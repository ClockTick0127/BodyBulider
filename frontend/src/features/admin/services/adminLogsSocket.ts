import type { IMessage } from '@stomp/stompjs'
import {
  registerSharedStomp,
  type SharedStompRegistration,
  type SharedStompStatus,
} from '../../../shared/services/sharedStompConnection'
import type {
  ActiveGame,
  ArchivedGame,
  ErrorSummary,
  SessionEvent,
} from './adminLogsApi'

export type AdminLiveEvent = {
  gameSessionId: string
  event: Omit<SessionEvent, 'sequenceNo'>
}

export type AdminSessionDelta = {
  type: 'SESSION_CREATED' | 'SESSION_UPDATED' | 'SESSION_ARCHIVED'
  gameSessionId: string
  activeGame: ActiveGame | null
  archivedGame: ArchivedGame | null
  eventId: string
  serverReceivedAt: string
}

export type AdminErrorDelta = {
  type: 'ERROR_CREATED'
  error: ErrorSummary
}

const parseEvent = (message: IMessage): AdminLiveEvent | null => {
  try {
    return JSON.parse(message.body) as AdminLiveEvent
  } catch {
    return null
  }
}

const parseSessionDelta = (message: IMessage): AdminSessionDelta | null => {
  try {
    const parsed = JSON.parse(message.body) as AdminSessionDelta
    if (!parsed.eventId || !parsed.gameSessionId || !parsed.type) return null
    return parsed
  } catch {
    return null
  }
}

const parseErrorDelta = (message: IMessage): AdminErrorDelta | null => {
  try {
    const parsed = JSON.parse(message.body) as AdminErrorDelta
    if (parsed.type !== 'ERROR_CREATED' || !parsed.error?.errorId) return null
    return parsed
  } catch {
    return null
  }
}

export function connectAdminLogs({
  userId,
  selectedGameSessionId,
  onSessionDelta,
  onErrorDelta,
  onSessionEvent,
  onStatusChange,
}: {
  userId: string
  selectedGameSessionId?: string
  onSessionDelta: (delta: AdminSessionDelta) => void
  onErrorDelta: (delta: AdminErrorDelta) => void
  onSessionEvent: (event: AdminLiveEvent) => void
  onStatusChange: (status: SharedStompStatus) => void
}): SharedStompRegistration {
  const subscriptions = [
    {
      destination: '/topic/admin/sessions',
      onMessage: (message: IMessage) => {
        const delta = parseSessionDelta(message)
        if (delta) onSessionDelta(delta)
      },
    },
    {
      destination: '/topic/admin/errors',
      onMessage: (message: IMessage) => {
        const delta = parseErrorDelta(message)
        if (delta) onErrorDelta(delta)
      },
    },
  ]

  if (selectedGameSessionId) {
    subscriptions.push({
      destination: `/topic/admin/sessions/${selectedGameSessionId}`,
      onMessage: (message: IMessage) => {
        const event = parseEvent(message)
        if (event) onSessionEvent(event)
      },
    })
  }

  return registerSharedStomp({
    userId,
    subscriptions,
    onStatusChange,
  })
}
