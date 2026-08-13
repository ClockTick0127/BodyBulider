import type { Client } from '@stomp/stompjs'
import { RTC_CONFIG } from './webrtcConfig'
import {
  sendAnswer,
  sendCandidate,
  sendOffer,
  sendReady,
  sendReadyAck,
  type SignalMessage,
} from '../../rooms/services/roomSocket'

export type PeerStatus =
  | 'idle'
  | 'signaling'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'retrying'
  | 'failed'

export type MediaState = {
  videoEnabled: boolean
  audioEnabled: boolean
}

type MediaStateMessage = MediaState & {
  type: 'MEDIA_STATE'
}

type PeerContext = {
  pc: RTCPeerConnection
  dataChannel: RTCDataChannel | null
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  isSettingRemoteAnswerPending: boolean
  retryCount: number
  negotiationId: string | null
  remoteGenerationId: string | null
  disconnectTimer: ReturnType<typeof setTimeout> | null
  negotiationTimer: ReturnType<typeof setTimeout> | null
}

type PeerHandshake = {
  readyId: string
  retryCount: number
  retryTimer: ReturnType<typeof setTimeout> | null
  shouldOffer: boolean
  remoteReady: boolean
  offerStarted: boolean
  remoteGenerationId: string | null
}

const MAX_PENDING_CANDIDATES = 64
const MAX_ICE_RETRIES = 2
const DISCONNECT_GRACE_MS = 4_000
const NEGOTIATION_TIMEOUT_MS = 10_000
const READY_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000] as const

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export class PeerManager {
  private peers = new Map<string, PeerContext>()
  private handshakes = new Map<string, PeerHandshake>()
  private candidatesQueue = new Map<string, Array<{
    candidate: RTCIceCandidateInit
    generationId: string
    negotiationId: string
  }>>()
  private signalChains = new Map<string, Promise<void>>()
  private activeParticipantIds = new Set<string>()
  private closed = false
  private roomId: string
  private myUserId: string
  private stompClient: Client
  private localStream: MediaStream
  private onRemoteStream: (userId: string, stream: MediaStream) => void
  private onConnectionFailed: (userId: string) => void
  private onStatusChange: (userId: string, status: PeerStatus) => void
  private onRemoteMediaState: (userId: string, state: MediaState) => void
  private localMediaState: MediaState
  private readonly generationId = createId()

  constructor(
    roomId: string,
    myUserId: string,
    stompClient: Client,
    localStream: MediaStream,
    onRemoteStream: (userId: string, stream: MediaStream) => void,
    onConnectionFailed: (userId: string) => void,
    onStatusChange: (userId: string, status: PeerStatus) => void = () => {},
    onRemoteMediaState: (userId: string, state: MediaState) => void = () => {},
    initialMediaState: MediaState = { videoEnabled: true, audioEnabled: true },
  ) {
    this.roomId = roomId
    this.myUserId = myUserId
    this.stompClient = stompClient
    this.localStream = localStream
    this.onRemoteStream = onRemoteStream
    this.onConnectionFailed = onConnectionFailed
    this.onStatusChange = onStatusChange
    this.onRemoteMediaState = onRemoteMediaState
    this.localMediaState = initialMediaState
  }

  public getPeerIds(): string[] {
    return [...this.peers.keys()]
  }

  public setActiveParticipants(userIds: Iterable<string>) {
    this.activeParticipantIds = new Set(userIds)
    this.handshakes.forEach((_, userId) => {
      if (!this.activeParticipantIds.has(userId)) this.clearHandshake(userId)
    })
  }

  private isAllowed(remoteUserId: string) {
    return remoteUserId !== this.myUserId && this.activeParticipantIds.has(remoteUserId)
  }

  public createPeer(remoteUserId: string): RTCPeerConnection {
    const existing = this.peers.get(remoteUserId)
    if (existing) return existing.pc

    const pc = new RTCPeerConnection(RTC_CONFIG)
    const context: PeerContext = {
      pc,
      dataChannel: null,
      // 두 클라이언트에서 항상 한쪽만 polite가 되도록 결정한다.
      polite: this.myUserId.localeCompare(remoteUserId) > 0,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      retryCount: 0,
      negotiationId: null,
      remoteGenerationId: null,
      disconnectTimer: null,
      negotiationTimer: null,
    }
    this.peers.set(remoteUserId, context)
    this.onStatusChange(remoteUserId, 'idle')

    pc.ondatachannel = (event) => this.configureDataChannel(remoteUserId, context, event.channel)
    // Only one side creates the channel, preventing duplicate channels and negotiation glare.
    if (this.myUserId.localeCompare(remoteUserId) < 0) {
      this.configureDataChannel(remoteUserId, context, pc.createDataChannel('media-state', {
        ordered: true,
      }))
    }

    this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream))

    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.stompClient.connected || this.closed) return
      try {
        if (!context.negotiationId) return
        sendCandidate(
          this.stompClient, this.roomId, this.myUserId, remoteUserId,
          event.candidate.toJSON(), this.generationId, context.negotiationId,
        )
      } catch (error) {
        console.warn(`[WebRTC] candidate 전송 실패: ${remoteUserId}`, error)
      }
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) this.onRemoteStream(remoteUserId, stream)
    }

    pc.onconnectionstatechange = () => this.handleConnectionState(remoteUserId, context)
    return pc
  }

  private configureDataChannel(
    remoteUserId: string,
    context: PeerContext,
    channel: RTCDataChannel,
  ) {
    if (channel.label !== 'media-state') return
    context.dataChannel = channel
    channel.onopen = () => this.sendMediaStateToChannel(channel)
    channel.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      try {
        const message = JSON.parse(event.data) as Partial<MediaStateMessage>
        if (
          message.type !== 'MEDIA_STATE' ||
          typeof message.videoEnabled !== 'boolean' ||
          typeof message.audioEnabled !== 'boolean'
        ) return
        this.onRemoteMediaState(remoteUserId, {
          videoEnabled: message.videoEnabled,
          audioEnabled: message.audioEnabled,
        })
      } catch {
        console.warn(`[WebRTC] invalid media state message: ${remoteUserId}`)
      }
    }
  }

  private sendMediaStateToChannel(channel: RTCDataChannel) {
    if (channel.readyState !== 'open') return
    const message: MediaStateMessage = { type: 'MEDIA_STATE', ...this.localMediaState }
    channel.send(JSON.stringify(message))
  }

  public setLocalMediaState(state: MediaState) {
    this.localMediaState = state
    this.peers.forEach(({ dataChannel }) => {
      if (dataChannel) this.sendMediaStateToChannel(dataChannel)
    })
  }

  private handleConnectionState(remoteUserId: string, context: PeerContext) {
    const state = context.pc.connectionState
    if (state === 'connected') {
      if (context.disconnectTimer) clearTimeout(context.disconnectTimer)
      if (context.negotiationTimer) clearTimeout(context.negotiationTimer)
      context.disconnectTimer = null
      context.negotiationTimer = null
      context.retryCount = 0
      this.onStatusChange(remoteUserId, 'connected')
    } else if (state === 'connecting' || state === 'new') {
      this.onStatusChange(remoteUserId, 'connecting')
    } else if (state === 'disconnected') {
      this.onStatusChange(remoteUserId, 'disconnected')
      if (!context.disconnectTimer) {
        context.disconnectTimer = setTimeout(() => {
          context.disconnectTimer = null
          if (context.pc.connectionState === 'disconnected') void this.restartPeer(remoteUserId)
        }, DISCONNECT_GRACE_MS)
      }
    } else if (state === 'failed') {
      void this.restartPeer(remoteUserId)
    } else if (state === 'closed' && this.peers.has(remoteUserId)) {
      this.removePeer(remoteUserId)
    }
  }

  private async restartPeer(remoteUserId: string) {
    const context = this.peers.get(remoteUserId)
    if (!context || !this.isAllowed(remoteUserId)) return
    if (context.negotiationTimer) clearTimeout(context.negotiationTimer)
    context.negotiationTimer = null
    if (context.retryCount >= MAX_ICE_RETRIES) {
      this.onStatusChange(remoteUserId, 'failed')
      this.removePeer(remoteUserId)
      return
    }
    context.retryCount += 1
    this.onStatusChange(remoteUserId, 'retrying')
    context.pc.restartIce()
    await this.initiateCall(remoteUserId, true)
  }

  public removePeer(remoteUserId: string) {
    const context = this.peers.get(remoteUserId)
    this.clearHandshake(remoteUserId)
    if (!context) return
    if (context.disconnectTimer) clearTimeout(context.disconnectTimer)
    if (context.negotiationTimer) clearTimeout(context.negotiationTimer)
    this.clearHandshake(remoteUserId)
    this.peers.delete(remoteUserId)
    this.candidatesQueue.delete(remoteUserId)
    this.signalChains.delete(remoteUserId)
    context.dataChannel?.close()
    context.pc.close()
    this.onConnectionFailed(remoteUserId)
  }

  public initiateCall(remoteUserId: string, iceRestart = false): Promise<void> {
    return this.enqueue(remoteUserId, async () => {
      if (!this.isAllowed(remoteUserId) || !this.stompClient.connected) return
      const pc = this.createPeer(remoteUserId)
      const context = this.peers.get(remoteUserId)!
      if (!iceRestart && pc.signalingState !== 'stable') return
      try {
        context.makingOffer = true
        context.negotiationId = createId()
        this.onStatusChange(remoteUserId, 'signaling')
        const offer = await pc.createOffer({ iceRestart })
        await pc.setLocalDescription(offer)
        sendOffer(
          this.stompClient, this.roomId, this.myUserId, remoteUserId,
          pc.localDescription!, this.generationId, context.negotiationId,
        )
        if (context.negotiationTimer) clearTimeout(context.negotiationTimer)
        context.negotiationTimer = setTimeout(() => {
          context.negotiationTimer = null
          if (
            this.peers.get(remoteUserId) === context &&
            context.pc.connectionState !== 'connected'
          ) {
            void this.restartPeer(remoteUserId)
          }
        }, NEGOTIATION_TIMEOUT_MS)
      } catch (error) {
        console.error(`[WebRTC] offer 생성 실패: ${remoteUserId}`, error)
        this.onStatusChange(remoteUserId, 'failed')
      } finally {
        context.makingOffer = false
      }
    })
  }

  /** Advertise that this generation has a live signal handler and PeerManager. */
  public preparePeer(remoteUserId: string, shouldOffer: boolean) {
    if (!this.isAllowed(remoteUserId) || this.closed) return
    let handshake = this.handshakes.get(remoteUserId)
    if (!handshake) {
      handshake = {
        readyId: createId(), retryCount: 0, retryTimer: null,
        shouldOffer, remoteReady: false, offerStarted: false, remoteGenerationId: null,
      }
      this.handshakes.set(remoteUserId, handshake)
    } else {
      handshake.shouldOffer = shouldOffer
    }
    if (handshake.remoteReady) {
      this.maybeStartOffer(remoteUserId, handshake)
      return
    }
    if (handshake.retryCount === 0 && !handshake.retryTimer) this.publishReady(remoteUserId, handshake)
  }

  private publishReady(remoteUserId: string, handshake: PeerHandshake) {
    if (this.closed || !this.stompClient.connected || this.handshakes.get(remoteUserId) !== handshake) return
    sendReady(
      this.stompClient, this.roomId, this.myUserId, remoteUserId,
      this.generationId, handshake.readyId,
    )
    const delay = READY_RETRY_DELAYS_MS[handshake.retryCount]
    handshake.retryCount += 1
    if (delay != null) {
      handshake.retryTimer = setTimeout(() => {
        handshake.retryTimer = null
        this.publishReady(remoteUserId, handshake)
      }, delay)
    } else {
      this.onStatusChange(remoteUserId, 'failed')
    }
  }

  private maybeStartOffer(remoteUserId: string, handshake: PeerHandshake) {
    if (!handshake.shouldOffer || !handshake.remoteReady || handshake.offerStarted) return
    handshake.offerStarted = true
    void this.initiateCall(remoteUserId)
  }

  private clearHandshake(remoteUserId: string) {
    const handshake = this.handshakes.get(remoteUserId)
    if (handshake?.retryTimer) clearTimeout(handshake.retryTimer)
    this.handshakes.delete(remoteUserId)
  }

  public handleSignal(message: SignalMessage): Promise<void> {
    if (message.roomId !== this.roomId || message.receiverId !== this.myUserId) return Promise.resolve()
    if (!this.isAllowed(message.senderId)) return Promise.resolve()
    return this.enqueue(message.senderId, () => this.processSignal(message))
  }

  private enqueue(remoteUserId: string, task: () => Promise<void>) {
    const previous = this.signalChains.get(remoteUserId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(task)
    this.signalChains.set(remoteUserId, next)
    const clear = () => {
      if (this.signalChains.get(remoteUserId) === next) this.signalChains.delete(remoteUserId)
    }
    void next.then(clear, clear)
    return next
  }

  private async processSignal(message: SignalMessage) {
    if (this.closed) return
    const remoteUserId = message.senderId

    if (message.type === 'READY') {
      const handshake = this.handshakes.get(remoteUserId)
      if (handshake) handshake.remoteGenerationId = message.generationId
      // Re-ACK duplicates: the original ACK may have raced with a reconnect.
      sendReadyAck(
        this.stompClient, this.roomId, this.myUserId, remoteUserId,
        message.generationId, message.readyId,
      )
      return
    }

    if (message.type === 'READY_ACK') {
      const handshake = this.handshakes.get(remoteUserId)
      if (
        !handshake || message.generationId !== this.generationId ||
        message.readyId !== handshake.readyId
      ) return
      if (handshake.retryTimer) clearTimeout(handshake.retryTimer)
      handshake.retryTimer = null
      handshake.remoteReady = true
      this.maybeStartOffer(remoteUserId, handshake)
      return
    }

    if (message.type === 'OFFER') {
      const expectedGeneration = this.handshakes.get(remoteUserId)?.remoteGenerationId
      if (expectedGeneration && expectedGeneration !== message.generationId) return
      const pc = this.createPeer(remoteUserId)
      const context = this.peers.get(remoteUserId)!
      const readyForOffer =
        !context.makingOffer &&
        (pc.signalingState === 'stable' || context.isSettingRemoteAnswerPending)
      const offerCollision = !readyForOffer
      context.ignoreOffer = !context.polite && offerCollision
      if (context.ignoreOffer) return

      try {
        if (offerCollision) await pc.setLocalDescription({ type: 'rollback' })
        context.negotiationId = message.negotiationId
        context.remoteGenerationId = message.generationId
        await pc.setRemoteDescription(message.sdp)
        await this.flushCandidates(remoteUserId, pc)
        await pc.setLocalDescription(await pc.createAnswer())
        sendAnswer(
          this.stompClient, this.roomId, this.myUserId, remoteUserId,
          pc.localDescription!, this.generationId, message.negotiationId,
        )
      } catch (error) {
        console.error(`[WebRTC] offer 처리 실패: ${remoteUserId}`, error)
      }
    } else if (message.type === 'ANSWER') {
      const context = this.peers.get(remoteUserId)
      if (
        !context || context.pc.signalingState !== 'have-local-offer' ||
        context.negotiationId !== message.negotiationId ||
        (this.handshakes.get(remoteUserId)?.remoteGenerationId != null &&
          this.handshakes.get(remoteUserId)?.remoteGenerationId !== message.generationId)
      ) return
      context.remoteGenerationId = message.generationId
      try {
        context.isSettingRemoteAnswerPending = true
        await context.pc.setRemoteDescription(message.sdp)
        await this.flushCandidates(remoteUserId, context.pc)
      } catch (error) {
        console.error(`[WebRTC] answer 처리 실패: ${remoteUserId}`, error)
      } finally {
        context.isSettingRemoteAnswerPending = false
      }
    } else {
      const context = this.peers.get(remoteUserId)
      if (!context) {
        this.enqueueCandidate(
          remoteUserId, message.candidate, message.generationId, message.negotiationId,
        )
        return
      }
      if (
        context.negotiationId !== message.negotiationId ||
        (context.remoteGenerationId != null && context.remoteGenerationId !== message.generationId)
      ) return
      if (!context.remoteGenerationId) context.remoteGenerationId = message.generationId
      if (context?.pc.remoteDescription && !context.ignoreOffer) {
        try {
          await context.pc.addIceCandidate(message.candidate)
        } catch (error) {
          console.warn(`[WebRTC] candidate 즉시 추가 실패, 큐로 이전: ${remoteUserId}`, error)
          this.enqueueCandidate(
            remoteUserId, message.candidate, message.generationId, message.negotiationId,
          )
        }
      } else {
        this.enqueueCandidate(
          remoteUserId, message.candidate, message.generationId, message.negotiationId,
        )
      }
    }
  }

  private enqueueCandidate(
    remoteUserId: string,
    candidate: RTCIceCandidateInit,
    generationId: string,
    negotiationId: string,
  ) {
    const queue = this.candidatesQueue.get(remoteUserId) ?? []
    if (queue.length < MAX_PENDING_CANDIDATES) {
      queue.push({ candidate, generationId, negotiationId })
    }
    this.candidatesQueue.set(remoteUserId, queue)
  }

  private async flushCandidates(remoteUserId: string, pc: RTCPeerConnection) {
    const queue = this.candidatesQueue.get(remoteUserId) ?? []
    this.candidatesQueue.delete(remoteUserId)
    const context = this.peers.get(remoteUserId)
    for (const queued of queue) {
      if (
        !context || queued.negotiationId !== context.negotiationId ||
        queued.generationId !== context.remoteGenerationId
      ) continue
      try {
        await pc.addIceCandidate(queued.candidate)
      } catch (error) {
        console.warn(`[WebRTC] flush candidate 처리 실패: ${remoteUserId}`, error)
      }
    }
  }

  public closeAll() {
    this.closed = true
    this.peers.forEach((context) => {
      if (context.disconnectTimer) clearTimeout(context.disconnectTimer)
      if (context.negotiationTimer) clearTimeout(context.negotiationTimer)
      context.dataChannel?.close()
      context.pc.close()
    })
    this.peers.clear()
    this.handshakes.forEach((handshake) => {
      if (handshake.retryTimer) clearTimeout(handshake.retryTimer)
    })
    this.handshakes.clear()
    this.candidatesQueue.clear()
    this.signalChains.clear()
  }
}
