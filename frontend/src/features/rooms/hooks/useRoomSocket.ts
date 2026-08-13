import { useCallback, useEffect, useRef, useState } from 'react'
import type { Client } from '@stomp/stompjs'
import {
  connectRoomSocket,
  type RoomConnection,
  type RoomEvent,
  type RoomSocketStatus,
  type SignalMessage,
} from '../services/roomSocket'

type UseRoomSocketOptions = {
  roomId: string | null
  myUserId: string | null
  onRoomEvent?: (event: RoomEvent) => void
  onSignal?: (message: SignalMessage) => void
  keepAliveOnUnmount?: boolean
}

let retainedConnection: RoomConnection | null = null
let retainedRoomId: string | null = null
let retainedUserId: string | null = null
let retainedRoomEventHandler: ((event: RoomEvent) => void) | undefined
let retainedSignalHandler: ((message: SignalMessage) => void) | undefined
let retainedStatusHandler: ((status: RoomSocketStatus) => void) | undefined
let pendingDisconnect: ReturnType<typeof setTimeout> | null = null

export function cancelScheduledRetainedRoomSocketDisconnect() {
  if (pendingDisconnect == null) return
  clearTimeout(pendingDisconnect)
  pendingDisconnect = null
}

export function scheduleRetainedRoomSocketDisconnect() {
  cancelScheduledRetainedRoomSocketDisconnect()
  pendingDisconnect = setTimeout(() => {
    pendingDisconnect = null
    void disconnectRetainedRoomSocket()
  }, 0)
}

export async function disconnectRetainedRoomSocket() {
  cancelScheduledRetainedRoomSocketDisconnect()
  const connection = retainedConnection
  retainedConnection = null
  retainedRoomId = null
  retainedUserId = null
  retainedRoomEventHandler = undefined
  retainedSignalHandler = undefined
  retainedStatusHandler = undefined
  if (connection) await connection.disconnect()
}

export function useRoomSocket({
  roomId,
  myUserId,
  onRoomEvent,
  onSignal,
  keepAliveOnUnmount = false,
}: UseRoomSocketOptions) {
  const [status, setStatus] = useState<RoomSocketStatus>('idle')
  const clientRef = useRef<Client | null>(null)
  const connectionRef = useRef<RoomConnection | null>(null)
  const roomEventRef = useRef(onRoomEvent)
  const signalRef = useRef(onSignal)

  // Keep retained socket dispatch synchronous with the latest render. During a
  // Lobby -> Game -> Lobby transition an offer can arrive before passive effects
  // run; updating these refs in effects would send it to the previous page (or
  // drop it), leaving the recreated PeerManager unable to answer.
  roomEventRef.current = onRoomEvent
  signalRef.current = onSignal

  const disconnect = useCallback(async () => {
    const connection = connectionRef.current
    if (!connection) return
    connectionRef.current = null
    clientRef.current = null
    if (retainedConnection === connection) {
      retainedConnection = null
      retainedRoomId = null
      retainedUserId = null
      retainedRoomEventHandler = undefined
      retainedSignalHandler = undefined
      retainedStatusHandler = undefined
    }
    await connection.disconnect()
    setStatus('idle')
  }, [])

  useEffect(() => {
    if (roomId == null || myUserId == null) return
    cancelScheduledRetainedRoomSocketDisconnect()

    if (retainedConnection && retainedRoomId === roomId && retainedUserId === myUserId) {
      const connection = retainedConnection
      retainedRoomEventHandler = (event) => roomEventRef.current?.(event)
      retainedSignalHandler = (message) => signalRef.current?.(message)
      retainedStatusHandler = setStatus
      connectionRef.current = connection
      clientRef.current = connection.client
      setStatus(connection.client.connected ? 'connected' : 'connecting')
      return () => {
        if (connectionRef.current !== connection) return
        connectionRef.current = null
        clientRef.current = null
        setStatus('idle')
        if (keepAliveOnUnmount) return
        if (retainedConnection === connection) retainedConnection = null
        void connection.disconnect()
      }
    }

    if (retainedConnection) void disconnectRetainedRoomSocket()

    retainedRoomEventHandler = (event) => roomEventRef.current?.(event)
    retainedSignalHandler = (message) => signalRef.current?.(message)
    retainedStatusHandler = setStatus
    const connection = connectRoomSocket({
      roomId,
      myUserId,
      onRoomEvent: (event) => retainedRoomEventHandler?.(event),
      onSignal: (message) => retainedSignalHandler?.(message),
      onStatusChange: (nextStatus) => retainedStatusHandler?.(nextStatus),
    })
    connectionRef.current = connection
    clientRef.current = connection.client
    retainedConnection = connection
    retainedRoomId = roomId
    retainedUserId = myUserId

    return () => {
      if (connectionRef.current !== connection) return
      connectionRef.current = null
      clientRef.current = null
      setStatus('idle')
      if (keepAliveOnUnmount) return
      if (retainedConnection === connection) retainedConnection = null
      void connection.disconnect()
    }
  }, [roomId, myUserId, keepAliveOnUnmount])

  return { status, clientRef, disconnect }
}
