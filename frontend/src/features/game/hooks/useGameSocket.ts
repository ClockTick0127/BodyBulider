import { useCallback, useEffect, useRef, useState } from 'react'
import { isMockingEnabled } from '../../../mocks/enableMocking'
import { connectMockGameSocket } from '../../../mocks/gameSocketMock'
import type { GameEvent, PoseCaptureDiagnostic, Vec2 } from '../services/gameProtocol'
import { connectGameSocket, type GameConnection, type GameSocketStatus } from '../services/gameSocket'

type Options = {
  roomSessionId: string | null
  gameSessionId?: string | null
  onEvent: (event: GameEvent) => void
  enabled?: boolean
  /** 로비에서 게임 화면으로 전환하는 동안 동일한 STOMP 연결을 유지한다. */
  keepAliveOnUnmount?: boolean
}

type RetainedGameConnection = {
  roomSessionId: string
  connection: GameConnection
  status: GameSocketStatus
  onEvent: (event: GameEvent) => void
  onStatusChange: (status: GameSocketStatus) => void
}

let retained: RetainedGameConnection | null = null

export async function disconnectRetainedGameSocket() {
  const connection = retained?.connection
  retained = null
  if (connection) await connection.disconnect()
}

export function useGameSocket({
  roomSessionId,
  gameSessionId = null,
  onEvent,
  enabled = true,
  keepAliveOnUnmount = false,
}: Options) {
  const [status, setStatus] = useState<GameSocketStatus>('idle')
  const connectionRef = useRef<GameConnection | null>(null)
  const eventRef = useRef(onEvent)
  useEffect(() => { eventRef.current = onEvent }, [onEvent])

  useEffect(() => {
    if (!enabled || roomSessionId == null) {
      setStatus('idle')
      return
    }
    const handleEvent = (event: GameEvent) => eventRef.current(event)
    if (retained?.roomSessionId === roomSessionId) {
      const connection = retained.connection
      retained.onEvent = handleEvent
      retained.onStatusChange = setStatus
      connectionRef.current = connection
      setStatus(retained.status)
      return () => {
        connectionRef.current = null
        if (keepAliveOnUnmount) return
        if (retained?.connection === connection) retained = null
        void connection.disconnect()
      }
    }

    if (retained) {
      void retained.connection.disconnect()
      retained = null
    }

    const dispatchEvent = (event: GameEvent) => retained?.onEvent(event)
    const dispatchStatus = (nextStatus: GameSocketStatus) => {
      if (!retained || retained.roomSessionId !== roomSessionId) return
      retained.status = nextStatus
      retained.onStatusChange(nextStatus)
    }
    const connection = isMockingEnabled
      ? connectMockGameSocket(roomSessionId, dispatchEvent, dispatchStatus)
      : connectGameSocket({
        roomSessionId,
        gameSessionId,
        onEvent: dispatchEvent,
        onStatusChange: dispatchStatus,
      })
    retained = {
      roomSessionId,
      connection,
      status: 'connecting',
      onEvent: handleEvent,
      onStatusChange: setStatus,
    }
    setStatus('connecting')
    connectionRef.current = connection
    return () => {
      connectionRef.current = null
      if (keepAliveOnUnmount) return
      if (retained?.connection === connection) retained = null
      void connection.disconnect()
    }
  }, [enabled, gameSessionId, roomSessionId, keepAliveOnUnmount])

  const startGame = useCallback((stageId: number) => {
    const connection = connectionRef.current
    if (!connection) throw new Error('게임 서버 연결이 준비되지 않았습니다.')
    connection.startGame(stageId)
  }, [])
  const submitPose = useCallback((
    captureNo: number,
    points: Vec2[],
    diagnostic?: PoseCaptureDiagnostic,
  ) => {
    const connection = connectionRef.current
    if (!connection) throw new Error('게임 서버 연결이 준비되지 않았습니다.')
    connection.submitPose(captureNo, points, diagnostic)
  }, [])
  return { status, startGame, submitPose }
}

