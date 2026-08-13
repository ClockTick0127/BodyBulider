import type { TrackedJoints } from '../hooks/usePoseLandmarker'

/**
 * The index contract shared by pose capture, map rendering, and the game server.
 *
 * 0: left wrist -> 1: left elbow -> 2: left shoulder ->
 * 3: right shoulder -> 4: right elbow -> 5: right wrist
 */
export const POSE_POINT_KEYS = [
  'leftWrist',
  'leftElbow',
  'leftShoulder',
  'rightShoulder',
  'rightElbow',
  'rightWrist',
] as const satisfies readonly (keyof TrackedJoints)[]

export const POSE_SEGMENTS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
] as const

export function orderPosePoints(points: TrackedJoints) {
  return POSE_POINT_KEYS.map((key) => points[key])
}
