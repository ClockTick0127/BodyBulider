import { request } from '../../../shared/api/request'

/**
 * 랭킹·기록 조회 API.
 *
 * 서버는 snake_case로 응답하고 화면에서는 camelCase를 쓴다.
 * 변환은 이 파일(API 경계)에서만 수행한다.
 * 공통 request()가 BaseResponse의 `data`를 벗겨 주므로 응답 타입에 status·message는 없다.
 */

/* ─────────────────────────────────────────────
 * 스테이지 랭킹 — GET /api/v1/stages/{stageId}/rankings?limit={limit}
 * ───────────────────────────────────────────── */

export type StageRankingEntry = {
  rank: number
  uuid: string
  nickname: string
  stageClearTimeMs: number
  /** 기록 달성 일시 (ISO 8601) */
  createdAt: string
}

type StageRankingEntryResponse = {
  rank: number
  uuid: string
  nickname: string
  stage_clear_time_ms: number
  created_at: string
}

const toStageRankingEntry = (entry: StageRankingEntryResponse): StageRankingEntry => ({
  rank: entry.rank,
  uuid: entry.uuid,
  nickname: entry.nickname,
  stageClearTimeMs: entry.stage_clear_time_ms,
  createdAt: entry.created_at,
})

/**
 * 스테이지별 랭킹 조회.
 * 응답은 순위 배열이며, 내 순위·총 참가자 수는 제공되지 않는다.
 */
export async function getStageRanking(stageId: number, limit?: number): Promise<StageRankingEntry[]> {
  const query = limit == null ? '' : `?limit=${limit}`
  const data = await request<StageRankingEntryResponse[]>(`/api/v1/stages/${stageId}/rankings${query}`)
  return data.map(toStageRankingEntry)
}

/* ─────────────────────────────────────────────
 * 내 현재 랭킹 — GET /api/v1/users/me/rankings
 * ───────────────────────────────────────────── */

export type MyStageRanking = {
  stageId: number
  stageName: string
  rank: number
  totalParticipants: number
  stageClearTimeMs: number
  createdAt: string
}

export type MyRankingSummary = {
  bestRank: number | null
  bestStageCount: number
  bestStages: MyStageRanking[]
  stages: MyStageRanking[]
}

type MyStageRankingResponse = {
  stage_id: number
  stage_name: string
  rank: number
  total_participants: number
  stage_clear_time_ms: number
  created_at: string
}

type MyRankingSummaryResponse = {
  best_rank: number | null
  best_stage_count: number
  best_stages: MyStageRankingResponse[]
  stages: MyStageRankingResponse[]
}

const toMyStageRanking = (stage: MyStageRankingResponse): MyStageRanking => ({
  stageId: stage.stage_id,
  stageName: stage.stage_name,
  rank: stage.rank,
  totalParticipants: stage.total_participants,
  stageClearTimeMs: stage.stage_clear_time_ms,
  createdAt: stage.created_at,
})

/** 내 스테이지별 현재 순위와, 동일 최고 순위를 달성한 모든 스테이지를 조회한다. */
export async function getMyRanking(): Promise<MyRankingSummary> {
  const data = await request<MyRankingSummaryResponse>('/api/v1/users/me/rankings')
  return {
    bestRank: data.best_rank,
    bestStageCount: data.best_stage_count,
    bestStages: data.best_stages.map(toMyStageRanking),
    stages: data.stages.map(toMyStageRanking),
  }
}

/* ─────────────────────────────────────────────
 * 내 최고 기록 — GET /api/v1/users/me/records
 * ───────────────────────────────────────────── */

export type MyBestRecord = {
  stageId: number
  name: string
  stageClearTimeMs: number
  /** 기록 달성 일시 (ISO 8601) */
  createdAt: string
}

type MyBestRecordResponse = {
  stage_id: number
  name: string
  stage_clear_time_ms: number
  created_at: string
}

/**
 * 내 스테이지별 최고 기록.
 * 클리어한 스테이지만 배열로 내려오며, 개인 순위는 제공되지 않는다.
 * 미클리어 스테이지까지 보여주려면 스테이지 목록(getStages)과 조합해야 한다.
 */
export async function getMyRecords(): Promise<MyBestRecord[]> {
  const data = await request<MyBestRecordResponse[]>('/api/v1/users/me/records')
  return data.map((record) => ({
    stageId: record.stage_id,
    name: record.name,
    stageClearTimeMs: record.stage_clear_time_ms,
    createdAt: record.created_at,
  }))
}

/* ─────────────────────────────────────────────
 * ⚠️ 아래 두 API는 백엔드 명세가 아직 제공되지 않았다. (FE-API-01)
 *
 * 현재는 MSW 목업으로만 동작하는 화면 개발·테스트 전용이며,
 * 실제 백엔드와 연동된 적이 없다. 명세가 확정되면 경로·필드명
 * (recordId / roundNo / stage_clear_time_ms / created_at 등)에 맞춰
 * 아래 타입과 목업, MyPage의 상세 화면을 함께 수정해야 한다.
 *
 * 백엔드 담당자에게 요청할 명세:
 *   1) 스테이지별 내 전체 클리어 이력 조회
 *   2) 특정 클리어 기록의 라운드별 기록 조회
 * ───────────────────────────────────────────── */

/** 미확정 API 전용 스테이지 요약 (명세 확정 시 교체) */
export type StageSummary = {
  id: number
  code: string
  name: string
}

export type MyStageHistoryEntry = {
  recordId: number
  /** 총 클리어 시간(ms) = 라운드 시간의 합산 */
  clearTimeMs: number
  /** 클리어 일시 (ISO 8601) */
  clearedAt: string
}

/**
 * 부록(백엔드 요청 사양) 기준 응답 형태 — { stageId, bestTimeMs, entries }.
 * 스테이지 이름은 응답에 없으므로 화면에서 스테이지 목록의 값을 사용한다.
 */
export type MyStageHistoryResult = {
  stageId: number
  /** 최근 클리어 순으로 정렬된 이력 */
  entries: MyStageHistoryEntry[]
  bestTimeMs: number | null
}

export type MyRecordRound = {
  roundNo: number
  clearTimeMs: number
}

export type MyRecordRoundsResult = {
  recordId: number
  stage: StageSummary
  totalClearTimeMs: number
  rounds: MyRecordRound[]
}

/** ⚠️ 명세 미확정 — 목업 전용 */
export function getMyStageRecords(stageId: number) {
  return request<MyStageHistoryResult>(`/api/v1/users/me/records/stages/${stageId}`)
}

/** ⚠️ 명세 미확정 — 목업 전용 */
export function getMyRecordRounds(recordId: number) {
  return request<MyRecordRoundsResult>(`/api/v1/users/me/records/${recordId}/rounds`)
}
