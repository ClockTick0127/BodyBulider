import { request } from '../../../shared/api/request'

/**
 * 맵 에디터(/dev/map-editor) 전용 API. ROLE_ADMIN 전용이다.
 *
 * 서버는 snake_case로 응답하고 화면에서는 camelCase를 쓴다.
 * 변환은 이 파일(API 경계)에서만 수행한다. (stagesApi.ts와 동일한 규칙)
 *
 * 공통 request()가 BaseResponse의 `data`를 벗겨 주므로 아래 응답 타입에는
 * status·message를 포함하지 않는다.
 */

/** map_config 원본. 에디터가 normalizeConfig()로 다시 정규화하므로 unknown으로 받는다. */
export type MapConfig = Record<string, unknown>

export type DevRoundSummary = {
  roundId: number
  stageId: number
  roundNo: number
  stageName: string | null
}

export type DevRoundDetail = DevRoundSummary & {
  mapConfig: MapConfig
}

type DevRoundSummaryResponse = {
  round_id: number
  stage_id: number
  round_no: number
  stage_name: string | null
}

type DevRoundDetailResponse = DevRoundSummaryResponse & {
  map_config: MapConfig
}

const toSummary = (r: DevRoundSummaryResponse): DevRoundSummary => ({
  roundId: r.round_id,
  stageId: r.stage_id,
  roundNo: r.round_no,
  stageName: r.stage_name,
})

const toDetail = (r: DevRoundDetailResponse): DevRoundDetail => ({
  ...toSummary(r),
  mapConfig: r.map_config,
})

/** 라운드 목록 조회 (에디터 드롭다운용, map_config 미포함) */
export async function getDevRounds(): Promise<DevRoundSummary[]> {
  const data = await request<DevRoundSummaryResponse[]>('/api/v1/dev/rounds')
  return (data ?? []).map(toSummary)
}

/** 라운드 map_config 조회 */
export async function getDevRound(roundId: number): Promise<DevRoundDetail> {
  const data = await request<DevRoundDetailResponse>(`/api/v1/dev/rounds/${roundId}`)
  return toDetail(data)
}

/** 라운드 map_config 저장 (덮어쓰기) */
export async function saveDevRound(roundId: number, mapConfig: MapConfig): Promise<DevRoundDetail> {
  const data = await request<DevRoundDetailResponse>(`/api/v1/dev/rounds/${roundId}`, {
    method: 'PUT',
    body: JSON.stringify({ map_config: mapConfig }),
  })
  return toDetail(data)
}

/** 드롭다운 표시용 라벨. 예: "1-2 · 하수도 (라운드 2)" */
export function formatRoundLabel(r: DevRoundSummary): string {
  const name = r.stageName ? ` · ${r.stageName}` : ''
  return `${r.stageId}-${r.roundNo}${name}`
}
