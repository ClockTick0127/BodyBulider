import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Client } from '@stomp/stompjs'
import { sendOffer, sendReady, sendReadyAck } from '../../rooms/services/roomSocket'
import { PeerManager } from './peerManager'

vi.mock('../../rooms/services/roomSocket', () => ({
  sendOffer: vi.fn(),
  sendAnswer: vi.fn(),
  sendCandidate: vi.fn(),
  sendReady: vi.fn(),
  sendReadyAck: vi.fn(),
}))

class FakePeerConnection {
  signalingState: RTCSignalingState = 'stable'
  connectionState: RTCPeerConnectionState = 'new'
  localDescription: RTCSessionDescriptionInit | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  ondatachannel = null
  onicecandidate = null
  ontrack = null
  onconnectionstatechange = null

  createDataChannel() {
    return { label: 'media-state', readyState: 'connecting', close: vi.fn(), send: vi.fn() }
  }
  addTrack() {}
  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: 'offer-sdp' })
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer' as const, sdp: 'answer-sdp' })
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable'
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description
    if (description.type === 'answer') this.signalingState = 'stable'
  }
  addIceCandidate() { return Promise.resolve() }
  restartIce() {}
  close() { this.connectionState = 'closed' }
}

describe('PeerManager READY handshake', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
    vi.mocked(sendOffer).mockClear()
    vi.mocked(sendReady).mockClear()
    vi.mocked(sendReadyAck).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const createManager = () => {
    const manager = new PeerManager(
      'room',
      'local',
      { connected: true } as Client,
      { getTracks: () => [] } as unknown as MediaStream,
      vi.fn(),
      vi.fn(),
    )
    manager.setActiveParticipants(['local', 'remote'])
    return manager
  }

  it('does not create an offer before the matching READY_ACK', async () => {
    const manager = createManager()
    manager.preparePeer('remote', true)
    expect(sendReady).toHaveBeenCalledTimes(1)
    expect(sendOffer).not.toHaveBeenCalled()

    const [, , , , generationId, readyId] = vi.mocked(sendReady).mock.calls[0]
    await manager.handleSignal({
      type: 'READY_ACK', roomId: 'room', senderId: 'remote', receiverId: 'local',
      generationId, readyId, sentAt: new Date().toISOString(), sdp: null, candidate: null,
    })
    await vi.waitFor(() => expect(sendOffer).toHaveBeenCalledTimes(1))

    manager.closeAll()
  })

  it('retries READY with the same identity and never speculatively offers', async () => {
    const manager = createManager()
    manager.preparePeer('remote', true)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sendReady).toHaveBeenCalledTimes(3)
    expect(new Set(vi.mocked(sendReady).mock.calls.map((call) => call[5])).size).toBe(1)
    expect(sendOffer).not.toHaveBeenCalled()

    manager.closeAll()
  })

  it('ACKs duplicate READY messages without creating an offer', async () => {
    const manager = createManager()
    manager.preparePeer('remote', false)
    const ready = {
      type: 'READY' as const, roomId: 'room', senderId: 'remote', receiverId: 'local',
      generationId: 'remote-generation', readyId: 'remote-ready',
      sentAt: new Date().toISOString(), sdp: null, candidate: null,
    }
    await manager.handleSignal(ready)
    await manager.handleSignal(ready)

    expect(sendReadyAck).toHaveBeenCalledTimes(2)
    expect(sendOffer).not.toHaveBeenCalled()
    manager.closeAll()
  })
})
