import sewerDownstream from '../../../maps/1-1_하수도_하류.png'
import sewerMidstream from '../../../maps/1-2_하수도_중류.png'
import sewerUpstream from '../../../maps/1-3_하수도_상류.png'
import riversideDownstream from '../../../maps/2-1_강가_하류.png'
import riversideMidstream from '../../../maps/2-2_강가_중류.png'
import riversideUpstream from '../../../maps/2-3_강가_상류.png'

export type MapDesign = {
  stage: number
  round: number
  name: string
  className: string
  /** 배경 이미지 에셋. 전용 에셋이 없는 커스텀 맵은 null이고 배경을 CSS가 그린다. */
  backgroundImage: string | null
  bgmPath: string
  effects: MapEffect[]
}

export type MapEffect = 'falling-water' | 'rain' | 'wind' | 'jump-pad'

const MAP_DESIGNS: Record<string, MapDesign> = {
  '1-1': {
    stage: 1,
    round: 1,
    name: '하수도 하류',
    className: 'game-board--sewer game-board--sewer-downstream',
    backgroundImage: sewerDownstream,
    bgmPath: '/sounds/Stage1_bgm.mp3',
    effects: [],
  },
  '1-2': {
    stage: 1,
    round: 2,
    name: '하수도 중류',
    className: 'game-board--sewer game-board--sewer-midstream',
    backgroundImage: sewerMidstream,
    bgmPath: '/sounds/Stage1_bgm.mp3',
    effects: [],
  },
  '1-3': {
    stage: 1,
    round: 3,
    name: '하수도 상류',
    className: 'game-board--sewer game-board--sewer-upstream',
    backgroundImage: sewerUpstream,
    bgmPath: '/sounds/Stage1_bgm.mp3',
    effects: ['falling-water'],
  },
  '2-1': {
    stage: 2,
    round: 1,
    name: '강가 하류',
    className: 'game-board--riverside game-board--riverside-downstream',
    backgroundImage: riversideDownstream,
    bgmPath: '/sounds/Stage2_bgm.mp3',
    effects: ['rain', 'wind'],
  },
  '2-2': {
    stage: 2,
    round: 2,
    name: '강가 중류',
    className: 'game-board--riverside game-board--riverside-midstream',
    backgroundImage: riversideMidstream,
    bgmPath: '/sounds/Stage2_bgm.mp3',
    effects: ['rain', 'jump-pad'],
  },
  '2-3': {
    stage: 2,
    round: 3,
    name: '강가 상류',
    className: 'game-board--riverside game-board--riverside-upstream',
    backgroundImage: riversideUpstream,
    bgmPath: '/sounds/Stage2_bgm.mp3',
    effects: ['rain'],
  },
  /**
   * 창작마당(UGC) 맵 및 미등록 맵의 기본 배경.
   * 유저 맵은 지형이 자유롭게 그려지므로 특정 스테이지의 배경 이미지를 씌우면 어울리지 않는다.
   * 전용 에셋 없이 CSS 그라디언트(.game-board--custom)로만 그린다.
   * stage/round는 어떤 실제 맵 번호와도 겹치지 않도록 0으로 둔다.
   */
  custom: {
    stage: 0,
    round: 0,
    name: '창작마당 맵',
    className: 'game-board--custom',
    backgroundImage: null,
    bgmPath: '/sounds/Main_bgm.mp3',
    effects: [],
  },
}

/** stage / round 번호로 직접 조회한다. (맵 에디터의 배경 자동 매칭용) */
export function findMapDesign(stage: number, round: number): MapDesign | null {
  return MAP_DESIGNS[`${stage}-${round}`] ?? null
}

export function getStageAssetUrls(stage: number) {
  return Object.values(MAP_DESIGNS)
    .filter((design) => design.stage === stage)
    .flatMap((design) => [design.backgroundImage, design.bgmPath])
    .filter((url): url is string => url !== null)
}

/**
 * 맵 번호는 백엔드가 `stageId * 1000 + roundNo`로 인코딩한다.
 * (`GameConstants.ROUND_MODULAR = 1_000`, `GameStartService`·`GameSession` 참조)
 *
 * 자릿수로 자르면 안 된다. 커스텀 맵은 stageId가 10000부터 시작하므로
 * 첫 자리·끝 자리를 잘라 쓰면 `10000001`이 `'1-1'`(하수도)로 잘못 매칭된다.
 *
 * 등록되지 않은 맵(창작마당 UGC 포함)은 custom 기본 배경으로 떨어진다.
 */
export function resolveMapDesign(mapNum: number): MapDesign | null {
  if (!Number.isSafeInteger(mapNum) || mapNum < 1000) return null

  const stage = Math.floor(mapNum / 1000)
  const round = mapNum % 1000

  return MAP_DESIGNS[`${stage}-${round}`] ?? MAP_DESIGNS.custom ?? null
}
