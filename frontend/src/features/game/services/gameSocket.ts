import { registerSharedStomp } from '../../../shared/services/sharedStompConnection'
import type { GameEvent, PoseCaptureDiagnostic, Vec2 } from './gameProtocol'
import {
  createGameEnvelope,
  GAME_MESSAGE_DESTINATION,
  GAME_MESSAGE_TYPE,
  parseGameEvent,
} from './gameProtocol'

export type GameSocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

export type GameConnection = {
  startGame: (stageId: number) => void
  submitPose: (captureNo: number, points: Vec2[], diagnostic?: PoseCaptureDiagnostic) => void
  disconnect: () => Promise<void>
}

type ConnectGameOptions = {
  roomSessionId: string
  gameSessionId: string | null
  onEvent: (event: GameEvent) => void
  onStatusChange: (status: GameSocketStatus) => void
}

/** 공유 STOMP 연결에 게임 채널을 등록한다. */
export function connectGameSocket({
  roomSessionId,
  gameSessionId,
  onEvent,
  onStatusChange,
}: ConnectGameOptions): GameConnection {
  let activeGameSessionId = gameSessionId
  const connection = registerSharedStomp({
    subscriptions: [{
      destination: `/topic/rooms/${roomSessionId}/game`,
      onMessage: (message) => {
        let body: unknown
        try {
          body = JSON.parse(message.body)
        } catch {
          console.warn('[GAME STOMP] JSON으로 해석할 수 없는 메시지입니다.', message.body)
          return
        }
        const event = parseGameEvent(body)
        if (!event) {
          console.warn('[GAME STOMP] 지원하지 않거나 유효하지 않은 게임 메시지입니다.', body)
          return
        }
        if (event.type === 'GAME_STARTED' || event.type === 'ROUND_STARTED') {
          activeGameSessionId = event.gameSessionId
        }
        onEvent(event)
      },
    }],
    onStatusChange: (status) => onStatusChange(status),
  })
  const { client } = connection

  const publish = (type: number, sessionId: string | null, payload: unknown) => {
    if (!client.connected) throw new Error('게임 서버에 연결되어 있지 않습니다.')
    client.publish({
      destination: GAME_MESSAGE_DESTINATION,
      body: JSON.stringify(createGameEnvelope(type, roomSessionId, sessionId, payload)),
    })
  }

  return {
    startGame: (stageId) => {
      if (!Number.isInteger(stageId) || stageId <= 0) {
        throw new Error('올바른 스테이지를 선택해 주세요.')
      }
      publish(GAME_MESSAGE_TYPE.START_REQUEST, null, { stageId })
    },
    submitPose: (captureNo, points, diagnostic) => {
      if (!activeGameSessionId) throw new Error('gameSessionId가 없어 자세를 제출할 수 없습니다.')
      publish(GAME_MESSAGE_TYPE.CAPTURING_RESPONSE, activeGameSessionId, {
        captureNo,
        points,
        ...(diagnostic ? { diagnostic } : {}),
      })
    },
    disconnect: connection.disconnect,
  }
}
