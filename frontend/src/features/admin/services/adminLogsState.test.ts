import { describe, expect, it } from 'vitest'
import type { ActiveGame, ArchivedGame, ErrorSummary } from './adminLogsApi'
import type { AdminErrorDelta, AdminSessionDelta } from './adminLogsSocket'
import {
  applyActiveGameDelta,
  applyArchivedGameDelta,
  applyErrorDelta,
} from './adminLogsState'

const activeGame = (id: string, lastEventAt: string): ActiveGame => ({
  gameSessionId: id,
  roomSessionId: `room-${id}`,
  roomCode: 'ABC123',
  roomTitle: '테스트 방',
  stageId: 1,
  participantCount: 2,
  latestEventType: 'GAME_STARTED',
  startedAt: '2026-08-01T10:00:00',
  lastEventAt,
})

const sessionDelta = (
  type: AdminSessionDelta['type'],
  active: ActiveGame | null,
  archived: ArchivedGame | null = null,
): AdminSessionDelta => ({
  type,
  gameSessionId: active?.gameSessionId ?? archived?.gameSessionId ?? 'game-1',
  activeGame: active,
  archivedGame: archived,
  eventId: 'event-1',
  serverReceivedAt: '2026-08-01T10:01:00',
})

describe('admin log delta state', () => {
  it('진행 중 세션을 추가하고 최신 이벤트 순서로 정렬한다', () => {
    const current = [activeGame('game-1', '2026-08-01T10:00:00')]
    const added = activeGame('game-2', '2026-08-01T10:01:00')

    expect(applyActiveGameDelta(
      current,
      sessionDelta('SESSION_CREATED', added),
    ).map((game) => game.gameSessionId)).toEqual(['game-2', 'game-1'])
  })

  it('종료 delta를 진행 목록에서 제거하고 종료 목록에 추가한다', () => {
    const archived: ArchivedGame = {
      gameSessionId: 'game-1',
      roomSessionId: 'room-1',
      roomCode: 'ABC123',
      roomTitle: '테스트 방',
      stageId: 1,
      finalStatus: 'COMPLETED',
      gameResult: 'CLEARED',
      startedAt: '2026-08-01T10:00:00',
      endedAt: '2026-08-01T10:02:00',
    }
    const delta = sessionDelta('SESSION_ARCHIVED', null, archived)

    expect(applyActiveGameDelta(
      [activeGame('game-1', '2026-08-01T10:01:00')],
      delta,
    )).toEqual([])
    expect(applyArchivedGameDelta([], delta)).toEqual([archived])
  })

  it('오류 delta를 중복 없이 최신 순서로 유지한다', () => {
    const error: ErrorSummary = {
      errorId: 'error-1',
      source: 'REST',
      severity: 'ERROR',
      errorCode: 'C004',
      message: 'failure',
      roomSessionId: null,
      gameSessionId: null,
      createdAt: '2026-08-01T10:03:00',
    }
    const delta: AdminErrorDelta = { type: 'ERROR_CREATED', error }

    expect(applyErrorDelta([error], delta)).toEqual([error])
  })
})
