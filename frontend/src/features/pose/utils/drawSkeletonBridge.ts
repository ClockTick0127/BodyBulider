import type { Point2D, TrackedJoints } from '../hooks/usePoseLandmarker'

export interface SkeletonSegment {
  p1: Point2D
  p2: Point2D
  name: string
  color: string
}

export interface DrawSkeletonOptions {
  isLocked?: boolean
  isCountdown?: boolean
  showSkeleton?: boolean
  minVisibility?: number
}

/**
 * 6개 관절 좌표를 연결하는 가상의 5개 선분 리스트 생성
 */
export function getSkeletonSegments(
  points: TrackedJoints,
  minVis = 0.5,
): SkeletonSegment[] {
  const segments: SkeletonSegment[] = []

  if (points.leftWrist.visibility > minVis && points.leftElbow.visibility > minVis) {
    segments.push({ p1: points.leftWrist, p2: points.leftElbow, name: '왼쪽 아래팔', color: '#ff007f' })
  }
  if (points.leftElbow.visibility > minVis && points.leftShoulder.visibility > minVis) {
    segments.push({ p1: points.leftElbow, p2: points.leftShoulder, name: '왼쪽 위팔', color: '#ff00aa' })
  }
  if (points.leftShoulder.visibility > minVis && points.rightShoulder.visibility > minVis) {
    segments.push({ p1: points.leftShoulder, p2: points.rightShoulder, name: '어깨 라인', color: '#00f0ff' })
  }
  if (points.rightShoulder.visibility > minVis && points.rightElbow.visibility > minVis) {
    segments.push({ p1: points.rightShoulder, p2: points.rightElbow, name: '오른쪽 위팔', color: '#39ff55' })
  }
  if (points.rightElbow.visibility > minVis && points.rightWrist.visibility > minVis) {
    segments.push({ p1: points.rightElbow, p2: points.rightWrist, name: '오른쪽 아래팔', color: '#39ff14' })
  }

  return segments
}

/**
 * 캔버스에 6개 관절 노드 및 연결 선분(다리) 드로잉
 */
export function drawSkeletonBridge(
  ctx: CanvasRenderingContext2D,
  points: TrackedJoints,
  options: DrawSkeletonOptions = {},
): SkeletonSegment[] {
  const { isLocked = false, isCountdown = false, showSkeleton = true, minVisibility = 0.5 } = options

  const segments = getSkeletonSegments(points, minVisibility)

  if (!showSkeleton) return segments

  // 1. 선분(다리) 드로잉
  segments.forEach((seg) => {
    ctx.beginPath()
    ctx.moveTo(seg.p1.x, seg.p1.y)
    ctx.lineTo(seg.p2.x, seg.p2.y)
    ctx.strokeStyle = seg.color
    ctx.lineWidth = isLocked ? 10 : 6
    ctx.lineCap = 'round'

    if (isCountdown) {
      ctx.setLineDash([5, 5])
      ctx.shadowBlur = 4
    } else {
      ctx.setLineDash([])
      ctx.shadowBlur = 15
    }

    ctx.shadowColor = seg.color
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.setLineDash([])

    const midX = (seg.p1.x + seg.p2.x) / 2
    const midY = (seg.p1.y + seg.p2.y) / 2
    ctx.fillStyle = '#ffffff'
    ctx.font = '9px Outfit, sans-serif'
    ctx.fillText(seg.name, midX - 18, midY - 12)
  })

  // 2. 관절 노드 드로잉
  const drawNode = (pt: Point2D, color: string) => {
    if (pt.visibility < minVisibility) return
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.stroke()

    if (isLocked) {
      ctx.fillStyle = color
      ctx.font = '8px sans-serif'
      ctx.fillText('🔒', pt.x - 4, pt.y - 12)
    }
  }

  drawNode(points.leftShoulder, '#bf55ec')
  drawNode(points.rightShoulder, '#bf55ec')
  drawNode(points.leftElbow, '#ff007f')
  drawNode(points.rightElbow, '#39ff14')
  drawNode(points.leftWrist, '#00f0ff')
  drawNode(points.rightWrist, '#00f0ff')

  return segments
}

