import type { Client } from '@stomp/stompjs'
import { registerSharedStomp } from '../../../shared/services/sharedStompConnection'
import type { RoomParticipant } from './roomsApi'

export type PlayerJoinedEvent = {
  type: 'PLAYER_JOINED'
  roomId: string
  newParticipant: RoomParticipant
  currentParticipantsCount: number
}

export type PlayerLeftEvent = {
  type: 'PLAYER_LEFT'
  roomId: string
  leftUserId: string
  newHostUserId: string | null
}

export type PlayerReadyChangedEvent = {
  type: 'PLAYER_READY_CHANGED'
  roomId: string
  userId: string
  slotId: number
  isReady: boolean
}

export type StageChangedEvent = {
  type: 'STAGE_CHANGED'
  roomId: string
  stageId: number
}

export type CutsceneSettingChangedEvent = {
  type: 'CUTSCENE_SETTING_CHANGED'
  roomId: string
  enabled: boolean
}

export type RoomEvent =
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | PlayerReadyChangedEvent
  | StageChangedEvent
  | CutsceneSettingChangedEvent

type SignalEnvelope = {
  roomId: string
  senderId: string
  receiverId: string
  generationId: string
  sentAt: string
}

export type SignalMessage =
  | (SignalEnvelope & {
      type: 'READY'
      readyId: string
      sdp: null
      candidate: null
    })
  | (SignalEnvelope & {
      type: 'READY_ACK'
      readyId: string
      sdp: null
      candidate: null
    })
  | {
      type: 'OFFER'
      roomId: string
      senderId: string
      receiverId: string
      sdp: RTCSessionDescriptionInit
      candidate: null
      generationId: string
      negotiationId: string
    }
  | {
      type: 'ANSWER'
      roomId: string
      senderId: string
      receiverId: string
      sdp: RTCSessionDescriptionInit
      candidate: null
      generationId: string
      negotiationId: string
    }
  | {
      type: 'CANDIDATE'
      roomId: string
      senderId: string
      receiverId: string
      sdp: null
      candidate: RTCIceCandidateInit
      generationId: string
      negotiationId: string
    }

export type RoomSocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

const ROOM_EVENT_TYPES = [
  'PLAYER_JOINED',
  'PLAYER_LEFT',
  'PLAYER_READY_CHANGED',
  'STAGE_CHANGED',
  'CUTSCENE_SETTING_CHANGED',
]

const isRoomEvent = (payload: { type?: unknown }): payload is RoomEvent =>
  typeof payload.type === 'string' && ROOM_EVENT_TYPES.includes(payload.type)

type ConnectOptions = {
  roomId: string
  myUserId: string
  onRoomEvent?: (event: RoomEvent) => void
  onSignal?: (message: SignalMessage) => void
  onStatusChange?: (status: RoomSocketStatus) => void
}

export type RoomConnection = {
  client: Client
  disconnect: () => Promise<void>
}

/** 공유 STOMP 연결에 방 이벤트와 개인 WebRTC signaling 채널을 등록한다. */
export function connectRoomSocket({
  roomId,
  myUserId,
  onRoomEvent,
  onSignal,
  onStatusChange,
}: ConnectOptions): RoomConnection {
  return registerSharedStomp({
    userId: myUserId,
    subscriptions: [
      {
        destination: `/topic/rooms/${roomId}`,
        onMessage: (message) => {
          try {
            const payload = JSON.parse(message.body)
            if (isRoomEvent(payload)) onRoomEvent?.(payload)
          } catch {
            console.warn('[STOMP] 파싱할 수 없는 방 메시지', message.body)
          }
        },
      },
      {
        destination: `/sub/room/${roomId}/user/${myUserId}`,
        onMessage: (message) => {
          try {
            const payload = JSON.parse(message.body) as SignalMessage
            if (!['READY', 'READY_ACK', 'OFFER', 'ANSWER', 'CANDIDATE'].includes(payload.type)) return
            if (payload.roomId !== roomId) return
            if (payload.receiverId !== myUserId) return
            if (payload.senderId === myUserId) return
            onSignal?.(payload)
          } catch {
            console.warn('[STOMP] signaling 메시지 파싱 실패', message.body)
          }
        },
      },
    ],
    onStatusChange: (status) => onStatusChange?.(status),
  })
}

const signalTimestamp = () => new Date().toISOString()

export function sendReady(
  client: Client,
  roomId: string,
  senderId: string,
  receiverId: string,
  generationId: string,
  readyId: string,
) {
  checkClient(client)
  client.publish({
    destination: '/pub/signal/ready',
    body: JSON.stringify({
      type: 'READY', roomId, senderId, receiverId, generationId, readyId,
      sentAt: signalTimestamp(), sdp: null, candidate: null,
    }),
  })
}

export function sendReadyAck(
  client: Client,
  roomId: string,
  senderId: string,
  receiverId: string,
  generationId: string,
  readyId: string,
) {
  checkClient(client)
  client.publish({
    destination: '/pub/signal/ready-ack',
    body: JSON.stringify({
      type: 'READY_ACK', roomId, senderId, receiverId, generationId, readyId,
      sentAt: signalTimestamp(), sdp: null, candidate: null,
    }),
  })
}

function checkClient(client: Client) {
  if (!client.connected) throw new Error('실시간 서버에 연결되어 있지 않습니다.')
}

export function sendOffer(
  client: Client,
  roomId: string,
  senderId: string,
  receiverId: string,
  sdp: RTCSessionDescriptionInit,
  generationId: string,
  negotiationId: string,
) {
  checkClient(client)
  client.publish({
    destination: '/pub/signal/offer',
    body: JSON.stringify({
      type: 'OFFER', roomId, senderId, receiverId, generationId, negotiationId,
      sentAt: signalTimestamp(), sdp, candidate: null,
    }),
  })
}

export function sendAnswer(
  client: Client,
  roomId: string,
  senderId: string,
  receiverId: string,
  sdp: RTCSessionDescriptionInit,
  generationId: string,
  negotiationId: string,
) {
  checkClient(client)
  client.publish({
    destination: '/pub/signal/answer',
    body: JSON.stringify({
      type: 'ANSWER', roomId, senderId, receiverId, generationId, negotiationId,
      sentAt: signalTimestamp(), sdp, candidate: null,
    }),
  })
}

export function sendCandidate(
  client: Client,
  roomId: string,
  senderId: string,
  receiverId: string,
  candidate: RTCIceCandidateInit,
  generationId: string,
  negotiationId: string,
) {
  checkClient(client)
  client.publish({
    destination: '/pub/signal/candidate',
    body: JSON.stringify({
      type: 'CANDIDATE', roomId, senderId, receiverId, generationId, negotiationId,
      sentAt: signalTimestamp(), sdp: null, candidate,
    }),
  })
}
