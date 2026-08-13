import { describe, expect, it } from 'vitest'
import {
  calculateSimulationElapsedMs,
  calculateSimulationDurationMs,
  calculateSimulationRemainingMs,
  calculateRemainingInitialDelayMs,
  clampCameraPercent,
  extendTerrainToOverscan,
  shouldShowCaptureTimer,
} from './GamePage'

describe('GamePage score calculation', () => {
  it('uses the same point interval calculation as the backend', () => {
    expect(calculateSimulationDurationMs(3, 50)).toBe(100)
    expect(calculateSimulationDurationMs(1, 50)).toBe(0)
  })

  it('derives elapsed playback time from the server frame interval', () => {
    expect(calculateSimulationElapsedMs(2, 5, 50)).toBe(100)
    expect(calculateSimulationElapsedMs(10, 5, 50)).toBe(200)
    expect(calculateSimulationElapsedMs(-1, 5, 50)).toBe(0)
  })

  it('counts down the 15-second limit using the server frame interval', () => {
    expect(calculateSimulationRemainingMs(0, 50)).toBe(15_000)
    expect(calculateSimulationRemainingMs(2, 50)).toBe(14_900)
    expect(calculateSimulationRemainingMs(300, 50)).toBe(0)
    expect(calculateSimulationRemainingMs(400, 50)).toBe(0)
  })
})

describe('GamePage cutscene timing', () => {
  it('GAME_STARTED 수신 후 경과 시간을 첫 촬영 대기 시간에서 제외한다', () => {
    expect(calculateRemainingInitialDelayMs(16_000, 1_000, 11_000)).toBe(6_000)
    expect(calculateRemainingInitialDelayMs(5_000, 1_000, 7_000)).toBe(0)
  })
})

describe('GamePage terrain overscan', () => {
  it('1000 map의 좌우 경계 지형만 -500~1500으로 연장한다', () => {
    expect(extendTerrainToOverscan(
      [[0, 800], [250, 700], [1000, 800]],
      1000,
      500,
    )).toEqual([[-500, 800], [250, 700], [1500, 800]])
  })

  it('경계에 닿지 않은 지형 좌표는 변경하지 않는다', () => {
    expect(extendTerrainToOverscan(
      [[100, 800], [500, 600], [900, 800]],
      1000,
      500,
    )).toEqual([[100, 800], [500, 600], [900, 800]])
  })
})

describe('GamePage camera boundary', () => {
  it('각 축을 확대 화면의 반경만큼 독립적으로 제한한다', () => {
    expect(clampCameraPercent(5, 2)).toBe(25)
    expect(clampCameraPercent(45, 2)).toBe(45)
    expect(clampCameraPercent(95, 2)).toBe(75)
  })

  it('overview에서는 항상 월드 중앙을 사용한다', () => {
    expect(clampCameraPercent(10, 1)).toBe(50)
  })
})

describe('GamePage capture timer visibility', () => {
  it('촬영 요청을 받아 촬영 시간이 남아 있을 때만 표시한다', () => {
    expect(shouldShowCaptureTimer('CAPTURING', 3000)).toBe(true)
    expect(shouldShowCaptureTimer('MAP_PREVIEW', 3000)).toBe(false)
    expect(shouldShowCaptureTimer('WAITING_RESULT', 3000)).toBe(false)
  })

  it('촬영 phase가 남아 있어도 제한 시간이 끝나면 숨긴다', () => {
    expect(shouldShowCaptureTimer('CAPTURING', 0)).toBe(false)
  })
})
