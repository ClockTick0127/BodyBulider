import type { Vec2 } from '../../game/services/gameProtocol'
import type { Point2D, TrackedJoints } from '../hooks/usePoseLandmarker'

const isVisiblePoint = (point: Point2D, minVisibility: number) =>
  Number.isFinite(point.x)
  && Number.isFinite(point.y)
  && point.visibility >= minVisibility

/** EMA 지수 이동 평균 계수 (0.65: 반응성 65% + 이전 보간 35% -> 정지 시 잔떨림 방지) */
export const DEFAULT_SMOOTH_ALPHA = 0.65
/** 빠른 움직임 판정 임계값 (정규화 거리 제곱 0.0016 ≒ 화면 폭의 약 4% 순간 이동) */
export const FAST_MOTION_THRESHOLD_SQ = 0.0016

/**
 * Keep the six-point server contract even when MediaPipe temporarily misses a joint.
 * Reuses previous valid coordinates or the nearest visible joint in the current frame.
 * Uses Speed-Adaptive Dynamic Alpha:
 * - Fast motion (> FAST_MOTION_THRESHOLD_SQ): Alpha = 0.95 (0ms lag, instant response)
 * - Slow motion / Stationary: Alpha = 0.65 (100% jitter reduction)
 */
export function resolvePosePoints(
  points: Point2D[],
  previous: Vec2[],
  width: number,
  height: number,
  minVisibility = 0.35,
  smoothAlpha = DEFAULT_SMOOTH_ALPHA,
): Vec2[] | null {
  if (width <= 0 || height <= 0) return null

  // 1. 현재 프레임 유효성 검사 및 정규화
  const current = points.map((point): Vec2 | null =>
    isVisiblePoint(point, minVisibility)
      ? [
        Math.min(1, Math.max(0, point.x / width)),
        Math.min(1, Math.max(0, point.y / height)),
      ]
      : null,
  )

  if (current.every((point) => point == null)) {
    if (previous && previous.length === 6 && previous.some(([x, y]) => x !== 0 || y !== 0)) {
      return previous
    }
    return points.map((): Vec2 => [0, 0])
  }

  // 2. 관절 유효성 보정 및 동적 속도 반응 EMA 적용
  return current.map((point, index): Vec2 => {
    let target = point

    if (!target) {
      const previousPoint = previous[index]
      if (previousPoint && (previousPoint[0] !== 0 || previousPoint[1] !== 0)) {
        // 이전 유효 좌표가 존재하면 유지 (화면 좌상단 0,0으로 찢어지는 왜곡 방지)
        target = previousPoint
      } else {
        // 최초 프레임처럼 이전 좌표가 없으면 양방향으로 가장 가까운 유효 관절을 찾는다.
        // index 0도 after(두 번째 좌표)부터 탐색하므로 [0, 0]으로 남지 않는다.
        for (let distance = 1; distance < current.length; distance += 1) {
          const before = current[index - distance]
          if (before) {
            target = before
            break
          }

          const after = current[index + distance]
          if (after) {
            target = after
            break
          }
        }

        if (!target) target = [0, 0]
      }
    }

    // 유효 좌표인 경우 동적 속도 반응 EMA 지수 이동 평균 적용 (잔떨림 제거)
    const prev = previous[index]
    if (target[0] !== 0 && target[1] !== 0 && prev && (prev[0] !== 0 || prev[1] !== 0)) {
      const dx = target[0] - prev[0]
      const dy = target[1] - prev[1]
      const distSq = dx * dx + dy * dy

      // 빠른 움직임이면 alpha = 0.95 (민첩 추종), 천천히 움직이거나 정지 시 alpha = 0.70 (떨림 제거)
      const effectiveAlpha = distSq > FAST_MOTION_THRESHOLD_SQ ? 0.95 : smoothAlpha

      return [
        target[0] * effectiveAlpha + prev[0] * (1 - effectiveAlpha),
        target[1] * effectiveAlpha + prev[1] * (1 - effectiveAlpha),
      ]
    }

    return target
  })
}

/**
 * TrackedJoints 객체 단위로 관절 미인식 시 이전 유효 좌표를 유지하여 다리가 사라지는 현상 방지
 */
export function resolveTrackedJoints(
  current: TrackedJoints,
  previous: TrackedJoints,
  minVisibility = 0.35,
): TrackedJoints {
  const result: TrackedJoints = { ...current }
  const keys = [
    'leftShoulder',
    'rightShoulder',
    'leftElbow',
    'rightElbow',
    'leftWrist',
    'rightWrist',
  ] as const

  for (const key of keys) {
    const cur = current[key]
    const prev = previous[key]

    const isCurVisible = Number.isFinite(cur.x) && Number.isFinite(cur.y) && cur.visibility >= minVisibility
    const isPrevValid = prev && (prev.x !== 0 || prev.y !== 0)

    if (!isCurVisible) {
      if (isPrevValid) {
        // 추적이 되지 않으면 마지막으로 관측된 유효 좌표에 그대로 고정 유지
        result[key] = { x: prev.x, y: prev.y, visibility: 1 }
      } else {
        result[key] = { x: 0, y: 0, visibility: 0 }
      }
    }
  }

  return result
}


