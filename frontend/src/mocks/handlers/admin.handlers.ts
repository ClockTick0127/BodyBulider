import { delay, http, HttpResponse } from 'msw'
import type {
  ActiveGame,
  ArchivedGame,
  ErrorDetail,
  ErrorSummary,
  SessionEvent,
} from '../../features/admin/services/adminLogsApi'
import { api } from '../utils/api'

const liveGameId = '10000000-0000-4000-8000-000000000001'
const secondLiveGameId = '10000000-0000-4000-8000-000000000002'
const archivedGameId = '10000000-0000-4000-8000-000000000003'
const errorGameId = '10000000-0000-4000-8000-000000000004'
const errorId = '90000000-0000-4000-8000-000000000001'

const activeGames: ActiveGame[] = [
  {
    gameSessionId: liveGameId,
    roomSessionId: '20000000-0000-4000-8000-000000000001',
    roomCode: 'A7K2Q9',
    roomTitle: '오늘도 다리 건설',
    stageId: 2,
    participantCount: 4,
    latestEventType: 'POSE_ACCEPTED',
    startedAt: '2026-07-31T14:01:20',
    lastEventAt: '2026-07-31T14:01:31',
  },
  {
    gameSessionId: secondLiveGameId,
    roomSessionId: '20000000-0000-4000-8000-000000000002',
    roomCode: 'B4M8TX',
    roomTitle: '초보자 환영방',
    stageId: 1,
    participantCount: 3,
    latestEventType: 'CAPTURE_REQUESTED',
    startedAt: '2026-07-31T14:03:05',
    lastEventAt: '2026-07-31T14:03:22',
  },
]

const archivedGames: ArchivedGame[] = [
  {
    gameSessionId: archivedGameId,
    roomSessionId: '20000000-0000-4000-8000-000000000003',
    roomCode: 'C9R2PL',
    roomTitle: '한 판만 하고 감',
    stageId: 3,
    finalStatus: 'COMPLETED',
    gameResult: 'CLEARED',
    startedAt: '2026-07-31T13:48:10',
    endedAt: '2026-07-31T13:51:42',
  },
  {
    gameSessionId: errorGameId,
    roomSessionId: '20000000-0000-4000-8000-000000000004',
    roomCode: 'ERR404',
    roomTitle: '고인물 도전방',
    stageId: 2,
    finalStatus: 'ERROR',
    gameResult: null,
    startedAt: '2026-07-31T13:40:02',
    endedAt: '2026-07-31T13:41:18',
  },
  {
    gameSessionId: '10000000-0000-4000-8000-000000000005',
    roomSessionId: '20000000-0000-4000-8000-000000000005',
    roomCode: 'STOP77',
    roomTitle: '점검 전 마지막 게임',
    stageId: 1,
    finalStatus: 'ABORTED',
    gameResult: null,
    startedAt: '2026-07-31T12:58:22',
    endedAt: '2026-07-31T13:00:00',
  },
]

const baseEvents: SessionEvent[] = [
  {
    sequenceNo: 1,
    eventId: '30000000-0000-4000-8000-000000000001',
    eventType: 'GAME_STARTED',
    messageType: 'GAME_START_RESPONSE',
    severity: 'INFO',
    direction: 'INTERNAL',
    result: 'SUCCESS',
    actorId: null,
    summary: {
      roomCode: 'A7K2Q9',
      stageId: 2,
      participantCount: 4,
    },
    payloadSizeBytes: 248,
    durationMs: 12,
    errorId: null,
    occurredAt: '2026-07-31T14:01:20',
    serverReceivedAt: '2026-07-31T14:01:20',
  },
  {
    sequenceNo: 2,
    eventId: '30000000-0000-4000-8000-000000000002',
    eventType: 'ROUND_STARTED',
    messageType: 'GAME_ROUND_START_RESPONSE',
    severity: 'INFO',
    direction: 'OUTBOUND',
    result: 'SUCCESS',
    actorId: null,
    summary: { stageId: 2, roundNo: 1 },
    payloadSizeBytes: 132,
    durationMs: 4,
    errorId: null,
    occurredAt: '2026-07-31T14:01:25',
    serverReceivedAt: '2026-07-31T14:01:25',
  },
  {
    sequenceNo: 3,
    eventId: '30000000-0000-4000-8000-000000000003',
    eventType: 'POSE_ACCEPTED',
    messageType: 'GAME_CAPTURING_RESPONSE',
    severity: 'INFO',
    direction: 'INBOUND',
    result: 'SUCCESS',
    actorId: '40000000-0000-4000-8000-000000000001',
    summary: {
      captureNo: 3,
      playerNo: 3,
      pointCount: 33,
      submittedCount: 3,
    },
    payloadSizeBytes: 1184,
    durationMs: 18,
    errorId: null,
    occurredAt: '2026-07-31T14:01:31',
    serverReceivedAt: '2026-07-31T14:01:31',
  },
]

const gameErrorEvent: SessionEvent = {
  sequenceNo: 4,
  eventId: '30000000-0000-4000-8000-000000000004',
  eventType: 'GAME_ERROR',
  messageType: 'GAME_ERROR',
  severity: 'ERROR',
  direction: 'INTERNAL',
  result: 'FAILED',
  actorId: null,
  summary: { errorCode: 'C004' },
  payloadSizeBytes: null,
  durationMs: null,
  errorId,
  occurredAt: '2026-07-31T13:41:18',
  serverReceivedAt: '2026-07-31T13:41:18',
}

const errors: ErrorSummary[] = [
  {
    errorId,
    source: 'SCHEDULER',
    severity: 'ERROR',
    errorCode: 'C004',
    message: 'Redis game session state is inconsistent',
    roomSessionId: '20000000-0000-4000-8000-000000000004',
    gameSessionId: errorGameId,
    createdAt: '2026-07-31T13:41:18',
  },
  {
    errorId: '90000000-0000-4000-8000-000000000002',
    source: 'REST',
    severity: 'ERROR',
    errorCode: 'C004',
    message: 'Unexpected database timeout',
    roomSessionId: null,
    gameSessionId: null,
    createdAt: '2026-07-31T12:22:06',
  },
]

const detail: ErrorDetail = {
  ...errors[0],
  exceptionClass: 'java.lang.IllegalStateException',
  stackTrace: `java.lang.IllegalStateException: Redis game session state is inconsistent
\tat org.ssafy.bodybuilder.domain.game.repository.redis.RedisGameSessionRepository.savePose(RedisGameSessionRepository.java:184)
\tat org.ssafy.bodybuilder.domain.game.service.PoseSubmissionService.submitPose(PoseSubmissionService.java:41)
\tat java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1144)`,
  userId: '40000000-0000-4000-8000-000000000001',
  requestId: null,
  traceId: '8d1f30c2e1594a43',
  eventId: gameErrorEvent.eventId,
  context: {
    operation: 'GAME_TERMINATION',
    captureNo: 4,
    worker: 'game-task-3',
  },
  expiresAt: '2026-08-07T13:41:18',
}

export const adminHandlers = [
  http.get(api('/api/v1/admin/sessions/active'), async () => {
    await delay(180)
    return HttpResponse.json(activeGames)
  }),
  http.get(api('/api/v1/admin/sessions/archived'), async () => {
    await delay(180)
    return HttpResponse.json(archivedGames)
  }),
  http.get(api('/api/v1/admin/sessions/:gameSessionId/events'), async ({ params }) => {
    await delay(160)
    if (params.gameSessionId === errorGameId) {
      return HttpResponse.json([...baseEvents.slice(0, 2), gameErrorEvent])
    }
    return HttpResponse.json(baseEvents)
  }),
  http.get(api('/api/v1/admin/errors'), async () => {
    await delay(160)
    return HttpResponse.json(errors)
  }),
  http.get(api('/api/v1/admin/errors/:errorId'), async ({ params }) => {
    await delay(120)
    if (params.errorId === errorId) return HttpResponse.json(detail)
    return HttpResponse.json(
      { ...detail, ...errors[1], exceptionClass: 'java.sql.SQLTimeoutException' },
    )
  }),
]
