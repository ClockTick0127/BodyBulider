import { delay, http, HttpResponse } from 'msw'
import type { MockCustomMap, MockMapConfig } from '../data/customMaps'
import { authStore } from '../stores/auth.store'
import { customMapsStore } from '../stores/customMaps.store'
import { api } from '../utils/api'
import { apiError } from '../utils/errors'

/**
 * 창작마당 목 핸들러. 실제 API와 동일하게 snake_case로 주고받는다.
 * (camelCase 변환은 customMapApi가 담당)
 *
 * ⚠️ `/custom-maps/me`가 `/custom-maps/:stageId`보다 먼저 매칭되어야 한다.
 * 이 배열 안에서도, handlers/index.ts 등록에서도 순서를 지킬 것.
 */

const MAX_POLYGONS = 8
const MIN_VERTICES = 3
const MAX_VERTICES = 20
const MAX_GIMMICKS = 5
const MAX_POSE_PLAYERS = 4
const MAX_POSE_POINTS = 12
const ALLOWED_GIMMICKS = new Set(['JUMP_PAD', 'WIND', 'KILL_ZONE', 'WATER_PIPE'])
const DIFFICULTIES = new Set(['하', '중', '상'])
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

type CustomMapWriteBody = {
  title?: string
  description?: string
  difficulty?: MockCustomMap['difficulty']
  palette?: string[]
  is_public?: boolean
  map_config?: MockMapConfig
  /** 클리어 검증에 성공한 포즈. 공개 저장이면 필수다. */
  poses?: ([number, number][] | null)[]
}

type SimulateBody = {
  map_config?: MockMapConfig
  poses?: ([number, number][] | null)[]
}

/**
 * 서버 `MapConfigValidator`와 같은 규칙. 위반 사유를 그대로 message에 담아
 * 화면이 400 메시지를 사용자에게 보여 주는 경로까지 목으로 검증할 수 있게 한다.
 */
function validateMapConfig(mapConfig: MockMapConfig | undefined): string | null {
  if (!mapConfig || typeof mapConfig !== 'object') return 'map_config가 필요합니다.'

  const terrain = mapConfig.terrain ?? []
  if (!Array.isArray(terrain)) return 'terrain은 배열이어야 합니다.'
  if (terrain.length > MAX_POLYGONS) {
    return `지형 폴리곤은 최대 ${MAX_POLYGONS}개입니다. (현재 ${terrain.length}개)`
  }
  const invalid = terrain.findIndex(
    (polygon) => !Array.isArray(polygon) || polygon.length < MIN_VERTICES || polygon.length > MAX_VERTICES,
  )
  if (invalid >= 0) {
    return `${invalid + 1}번 폴리곤의 정점 수가 ${MIN_VERTICES}~${MAX_VERTICES} 범위를 벗어났습니다.`
  }

  const gimmicks = mapConfig.gimmicks ?? []
  if (!Array.isArray(gimmicks)) return 'gimmicks는 배열이어야 합니다.'
  if (gimmicks.length > MAX_GIMMICKS) {
    return `기믹은 최대 ${MAX_GIMMICKS}개입니다. (현재 ${gimmicks.length}개)`
  }
  const banned = gimmicks.find((gimmick) => !ALLOWED_GIMMICKS.has(String(gimmick?.type)))
  if (banned) return `창작마당에서 쓸 수 없는 기믹입니다: ${String(banned.type)}`

  return null
}

/**
 * 클리어 검증. 실제 서버는 받은 포즈로 물리 시뮬레이션을 재현해 클리어를 확인한다.
 * 목에서는 "유효한 포즈(좌표 2개 이상)가 하나라도 있으면 성공"으로 흉내 낸다.
 * (simulate 핸들러의 성공 조건과 같아야 화면 흐름이 어긋나지 않는다)
 */
function verifyClear(poses: CustomMapWriteBody['poses']): boolean {
  return (poses ?? []).some((pose) => Array.isArray(pose) && pose.length >= 2)
}

function validateMeta(body: CustomMapWriteBody): string | null {
  if (!body.description?.trim()) return '맵 설명은 필수입니다.'
  if (!DIFFICULTIES.has(body.difficulty as string)) return "난이도는 '하'·'중'·'상' 중 하나여야 합니다."
  const palette = body.palette ?? []
  if (palette.length !== 3 || palette.some((color) => !HEX_COLOR.test(color))) {
    return '팔레트는 #RRGGBB 형식의 색 3개여야 합니다.'
  }
  return null
}

const toSummaryResponse = (map: MockCustomMap, nickname: string | null) => {
  const { map_config: _mapConfig, ...summary } = map
  return { ...summary, is_mine: customMapsStore.isMine(map, nickname) }
}

const toDetailResponse = (map: MockCustomMap, nickname: string | null) => ({
  ...toSummaryResponse(map, nickname),
  map_config: map.map_config,
})

export const customMapHandlers = [
  // 리터럴 경로가 /:stageId 템플릿보다 먼저 와야 한다.
  http.get(api('/api/v1/custom-maps/me'), async () => {
    await delay(250)
    const currentUser = authStore.getSessionUser()
    if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

    return HttpResponse.json(
      customMapsStore
        .list()
        .filter((map) => customMapsStore.isMine(map, currentUser.nickname))
        .map((map) => toSummaryResponse(map, currentUser.nickname)),
    )
  }),

  http.post<never, SimulateBody>(api('/api/v1/custom-maps/simulate'), async ({ request }) => {
    await delay(400)
    const currentUser = authStore.getSessionUser()
    if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

    const body = await request.json()
    const configError = validateMapConfig(body.map_config)
    if (configError) return apiError('CM001', configError, 400)

    const poses = body.poses ?? []
    if (poses.length > MAX_POSE_PLAYERS) {
      return apiError('CM001', `포즈는 최대 ${MAX_POSE_PLAYERS}명분까지 보낼 수 있습니다.`, 400)
    }
    const overflow = poses.findIndex((pose) => Array.isArray(pose) && pose.length > MAX_POSE_POINTS)
    if (overflow >= 0) {
      return apiError('CM001', `${overflow + 1}번 플레이어의 좌표가 ${MAX_POSE_POINTS}개를 넘습니다.`, 400)
    }

    // 실제 물리 엔진 대신 시작점 → 도착점을 잇는 직선 궤적을 돌려준다.
    // 화면(재생 루프·결과 배지)이 응답 형태를 제대로 다루는지 확인하는 용도다.
    const config = body.map_config as MockMapConfig
    const [sx, sy] = config.startPoint ?? [0, 0]
    const [ex, ey] = config.endPoint ?? [0, 0]
    const frameCount = 60
    const points = Array.from({ length: frameCount }, (_, index) => {
      const t = index / (frameCount - 1)
      return [sx + (ex - sx) * t, sy + (ey - sy) * t, (ex - sx) / frameCount, (ey - sy) / frameCount]
    })
    // 포즈를 하나도 안 냈으면 실제 게임처럼 실패 처리한다.
    const hasPose = poses.some((pose) => Array.isArray(pose) && pose.length >= 2)
    return HttpResponse.json({ intervalMs: 30, points, result: hasPose, grounded: null })
  }),

  http.get(api('/api/v1/custom-maps'), async ({ request }) => {
    await delay(250)
    const currentUser = authStore.getSessionUser()
    if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

    const url = new URL(request.url)
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase()
    const difficulty = url.searchParams.get('difficulty')

    return HttpResponse.json(
      customMapsStore
        .list()
        .filter((map) => map.is_public)
        .filter((map) => !difficulty || map.difficulty === difficulty)
        .filter(
          (map) =>
            !search ||
            map.title.toLowerCase().includes(search) ||
            map.creator_nickname.toLowerCase().includes(search),
        )
        .map((map) => toSummaryResponse(map, currentUser.nickname)),
    )
  }),

  http.post<never, CustomMapWriteBody>(api('/api/v1/custom-maps'), async ({ request }) => {
    await delay(400)
    const currentUser = authStore.getSessionUser()
    if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

    const body = await request.json()
    if (!body.title?.trim()) return apiError('CM001', '맵 제목은 필수입니다.', 400)
    const metaError = validateMeta(body)
    if (metaError) return apiError('CM001', metaError, 400)
    const configError = validateMapConfig(body.map_config)
    if (configError) return apiError('CM001', configError, 400)

    // 공개 업로드는 클리어 검증을 통과해야 한다.
    const isPublic = body.is_public ?? true
    const isCleared = verifyClear(body.poses)
    if (isPublic && !isCleared) {
      return apiError('ST004', '클리어 검증을 통과하지 못했습니다. 테스트 플레이를 먼저 성공해 주세요.', 400)
    }

    const created = customMapsStore.create({
      title: body.title.trim(),
      description: body.description!.trim(),
      difficulty: body.difficulty!,
      palette: body.palette!,
      isPublic,
      mapConfig: body.map_config!,
      creatorNickname: currentUser.nickname,
      isCleared,
    })
    return HttpResponse.json(toDetailResponse(created, currentUser.nickname), { status: 201 })
  }),

  http.get<{ stageId: string }>(api('/api/v1/custom-maps/:stageId'), async ({ params }) => {
    await delay(250)
    const currentUser = authStore.getSessionUser()
    if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

    const map = customMapsStore.find(Number(params.stageId))
    if (!map) return apiError('CM002', '존재하지 않는 맵입니다.', 404)
    if (!map.is_public && !customMapsStore.isMine(map, currentUser.nickname)) {
      return apiError('C003', '비공개 맵입니다.', 403)
    }

    return HttpResponse.json(toDetailResponse(map, currentUser.nickname))
  }),

  http.put<{ stageId: string }, CustomMapWriteBody>(
    api('/api/v1/custom-maps/:stageId'),
    async ({ params, request }) => {
      await delay(350)
      const currentUser = authStore.getSessionUser()
      if (!currentUser) return apiError('AU001', '로그인이 필요합니다.', 401)

      const map = customMapsStore.find(Number(params.stageId))
      if (!map) return apiError('CM002', '존재하지 않는 맵입니다.', 404)
      if (!customMapsStore.isMine(map, currentUser.nickname)) {
        return apiError('C003', '본인이 만든 맵만 수정할 수 있습니다.', 403)
      }

      const body = await request.json()
      const metaError = validateMeta(body)
      if (metaError) return apiError('CM001', metaError, 400)
      const configError = validateMapConfig(body.map_config)
      if (configError) return apiError('CM001', configError, 400)

      /*
       * 서버(CustomMapService.verifyClear)와 같은 규칙이다.
       * **저장된 is_cleared 는 보지 않는다.** 공개 저장은 이번 요청의 poses 로만 판정하고,
       * poses 가 없으면 곧바로 ST004 다. (클라이언트 플래그를 믿지 않는 설계)
       */
      const isPublic = body.is_public ?? map.is_public
      const isCleared = verifyClear(body.poses)
      if (isPublic && !isCleared) {
        return apiError('ST004', '공개 업로드하려면 클리어에 성공한 포즈를 함께 제출해야 합니다.', 400)
      }

      const updated = customMapsStore.update(map, {
        description: body.description!.trim(),
        difficulty: body.difficulty!,
        palette: body.palette!,
        isPublic,
        mapConfig: body.map_config!,
        isCleared,
      })
      return HttpResponse.json(toDetailResponse(updated, currentUser.nickname))
    },
  ),
]
