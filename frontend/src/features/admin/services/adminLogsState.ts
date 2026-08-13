import type { ActiveGame, ArchivedGame, ErrorSummary } from './adminLogsApi'
import type { AdminErrorDelta, AdminSessionDelta } from './adminLogsSocket'

const newestFirst = (left: string, right: string) =>
  new Date(right).getTime() - new Date(left).getTime()

export function applyActiveGameDelta(
  games: ActiveGame[],
  delta: AdminSessionDelta,
): ActiveGame[] {
  if (delta.type === 'SESSION_ARCHIVED') {
    return games.filter((game) => game.gameSessionId !== delta.gameSessionId)
  }
  if (!delta.activeGame) return games

  const next = games.filter(
    (game) => game.gameSessionId !== delta.gameSessionId,
  )
  next.push(delta.activeGame)
  return next
    .sort((left, right) => newestFirst(left.lastEventAt, right.lastEventAt))
    .slice(0, 100)
}

export function applyArchivedGameDelta(
  games: ArchivedGame[],
  delta: AdminSessionDelta,
): ArchivedGame[] {
  if (delta.type !== 'SESSION_ARCHIVED' || !delta.archivedGame) return games

  const next = games.filter(
    (game) => game.gameSessionId !== delta.gameSessionId,
  )
  next.push(delta.archivedGame)
  return next
    .sort((left, right) => newestFirst(left.endedAt, right.endedAt))
    .slice(0, 100)
}

export function applyErrorDelta(
  errors: ErrorSummary[],
  delta: AdminErrorDelta,
): ErrorSummary[] {
  const next = errors.filter((error) => error.errorId !== delta.error.errorId)
  next.push(delta.error)
  return next
    .sort((left, right) => newestFirst(left.createdAt, right.createdAt))
    .slice(0, 100)
}
