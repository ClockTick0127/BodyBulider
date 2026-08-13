import type { GameGimmick, Vec2 } from '../services/gameProtocol'

export type WaterFlowSegment = {
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
}

type Edge = [number, number, number, number]

const EPSILON = 0.01
const MAX_SEGMENTS = 8
const MAX_TOTAL_LENGTH = 3000
const JOINT_TOLERANCE = 5

const pointInPolygon = ([x, y]: Vec2, polygon: Vec2[]) => {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const c = polygon[current]
    const p = polygon[previous]
    if ((c[1] > y) !== (p[1] > y)
      && x < (p[0] - c[0]) * (y - c[1]) / (p[1] - c[1]) + c[0]) inside = !inside
  }
  return inside
}

const rayIntersection = (px: number, py: number, dx: number, dy: number, edge: Edge) => {
  const sx = edge[2] - edge[0]
  const sy = edge[3] - edge[1]
  const denominator = dx * sy - dy * sx
  if (Math.abs(denominator) < 1e-12) return Infinity
  const qx = edge[0] - px
  const qy = edge[1] - py
  const distance = (qx * sy - qy * sx) / denominator
  const position = (qx * dy - qy * dx) / denominator
  return distance <= 0 || position < 0 || position > 1 ? Infinity : distance
}

export function computeWaterFlows({
  gimmicks,
  terrain,
  posePaths,
  mapWidth = 1000,
  mapHeight = 1000,
}: {
  gimmicks: GameGimmick[]
  terrain: Vec2[][]
  posePaths: Vec2[][]
  mapWidth?: number
  mapHeight?: number
}): WaterFlowSegment[] {
  const pipes = gimmicks.filter((gimmick) => gimmick.type === 'WATER_PIPE' && gimmick.outlet)
  if (pipes.length === 0) return []

  const surfaces: Edge[] = []
  posePaths.forEach((path) => {
    let points = path
    if (points.length > 1 && points[0][0] > points.at(-1)![0]) points = [...points].reverse()
    // WaterFlowField receives PoseTransformer.transformAllRaw output, so its
    // surface must preserve the captured pose geometry (without smoothing).
    for (let index = 1; index < points.length; index++) {
      const [a, b] = [points[index - 1], points[index]]
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.1) surfaces.push([a[0], a[1], b[0], b[1]])
    }
  })
  const ceilings: Edge[] = []
  terrain.forEach((polygon) => polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    const edge: Edge = [point[0], point[1], next[0], next[1]]
    const vertical = Math.abs(edge[3] - edge[1]) > Math.abs(edge[2] - edge[0])
    const above: Vec2 = [(edge[0] + edge[2]) / 2, (edge[1] + edge[3]) / 2 - 1]
    if (!vertical && terrain.some((candidate) => pointInPolygon(above, candidate))) ceilings.push(edge)
    else surfaces.push(edge)
  }))

  const flows: WaterFlowSegment[] = []
  pipes.forEach((pipe) => {
    const direction = pipe.flowDirection
    if (!pipe.outlet || !direction || (!direction[0] && !direction[1])) return
    const directionLength = Math.hypot(direction[0], direction[1])
    const width = Number.isFinite(pipe.width) && pipe.width! > 0 ? pipe.width! : 36
    let [px, py] = pipe.outlet
    let dx = direction[0] / directionLength
    let dy = direction[1] / directionLength
    let totalLength = 0

    for (let hop = 0; hop < MAX_SEGMENTS && totalLength < MAX_TOTAL_LENGTH; hop++) {
      let best = Infinity
      if (dy > 0) best = Math.min(best, (mapHeight - py) / dy)
      if (dy < 0) best = Math.min(best, -py / dy)
      if (dx > 0) best = Math.min(best, (mapWidth - px) / dx)
      if (dx < 0) best = Math.min(best, -px / dx)
      let hit: Edge | null = null
      surfaces.forEach((surface) => {
        const distance = rayIntersection(px, py, dx, dy, surface)
        if (distance > EPSILON && distance < best) { best = distance; hit = surface }
      })
      ceilings.forEach((ceiling) => {
        const distance = rayIntersection(px, py, dx, dy, ceiling)
        if (distance > EPSILON && distance < best) { best = distance; hit = null }
      })
      if (best <= EPSILON || !Number.isFinite(best)) break
      const hx = px + dx * best
      const hy = py + dy * best
      flows.push({ x1: px, y1: py, x2: hx, y2: hy, width })
      totalLength += best
      if (!hit) break

      let [cx, cy] = [hx, hy]
      let current: Edge = hit
      let travelSign = 0
      for (let run = 0; run < MAX_SEGMENTS * 2 && totalLength < MAX_TOTAL_LENGTH; run++) {
        // WaterFlowField treats sub-EPSILON slopes as flat. Using an exact
        // comparison here makes pose smoothing's tiny slopes flow right and
        // leak through a dead end while the backend consistently flows left.
        const flatSegment = Math.abs(current[3] - current[1]) <= EPSILON
        let useEnd = (!flatSegment && current[3] > current[1])
          || (flatSegment && current[2] < current[0])
        let [endX, endY] = useEnd ? [current[2], current[3]] : [current[0], current[1]]

        // If the ray landed on the downhill endpoint, water may overflow toward
        // the other endpoint only when that edge continues uphill in the same
        // horizontal direction. This mirrors WaterFlowField.tracePipe.
        if (Math.hypot(endX - cx, endY - cy) < EPSILON) {
          useEnd = !useEnd
          const [otherX, otherY] = useEnd
            ? [current[2], current[3]]
            : [current[0], current[1]]
          const ascending = otherY < cy - EPSILON
          const forward = travelSign === 0 || Math.sign(otherX - cx) === travelSign
          if (!ascending || !forward) break
          endX = otherX
          endY = otherY
        }
        const length = Math.hypot(endX - cx, endY - cy)
        if (length > EPSILON) {
          flows.push({ x1: cx, y1: cy, x2: endX, y2: endY, width })
          totalLength += length
        }
        if (Math.abs(endX - cx) > EPSILON) travelSign = Math.sign(endX - cx)
        cx = endX
        cy = endY

        let flat: Edge | null = null
        let ascending: Edge | null = null
        let next: Edge | null = null
        for (const candidate of surfaces) {
          if (candidate === current) continue
          const fromStart = Math.hypot(candidate[0] - cx, candidate[1] - cy) < JOINT_TOLERANCE
          const fromEnd = Math.hypot(candidate[2] - cx, candidate[3] - cy) < JOINT_TOLERANCE
          if (!fromStart && !fromEnd) continue
          const otherX = fromStart ? candidate[2] : candidate[0]
          const otherY = fromStart ? candidate[3] : candidate[1]
          const signToOther = Math.sign(otherX - cx)
          const forwardOrVertical = travelSign === 0
            || signToOther === 0
            || signToOther === travelSign
          if (otherY > cy + EPSILON) {
            if (forwardOrVertical) {
              next = candidate
              break
            }
            continue
          }
          if (Math.abs(otherY - cy) <= EPSILON) {
            if (!flat && signToOther < 0 && travelSign <= 0) flat = candidate
          } else if (!ascending && (travelSign === 0 || signToOther === travelSign)) {
            ascending = candidate
          }
        }
        next ??= flat ?? ascending
        if (!next) break
        current = next
      }
      px = cx
      py = cy + EPSILON
      dx = 0
      dy = 1
    }
  })
  return flows
}
