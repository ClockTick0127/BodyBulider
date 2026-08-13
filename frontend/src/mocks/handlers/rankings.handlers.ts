import { delay, http, HttpResponse } from 'msw'
import { rankingBoards, stages } from '../data/game'
import { mockUserUuid } from '../factories/identifiers'
import { api } from '../utils/api'
import { apiError } from '../utils/errors'

/**
 * 스테이지 랭킹 목 핸들러 — GET /api/v1/stages/{stageId}/rankings?limit={limit}
 *
 * 실제 API와 동일하게 순위 배열만 snake_case로 응답한다.
 * (내 순위·총 참가자 수는 이 API가 제공하지 않는다)
 */
export const rankingHandlers = [
  http.get(
    api('/api/v1/users/me/rankings'),
    async () => {
      await delay(300)
      const userUuid = mockUserUuid(1)
      const myStages = stages.flatMap((stage) => {
        const board = rankingBoards[stage.stage_id] ?? []
        const index = board.findIndex((entry) => entry.uuid === userUuid)
        if (index < 0) return []
        const entry = board[index]
        return [{
          stage_id: stage.stage_id,
          stage_name: stage.name,
          rank: index + 1,
          total_participants: board.length,
          stage_clear_time_ms: entry.stage_clear_time_ms,
          created_at: entry.created_at,
        }]
      })
      const bestRank = myStages.length > 0
        ? Math.min(...myStages.map((stage) => stage.rank))
        : null
      const bestStages = bestRank == null
        ? []
        : myStages.filter((stage) => stage.rank === bestRank)

      return HttpResponse.json({
        best_rank: bestRank,
        best_stage_count: bestStages.length,
        best_stages: bestStages,
        stages: myStages,
      })
    },
  ),
  http.get<{ stageId: string }>(
    api('/api/v1/stages/:stageId/rankings'),
    async ({ params, request }) => {
      await delay(300)
      const stage = stages.find((entry) => entry.stage_id === Number(params.stageId))
      if (!stage) return apiError('ST001', '존재하지 않는 스테이지입니다.', 404)

      const board = rankingBoards[stage.stage_id] ?? []
      // 보드는 클리어 시간 오름차순으로 정렬되어 있고, 동점자는 먼저 기록한 쪽이 앞선다.
      const ranked = board.map((entry, index) => ({ rank: index + 1, ...entry }))

      const limitParam = new URL(request.url).searchParams.get('limit')
      const limit = limitParam == null ? null : Number(limitParam)
      const entries = limit != null && Number.isFinite(limit) && limit > 0
        ? ranked.slice(0, limit)
        : ranked

      return HttpResponse.json(entries)
    },
  ),
]
