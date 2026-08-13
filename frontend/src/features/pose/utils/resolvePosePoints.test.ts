import { describe, expect, it } from 'vitest'
import type { Point2D } from '../hooks/usePoseLandmarker'
import { resolvePosePoints } from './resolvePosePoints'

const point = (x: number, y: number, visibility = 1): Point2D => ({ x, y, visibility })

describe('resolvePosePoints', () => {
  it('keeps all six normalized points when every joint is visible', () => {
    const points = Array.from({ length: 6 }, (_, index) => point(index * 10, index * 5))

    expect(resolvePosePoints(points, [], 100, 50)).toEqual([
      [0, 0], [0.1, 0.1], [0.2, 0.2], [0.3, 0.3], [0.4, 0.4], [0.5, 0.5],
    ])
  })

  it('reuses the same joint from the previous frame when a joint is missed', () => {
    const points = [
      point(10, 10), point(20, 20, 0.1), point(30, 30),
      point(40, 40), point(50, 50), point(60, 60),
    ]
    const previous = [
      [0.1, 0.1], [0.25, 0.35], [0.3, 0.3],
      [0.4, 0.4], [0.5, 0.5], [0.6, 0.6],
    ] as [number, number][]

    expect(resolvePosePoints(points, previous, 100, 100, 0.35, 1)?.[1]).toEqual([0.25, 0.35])
  })

  it('fills leading missing joints from the nearest following joint when no previous frame is available', () => {
    const points = [
      point(10, 10, 0.1), point(20, 20, 0.1), point(30, 30),
      point(40, 40), point(50, 50), point(60, 60),
    ]

    expect(resolvePosePoints(points, [], 100, 100)?.slice(0, 3)).toEqual([
      [0.3, 0.3], [0.3, 0.3], [0.3, 0.3],
    ])
  })

  it('fills a missing joint from the nearest preceding joint', () => {
    const points = [
      point(10, 10), point(20, 20), point(30, 30, 0.1),
      point(40, 40), point(50, 50), point(60, 60),
    ]

    expect(resolvePosePoints(points, [], 100, 100)?.[2]).toEqual([0.2, 0.2])
  })

  it('returns six zero coordinates when no joint is visible and no previous frame exists', () => {
    const points = Array.from({ length: 6 }, () => point(0, 0, 0))
    expect(resolvePosePoints(points, [], 100, 100)).toEqual([
      [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
    ])
  })
})
