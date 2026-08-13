import { mockUserUuid } from '../factories/identifiers'



/**
 * 목 데이터는 백엔드 API 명세와 같은 snake_case 형태로 둔다.
 * camelCase 변환은 프론트의 API 경계(stagesApi/recordsApi)에서만 수행한다.
 */

export type MockStageRound = {
  round_id: number
  round_no: number
}

export type MockStage = {
  stage_id: number
  name: string
  description: string
  difficulty: '상' | '중' | '하'
  thumbnail_url: string | null
  rounds: MockStageRound[]
}

export const stages: MockStage[] = [
  {
    stage_id: 1,
    name: '하수도',
    description: '하수도에서 무슨 소리가 들려! 빨리 확인해야 될 것 같아.',
    difficulty: '하',
    thumbnail_url: 'https://res.cloudinary.com/dkmtsb9k3/image/upload/v1785719586/stage1_thumbnail_wy1qjy.png',
    rounds: [
      { round_id: 101, round_no: 1 },
      { round_id: 102, round_no: 2 },
      { round_id: 103, round_no: 3 },
    ],
  },
  {
    stage_id: 2,
    name: '강가',
    description: '저 꼬마 친구가 돌아갈 수 있게 도와주자고!',
    difficulty: '중',
    thumbnail_url: 'https://res.cloudinary.com/dkmtsb9k3/image/upload/v1785719594/stage2_thumbnail_jkcrbw.png',
    rounds: [
      { round_id: 201, round_no: 1 },
      { round_id: 202, round_no: 2 },
      { round_id: 203, round_no: 3 },
    ],
  },
]

export type MockRankingEntry = {
  uuid: string
  nickname: string
  stage_clear_time_ms: number
  created_at: string
}

/**
 * 스테이지별 랭킹 보드. 클리어 시간 오름차순으로 미리 정렬해 둔다.
 * (동점자는 먼저 기록한 사용자가 앞에 오도록 배열 순서를 유지한다)
 */
export const rankingBoards: Record<number, MockRankingEntry[]> = {
  1: [
    { uuid: mockUserUuid(11), nickname: '다리 건설가', stage_clear_time_ms: 63120, created_at: '2026-07-18T09:12:00.000Z' },
    { uuid: mockUserUuid(12), nickname: '토이 마스터', stage_clear_time_ms: 68450, created_at: '2026-07-19T10:30:00.000Z' },
    { uuid: mockUserUuid(13), nickname: '점프점프', stage_clear_time_ms: 71980, created_at: '2026-07-21T08:05:00.000Z' },
    { uuid: mockUserUuid(1), nickname: 'syncup', stage_clear_time_ms: 84210, created_at: '2026-07-24T12:14:00.000Z' },
    { uuid: mockUserUuid(14), nickname: '삭제된 이용자', stage_clear_time_ms: 88800, created_at: '2026-07-17T11:45:00.000Z' },
    { uuid: mockUserUuid(15), nickname: '브릿지 헌터', stage_clear_time_ms: 93340, created_at: '2026-07-23T14:20:00.000Z' },
  ],
  2: [
    { uuid: mockUserUuid(16), nickname: '캐년 러너', stage_clear_time_ms: 95400, created_at: '2026-07-20T13:02:00.000Z' },
    { uuid: mockUserUuid(11), nickname: '다리 건설가', stage_clear_time_ms: 99180, created_at: '2026-07-22T09:41:00.000Z' },
    { uuid: mockUserUuid(1), nickname: 'syncup', stage_clear_time_ms: 101540, created_at: '2026-07-25T13:03:00.000Z' },
    { uuid: mockUserUuid(17), nickname: '포즈의 신', stage_clear_time_ms: 108920, created_at: '2026-07-19T16:28:00.000Z' },
  ],
}

export type MockClearRecord = {
  recordId: number
  stageId: number
  /** 총 클리어 시간(ms) = rounds의 합 */
  clearTimeMs: number
  /** ISO 8601 문자열 */
  clearedAt: string
  rounds: { roundNo: number; clearTimeMs: number }[]
}

/**
 * 내 클리어 이력.
 * ⚠️ 이력·라운드 상세 API는 아직 백엔드 명세가 제공되지 않았다(FE-API-01).
 * 이 데이터는 화면 개발·테스트 전용이며, 명세 확정 시 형태를 다시 맞춰야 한다.
 *
 * 확정 규칙상 기록 단위는 스테이지이며, 스테이지 클리어 시간 = 각 라운드 시간의 합산이다.
 * (미클리어인 스테이지 3·4는 이력이 없다)
 */
export const myClearHistory: MockClearRecord[] = [
  {
    recordId: 101,
    stageId: 1,
    clearTimeMs: 84210,
    clearedAt: '2026-07-24T12:14:00.000Z',
    rounds: [
      { roundNo: 1, clearTimeMs: 27400 },
      { roundNo: 2, clearTimeMs: 28310 },
      { roundNo: 3, clearTimeMs: 28500 },
    ],
  },
  {
    recordId: 102,
    stageId: 1,
    clearTimeMs: 91050,
    clearedAt: '2026-07-22T11:02:00.000Z',
    rounds: [
      { roundNo: 1, clearTimeMs: 29800 },
      { roundNo: 2, clearTimeMs: 30900 },
      { roundNo: 3, clearTimeMs: 30350 },
    ],
  },
  {
    recordId: 103,
    stageId: 1,
    clearTimeMs: 96740,
    clearedAt: '2026-07-20T10:41:00.000Z',
    rounds: [
      { roundNo: 1, clearTimeMs: 31200 },
      { roundNo: 2, clearTimeMs: 32540 },
      { roundNo: 3, clearTimeMs: 33000 },
    ],
  },
  {
    recordId: 201,
    stageId: 2,
    clearTimeMs: 101540,
    clearedAt: '2026-07-25T13:03:00.000Z',
    rounds: [
      { roundNo: 1, clearTimeMs: 33100 },
      { roundNo: 2, clearTimeMs: 34220 },
      { roundNo: 3, clearTimeMs: 34220 },
    ],
  },
  {
    recordId: 202,
    stageId: 2,
    clearTimeMs: 110870,
    clearedAt: '2026-07-21T12:35:00.000Z',
    rounds: [
      { roundNo: 1, clearTimeMs: 36500 },
      { roundNo: 2, clearTimeMs: 37100 },
      { roundNo: 3, clearTimeMs: 37270 },
    ],
  },
]

/** 해당 스테이지의 내 최고 기록. 이력이 없으면 null. */
export const bestRecordOfStage = (stageId: number) =>
  myClearHistory
    .filter((record) => record.stageId === stageId)
    .reduce<MockClearRecord | null>(
      (best, record) => (best == null || record.clearTimeMs < best.clearTimeMs ? record : best),
      null,
    )
