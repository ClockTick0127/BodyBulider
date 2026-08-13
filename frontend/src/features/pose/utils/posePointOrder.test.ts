import { describe, expect, it } from 'vitest'
import type { Point2D, TrackedJoints } from '../hooks/usePoseLandmarker'
import { orderPosePoints, POSE_POINT_KEYS, POSE_SEGMENTS } from './posePointOrder'

const point = (x: number): Point2D => ({ x, y: x, visibility: 1 })

describe('pose point index contract', () => {
  it('orders all joints from wrist to wrist through both shoulders', () => {
    const points: TrackedJoints = {
      leftShoulder: point(2),
      rightShoulder: point(3),
      leftElbow: point(1),
      rightElbow: point(4),
      leftWrist: point(0),
      rightWrist: point(5),
    }

    expect(POSE_POINT_KEYS).toEqual([
      'leftWrist',
      'leftElbow',
      'leftShoulder',
      'rightShoulder',
      'rightElbow',
      'rightWrist',
    ])
    expect(orderPosePoints(points).map(({ x }) => x)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('connects every adjacent point, including the two shoulders', () => {
    expect(POSE_SEGMENTS).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ])
  })
})
