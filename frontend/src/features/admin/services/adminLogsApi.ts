import { request } from '../../../shared/api/request'

export type FinalStatus = 'COMPLETED' | 'ERROR' | 'ABORTED'
export type GameResult = 'CLEARED' | 'NOT_CLEARED' | null

export type ActiveGame = {
  gameSessionId: string
  roomSessionId: string
  roomCode: string
  roomTitle: string
  stageId: number
  participantCount: number
  latestEventType: string
  startedAt: string
  lastEventAt: string
}

export type ArchivedGame = {
  gameSessionId: string
  roomSessionId: string
  roomCode: string
  roomTitle: string
  stageId: number
  finalStatus: FinalStatus
  gameResult: GameResult
  startedAt: string
  endedAt: string
}

export type SessionEvent = {
  sequenceNo: number
  eventId: string
  eventType: string
  messageType: string | null
  severity: 'INFO' | 'WARN' | 'ERROR'
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL'
  result: 'SUCCESS' | 'REJECTED' | 'FAILED'
  actorId: string | null
  summary: Record<string, unknown>
  payloadSizeBytes: number | null
  durationMs: number | null
  errorId: string | null
  occurredAt: string
  serverReceivedAt: string
}

export type RoundReplay = {
  roundNo: number
  poses: {
    p1Bridge: [number, number][]
    p2Bridge: [number, number][]
    p3Bridge: [number, number][]
    p4Bridge: [number, number][]
  }
  simulation: {
    intervalMs: number
    points: [number, number, number, number][]
    result: boolean
  }
}

export type ErrorSummary = {
  errorId: string
  source: string
  severity: string
  errorCode: string | null
  message: string
  roomSessionId: string | null
  gameSessionId: string | null
  createdAt: string
}

export type ErrorDetail = ErrorSummary & {
  exceptionClass: string
  stackTrace: string | null
  userId: string | null
  requestId: string | null
  traceId: string | null
  eventId: string | null
  context: Record<string, unknown> | null
  expiresAt: string
}

export function getActiveGames() {
  return request<ActiveGame[]>('/api/v1/admin/sessions/active')
}

export function getArchivedGames(limit = 100) {
  return request<ArchivedGame[]>(`/api/v1/admin/sessions/archived?limit=${limit}`)
}

export function getSessionEvents(gameSessionId: string, limit = 500) {
  return request<SessionEvent[]>(
    `/api/v1/admin/sessions/${encodeURIComponent(gameSessionId)}/events?limit=${limit}`,
  )
}

export function getRoundReplays(gameSessionId: string) {
  return request<RoundReplay[]>(
    `/api/v1/admin/sessions/${encodeURIComponent(gameSessionId)}/rounds`,
  )
}

export function getErrors(limit = 100) {
  return request<ErrorSummary[]>(`/api/v1/admin/errors?limit=${limit}`)
}

export function getErrorDetail(errorId: string) {
  return request<ErrorDetail>(`/api/v1/admin/errors/${encodeURIComponent(errorId)}`)
}
