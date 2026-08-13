import { describe, expect, it } from 'vitest'
import { computeWaterFlows } from './waterFlow'

describe('computeWaterFlows', () => {
  it('포즈 표면을 만나면 아래쪽 끝을 따라 흐른 뒤 다시 낙하한다', () => {
    const flows = computeWaterFlows({
      gimmicks: [{
        type: 'WATER_PIPE',
        outlet: [500, 100],
        flowDirection: [0, 1],
        flowSpeed: 300,
        width: 40,
      }],
      terrain: [],
      posePaths: [[[400, 500], [500, 500], [600, 600]]],
    })

    expect(flows).toHaveLength(3)
    expect(flows[0]).toMatchObject({ x1: 500, y1: 100, x2: 500, width: 40 })
    expect(flows[0].y2).toBe(500)
    expect(flows[1]).toMatchObject({ x1: 500, x2: 400, y2: 500 })
    expect(flows[1].y1).toBeCloseTo(flows[0].y2)
    expect(flows[2]).toMatchObject({ x1: 400, x2: 400, y2: 1000 })
  })

  it('수평 표면에서는 백엔드 규칙대로 왼쪽 끝으로 흐른다', () => {
    const flows = computeWaterFlows({
      gimmicks: [{
        type: 'WATER_PIPE',
        outlet: [500, 100],
        flowDirection: [0, 1],
        flowSpeed: 300,
        width: 36,
      }],
      terrain: [],
      posePaths: [[[400, 500], [600, 500]]],
    })

    expect(flows).toEqual([
      { x1: 500, y1: 100, x2: 500, y2: 500, width: 36 },
      { x1: 500, y1: 500, x2: 400, y2: 500, width: 36 },
      { x1: 400, y1: 500.01, x2: 400, y2: 1000, width: 36 },
    ])
  })

  it('0.01px 이하의 초미세 경사를 수평으로 취급해 왼쪽으로 흐른다', () => {
    const flows = computeWaterFlows({
      gimmicks: [{
        type: 'WATER_PIPE',
        outlet: [500, 100],
        flowDirection: [0, 1],
        flowSpeed: 300,
        width: 36,
      }],
      terrain: [],
      posePaths: [[[400, 500], [600, 500.005]]],
    })

    expect(flows).toHaveLength(3)
    expect(flows[1]).toMatchObject({ x2: 400, y2: 500 })
    expect(flows[2]).toMatchObject({ x1: 400, y1: 500.01, x2: 400, y2: 1000 })
  })

  it('WATER_PIPE가 없으면 물길을 만들지 않는다', () => {
    expect(computeWaterFlows({ gimmicks: [], terrain: [], posePaths: [] })).toEqual([])
  })

  it('does not follow a downhill continuation that reverses the current direction', () => {
    const flows = computeWaterFlows({
      gimmicks: [{
        type: 'WATER_PIPE',
        outlet: [550, 100],
        flowDirection: [0, 1],
        flowSpeed: 300,
        width: 36,
      }],
      terrain: [],
      posePaths: [[
        [600, 600],
        [500, 500],
        [600, 500],
      ]],
    })

    expect(flows.slice(0, 3)).toEqual([
      { x1: 550, y1: 100, x2: 550, y2: 500, width: 36 },
      { x1: 550, y1: 500, x2: 500, y2: 500, width: 36 },
      { x1: 500, y1: 500.01, x2: 500, y2: 1000, width: 36 },
    ])
  })
})
