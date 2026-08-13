import { ApiError, request } from '../../../shared/api/request'

/**
 * 창작마당(유저 커스텀 맵) API.
 *
 * `features/dev/services/devMapApi.ts`와 분리한다. 그쪽은 `/api/v1/dev/**`이고
 * `SecurityConfig`에서 `hasRole("ADMIN")`이라 일반 유저가 호출하면 403이 난다.
 *
 * 서버는 snake_case로 응답하고 화면은 camelCase만 본다. 변환은 이 파일(API 경계)에서만
 * 수행한다. 공통 request()가 BaseResponse의 `data`를 벗겨 주므로 아래 응답 타입에는
 * status·message를 포함하지 않는다.
 *
 * ⚠️ `map_config` 내부는 변환하지 않는다. `startPoint`·`endPoint`·`launchVelocity` 같은
 * 키가 `stage_rounds.map_config`에 그대로 저장되어 서버 물리 엔진이 직접 읽는다.
 * 바깥 껍데기(`stage_id` → `stageId`)만 바꾸고 값은 통째로 넘긴다.
 */

/** map_config 원본. 에디터가 자체 정규화하므로 unknown으로 받는다. (devMapApi와 동일) */
export type MapConfig = Record<string, unknown>

/**
 * 커스텀 맵 예약 ID 대역의 시작값.
 *
 * 서버는 커스텀 맵을 별도 테이블로 분리하지 않고 `stages`에 `stage_id >= 10000`으로
 * 넣는다. 그래서 stageId 하나로 공식/UGC를 가릴 수 있다.
 * (`창작마당_구현명세서_v9.md` §2-1 예약 ID 대역 방식)
 */
export const CUSTOM_STAGE_ID_MIN = 10000

/** 이 stageId가 창작마당 맵인가. 로비·게임에서 공식 맵과 갈라내는 기준이다. */
export const isCustomStageId = (stageId: number | null | undefined): boolean =>
  stageId != null && stageId >= CUSTOM_STAGE_ID_MIN

export type CustomMapDifficulty = '하' | '중' | '상'

export const DIFFICULTIES: readonly CustomMapDifficulty[] = ['하', '중', '상']

/**
 * 서버 `MapConfigValidator`와 같은 상한. 화면에서 미리 막아 주기 위한 사본이며
 * 진실의 원천은 서버다. (초과 시 POST·PUT·simulate 모두 400)
 */
export const MAP_LIMITS = {
  polygons: 8,
  verticesMin: 3,
  verticesMax: 20,
  gimmicks: 5,
  posePlayers: 4,
  posePointsPerPlayer: 12,
} as const

/** 서버 allowlist. 여기 없는 타입(BLACKOUT 등)은 UGC에서 거부된다. */
export const ALLOWED_GIMMICK_TYPES = ['JUMP_PAD', 'WIND', 'KILL_ZONE', 'WATER_PIPE'] as const

export type CustomMapSummary = {
  stageId: number
  title: string
  description: string
  difficulty: CustomMapDifficulty
  creatorNickname: string
  /** 썸네일 그라디언트용 3색 (#RRGGBB) */
  palette: string[]
  polygonCount: number
  gimmickCount: number
  playCount: number
  /** Phase 1에서는 항상 0 (좋아요는 Phase 2) */
  likeCount: number
  isPublic: boolean
  isMine: boolean
  /**
   * 클리어 검증(테스트 플레이 성공) 완료 여부.
   * 공개 업로드는 이 값이 true여야 한다. 맵을 수정하면 서버가 다시 false로 되돌린다.
   */
  isCleared: boolean
  createdAt: string
}

export type CustomMapDetail = CustomMapSummary & {
  /** 내부는 camelCase 원본 그대로. 변환 금지. */
  mapConfig: MapConfig
}

type CustomMapSummaryResponse = {
  stage_id: number
  title: string
  description: string
  difficulty: CustomMapDifficulty
  creator_nickname: string
  palette: string[]
  polygon_count: number
  gimmick_count: number
  play_count: number
  like_count: number
  is_public: boolean
  is_mine: boolean
  is_cleared: boolean
  created_at: string
}

type CustomMapDetailResponse = CustomMapSummaryResponse & {
  map_config: MapConfig
}

const toSummary = (m: CustomMapSummaryResponse): CustomMapSummary => ({
  stageId: m.stage_id,
  title: m.title,
  description: m.description,
  difficulty: m.difficulty,
  creatorNickname: m.creator_nickname,
  palette: m.palette ?? [],
  polygonCount: m.polygon_count,
  gimmickCount: m.gimmick_count,
  playCount: m.play_count,
  likeCount: m.like_count,
  isPublic: m.is_public,
  isMine: m.is_mine,
  // 구버전 서버 응답에 필드가 없으면 미검증으로 본다. (공개 차단 쪽이 안전하다)
  isCleared: m.is_cleared ?? false,
  createdAt: m.created_at,
})

const toDetail = (m: CustomMapDetailResponse): CustomMapDetail => ({
  ...toSummary(m),
  mapConfig: m.map_config,
})

export type CustomMapListQuery = {
  /** 맵 제목 또는 제작자 닉네임 부분 일치 */
  search?: string
  difficulty?: CustomMapDifficulty
}

const buildQuery = ({ search, difficulty }: CustomMapListQuery = {}) => {
  const params = new URLSearchParams()
  if (search?.trim()) params.set('search', search.trim())
  if (difficulty) params.set('difficulty', difficulty)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** 공개 맵 목록 조회 (`is_public = TRUE`) */
export async function getCustomMaps(query: CustomMapListQuery = {}): Promise<CustomMapSummary[]> {
  const data = await request<CustomMapSummaryResponse[]>(`/api/v1/custom-maps${buildQuery(query)}`)
  return (data ?? []).map(toSummary)
}

/** 내가 만든 맵 전체 (비공개 포함) */
export async function getMyCustomMaps(): Promise<CustomMapSummary[]> {
  const data = await request<CustomMapSummaryResponse[]>('/api/v1/custom-maps/me')
  return (data ?? []).map(toSummary)
}

/** 맵 상세 (공개 맵 또는 본인 맵만. 아니면 403) */
export async function getCustomMap(stageId: number): Promise<CustomMapDetail> {
  const data = await request<CustomMapDetailResponse>(`/api/v1/custom-maps/${stageId}`)
  return toDetail(data)
}

export type CustomMapCreatePayload = {
  title: string
  description: string
  difficulty: CustomMapDifficulty
  palette: string[]
  isPublic: boolean
  mapConfig: MapConfig
  /**
   * 클리어 검증에 성공한 포즈. 서버가 이 포즈로 시뮬레이션을 재현해 클리어를 확인한다.
   * **`isPublic === true`면 필수다.** 없으면 서버가 400(ST004)을 준다.
   */
  poses?: SimulationPoses
}

/** 신규 맵 저장. 서버가 `stage_id`를 10000부터 채번한다. */
export async function createCustomMap(payload: CustomMapCreatePayload): Promise<CustomMapDetail> {
  const data = await request<CustomMapDetailResponse>('/api/v1/custom-maps', {
    method: 'POST',
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      difficulty: payload.difficulty,
      palette: payload.palette,
      is_public: payload.isPublic,
      map_config: payload.mapConfig,
      poses: payload.poses,
    }),
  })
  return toDetail(data)
}

/** `title`은 수정할 수 없다 — `stages.name`이 UNIQUE라 서버가 지원하지 않는다. */
export type CustomMapUpdatePayload = Omit<CustomMapCreatePayload, 'title'>

/** 기존 맵 수정 (본인만) */
export async function updateCustomMap(
  stageId: number,
  payload: CustomMapUpdatePayload,
): Promise<CustomMapDetail> {
  const data = await request<CustomMapDetailResponse>(`/api/v1/custom-maps/${stageId}`, {
    method: 'PUT',
    body: JSON.stringify({
      description: payload.description,
      difficulty: payload.difficulty,
      palette: payload.palette,
      is_public: payload.isPublic,
      map_config: payload.mapConfig,
      poses: payload.poses,
    }),
  })
  return toDetail(data)
}

/**
 * 공개 여부만 바꾼다.
 *
 * `PUT`은 부분 수정이 아니라 전체 갱신이라 `map_config`를 빼고 보내면 맵이 비워지거나
 * 400이 난다. 목록 응답에는 `map_config`가 없으므로 상세를 먼저 조회해 나머지 필드를
 * 그대로 되돌려 보낸다. (요청 2회는 이 때문이며, 서버에 부분 수정 API가 생기면 대체 가능)
 */
export async function setCustomMapVisibility(
  stageId: number,
  isPublic: boolean,
): Promise<CustomMapDetail> {
  /*
   * 공개 전환은 목록에서 할 수 없다.
   *
   * 서버(CustomMapService.verifyClear)는 `is_public = true` 요청에 `poses`가 없으면
   * 저장된 `is_cleared`와 무관하게 ST004를 던진다. 매번 물리 시뮬레이션으로 재현하는 설계다.
   * 목록 화면에는 에디터가 없어 포즈를 만들 수 없으므로, 요청을 보내 봐야 반드시 실패한다.
   * → 요청 전에 막고 에디터로 안내한다. (비공개로 내리는 것은 검증과 무관해 그대로 된다)
   */
  if (isPublic) {
    throw new ApiError(
      '공개 전환은 에디터에서만 할 수 있습니다. 편집을 눌러 테스트 플레이를 성공시킨 뒤 저장해 주세요.',
      400,
      'ST004',
    )
  }
  const current = await getCustomMap(stageId)
  return updateCustomMap(stageId, {
    description: current.description,
    difficulty: current.difficulty,
    palette: current.palette,
    isPublic,
    mapConfig: current.mapConfig,
  })
}

/** 포즈 1명분. 각 좌표는 [x, y] 정규화 값. 미제출 슬롯은 null 또는 빈 배열. */
export type SimulationPoses = ([number, number][] | null)[]

/** `/api/v1/dev/simulate`와 동일한 응답 규격 (`SimulationResult`) */
export type CustomMapSimulationResult = {
  intervalMs: number | null
  points: number[][] | null
  result: boolean | null
  grounded: boolean[] | null
}

/**
 * 테스트 플레이.
 *
 * ⚠️ 요청 키가 `/api/v1/dev/simulate`와 다르다. 기존 엔드포인트는 `mapConfig`(camelCase)이고
 * 이쪽은 **`map_config`(snake_case)** 다. 그대로 두면 서버가 null로 읽어 400이 난다.
 */
export function simulateCustomMap(payload: {
  mapConfig: MapConfig
  poses: SimulationPoses
}): Promise<CustomMapSimulationResult> {
  return request<CustomMapSimulationResult>('/api/v1/custom-maps/simulate', {
    method: 'POST',
    body: JSON.stringify({ map_config: payload.mapConfig, poses: payload.poses }),
  })
}

/** 물길 프리뷰 응답 — [x1, y1, x2, y2, halfWidth] 행. 빈 배열 = "물 없음"(권위적). */
export type WaterPreviewResult = {
  waterFlows: number[][]
}

/**
 * 에디터 물길 프리뷰 (개발명세서_FE_물기믹_유니온물길 FE-WATER-03).
 *
 * simulate와 같은 컨벤션: 요청 키 `map_config`(snake_case), 응답 키 `waterFlows`(camelCase).
 * poses는 정규화 [0..1]² 좌표, 인덱스 = players 인덱스, null 엔트리 허용.
 * 계산 실패는 5xx로 온다 — 호출부는 마지막 성공 결과를 유지한다.
 */
export function previewWaterFlows(
  payload: { mapConfig: MapConfig; poses: (([number, number][]) | null)[] },
  signal?: AbortSignal,
): Promise<WaterPreviewResult> {
  return request<WaterPreviewResult>('/api/v1/custom-maps/water-preview', {
    method: 'POST',
    body: JSON.stringify({ map_config: payload.mapConfig, poses: payload.poses }),
    signal,
  })
}

/** 카드·상세 모달 공통 썸네일 그라디언트. palette가 모자라면 남은 색을 반복한다. */
export function paletteGradient(palette: string[]): string {
  const [a = '#315f9d', b = a, c = b] = palette
  return `linear-gradient(135deg, ${a} 0%, ${b} 60%, ${c} 100%)`
}
