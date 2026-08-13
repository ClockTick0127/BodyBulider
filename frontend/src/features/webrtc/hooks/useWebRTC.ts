import { useEffect, useRef, useState, useCallback } from 'react'
import type { Client } from '@stomp/stompjs'
import { MediaManager } from '../services/mediaManager'
import { PeerManager } from '../services/peerManager'
import type { MediaState, PeerStatus } from '../services/peerManager'
import type { RoomSocketStatus, SignalMessage } from '../../rooms/services/roomSocket'
import type { RoomParticipant } from '../../rooms/services/roomsApi'

type UseWebRTCOptions = {
  roomId: string | null
  myUserId: string | null
  participants: RoomParticipant[]
  stompClient: React.MutableRefObject<Client | null>
  socketStatus?: RoomSocketStatus
}

/**
 * Pick exactly one offerer for a peer pair.
 *
 * A newly joined participant is normally assigned a higher slot than the peers
 * already in the room. Making that participant the offerer means its signaling
 * subscription and local media are ready before the first offer is published;
 * existing peers no longer race to offer while the newcomer is still mounting.
 */
export function shouldInitiateOffer(
  localParticipant: RoomParticipant | undefined,
  remoteParticipant: RoomParticipant,
) {
  if (!localParticipant) return false
  if (localParticipant.slotId !== remoteParticipant.slotId) {
    return localParticipant.slotId > remoteParticipant.slotId
  }
  // Defensive fallback for malformed/temporarily duplicated slot data.
  return localParticipant.userId.localeCompare(remoteParticipant.userId) > 0
}

export function useWebRTC({ roomId, myUserId, participants, stompClient, socketStatus }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [isVideoOn, setIsVideoOn] = useState(true)
  const [isAudioOn, setIsAudioOn] = useState(true)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [peerStatuses, setPeerStatuses] = useState<Map<string, PeerStatus>>(new Map())
  const [remoteMediaStates, setRemoteMediaStates] = useState<Map<string, MediaState>>(new Map())

  const mediaManagerRef = useRef<MediaManager | null>(null)
  const peerManagerRef = useRef<PeerManager | null>(null)
  const localMediaStateRef = useRef<MediaState>({ videoEnabled: true, audioEnabled: true })
  const pendingSignalsRef = useRef<Array<{ message: SignalMessage; receivedAt: number }>>([])
  const mediaGenerationRef = useRef(0)
  const participantsRef = useRef(participants)
  participantsRef.current = participants
  const connectedClient =
    socketStatus === 'connected' && stompClient.current?.connected ? stompClient.current : null

  // 미디어 초기화
  const initMedia = useCallback(async () => {
    const generation = ++mediaGenerationRef.current
    const previous = mediaManagerRef.current
    previous?.stopLocalStream()
    try {
      setMediaError(null)
      const mm = new MediaManager()
      mediaManagerRef.current = mm
      const stream = await mm.getLocalStream()
      if (generation !== mediaGenerationRef.current || mediaManagerRef.current !== mm) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      setLocalStream(stream)
    } catch {
      if (generation !== mediaGenerationRef.current) return
      setMediaError('카메라 또는 마이크를 시작할 수 없습니다. 권한을 확인해 주세요.')
    }
  }, [])

  // 컴포넌트 마운트 시 미디어 획득 (StrictMode 렌더링 중복 호출 방지를 위해 useEffect 내에서만 실행)
  useEffect(() => {
    initMedia()
    return () => {
      mediaGenerationRef.current += 1
      mediaManagerRef.current?.stopLocalStream()
      mediaManagerRef.current = null
    }
  }, [initMedia])

  // PeerManager 관리
  useEffect(() => {
    if (
      !roomId ||
      !myUserId ||
      !connectedClient ||
      !localStream
    ) return

    const pm = new PeerManager(
      roomId,
      myUserId,
      connectedClient,
      localStream,
      (userId, stream) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev)
          next.set(userId, stream)
          return next
        })
      },
      (userId) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev)
          next.delete(userId)
          return next
        })
      },
      (userId, status) => {
        setPeerStatuses((prev) => new Map(prev).set(userId, status))
      },
      (userId, state) => {
        setRemoteMediaStates((prev) => new Map(prev).set(userId, state))
      },
      localMediaStateRef.current,
    )
    const currentParticipants = participantsRef.current
    pm.setActiveParticipants(currentParticipants.map((participant) => participant.userId))
    peerManagerRef.current = pm
    const now = Date.now()
    const queued = pendingSignalsRef.current
      .filter(({ receivedAt }) => now - receivedAt < 15_000)
      .splice(-128)
    pendingSignalsRef.current = []
    queued.forEach(({ message }) => void pm.handleSignal(message))

    // participants effect may already have run before media/STOMP became ready.
    // Start READY handshakes here too so an unchanged list cannot wait forever.
    const localParticipant = currentParticipants.find((participant) => participant.userId === myUserId)
    currentParticipants.forEach((participant) => {
      if (participant.userId !== myUserId) {
        pm.preparePeer(
          participant.userId,
          shouldInitiateOffer(localParticipant, participant),
        )
      }
    })

    // 컴포넌트 언마운트 또는 의존성 변경 시 정리
    return () => {
      pm.closeAll()
      peerManagerRef.current = null
      setRemoteStreams(new Map())
      setPeerStatuses(new Map())
      setRemoteMediaStates(new Map())
    }
  }, [roomId, myUserId, connectedClient, localStream])

  // 참가자 목록 변경 감지 (활성 참가자 업데이트 및 이탈자 정리)
  useEffect(() => {
    if (!peerManagerRef.current) return
    const pm = peerManagerRef.current
    const activeIds = participants.map((p) => p.userId)
    pm.setActiveParticipants(activeIds)

    // 방을 나간 참가자 연결 정리
    pm.getPeerIds().forEach((id) => {
      if (!activeIds.includes(id)) {
        pm.removePeer(id)
      }
    })

    // Both sides announce readiness. Only the deterministic offerer proceeds,
    // and only after the matching READY_ACK arrives.
    const localParticipant = participants.find((participant) => participant.userId === myUserId)
    participants.forEach((participant) => {
      if (participant.userId !== myUserId) {
        pm.preparePeer(
          participant.userId,
          shouldInitiateOffer(localParticipant, participant),
        )
      }
    })
    setRemoteMediaStates((prev) => {
      const next = new Map([...prev].filter(([id]) => activeIds.includes(id)))
      const unchanged = next.size === prev.size && [...next.keys()].every((id) => prev.has(id))
      return unchanged ? prev : next
    })
  }, [participants, myUserId])

  // 시그널 핸들러 (LobbyPage에서 이 함수를 onSignal에 연결)
  const handleSignal = useCallback((message: SignalMessage) => {
    const pm = peerManagerRef.current
    if (pm) {
      void pm.handleSignal(message)
      return
    }
    const queue = pendingSignalsRef.current
    queue.push({ message, receivedAt: Date.now() })
    if (queue.length > 128) queue.splice(0, queue.length - 128)
  }, [])

  const toggleVideo = useCallback(() => {
    if (!mediaManagerRef.current) return
    const next = !localMediaStateRef.current.videoEnabled
    localMediaStateRef.current = { ...localMediaStateRef.current, videoEnabled: next }
    mediaManagerRef.current.toggleVideo(next)
    peerManagerRef.current?.setLocalMediaState(localMediaStateRef.current)
    setIsVideoOn(next)
  }, [])

  const toggleAudio = useCallback(() => {
    if (!mediaManagerRef.current) return
    const next = !localMediaStateRef.current.audioEnabled
    localMediaStateRef.current = { ...localMediaStateRef.current, audioEnabled: next }
    mediaManagerRef.current.toggleAudio(next)
    peerManagerRef.current?.setLocalMediaState(localMediaStateRef.current)
    setIsAudioOn(next)
  }, [])

  return {
    localStream,
    remoteStreams,
    isVideoOn,
    isAudioOn,
    toggleVideo,
    toggleAudio,
    mediaError,
    peerStatuses,
    remoteMediaStates,
    retryMedia: initMedia,
    handleSignal,
  }
}
