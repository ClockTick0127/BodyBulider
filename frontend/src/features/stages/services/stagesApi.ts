import { request } from '../../../shared/api/request'
import defaultStageThumb from '../../../assets/example_image.png'

export const DEFAULT_STAGE_THUMB = defaultStageThumb

/**
 * 스테이지 조회 API. (API 명세서: 스테이지 목록 조회 / 스테이지 상세 조회)
 *
 * 서버는 snake_case로 응답하고, 화면에서는 camelCase를 쓴다.
 * 변환은 이 파일(API 경계)에서만 수행하고, 컴포넌트는 camelCase 타입만 본다.
 *
 * 공통 request()가 BaseResponse의 `data`를 벗겨 주므로 아래 응답 타입에는
 * status·message를 포함하지 않는다.
 */

export type StageDifficulty = '상' | '중' | '하'

export type StageListItem = {
  stageId: number
  name: string
  description: string
  difficulty: StageDifficulty
  thumbnailUrl: string | null
}

type StageListItemResponse = {
  stage_id: number
  name: string
  description: string
  difficulty: StageDifficulty
  thumbnail_url: string | null
}

export type StageRound = {
  roundId: number
  roundNo: number
}

export type StageDetail = StageListItem & {
  rounds: StageRound[]
}

/**
 * ⚠️ 상세 조회 명세의 필드 표에는 `rounds_id`, 예시 JSON에는 `round_id`가 쓰여 있다.
 * 백엔드 확정 전까지 두 키를 모두 수용한다. 확정되면 하나만 남길 것.
 */
type StageRoundResponse = {
  round_id?: number
  rounds_id?: number
  round_no: number
}

type StageDetailResponse = StageListItemResponse & {
  rounds: StageRoundResponse[]
}

/** 목록 API에 code 필드가 없으므로 stageId를 두 자리 문자열로 표시한다. (01, 02 …) */
export const toStageCode = (stageId: number) => String(stageId).padStart(2, '0')

const toStageListItem = (item: StageListItemResponse): StageListItem => ({
  stageId: item.stage_id,
  name: item.name,
  description: item.description,
  difficulty: item.difficulty,
  thumbnailUrl: item.thumbnail_url || DEFAULT_STAGE_THUMB,
})

const toStageRound = (round: StageRoundResponse): StageRound => ({
  roundId: round.round_id ?? round.rounds_id ?? 0,
  roundNo: round.round_no,
})

/** 스테이지 목록 조회 */
export async function getStages(): Promise<StageListItem[]> {
  const data = await request<StageListItemResponse[]>('/api/v1/stages')
  return data.map(toStageListItem)
}

/** 스테이지 상세 조회 (라운드 정보 포함) */
export async function getStageDetail(stageId: number): Promise<StageDetail> {
  const data = await request<StageDetailResponse>(`/api/v1/stages/${stageId}`)
  return {
    ...toStageListItem(data),
    rounds: (data.rounds ?? []).map(toStageRound),
  }
}
