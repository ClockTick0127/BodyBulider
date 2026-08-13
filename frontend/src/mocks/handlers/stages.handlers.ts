import { delay, http, HttpResponse } from 'msw'
import { stages } from '../data/game'
import { api } from '../utils/api'
import { apiError } from '../utils/errors'

/**
 * 스테이지 목록·상세 목 핸들러.
 * 실제 API와 동일하게 snake_case로 응답한다. (camelCase 변환은 stagesApi가 담당)
 */
export const stageHandlers = [
  http.get(api('/api/v1/stages'), async () => {
    await delay(250)
    // 목록 응답에는 rounds를 포함하지 않는다.
    return HttpResponse.json(
      stages.map(({ rounds: _rounds, ...stage }) => stage),
    )
  }),

  http.get<{ stageId: string }>(api('/api/v1/stages/:stageId'), async ({ params }) => {
    await delay(250)
    const stage = stages.find((entry) => entry.stage_id === Number(params.stageId))
    if (!stage) return apiError('ST001', '존재하지 않는 스테이지입니다.', 404)

    return HttpResponse.json(stage)
  }),
]
