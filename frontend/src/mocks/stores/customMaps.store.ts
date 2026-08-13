import { defaultCustomMaps, type MockCustomMap, type MockMapConfig } from '../data/customMaps'
import { readSessionStorage, writeSessionStorage } from '../utils/storage'

const CUSTOM_MAPS_KEY = 'msw:custom-maps'

/**
 * 실제 서버는 `custom_maps.creator_uuid`로 소유자를 판정한다.
 * 목에는 UUID가 없고 어떤 계정으로 로그인해도 `내 맵` 탭을 검증할 수 있어야 하므로,
 * 시드 맵 2개(공개 1 + 비공개 1)를 항상 "내 맵"으로 취급한다.
 * 나머지는 제작자 닉네임이 로그인 닉네임과 같을 때만 내 맵이다.
 */
const SEEDED_MINE_STAGE_IDS = new Set([10000, 10006])

const cloneDefaults = () => defaultCustomMaps.map((map) => structuredClone(map))

let maps = readSessionStorage<MockCustomMap[]>(CUSTOM_MAPS_KEY, cloneDefaults())

/** 서버가 `stages` 테이블에서 10000부터 채번하는 것을 흉내 낸다. */
const nextStageId = () => Math.max(9999, ...maps.map((map) => map.stage_id)) + 1

export const customMapsStore = {
  list: () => maps,

  find: (stageId: number) => maps.find((map) => map.stage_id === stageId),

  isMine: (map: MockCustomMap, nickname: string | null) =>
    SEEDED_MINE_STAGE_IDS.has(map.stage_id) || (!!nickname && map.creator_nickname === nickname),

  create(input: {
    title: string
    description: string
    difficulty: MockCustomMap['difficulty']
    palette: string[]
    isPublic: boolean
    mapConfig: MockMapConfig
    creatorNickname: string
    isCleared: boolean
  }): MockCustomMap {
    const created: MockCustomMap = {
      stage_id: nextStageId(),
      title: input.title,
      description: input.description,
      difficulty: input.difficulty,
      creator_nickname: input.creatorNickname,
      palette: input.palette,
      polygon_count: input.mapConfig?.terrain?.length ?? 0,
      gimmick_count: input.mapConfig?.gimmicks?.length ?? 0,
      play_count: 0,
      like_count: 0,
      is_public: input.isPublic,
      is_cleared: input.isCleared,
      created_at: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      map_config: input.mapConfig,
    }
    maps.push(created)
    // 새로 만든 맵은 그 세션에서 바로 내 맵으로 보여야 한다.
    SEEDED_MINE_STAGE_IDS.add(created.stage_id)
    this.save()
    return created
  },

  update(
    map: MockCustomMap,
    input: {
      description: string
      difficulty: MockCustomMap['difficulty']
      palette: string[]
      isPublic: boolean
      mapConfig: MockMapConfig
      isCleared: boolean
    },
  ): MockCustomMap {
    map.description = input.description
    map.difficulty = input.difficulty
    map.palette = input.palette
    map.is_public = input.isPublic
    map.map_config = input.mapConfig
    map.is_cleared = input.isCleared
    map.polygon_count = input.mapConfig?.terrain?.length ?? 0
    map.gimmick_count = input.mapConfig?.gimmicks?.length ?? 0
    this.save()
    return map
  },

  reset() {
    maps = cloneDefaults()
    this.save()
  },

  save() {
    writeSessionStorage(CUSTOM_MAPS_KEY, maps)
  },
}
