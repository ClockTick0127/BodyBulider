import { describe, expect, it } from 'vitest'
import type { SimulationFrame } from '@/features/game/services/gameProtocol'
import { buildActionTimeline } from './buildActionTimeline'

const INTERVAL = 50
/** 실서버 스케일 */
const MAP = 1000

const frame = (x: number, y: number, vx: number, vy: number): SimulationFrame => [x, y, vx, vy]

/** vy 를 그대로 나열해 프레임 배열을 만든다. (x·vx 는 고정) */
const framesFromVy = (vyList: number[], vx = 190): SimulationFrame[] =>
  vyList.map((vy, i) => frame(i * 9, 0, vx, vy))

describe('buildActionTimeline — 경사 보행 vs 자유낙하', () => {
  it('경사 보행(vy=134 유지, 변화량 0)은 fall 이 아니다', () => {
    // 45° 경사를 걸으면 vy 가 134까지 나오지만 자유낙하가 아니다.
    const timeline = buildActionTimeline(framesFromVy(Array(12).fill(134)), INTERVAL, MAP)

    expect(timeline).not.toContain('fall')
    expect(timeline.every((action) => action === 'move')).toBe(true)
  })

  it('자유낙하(변화량 36 연속)는 해당 구간이 fall 이다', () => {
    // 0에서 시작해 프레임당 36씩 증가 = GRAVITY 720 × 0.05s
    const vy = Array.from({ length: 12 }, (_, i) => i * 36)
    const timeline = buildActionTimeline(framesFromVy(vy), INTERVAL, MAP)

    // 첫 프레임은 정지 취급, 이후는 전부 낙하
    expect(timeline.slice(1).every((action) => action === 'fall')).toBe(true)
  })
})

describe('buildActionTimeline — 최소 지속시간 필터', () => {
  it('1프레임짜리 변화량 스파이크는 fall 로 잡지 않는다', () => {
    // 지형 요철로 한 프레임만 vy 가 튄 경우
    const timeline = buildActionTimeline(
      framesFromVy([0, 0, 0, 60, 60, 60, 60, 60, 60]),
      INTERVAL,
      MAP,
    )

    expect(timeline).not.toContain('fall')
  })

  it('튕김 중 1프레임 접촉은 계속 fall 이고 landing 이 아니다', () => {
    // 낙하 → 1프레임만 vy 유지(접촉) → 다시 낙하
    const vy = [0, 36, 72, 108, 144, 144, 180, 216, 252, 288, 324, 360]
    const timeline = buildActionTimeline(framesFromVy(vy), INTERVAL, MAP)

    expect(timeline).not.toContain('landing')
    expect(timeline.slice(1).every((action) => action === 'fall')).toBe(true)
  })
})

describe('buildActionTimeline — 착지', () => {
  // 낙하 6프레임 후 접지해서 vy 가 0으로 유지되는 궤적
  const vy = [0, 36, 72, 108, 144, 180, 216, ...Array(14).fill(216)]
  const timeline = buildActionTimeline(framesFromVy(vy), INTERVAL, MAP)

  it('낙하 → 접지 전이 직후는 landing 이다', () => {
    const firstGround = timeline.findIndex((action, i) => i > 0 && action !== 'fall')
    expect(timeline[firstGround]).toBe('landing')
  })

  it('전이 후 8프레임(375ms)이 지나면 move 또는 idle 로 돌아온다', () => {
    const landingCount = timeline.filter((action) => action === 'landing').length
    expect(landingCount).toBe(Math.ceil(375 / INTERVAL))
    expect(timeline.at(-1)).toBe('move')
  })
})

describe('buildActionTimeline — 지상 동작', () => {
  it('지상이고 vx 가 크면 move', () => {
    const timeline = buildActionTimeline(framesFromVy(Array(6).fill(0), 190), INTERVAL, MAP)
    expect(timeline.every((action) => action === 'move')).toBe(true)
  })

  it('지상이고 vx 가 0이면 idle', () => {
    const timeline = buildActionTimeline(framesFromVy(Array(6).fill(0), 0), INTERVAL, MAP)
    expect(timeline.every((action) => action === 'idle')).toBe(true)
  })
})

describe('buildActionTimeline — 맵 스케일 정규화 (회귀 방지 핵심)', () => {
  it('mock 스케일(mapWidth=10, vx=0.9)에서도 move 로 판정한다', () => {
    const frames = Array.from({ length: 6 }, (_, i) => frame(1.1 + i * 0.05, 4, 0.9, 0))
    const timeline = buildActionTimeline(frames, INTERVAL, 10)

    expect(timeline.every((action) => action === 'move')).toBe(true)
  })

  it('실서버 스케일(mapWidth=1000, vx=190)에서도 move 로 판정한다', () => {
    const frames = Array.from({ length: 6 }, (_, i) => frame(100 + i * 9, 400, 190, 0))
    const timeline = buildActionTimeline(frames, INTERVAL, 1000)

    expect(timeline.every((action) => action === 'move')).toBe(true)
  })

  it('낙하 임계값도 스케일과 무관해야 한다 — 두 스케일이 같은 결과를 낸다', () => {
    // 같은 물리 현상을 두 스케일로 표현한다. mock 중력 7.2 = 실서버 720 / 100
    const mockFrames = Array.from({ length: 12 }, (_, i) => frame(i * 0.08, 0, 1.6, i * 0.36))
    const realFrames = Array.from({ length: 12 }, (_, i) => frame(i * 8, 0, 160, i * 36))

    const mockTimeline = buildActionTimeline(mockFrames, INTERVAL, 10)
    const realTimeline = buildActionTimeline(realFrames, INTERVAL, 1000)

    // 임계값을 mapWidth 로 한 번 더 나누면 mock 에서만 fall 이 사라진다.
    expect(mockTimeline).toEqual(realTimeline)
    expect(mockTimeline.slice(1).every((action) => action === 'fall')).toBe(true)
  })
})

describe('buildActionTimeline — 경계', () => {
  it('타임라인 길이는 frames 길이와 같다', () => {
    const frames = framesFromVy(Array(37).fill(0))
    expect(buildActionTimeline(frames, INTERVAL, MAP)).toHaveLength(37)
  })

  it('빈 배열·mapWidth 0 은 예외 없이 빈 배열을 돌려준다', () => {
    expect(buildActionTimeline([], INTERVAL, MAP)).toEqual([])
    expect(buildActionTimeline(framesFromVy([0, 0]), INTERVAL, 0)).toEqual([])
    expect(buildActionTimeline(framesFromVy([0, 0]), 0, MAP)).toEqual([])
  })

  it('float 은 타임라인에 들어가지 않는다 (실패 연출은 GamePage 담당)', () => {
    const vy = Array.from({ length: 20 }, (_, i) => i * 36)
    expect(buildActionTimeline(framesFromVy(vy), INTERVAL, MAP)).not.toContain('float')
  })
})
