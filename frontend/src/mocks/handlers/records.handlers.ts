import { delay, http, HttpResponse } from 'msw'
import type {
  MyRecordRoundsResult,
  MyStageHistoryResult,
} from '../../features/records/services/recordsApi'
import { bestRecordOfStage, myClearHistory, stages } from '../data/game'
import { api } from '../utils/api'
import { apiError } from '../utils/errors'
import type { MockApiResponse } from '../utils/errors'

/** 미확정 API 목업이 쓰는 스테이지 요약 형태 */
const toStageSummary = (stageId: number) => {
  const stage = stages.find((entry) => entry.stage_id === stageId)
  if (!stage) return null
  return { id: stage.stage_id, code: String(stage.stage_id).padStart(2, '0'), name: stage.name }
}

export const recordHandlers = [
  /**
   * 내 최고 기록 — 클리어한 스테이지만 배열로 응답한다.
   * (전체 스테이지 목록과의 조합은 화면에서 수행)
   */
  http.get(api('/api/v1/users/me/records'), async () => {
    await delay(300)
    const records = stages
      .map((stage) => {
        const best = bestRecordOfStage(stage.stage_id)
        if (!best) return null
        return {
          stage_id: stage.stage_id,
          name: stage.name,
          stage_clear_time_ms: best.clearTimeMs,
          created_at: best.clearedAt,
        }
      })
      .filter((record): record is NonNullable<typeof record> => record != null)

    return HttpResponse.json(records)
  }),

  /* ── 아래 두 핸들러는 백엔드 명세 미제공 API의 화면 개발·테스트용 목업이다. (FE-API-01)
   *    명세 확정 시 경로·응답 형태를 함께 수정해야 한다. ── */

  http.get<{ stageId: string }, never, MockApiResponse<MyStageHistoryResult>>(
    api('/api/v1/users/me/records/stages/:stageId'),
    async ({ params }) => {
      await delay(300)
      const stage = toStageSummary(Number(params.stageId))
      if (!stage) return apiError('ST001', '존재하지 않는 스테이지입니다.', 404)

      const entries = myClearHistory
        .filter((record) => record.stageId === stage.id)
        // 최근 클리어 순
        .sort((a, b) => Date.parse(b.clearedAt) - Date.parse(a.clearedAt))
        .map(({ recordId, clearTimeMs, clearedAt }) => ({ recordId, clearTimeMs, clearedAt }))

      // 부록 규격: { stageId, bestTimeMs, entries }
      return HttpResponse.json({
        stageId: stage.id,
        entries,
        bestTimeMs: bestRecordOfStage(stage.id)?.clearTimeMs ?? null,
      })
    },
  ),

  http.get<{ recordId: string }, never, MockApiResponse<MyRecordRoundsResult>>(
    api('/api/v1/users/me/records/:recordId/rounds'),
    async ({ params }) => {
      await delay(300)
      const record = myClearHistory.find((entry) => entry.recordId === Number(params.recordId))
      if (!record) return apiError('RC002', '존재하지 않는 기록입니다.', 404)

      const stage = toStageSummary(record.stageId)
      if (!stage) return apiError('ST001', '존재하지 않는 스테이지입니다.', 404)

      return HttpResponse.json({
        recordId: record.recordId,
        stage,
        totalClearTimeMs: record.clearTimeMs,
        rounds: record.rounds.map(({ roundNo, clearTimeMs }) => ({ roundNo, clearTimeMs })),
      })
    },
  ),
]
