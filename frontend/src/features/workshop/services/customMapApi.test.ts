import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/setupTests'
import { authStore } from '../../../mocks/stores/auth.store'
import { customMapsStore } from '../../../mocks/stores/customMaps.store'
import { defaultUsers } from '../../../mocks/data/users'
import {
  createCustomMap,
  getCustomMap,
  getCustomMaps,
  getMyCustomMaps,
  paletteGradient,
  setCustomMapVisibility,
  simulateCustomMap,
  type SimulationPoses,
} from './customMapApi'

const SAMPLE_CONFIG = {
  startPoint: [90, 870],
  endPoint: [870, 120],
  players: [[170, 760]],
  terrain: [[[0, 920], [1000, 920], [1000, 1000], [0, 1000]]],
  gimmicks: [],
}

beforeEach(() => {
  // 목 핸들러가 세션을 확인하므로 로그인 상태로 만든다.
  authStore.setSessionUser(defaultUsers[0])
  customMapsStore.reset()
})

describe('창작마당 목록 조회', () => {
  it('snake_case 응답을 camelCase로 변환하고 snake_case 키를 남기지 않는다', async () => {
    const maps = await getCustomMaps()

    expect(maps.length).toBeGreaterThan(0)
    const [first] = maps
    expect(first).toMatchObject({
      stageId: expect.any(Number),
      creatorNickname: expect.any(String),
      polygonCount: expect.any(Number),
      gimmickCount: expect.any(Number),
      playCount: expect.any(Number),
      isPublic: true,
    })
    // 변환 누락이 있으면 아래 키가 그대로 새어 나온다.
    for (const leaked of ['stage_id', 'creator_nickname', 'polygon_count', 'is_public']) {
      expect(first).not.toHaveProperty(leaked)
    }
  })

  it('공개 맵만 내려준다', async () => {
    const maps = await getCustomMaps()
    expect(maps.every((map) => map.isPublic)).toBe(true)
    expect(maps.some((map) => map.stageId === 10006)).toBe(false)
  })

  it('검색어를 쿼리 파라미터로 보낸다', async () => {
    const maps = await getCustomMaps({ search: '빙하' })
    expect(maps).toHaveLength(1)
    expect(maps[0].title).toBe('빙하 점프')
  })

  it('제작자 닉네임으로도 검색된다', async () => {
    const maps = await getCustomMaps({ search: '김민준' })
    expect(maps.map((map) => map.title)).toEqual(['용암 지대 탈출'])
  })

  it('난이도 필터를 적용한다', async () => {
    const maps = await getCustomMaps({ difficulty: '상' })
    expect(maps.length).toBeGreaterThan(0)
    expect(maps.every((map) => map.difficulty === '상')).toBe(true)
  })

  it('검색과 난이도를 함께 적용한다', async () => {
    expect(await getCustomMaps({ search: '빙하', difficulty: '상' })).toEqual([])
  })
})

describe('내 맵 조회', () => {
  it('비공개 맵은 /me 에만 나오고 공개 목록에는 없다', async () => {
    const mine = await getMyCustomMaps()
    const publicMaps = await getCustomMaps()

    expect(mine.some((map) => map.stageId === 10006)).toBe(true)
    expect(publicMaps.some((map) => map.stageId === 10006)).toBe(false)
  })

  it('본인 맵은 상세 조회가 되고 map_config를 함께 준다', async () => {
    const detail = await getCustomMap(10006)
    expect(detail.isMine).toBe(true)
    expect(detail.mapConfig).toHaveProperty('terrain')
    // map_config 내부는 camelCase 원본 그대로여야 한다. 물리 엔진이 직접 읽는다.
    expect(detail.mapConfig).toHaveProperty('startPoint')
    expect(detail.mapConfig).not.toHaveProperty('start_point')
  })
})

/** 클리어 검증에 성공했다고 볼 수 있는 최소 포즈. */
const CLEARED_POSES: SimulationPoses = [[[0.1, 0.2], [0.3, 0.4]]]

const basePayload = {
  description: '설명',
  difficulty: '중' as const,
  palette: ['#112233', '#445566', '#778899'],
  mapConfig: SAMPLE_CONFIG,
}

describe('저장', () => {
  it('신규 저장은 10000 이상의 stageId를 받는다', async () => {
    const created = await createCustomMap({
      ...basePayload,
      title: '테스트 맵',
      isPublic: true,
      poses: CLEARED_POSES,
    })

    expect(created.stageId).toBeGreaterThanOrEqual(10000)
    expect(created.title).toBe('테스트 맵')
    // 폴리곤·기믹 수는 서버가 map_config에서 세어 비정규화한다.
    expect(created.polygonCount).toBe(1)
    expect(created.gimmickCount).toBe(0)
    expect(created.isCleared).toBe(true)
  })

  it('폴리곤 상한(8개)을 넘기면 서버 400 메시지를 그대로 전달한다', async () => {
    const tooMany = {
      ...SAMPLE_CONFIG,
      terrain: Array.from({ length: 9 }, () => [[0, 0], [10, 0], [10, 10]]),
    }

    await expect(
      createCustomMap({
        ...basePayload,
        title: '과다 폴리곤',
        isPublic: true,
        mapConfig: tooMany,
        poses: CLEARED_POSES,
      }),
    ).rejects.toThrow(/폴리곤은 최대 8개/)
  })

  it('허용되지 않은 기믹은 거부된다', async () => {
    await expect(
      createCustomMap({
        ...basePayload,
        title: '금지 기믹',
        isPublic: true,
        mapConfig: { ...SAMPLE_CONFIG, gimmicks: [{ type: 'BLACKOUT' }] },
        poses: CLEARED_POSES,
      }),
    ).rejects.toThrow(/BLACKOUT/)
  })

  it('비공개 전환은 map_config를 유지한 채 is_public만 바꾼다', async () => {
    const before = await getCustomMap(10000)
    const after = await setCustomMapVisibility(10000, false)

    expect(after.isPublic).toBe(false)
    expect(after.mapConfig).toEqual(before.mapConfig)
    expect(after.description).toBe(before.description)
    expect(after.difficulty).toBe(before.difficulty)
    // 수정이지 복제가 아니다.
    expect((await getMyCustomMaps()).filter((map) => map.stageId === 10000)).toHaveLength(1)
  })
})

describe('클리어 검증', () => {
  it('공개 저장에 포즈가 없으면 400(ST004)이다', async () => {
    await expect(
      createCustomMap({ ...basePayload, title: '미검증 공개', isPublic: true }),
    ).rejects.toMatchObject({ status: 400, code: 'ST004' })
  })

  it('클리어하지 못한 포즈로는 공개 저장할 수 없다', async () => {
    await expect(
      createCustomMap({ ...basePayload, title: '실패 포즈', isPublic: true, poses: [null, null] }),
    ).rejects.toMatchObject({ status: 400, code: 'ST004' })
  })

  it('비공개 저장은 검증 없이도 된다 — 만드는 도중에도 남길 수 있어야 한다', async () => {
    const created = await createCustomMap({ ...basePayload, title: '작업 중', isPublic: false })

    expect(created.isPublic).toBe(false)
    expect(created.isCleared).toBe(false)
  })

  /*
   * 목록에서는 공개로 올릴 수 없다. 서버가 저장할 때마다 poses 로 클리어를 재현하는데
   * 목록 화면에는 에디터가 없어 포즈를 만들 수 없다. 검증 여부와 무관하게 막는다.
   */
  it('공개 전환은 검증 여부와 무관하게 요청 전에 막고 에디터로 안내한다', async () => {
    await expect(setCustomMapVisibility(10006, true)).rejects.toMatchObject({ code: 'ST004' })
    // 이미 검증된 맵이어도 마찬가지다. 포즈가 없으면 서버가 어차피 400을 준다.
    await setCustomMapVisibility(10000, false)
    await expect(setCustomMapVisibility(10000, true)).rejects.toThrow(/에디터에서만/)
    // 서버 상태가 바뀌지 않아야 한다.
    expect((await getCustomMap(10006)).isPublic).toBe(false)
  })

  it('비공개로 내리는 것은 검증 없이도 된다', async () => {
    const hidden = await setCustomMapVisibility(10000, false)
    expect(hidden.isPublic).toBe(false)
  })

  it('목록 응답의 is_cleared를 camelCase로 변환한다', async () => {
    const mine = await getMyCustomMaps()
    expect(mine.find((map) => map.stageId === 10000)?.isCleared).toBe(true)
    expect(mine.find((map) => map.stageId === 10006)?.isCleared).toBe(false)
    expect(mine[0]).not.toHaveProperty('is_cleared')
  })

  it('저장 요청 본문에 poses를 실어 보낸다', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('*/api/v1/custom-maps', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ status: 400, code: 'ST004', message: 'stop' }, { status: 400 })
      }),
    )

    await createCustomMap({
      ...basePayload,
      title: '포즈 전송',
      isPublic: true,
      poses: CLEARED_POSES,
    }).catch(() => {})

    expect(captured!.poses).toEqual(CLEARED_POSES)
  })
})

describe('시뮬레이션', () => {
  it('요청 본문을 map_config(snake_case)로 보낸다', async () => {
    let captured: Record<string, unknown> | null = null
    server.use(
      http.post('*/api/v1/custom-maps/simulate', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ intervalMs: 30, points: [[0, 0, 0, 0]], result: true, grounded: null })
      }),
    )

    await simulateCustomMap({ mapConfig: SAMPLE_CONFIG, poses: [[[0.1, 0.2], [0.3, 0.4]]] })

    // 기존 /dev/simulate 는 mapConfig(camelCase)라 그대로 두면 서버가 null로 읽어 400이 난다.
    expect(captured).toHaveProperty('map_config')
    expect(captured).not.toHaveProperty('mapConfig')
    expect(captured!.map_config).toEqual(SAMPLE_CONFIG)
  })

  it('SimulationResult 규격(intervalMs·points·result)을 그대로 받는다', async () => {
    const result = await simulateCustomMap({
      mapConfig: SAMPLE_CONFIG,
      poses: [[[0.1, 0.2], [0.3, 0.4]]],
    })

    expect(result.intervalMs).toBe(30)
    expect(Array.isArray(result.points)).toBe(true)
    expect(result.result).toBe(true)
  })

  it('포즈 좌표 상한(12개)을 넘기면 400', async () => {
    const longPose = Array.from({ length: 13 }, (_, i) => [i / 100, 0.5] as [number, number])
    await expect(
      simulateCustomMap({ mapConfig: SAMPLE_CONFIG, poses: [longPose] }),
    ).rejects.toThrow(/좌표가 12개를 넘습니다/)
  })
})

describe('paletteGradient', () => {
  it('3색을 135deg 그라디언트로 만든다', () => {
    expect(paletteGradient(['#111111', '#222222', '#333333'])).toBe(
      'linear-gradient(135deg, #111111 0%, #222222 60%, #333333 100%)',
    )
  })

  it('색이 모자라면 마지막 색을 이어 써서 항상 유효한 CSS를 만든다', () => {
    expect(paletteGradient(['#111111'])).toBe(
      'linear-gradient(135deg, #111111 0%, #111111 60%, #111111 100%)',
    )
    expect(paletteGradient([])).toContain('linear-gradient(135deg,')
  })
})
