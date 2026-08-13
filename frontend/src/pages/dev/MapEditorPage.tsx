import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, request } from '../../shared/api/request'
import {
  formatRoundLabel,
  getDevRound,
  getDevRounds,
  saveDevRound,
  type DevRoundSummary,
} from '../../features/dev/services/devMapApi'
import {
  ALLOWED_GIMMICK_TYPES,
  DIFFICULTIES,
  MAP_LIMITS,
  createCustomMap,
  getCustomMap,
  simulateCustomMap,
  previewWaterFlows,
  updateCustomMap,
  type CustomMapDifficulty,
  type SimulationPoses,
} from '../../features/workshop/services/customMapApi'
import { findMapDesign } from '../game/mapDesign'
import './MapEditorPage.css'

/* ============ 상수 (백엔드 GamePhysicsSimulator와 동일) ============ */
const MAP = 1000
const PLAYER_W = 230
const PLAYER_H = 180
const BALL_R = 13
const ROAD_R = 4.5
const MAX_PLAYERS = 4

interface Gimmick {
  type: string
  position?: [number, number]
  size?: [number, number]
  launchVelocity?: [number, number]
  /** WIND: y밴드 [yTop, yBottom] — x축 전체에 -x 바람, 포즈 로드가 차폐물 */
  band?: [number, number]
  /** WIND: 바람 가속도 px/s² (≤450 버티기 · 550+ 역밀림, 권장 700) */
  strength?: number
  /** KILL_ZONE: [x, y, w, h] — 공 외곽(반경 13)이 닿으면 즉시 라운드 실패 */
  area?: [number, number, number, number]
  /** WATER_PIPE: 물이 나오는 지점. inlet/shutdownOnBlocked는 deprecated(BE 무시) */
  outlet?: [number, number]
  /** WATER_PIPE: 초기 분사 방향 (영벡터 금지) */
  flowDirection?: [number, number]
  /** WATER_PIPE: 물살 속도 px/s */
  flowSpeed?: number
  /** WATER_PIPE: 물줄기 폭 px (기본 36) */
  width?: number
  [key: string]: any
}

/** WATER_PIPE 물길 구간 (BE WaterFlowField와 동일 알고리즘, 프리뷰용) */
interface FlowSeg {
  x1: number
  y1: number
  x2: number
  y2: number
  hw: number
}

/** [폴백 전용] 구 알고리즘 근사 프리뷰 — 실물길은 BE water-preview API가 계산한다.
 *  (개발명세서_FE_물기믹_유니온물길 FE-WATER-03: 엔드포인트 404/405일 때만 사용.
 *  BE 배포 확인 후 이 함수와 폴백 경로는 삭제 예정) */
function computeWaterFlows(st: MapState, ps: PoseList): FlowSeg[] {
  const pipes = st.gimmicks.filter((g) => g.type === 'WATER_PIPE' && g.outlet)
  if (!pipes.length) return []
  const roads: [number, number, number, number][] = []
  st.players.forEach((c, i) => {
    const pose = ps[i]
    if (!pose || pose.length < 2) return
    let pts = pose.map((p) => [c[0] - PLAYER_W / 2 + p[0] * PLAYER_W, c[1] - PLAYER_H / 2 + p[1] * PLAYER_H])
    if (pts[0][0] > pts[pts.length - 1][0]) pts = [...pts].reverse()
    // 물길은 스무딩 없는 원본 포즈 기준 (BE WaterFlowField와 동일 — 화면 로드와 일치)
    for (let k = 1; k < pts.length; k++) {
      if (Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) < 0.1) continue
      roads.push([pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]])
    }
  })
  // 지형 엣지: 밑면(엣지 위가 폴리곤 내부)은 차단만, 나머지는 흐르는 표면 (BE 동일)
  const ceilings: [number, number, number, number][] = []
  st.terrain.forEach((poly) => {
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k]
      const b = poly[(k + 1) % poly.length]
      const edge: [number, number, number, number] = [a[0], a[1], b[0], b[1]]
      const isWall = Math.abs(edge[3] - edge[1]) > Math.abs(edge[2] - edge[0])
      const midAbove: [number, number] = [(edge[0] + edge[2]) / 2, (edge[1] + edge[3]) / 2 - 1]
      const covered = !isWall && st.terrain.some((pg) => pointInPoly(midAbove, pg))
      if (covered) ceilings.push(edge)
      else roads.push(edge)
    }
  })
  const rayseg = (px: number, py: number, dx: number, dy: number, s: number[]): number => {
    const sx = s[2] - s[0]
    const sy = s[3] - s[1]
    const den = dx * sy - dy * sx
    if (Math.abs(den) < 1e-12) return Infinity
    const qx = s[0] - px
    const qy = s[1] - py
    const t = (qx * sy - qy * sx) / den
    const u = (qx * dy - qy * dx) / den
    return t <= 0 || u < 0 || u > 1 ? Infinity : t
  }
  const flows: FlowSeg[] = []
  for (const g of pipes) {
    const hw = (Number(g.width) > 0 ? Number(g.width) : 36) / 2
    const speedDir = g.flowDirection && (g.flowDirection[0] || g.flowDirection[1]) ? g.flowDirection : [0, 1]
    const dl = Math.hypot(speedDir[0], speedDir[1])
    let px = g.outlet![0]
    let py = g.outlet![1]
    let dx = speedDir[0] / dl
    let dy = speedDir[1] / dl
    let total = 0
    for (let hop = 0; hop < 8 && total < 3000; hop++) {
      let best = Infinity
      if (dy > 0) best = Math.min(best, (MAP - py) / dy)
      if (dx > 0) best = Math.min(best, (MAP - px) / dx)
      else if (dx < 0) best = Math.min(best, (0 - px) / dx)
      if (dy < 0) best = Math.min(best, (0 - py) / dy)
      let hit: number[] | null = null
      for (const r of roads) {
        const t = rayseg(px, py, dx, dy, r)
        if (t > 0.01 && t < best) {
          best = t
          hit = r
        }
      }
      for (const o of ceilings) {
        const t = rayseg(px, py, dx, dy, o)
        if (t > 0.01 && t < best) {
          best = t
          hit = null
        }
      }
      if (best <= 0.01 || !isFinite(best)) break
      const hx = px + dx * best
      const hy = py + dy * best
      flows.push({ x1: px, y1: py, x2: hx, y2: hy, hw })
      total += best
      if (!hit) break
      let cx = hx
      let cy = hy
      let cur = hit
      let travelSign = 0 // 진행 방향 x부호 — BE WaterFlowField와 동기
      for (let run = 0; run < 16 && total < 3000; run++) {
        let ex: number
        let ey: number
        // 내리막 끝점 (|Δy|≤0.01은 수평=좌측) — BE와 동일 엡실론 (초미세 경사 누수 방지)
        const flatCur = Math.abs(cur[3] - cur[1]) <= 0.01
        if ((!flatCur && cur[3] > cur[1]) || (flatCur && cur[2] < cur[0])) {
          ex = cur[2]
          ey = cur[3]
        } else {
          ex = cur[0]
          ey = cur[1]
        }
        if (Math.hypot(ex - cx, ey - cy) < 0.01) {
          // 국소 저점 → 진행 방향 오르막 턱 넘기 (overflow)
          const ox = ex === cur[2] ? cur[0] : cur[2]
          const oy = ex === cur[2] ? cur[1] : cur[3]
          const ascending = oy < cy - 0.01
          const forward = travelSign === 0 || Math.sign(ox - cx) === travelSign
          if (!ascending || !forward) break
          ex = ox
          ey = oy
        }
        const L = Math.hypot(ex - cx, ey - cy)
        if (L > 0.01) {
          flows.push({ x1: cx, y1: cy, x2: ex, y2: ey, hw })
          total += L
        }
        if (Math.abs(ex - cx) > 0.01) travelSign = Math.sign(ex - cx)
        cx = ex
        cy = ey
        // 다음 표면: ①내리막(진행방향/수직만 — 갈고리 역주행 금지) ②수평(좌측 진행시) ③진행방향 오르막
        let down: number[] | null = null
        let flat: number[] | null = null
        let asc: number[] | null = null
        for (const c2 of roads) {
          if (c2 === cur) continue
          const fs = Math.hypot(c2[0] - cx, c2[1] - cy) < 5
          const fe = Math.hypot(c2[2] - cx, c2[3] - cy) < 5
          if (!fs && !fe) continue
          const ox2 = fs ? c2[2] : c2[0]
          const oy2 = fs ? c2[3] : c2[1]
          const s0 = Math.sign(ox2 - cx)
          if (oy2 > cy + 0.01) {
            if (travelSign === 0 || s0 === 0 || s0 === travelSign) {
              down = c2
              break
            }
            continue
          }
          const s = s0
          if (Math.abs(oy2 - cy) <= 0.01) {
            if (!flat && s < 0 && travelSign <= 0) flat = c2
          } else if (!asc && (travelSign === 0 || s === travelSign)) {
            asc = c2
          }
        }
        const nxt = down ?? flat ?? asc
        if (!nxt) break
        cur = nxt
      }
      px = cx
      py = cy + 0.01
      dx = 0
      dy = 1
    }
  }
  return flows
}

interface MapState {
  startPoint: [number, number]
  endPoint: [number, number]
  players: [number, number][]
  terrain: [number, number][][]
  gimmicks: Gimmick[]
  /**
   * 클리어 구역 [x, y, w, h] (선택, 좌상단 + 크기).
   * 있으면 BE가 공 외곽(반경 13) 접촉으로 클리어 판정, 없으면 공.x ≥ 도착점.x.
   * endPoint는 항상 필수 — 존이 있어도 GOAL 깃발 표시용으로 유지된다.
   */
  clearZone?: [number, number, number, number]
}

type PoseList = ([number, number][] | null)[]

type Tool = 'select' | 'terrain' | 'start' | 'end' | 'player' | 'jumppad' | 'wind' | 'killzone' | 'waterpipe' | 'pose' | 'clearzone'

interface Selection {
  kind: 'start' | 'end' | 'player' | 'pad' | 'terrain' | 'clearzone'
  index?: number
  vertex?: number
}

interface SimulationState {
  frames: [number, number, ...number[]][] | null
  intervalMs: number
  result: boolean | null
  playIdx: number
  playing: boolean
}

const SAMPLE_A: MapState = {
  startPoint: [90, 870],
  endPoint: [870, 120],
  players: [
    [170, 760],
    [360, 610],
    [580, 420],
    [760, 260],
  ],
  terrain: [
    [
      [0, 920],
      [1000, 920],
      [1000, 1000],
      [0, 1000],
    ],
    [
      [250, 720],
      [460, 680],
      [470, 735],
      [260, 775],
    ],
    [
      [590, 410],
      [820, 360],
      [830, 420],
      [600, 470],
    ],
  ],
  gimmicks: [],
}

const SAMPLE_B: MapState = {
  startPoint: [10, 500],
  endPoint: [990, 500],
  players: [
    [250, 560],
    [700, 560],
  ],
  terrain: [
    [
      [0, 620],
      [1000, 620],
      [1000, 1000],
      [0, 1000],
    ],
  ],
  gimmicks: [
    {
      type: 'JUMP_PAD',
      position: [500, 600],
      size: [60, 20],
      launchVelocity: [100, -600],
    },
  ],
}

/* ============ 헬퍼 함수 ============ */
function clampMap(v: number): number {
  return Math.max(0, Math.min(MAP, Math.round(v * 10) / 10))
}

function near(p: [number, number], wx: number, wy: number, r: number): boolean {
  return Math.hypot(p[0] - wx, p[1] - wy) <= r
}

function pointInPoly(pt: [number, number], poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside
    }
  }
  return inside
}

function segIntersect(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) && o(a, b, c) !== 0 && o(c, d, a) !== 0
}

function selfIntersects(poly: [number, number][]): boolean {
  const n = poly.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true
    }
  }
  return false
}

function exportJson(st: MapState): string {
  const out: any = {
    startPoint: st.startPoint,
    endPoint: st.endPoint,
    players: st.players,
    terrain: st.terrain,
  }
  if (st.gimmicks.length) out.gimmicks = st.gimmicks
  if (st.clearZone) out.clearZone = st.clearZone
  return JSON.stringify(out, null, 2)
}

function exportPoseJson(st: MapState, ps: PoseList): string {
  const out: Record<string, [number, number][]> = {}
  const maxP = Math.max(st ? st.players.length : 0, 4)
  for (let i = 0; i < maxP; i++) {
    out[`p${i + 1}Bridge`] = ps && ps[i] && ps[i]!.length ? ps[i]! : []
  }
  return JSON.stringify(out, null, 2)
}

function extractMapConfig(j: any): any {
  if (!j || typeof j !== 'object') return null
  const cands = [
    j?.payload?.round?.mapConfig,
    j?.payload?.round?.map_config,
    j?.round?.mapConfig,
    j?.round?.map_config,
    j?.payload?.mapConfig,
    j?.payload?.map_config,
    j?.data?.mapConfig,
    j?.data?.map_config,
    j?.data?.round?.mapConfig,
    j?.mapConfig,
    j?.map_config,
    j?.map,
    j?.data,
    j,
  ]
  for (const c of cands) {
    if (
      c &&
      typeof c === 'object' &&
      !Array.isArray(c) &&
      (c.startPoint || c.start_point || c.start)
    ) {
      return c
    }
  }
  return null
}

function normalizeConfig(raw: any): { cfg: MapState; scaled: boolean } {
  const sp = raw.startPoint || raw.start_point || raw.start
  const ep = raw.endPoint || raw.end_point || raw.end
  const pl = raw.players || raw.player_points || raw.playerCenters || []
  const tr = raw.terrain || raw.terrains || raw.terrainPolygons || []
  const gm = raw.gimmicks || []

  if (!Array.isArray(sp) || sp.length < 2 || !Array.isArray(ep) || ep.length < 2) {
    throw new Error('startPoint / endPoint가 없거나 형식이 잘못되었습니다.')
  }
  let all: any[] = [sp, ep, ...(Array.isArray(pl) ? pl : [])]
  if (Array.isArray(tr)) {
    tr.forEach((p: any) => Array.isArray(p) && (all = all.concat(p)))
  }
  const maxX = Math.max(...all.map((p) => +p[0] || 0))
  const maxY = Math.max(...all.map((p) => +p[1] || 0))
  let fx = 1
  let fy = 1
  if (maxX <= 1.2 && maxY <= 1.2) {
    fx = fy = 1000
  } else if (maxX <= 12 && maxY <= 7.5) {
    fx = 100
    fy = 1000 / 6
  }
  const P = (p: any): [number, number] => [
    +(p[0] * fx).toFixed(2),
    +(p[1] * fy).toFixed(2),
  ]
  const cfg: MapState = {
    startPoint: P(sp),
    endPoint: P(ep),
    players: (Array.isArray(pl) ? pl : []).map(P),
    terrain: (Array.isArray(tr) ? tr : []).map((poly: any) => (Array.isArray(poly) ? poly.map(P) : [])),
    gimmicks: (Array.isArray(gm) ? gm : []).map((g: any) => {
      const copy = { ...g }
      if (copy.position) copy.position = P(copy.position)
      if (copy.size && fx !== 1) copy.size = [copy.size[0] * fx, copy.size[1] * fy]
      if (copy.type === 'WIND') {
        // JSON 직접 작성 시 문자열 숫자·필드 누락을 정규화.
        // band 없는 WIND는 렌더·선택이 안 되는 '유령'이 되므로 기본 밴드로 채워
        // 보이게 만든다 (위치는 에디터에서 조정).
        if (Array.isArray(copy.band) && copy.band.length >= 2
            && Number.isFinite(Number(copy.band[0])) && Number.isFinite(Number(copy.band[1]))) {
          copy.band = [Number(copy.band[0]) * fy, Number(copy.band[1]) * fy]
          if (copy.band[0] > copy.band[1]) copy.band = [copy.band[1], copy.band[0]]
        } else {
          copy.band = [400, 520]
        }
        copy.strength = Number(copy.strength)
        if (!Number.isFinite(copy.strength) || copy.strength <= 0) copy.strength = 700
      } else if (copy.type === 'WATER_PIPE') {
        // 정규화: outlet/flowDirection 스케일·숫자 강제, 누락 시 기본값 (유령 방지)
        copy.outlet = Array.isArray(copy.outlet) && copy.outlet.length >= 2
          ? P(copy.outlet)
          : [500, 200]
        copy.flowDirection = Array.isArray(copy.flowDirection)
            && (Number(copy.flowDirection[0]) !== 0 || Number(copy.flowDirection[1]) !== 0)
          ? [Number(copy.flowDirection[0]), Number(copy.flowDirection[1])]
          : [0, 1]
        copy.flowSpeed = Number(copy.flowSpeed)
        if (!Number.isFinite(copy.flowSpeed) || copy.flowSpeed <= 0) copy.flowSpeed = 180
        if (copy.width !== undefined) {
          copy.width = Number(copy.width)
          if (!Number.isFinite(copy.width) || copy.width <= 0) copy.width = 36
        }
      } else if (copy.type === 'KILL_ZONE') {
        // 문자열 숫자·필드 누락 정규화 (유령 항목 방지: 무효 시 기본 상단 스트립)
        const a = Array.isArray(copy.area) ? copy.area.map(Number) : []
        if (a.length >= 4 && a.every(Number.isFinite) && a[2] > 0 && a[3] > 0) {
          copy.area = [a[0] * fx, a[1] * fy, a[2] * fx, a[3] * fy]
        } else {
          copy.area = [0, 0, 1000, 40]
        }
      } else if (copy.band && fy !== 1) {
        copy.band = [copy.band[0] * fy, copy.band[1] * fy]
      }
      return copy
    }),
  }
  // clearZone (선택): [x, y, w, h] 숫자 배열 + w·h > 0일 때만 유지 (무효 시 조용히 제거 — x 기준 폴백)
  const cz = raw.clearZone || raw.clear_zone
  if (Array.isArray(cz) && cz.length >= 4) {
    const a = cz.map(Number)
    if (a.every(Number.isFinite) && a[2] > 0 && a[3] > 0) {
      cfg.clearZone = [a[0] * fx, a[1] * fy, a[2] * fx, a[3] * fy]
    }
  }
  return { cfg, scaled: fx !== 1 }
}

function extractPoseConfig(j: any): any {
  if (!j || typeof j !== 'object') return null
  if (Array.isArray(j)) return j
  const cands = [j.poses, j.payload?.poses, j.bridges, j.payload?.bridges, j.data?.poses, j.data]
  for (const c of cands) {
    if (c && typeof c === 'object') {
      if (Array.isArray(c)) return c
      const keys = Object.keys(c)
      if (keys.some((k) => /^p(?:layer)?\d+/i.test(k))) return c
    }
  }
  return j
}

function extractSimResult(j: any): { frames: [number, number, ...number[]][]; intervalMs: number; result: boolean | null } | null {
  if (Array.isArray(j) && j.length && Array.isArray(j[0]) && j[0].length >= 2 && typeof j[0][0] === 'number') {
    return { frames: j, intervalMs: 30, result: null }
  }
  const cands = [j, j?.payload, j?.payload?.simulation, j?.simulation, j?.data, j?.payload?.data]
  for (const c of cands) {
    if (!c || typeof c !== 'object') continue
    const frames = c.points || c.frames || c.coordinates
    if (Array.isArray(frames) && frames.length && Array.isArray(frames[0]) && frames[0].length >= 2) {
      const intervalMs = c.intervalMs ?? c.interval_ms ?? c.interval ?? 30
      const result = c.result ?? c.success ?? null
      return { frames, intervalMs: +intervalMs || 30, result }
    }
  }
  return null
}

/**
 * 인스펙터용 숫자 입력.
 *
 * React의 onChange는 키 입력마다 발생하므로, 그때마다 commit하면
 *  - undo 히스토리가 글자 수만큼 쌓이고
 *  - 필드를 비우는 순간 `+'' === 0`이라 값이 0으로 튄다.
 * 원본 HTML의 change 이벤트와 동일하게 blur/Enter에서만 커밋한다.
 */
function NumberField({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  // blur()는 동기적으로 onBlur를 부르므로, Escape로 취소할 때는 플래그로 커밋을 건너뛴다.
  const cancelledRef = useRef(false)

  // 외부(드래그·undo 등)에서 값이 바뀌면 따라간다. 단, 편집 중에는 건드리지 않는다.
  useEffect(() => {
    if (!editing) setText(String(value))
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    if (cancelledRef.current) {
      cancelledRef.current = false
      setText(String(value))
      return
    }
    const parsed = Number(text)
    if (text.trim() === '' || Number.isNaN(parsed)) {
      setText(String(value)) // 잘못된 입력은 되돌린다
      return
    }
    setText(String(parsed))
    if (parsed !== value) onCommit(parsed)
  }

  return (
    <input
      type="number"
      step="any"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation() // 전역 Escape(선택 해제)까지 번지지 않게
          cancelledRef.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/**
 * 맵 에디터의 동작 모드.
 *
 * - `admin`   : `/dev/map-editor` (ROLE_ADMIN). 공식 라운드의 map_config를 직접 덮어쓴다.
 * - `workshop`: `/workshop/editor` (일반 유저). 창작마당 맵을 만들고 고친다.
 *
 * 캔버스·도구·검증·재생 로직이 완전히 같아 파일을 복제하는 대신 한 컴포넌트로 분기한다.
 * (3,000줄을 복사하면 이후 버그 수정을 두 곳에 해야 한다)
 * 창작마당 전용 코드는 전부 `isWorkshop` 뒤에 두어 관리자 경로의 동작을 바꾸지 않는다.
 */
export type MapEditorVariant = 'admin' | 'workshop'

export function MapEditorPage({ variant = 'admin' }: { variant?: MapEditorVariant } = {}) {
  const isWorkshop = variant === 'workshop'
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  /** 창작마당: 쿼리스트링의 stageId가 있으면 수정, 없으면 신규 저장이다. */
  const editingStageId = isWorkshop ? Number(searchParams.get('stageId')) || null : null

  /* ============ 상태 ============ */
  const [mapState, setMapState] = useState<MapState>(() => JSON.parse(JSON.stringify(SAMPLE_A)))
  const [poses, setPoses] = useState<PoseList>(() => SAMPLE_A.players.map(() => null))
  const [tool, setTool] = useState<Tool>('select')
  const [selection, setSelection] = useState<Selection | null>(null)
  
  // 표시 옵션
  const [showGrid, setShowGrid] = useState(true)
  const [showBoxes, setShowBoxes] = useState(true)
  const [showPoses, setShowPoses] = useState(true)
  const [showOob, setShowOob] = useState(true)

  // 배경 옵션 (bgLabel은 현재 적용된 배경의 표시용 이름)
  const [bgLabel, setBgLabel] = useState('')
  const [bgOpacity, setBgOpacity] = useState(45)
  const bgImgRef = useRef<HTMLImageElement | null>(null)
  const bgGenRef = useRef(0)
  const [, setBgTrigger] = useState(0)

  // 히스토리 (Undo / Redo)
  const historyRef = useRef<string[]>([])
  const futureRef = useRef<string[]>([])

  const snapshot = useCallback((stateToSnap: MapState, posesToSnap: PoseList) => {
    return JSON.stringify({ state: stateToSnap, poses: posesToSnap })
  }, [])

  const lastSnapRef = useRef<string>(snapshot(SAMPLE_A, SAMPLE_A.players.map(() => null)))

  // 시뮬레이션 상태
  const [sim, setSim] = useState<SimulationState>({
    frames: null,
    intervalMs: 30,
    result: null,
    playIdx: 0,
    playing: false,
  })
  const simRef = useRef<SimulationState>({
    frames: null,
    intervalMs: 30,
    result: null,
    playIdx: 0,
    playing: false,
  })
  const [simStatusMsg, setSimStatusMsg] = useState<string>('')
  const [serverUrl, setServerUrl] = useState('http://localhost:8080')



  /* ── 창작마당 전용 메타데이터 (admin 모드에서는 쓰지 않는다) ── */
  const [mapTitle, setMapTitle] = useState(() => searchParams.get('title') ?? '')
  const [mapDescription, setMapDescription] = useState('')
  const [mapDifficulty, setMapDifficulty] = useState<CustomMapDifficulty>('중')
  const [mapPalette, setMapPalette] = useState<string[]>(['#315f9d', '#8bc4e8', '#f5d652'])
  const [mapIsPublic, setMapIsPublic] = useState(true)
  const [workshopBusy, setWorkshopBusy] = useState(false)
  const [workshopStatus, setWorkshopStatus] = useState('')

  /*
   * 클리어 검증.
   *
   * 공개 업로드는 "이 맵이 실제로 깰 수 있다"는 증거가 있어야 한다.
   * 테스트 플레이가 성공하면 그때 쓴 포즈를 들고 있다가 저장 시 함께 보내고,
   * 서버가 같은 포즈로 시뮬레이션을 재현해 확인한다.
   */
  const [isMapCleared, setIsMapCleared] = useState(false)
  const [lastClearedPoses, setLastClearedPoses] = useState<SimulationPoses | null>(null)
  /** 서버에 저장돼 있는 검증 상태. 배지(세션 검증)와 구분해 안내에만 쓴다. */
  const [savedIsCleared, setSavedIsCleared] = useState(false)

  const invalidateClearStatus = useCallback(() => {
    setIsMapCleared(false)
    setLastClearedPoses(null)
  }, [])

  /**
   * commitState는 여러 콜백이 의존성으로 들고 있어 참조가 안정적이어야 한다.
   * (mapState를 의존성에 넣으면 매 렌더 새로 만들어진다)
   * 직전 맵과 비교하려면 값이 필요하므로 ref로 우회한다.
   */
  const mapStateRef = useRef(mapState)
  useEffect(() => {
    mapStateRef.current = mapState
  }, [mapState])

  /**
   * 서버 `MapConfigValidator`와 같은 상한을 화면에서 미리 확인한다.
   * 편의 기능일 뿐이라 초과하지 않아도 서버가 400을 주면 그 메시지를 그대로 보여 준다.
   * (runServerSim보다 먼저 선언해야 하므로 상태 바로 아래에 둔다)
   */
  const limitIssues = useMemo(() => {
    if (!isWorkshop) return [] as string[]
    const issues: string[] = []
    if (mapState.terrain.length > MAP_LIMITS.polygons) {
      issues.push(`지형 폴리곤 ${mapState.terrain.length}개 (최대 ${MAP_LIMITS.polygons}개)`)
    }
    const badPolygon = mapState.terrain.findIndex(
      (polygon) => polygon.length < MAP_LIMITS.verticesMin || polygon.length > MAP_LIMITS.verticesMax,
    )
    if (badPolygon >= 0) {
      issues.push(
        `${badPolygon + 1}번 폴리곤 정점 ${mapState.terrain[badPolygon].length}개 ` +
          `(${MAP_LIMITS.verticesMin}~${MAP_LIMITS.verticesMax}개)`,
      )
    }
    if (mapState.gimmicks.length > MAP_LIMITS.gimmicks) {
      issues.push(`기믹 ${mapState.gimmicks.length}개 (최대 ${MAP_LIMITS.gimmicks}개)`)
    }
    const banned = mapState.gimmicks
      .map((gimmick) => gimmick.type)
      .filter((type) => !(ALLOWED_GIMMICK_TYPES as readonly string[]).includes(type))
    if (banned.length) issues.push(`창작마당에서 쓸 수 없는 기믹: ${[...new Set(banned)].join(', ')}`)
    if (mapState.players.length > MAP_LIMITS.posePlayers) {
      issues.push(`플레이어 ${mapState.players.length}명 (최대 ${MAP_LIMITS.posePlayers}명)`)
    }
    const posePoints = poses.findIndex(
      (pose) => Array.isArray(pose) && pose.length > MAP_LIMITS.posePointsPerPlayer,
    )
    if (posePoints >= 0) {
      issues.push(
        `P${posePoints + 1} 포즈 좌표 ${poses[posePoints]!.length}개 ` +
          `(최대 ${MAP_LIMITS.posePointsPerPlayer}개)`,
      )
    }
    return issues
  }, [isWorkshop, mapState, poses])

  const isOverLimit = limitIssues.length > 0

  /* ============ 물길 프리뷰 (BE 권위형 — FE-WATER-03) ============ */
  /** BE water-preview 결과. 편집이 멈춘 뒤 디바운스로 갱신되며, 드래그 중에는 스테일 허용. */
  const [editorWaterFlows, setEditorWaterFlows] = useState<FlowSeg[]>([])
  /** 404/405(구버전 BE) → 세션 내내 로컬 근사 계산 폴백. */
  const waterPreviewFallbackRef = useRef(false)
  /** 응답 순서 역전 방어: 최신 요청 토큰만 반영. */
  const waterPreviewSeqRef = useRef(0)
  /** 무편집 상태에서 마지막 응답이 실패였을 때의 1회 지연 재시도 타이머. */
  const waterPreviewRetryRef = useRef<number | null>(null)
  const [waterPreviewRetryTick, setWaterPreviewRetryTick] = useState(0)

  useEffect(() => {
    const pipes = mapState.gimmicks.filter((g) => g.type === 'WATER_PIPE')
    if (!pipes.length) {
      setEditorWaterFlows([])
      return
    }
    // 파서가 거부하는 과도 상태(배치 도중)는 호출 스킵 — 매 디바운스 400 방지
    const hasInvalidPipe = pipes.some((g) => !g.outlet
      || !g.flowDirection || (!g.flowDirection[0] && !g.flowDirection[1])
      || !(Number(g.flowSpeed) > 0))
    if (hasInvalidPipe) return
    if (isWorkshop && isOverLimit) return
    if (waterPreviewFallbackRef.current) {
      setEditorWaterFlows(computeWaterFlows(mapState, poses))
      return
    }

    const seq = ++waterPreviewSeqRef.current
    const controller = new AbortController()
    if (waterPreviewRetryRef.current != null) {
      window.clearTimeout(waterPreviewRetryRef.current)
      waterPreviewRetryRef.current = null
    }
    const timer = window.setTimeout(async () => {
      const currentMapConfig = JSON.parse(exportJson(mapState))
      // 정규화 [0..1]² 좌표 그대로 전송 (BE 계약) — 미제출 플레이어는 null
      const currentPoses = mapState.players.map((_, i) =>
        poses[i] && poses[i]!.length >= 2 ? poses[i]! : null)
      try {
        let rows: number[][]
        if (isWorkshop) {
          rows = (await previewWaterFlows(
            { mapConfig: currentMapConfig, poses: currentPoses },
            controller.signal,
          )).waterFlows ?? []
        } else {
          rows = (await request<{ waterFlows: number[][] }>('/api/v1/dev/water-preview', {
            method: 'POST',
            body: JSON.stringify({ mapConfig: currentMapConfig, poses: currentPoses }),
            signal: controller.signal,
          })).waterFlows ?? []
        }
        if (seq !== waterPreviewSeqRef.current) return // 순서 역전 — 폐기
        setEditorWaterFlows(rows
          .filter((r) => Array.isArray(r) && r.length === 5)
          .map(([x1, y1, x2, y2, hw]) => ({ x1, y1, x2, y2, hw })))
      } catch (error) {
        if (controller.signal.aborted || seq !== waterPreviewSeqRef.current) return
        if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
          // 구버전 BE — 로컬 근사 계산으로 영구 폴백
          waterPreviewFallbackRef.current = true
          setEditorWaterFlows(computeWaterFlows(mapState, poses))
          return
        }
        // 5xx(계산 실패)·429·네트워크: 마지막 성공 결과 유지.
        // 무편집 상태로 끝나면 스테일이 영구화되므로 2초 후 1회 재시도.
        console.warn('물길 프리뷰 갱신 실패 — 마지막 결과 유지', error)
        waterPreviewRetryRef.current = window.setTimeout(() => {
          waterPreviewRetryRef.current = null
          if (seq === waterPreviewSeqRef.current) setWaterPreviewRetryTick((t) => t + 1)
        }, 2000)
      }
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // waterPreviewRetryTick: 실패 후 1회 지연 재시도 트리거
  }, [mapState, poses, isWorkshop, isOverLimit, waterPreviewRetryTick])

  // Textarea 입력 상태 (commitState / undo / redo 시점에만 동기화된다)
  const [jsonText, setJsonText] = useState(() => exportJson(SAMPLE_A))
  const [poseJsonText, setPoseJsonText] = useState(() =>
    exportPoseJson(SAMPLE_A, SAMPLE_A.players.map(() => null)),
  )
  const [simJsonText, setSimJsonText] = useState('')

  // 힌트 및 토스트
  const [hint, setHint] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 뷰 변환 (scale, ox, oy)
  const viewRef = useRef({ s: 1, ox: 0, oy: 0 })
  // HUD는 mousemove/wheel마다 갱신되므로 state로 두면 매 픽셀마다 전체 리렌더가 난다.
  // 원본 HTML과 동일하게 DOM에 직접 textContent를 쓴다.
  const hudRef = useRef({ x: 0, y: 0 })
  const hudElRef = useRef<HTMLDivElement | null>(null)

  // DB 라운드 연동
  const [rounds, setRounds] = useState<DevRoundSummary[]>([])
  const [selectedRoundId, setSelectedRoundId] = useState<number | ''>('')
  const [roundBusy, setRoundBusy] = useState(false)
  const [roundStatus, setRoundStatus] = useState<string>('')

  // 캔버스 및 인터랙션 임시 변수
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const draftRef = useRef<[number, number][] | null>(null)
  const poseDraftRef = useRef<{ player: number; pts: [number, number][] } | null>(null)
  const padDraftRef = useRef<{ x0: number; y0: number; x1: number; y1: number; kind: 'jumppad' | 'killzone' | 'clearzone' } | null>(null)
  const dragRef = useRef<{
    hit: Selection
    wx: number
    wy: number
    orig: string
    polyOrig?: [number, number][]
  } | null>(null)
  const panRef = useRef<{ x: number; y: number } | null>(null)
  const simRafRef = useRef<number | null>(null)
  const simT0Ref = useRef<number>(0)

  /* ============ 헬퍼 토스트/스냅샷 ============ */
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => {
      setToastMsg(null)
    }, 2200)
  }, [])

  /**
   * JSON textarea 동기화.
   *
   * mapState 변경마다 자동으로 덮어쓰면 드래그 중(mousemove마다 setMapState)에도
   * 사용자가 입력하던 JSON이 날아간다. 원본 HTML처럼 "커밋 시점"에만 갱신한다.
   */
  const syncJsonTexts = useCallback((st: MapState, ps: PoseList) => {
    setJsonText(exportJson(st))
    setPoseJsonText(exportPoseJson(st, ps))
  }, [])

  const commitState = useCallback((nextState: MapState, nextPoses: PoseList) => {
    if (lastSnapRef.current !== '') {
      historyRef.current.push(lastSnapRef.current)
      if (historyRef.current.length > 100) historyRef.current.shift()
    }
    futureRef.current = []
    const newSnap = snapshot(nextState, nextPoses)
    lastSnapRef.current = newSnap
    /*
     * 맵이 실제로 바뀌었을 때만 클리어 검증을 무효화한다.
     *
     * commitState 는 포즈 변경도 함께 태우는데, 포즈를 다시 그렸다고 해서
     * 이미 저장해 둔 lastClearedPoses 가 무효가 되지는 않는다. (그 포즈로는 여전히 깬다)
     * 지형·기믹·시작/도착점이 바뀌어야만 재검증이 필요하다.
     */
    if (exportJson(mapStateRef.current) !== exportJson(nextState)) invalidateClearStatus()
    setMapState(nextState)
    setPoses(nextPoses)
    syncJsonTexts(nextState, nextPoses)
  }, [snapshot, syncJsonTexts, invalidateClearStatus])

  const undo = useCallback(() => {
    if (!historyRef.current.length) return
    futureRef.current.push(snapshot(mapState, poses))
    const prev = JSON.parse(historyRef.current.pop()!)
    if (exportJson(mapState) !== exportJson(prev.state)) invalidateClearStatus()
    setMapState(prev.state)
    setPoses(prev.poses)
    setSelection(null)
    lastSnapRef.current = snapshot(prev.state, prev.poses)
    syncJsonTexts(prev.state, prev.poses)
  }, [mapState, poses, snapshot, syncJsonTexts, invalidateClearStatus])

  const redo = useCallback(() => {
    if (!futureRef.current.length) return
    historyRef.current.push(snapshot(mapState, poses))
    const next = JSON.parse(futureRef.current.pop()!)
    if (exportJson(mapState) !== exportJson(next.state)) invalidateClearStatus()
    setMapState(next.state)
    setPoses(next.poses)
    setSelection(null)
    lastSnapRef.current = snapshot(next.state, next.poses)
    syncJsonTexts(next.state, next.poses)
  }, [mapState, poses, snapshot, syncJsonTexts, invalidateClearStatus])

  /* ============ 뷰 변환 헬퍼 ============ */
  const fitView = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    const s = (Math.min(w, h) / MAP) * 0.94
    viewRef.current = { s, ox: (w - MAP * s) / 2, oy: (h - MAP * s) / 2 }
  }, [])

  const toWorld = useCallback((mx: number, my: number): [number, number] => {
    const { s, ox, oy } = viewRef.current
    return [(mx - ox) / s, (my - oy) / s]
  }, [])

  const toScreen = useCallback((x: number, y: number): [number, number] => {
    const { s, ox, oy } = viewRef.current
    return [x * s + ox, y * s + oy]
  }, [])

  /** HUD(좌표·줌)를 DOM에 직접 기록한다. 리렌더를 유발하지 않는다. */
  const paintHud = useCallback(() => {
    const el = hudElRef.current
    if (!el) return
    const { x, y } = hudRef.current
    el.textContent = `x: ${x.toFixed(0)}  y: ${y.toFixed(0)}  |  줌 ${viewRef.current.s.toFixed(2)}×`
  }, [])

  /* ============ 렌더링 함수 ============ */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.clientWidth
    const H = canvas.clientHeight
    ctx.clearRect(0, 0, W, H)

    const [x0, y0] = toScreen(0, 0)
    const [x1, y1] = toScreen(MAP, MAP)
    const view = viewRef.current

    // 맵 영역 배경
    ctx.fillStyle = '#171b22'
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)

    // 배경 이미지
    const bgImg = bgImgRef.current
    if (bgImg && bgImg.complete && bgImg.naturalWidth) {
      const sc = Math.max(MAP / bgImg.naturalWidth, MAP / bgImg.naturalHeight)
      const dw = bgImg.naturalWidth * sc
      const dh = bgImg.naturalHeight * sc
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, y0, x1 - x0, y1 - y0)
      ctx.clip()
      ctx.globalAlpha = bgOpacity / 100
      ctx.drawImage(
        bgImg,
        x0 + ((MAP - dw) / 2) * view.s,
        y0 + ((MAP - dh) / 2) * view.s,
        dw * view.s,
        dh * view.s
      )
      ctx.restore()
    }

    // 그리드
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,.06)'
      ctx.lineWidth = 1
      ctx.fillStyle = 'rgba(255,255,255,.25)'
      ctx.font = '10px Consolas'
      for (let g = 0; g <= MAP; g += 100) {
        const [gx] = toScreen(g, 0)
        const [, gy] = toScreen(0, g)
        ctx.beginPath()
        ctx.moveTo(gx, y0)
        ctx.lineTo(gx, y1)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x0, gy)
        ctx.lineTo(x1, gy)
        ctx.stroke()
        if (g < MAP) {
          ctx.fillText(String(g), gx + 2, y0 + 10)
          if (g > 0) ctx.fillText(String(g), x0 + 2, gy + 10)
        }
      }
    }

    // 낙사 경계
    if (showOob) {
      ctx.strokeStyle = 'rgba(255,107,107,.4)'
      ctx.setLineDash([6, 5])
      ctx.lineWidth = 1.5
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
      ctx.setLineDash([])
    }

    const poly2path = (pts: [number, number][]) => {
      ctx.beginPath()
      pts.forEach((p, i) => {
        const [x, y] = toScreen(p[0], p[1])
        if (i) {
          ctx.lineTo(x, y)
        } else {
          ctx.moveTo(x, y)
        }
      })
    }

    // 지형
    mapState.terrain.forEach((poly, i) => {
      poly2path(poly)
      ctx.closePath()
      const sel = selection?.kind === 'terrain' && selection.index === i
      ctx.fillStyle = sel ? 'rgba(76,141,255,.35)' : 'rgba(47,56,68,.9)'
      ctx.fill()
      ctx.strokeStyle = sel ? '#4c8dff' : '#4a5668'
      ctx.lineWidth = sel ? 2 : 1.2
      ctx.stroke()

      if (sel || tool === 'select') {
        poly.forEach((p, vi) => {
          const [vx, vy] = toScreen(p[0], p[1])
          ctx.beginPath()
          ctx.arc(vx, vy, sel && selection.vertex === vi ? 6 : 4, 0, 7)
          ctx.fillStyle = sel && selection.vertex === vi ? '#fff' : sel ? '#4c8dff' : '#5a6878'
          ctx.fill()
        })
      }
    })

    // 지형 드래프트
    const draft = draftRef.current
    if (draft) {
      poly2path(draft)
      ctx.strokeStyle = '#4c8dff'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 4])
      ctx.stroke()
      ctx.setLineDash([])
      draft.forEach((p, i) => {
        const [vx, vy] = toScreen(p[0], p[1])
        ctx.beginPath()
        ctx.arc(vx, vy, i === 0 ? 7 : 4, 0, 7)
        ctx.fillStyle = i === 0 ? '#f5b942' : '#4c8dff'
        ctx.fill()
      })
    }

    // 플레이어 영역 + 포즈
    const poseDraft = poseDraftRef.current
    mapState.players.forEach((c, i) => {
      const b = { x: c[0] - PLAYER_W / 2, y: c[1] - PLAYER_H / 2, w: PLAYER_W, h: PLAYER_H }
      const [bx, by] = toScreen(b.x, b.y)
      const bw = b.w * view.s
      const bh = b.h * view.s
      const sel = selection?.kind === 'player' && selection.index === i
      const posing = poseDraft && poseDraft.player === i

      if (showBoxes || posing) {
        ctx.strokeStyle = posing ? '#ff9f43' : sel ? '#f5b942' : 'rgba(245,185,66,.55)'
        ctx.lineWidth = posing ? 2.5 : sel ? 2 : 1.2
        if (!posing) ctx.setLineDash([4, 3])
        ctx.strokeRect(bx, by, bw, bh)
        ctx.setLineDash([])
        if (posing) {
          ctx.fillStyle = 'rgba(255,159,67,.08)'
          ctx.fillRect(bx, by, bw, bh)
        }
        ctx.fillStyle = posing ? '#ff9f43' : sel ? '#f5b942' : 'rgba(245,185,66,.8)'
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText('P' + (i + 1), bx + 4, by + 14)
      }

      const pose = poseDraft && poseDraft.player === i ? poseDraft.pts : poses[i]
      if (pose && pose.length && showPoses) {
        ctx.beginPath()
        pose.forEach((p, pi) => {
          const [px, py] = toScreen(b.x + p[0] * b.w, b.y + p[1] * b.h)
          if (pi) {
            ctx.lineTo(px, py)
          } else {
            ctx.moveTo(px, py)
          }
        })
        ctx.strokeStyle = posing ? '#ff9f43' : '#3ecf8e'
        ctx.lineWidth = Math.max(2, ROAD_R * 2 * view.s)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = 0.85
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      const [cx, cy] = toScreen(c[0], c[1])
      ctx.beginPath()
      ctx.arc(cx, cy, sel ? 6 : 4.5, 0, 7)
      ctx.fillStyle = sel ? '#fff' : '#f5b942'
      ctx.fill()
    })

    // WATER_PIPE 물길 프리뷰 — BE water-preview 결과 (디바운스 갱신, 드래그 중 스테일 허용)
    {
      const flows = editorWaterFlows
      for (const f of flows) {
        const [ax, ay] = toScreen(f.x1, f.y1)
        const [bx2, by2] = toScreen(f.x2, f.y2)
        ctx.strokeStyle = 'rgba(72,219,251,.4)'
        ctx.lineWidth = Math.max(2, f.hw * 2 * view.s)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx2, by2)
        ctx.stroke()
        // 흐름 방향 중앙선
        ctx.strokeStyle = 'rgba(72,219,251,.8)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx2, by2)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // 점프패드 · 바람 · 물 (+미구현 기믹)
    mapState.gimmicks.forEach((g, i) => {
      const sel = selection?.kind === 'pad' && selection.index === i
      if (g.type === 'WATER_PIPE' && g.outlet) {
        const [ox, oy] = toScreen(g.outlet[0], g.outlet[1])
        ctx.beginPath()
        ctx.arc(ox, oy, sel ? 9 : 7, 0, 7)
        ctx.fillStyle = sel ? '#48dbfb' : 'rgba(72,219,251,.75)'
        ctx.fill()
        ctx.strokeStyle = '#0abde3'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#48dbfb'
        ctx.font = '11px sans-serif'
        ctx.fillText(`💧 WATER ${g.flowSpeed ?? ''}`, ox + 12, oy + 4)
        return
      }
      if (g.type === 'WIND' && g.band) {
        const [lx, ty] = toScreen(0, g.band[0])
        const [rx, by] = toScreen(MAP, g.band[1])
        ctx.fillStyle = sel ? 'rgba(84,160,255,.28)' : 'rgba(84,160,255,.15)'
        ctx.fillRect(lx, ty, rx - lx, by - ty)
        ctx.strokeStyle = sel ? '#54a0ff' : 'rgba(84,160,255,.7)'
        ctx.lineWidth = sel ? 2.5 : 1.5
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(lx, ty)
        ctx.lineTo(rx, ty)
        ctx.moveTo(lx, by)
        ctx.lineTo(rx, by)
        ctx.stroke()
        ctx.setLineDash([])
        // 좌향 화살표 (바람 방향 -x)
        const midY = (ty + by) / 2
        ctx.strokeStyle = 'rgba(84,160,255,.85)'
        ctx.lineWidth = 2
        for (let k = 0; k < 5; k++) {
          const ax = lx + ((rx - lx) * (k + 0.5)) / 5
          ctx.beginPath()
          ctx.moveTo(ax + 14, midY)
          ctx.lineTo(ax - 14, midY)
          ctx.lineTo(ax - 6, midY - 6)
          ctx.moveTo(ax - 14, midY)
          ctx.lineTo(ax - 6, midY + 6)
          ctx.stroke()
        }
        ctx.fillStyle = '#54a0ff'
        ctx.font = '11px sans-serif'
        ctx.fillText(`💨 WIND ${g.strength ?? ''}`, lx + 8, ty + 14)
        return
      }
      if (g.type === 'KILL_ZONE' && g.area) {
        const [zx, zy] = toScreen(g.area[0], g.area[1])
        const zw = g.area[2] * view.s
        const zh = g.area[3] * view.s
        ctx.fillStyle = sel ? 'rgba(238,82,83,.35)' : 'rgba(238,82,83,.2)'
        ctx.fillRect(zx, zy, zw, zh)
        ctx.strokeStyle = sel ? '#ee5253' : 'rgba(238,82,83,.8)'
        ctx.lineWidth = sel ? 2.5 : 1.5
        ctx.strokeRect(zx, zy, zw, zh)
        // 대각선 해칭
        ctx.save()
        ctx.beginPath()
        ctx.rect(zx, zy, zw, zh)
        ctx.clip()
        ctx.strokeStyle = 'rgba(238,82,83,.35)'
        ctx.lineWidth = 1
        const gap = 14
        for (let hx = zx - zh; hx < zx + zw; hx += gap) {
          ctx.beginPath()
          ctx.moveTo(hx, zy + zh)
          ctx.lineTo(hx + zh, zy)
          ctx.stroke()
        }
        ctx.restore()
        ctx.fillStyle = '#ee5253'
        ctx.font = '11px sans-serif'
        ctx.fillText('☠ KILL_ZONE', zx + 6, zy + 14)
        return
      }
      if (g.type === 'JUMP_PAD' && g.position && g.size) {
        const [px, py] = toScreen(g.position[0] - g.size[0] / 2, g.position[1] - g.size[1] / 2)
        const pw = g.size[0] * view.s
        const ph = g.size[1] * view.s
        ctx.fillStyle = sel ? 'rgba(255,159,67,.85)' : 'rgba(255,159,67,.55)'
        ctx.fillRect(px, py, pw, ph)
        ctx.strokeStyle = '#ff9f43'
        ctx.lineWidth = sel ? 2.5 : 1.5
        ctx.strokeRect(px, py, pw, ph)

        // 발사 방향 화살표
        const v = g.launchVelocity || [0, -600]
        const mag = Math.hypot(v[0], v[1]) || 1
        const [ax, ay] = toScreen(g.position[0], g.position[1])
        const ex = ax + (v[0] / mag) * 40 * view.s
        const ey = ay + (v[1] / mag) * 40 * view.s
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = '#ff9f43'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(ex, ey, 3.5, 0, 7)
        ctx.fillStyle = '#ff9f43'
        ctx.fill()
      } else if (g.position) {
        const [px, py] = toScreen(g.position[0], g.position[1])
        ctx.fillStyle = sel ? '#c56cf0' : 'rgba(197,108,240,.6)'
        ctx.beginPath()
        ctx.arc(px, py, 8, 0, 7)
        ctx.fill()
        ctx.fillStyle = '#c56cf0'
        ctx.font = '10px sans-serif'
        ctx.fillText(g.type + ' (미구현)', px + 10, py + 3)
      }
    })

    const padDraft = padDraftRef.current
    if (padDraft) {
      const [px, py] = toScreen(Math.min(padDraft.x0, padDraft.x1), Math.min(padDraft.y0, padDraft.y1))
      ctx.strokeStyle = padDraft.kind === 'killzone' ? '#ee5253' : padDraft.kind === 'clearzone' ? '#3ecf8e' : '#ff9f43'
      ctx.setLineDash([4, 3])
      ctx.strokeRect(
        px,
        py,
        Math.abs(padDraft.x1 - padDraft.x0) * view.s,
        Math.abs(padDraft.y1 - padDraft.y0) * view.s
      )
      ctx.setLineDash([])
    }

    // clearZone: 사각형 클리어 구역 (공 외곽이 닿는 순간 클리어 — 킬존의 초록 버전)
    if (mapState.clearZone) {
      const cz = mapState.clearZone
      const sel = selection?.kind === 'clearzone'
      const [zx, zy] = toScreen(cz[0], cz[1])
      const zw = cz[2] * view.s
      const zh = cz[3] * view.s
      ctx.fillStyle = sel ? 'rgba(62,207,142,.32)' : 'rgba(62,207,142,.16)'
      ctx.fillRect(zx, zy, zw, zh)
      ctx.strokeStyle = sel ? '#3ecf8e' : 'rgba(62,207,142,.85)'
      ctx.lineWidth = sel ? 2.5 : 1.5
      ctx.setLineDash([8, 6])
      ctx.strokeRect(zx, zy, zw, zh)
      ctx.setLineDash([])
      // 대각선 해칭 (킬존과 동일 패턴, 색만 초록)
      ctx.save()
      ctx.beginPath()
      ctx.rect(zx, zy, zw, zh)
      ctx.clip()
      ctx.strokeStyle = 'rgba(62,207,142,.3)'
      ctx.lineWidth = 1
      const czGap = 14
      for (let hx = zx - zh; hx < zx + zw; hx += czGap) {
        ctx.beginPath()
        ctx.moveTo(hx, zy + zh)
        ctx.lineTo(hx + zh, zy)
        ctx.stroke()
      }
      ctx.restore()
      ctx.fillStyle = '#3ecf8e'
      ctx.font = '11px sans-serif'
      ctx.fillText('🏁 CLEAR_ZONE', zx + 6, zy + 14)
    }

    // endPoint: 클리어 라인 + 깃발
    // (clearZone이 있으면 세로 클리어 라인은 그리지 않는다 — x 기준 판정이 아니므로.
    //  깃발은 표시용으로 유지)
    {
      const [ex, ey] = toScreen(mapState.endPoint[0], mapState.endPoint[1])
      if (!mapState.clearZone) {
        ctx.strokeStyle = 'rgba(62,207,142,.5)'
        ctx.setLineDash([8, 6])
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(ex, y0)
        ctx.lineTo(ex, y1)
        ctx.stroke()
        ctx.setLineDash([])
      }

      const sel = selection?.kind === 'end'
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex, ey - 26)
      ctx.strokeStyle = sel ? '#fff' : '#3ecf8e'
      ctx.lineWidth = 2.5
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(ex, ey - 26)
      ctx.lineTo(ex + 16, ey - 20)
      ctx.lineTo(ex, ey - 14)
      ctx.closePath()
      ctx.fillStyle = sel ? '#fff' : '#3ecf8e'
      ctx.fill()
    }

    // startPoint: 공
    {
      const [sx, sy] = toScreen(mapState.startPoint[0], mapState.startPoint[1])
      const sel = selection?.kind === 'start'
      ctx.beginPath()
      ctx.arc(sx, sy, BALL_R * view.s, 0, 7)
      ctx.fillStyle = sel ? '#7fb0ff' : '#4c8dff'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(10, 13 * view.s)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('S', sx, sy + 1)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }

    // 시뮬레이션 궤적 + 공
    const currentSim = simRef.current
    if (currentSim.frames && currentSim.frames.length) {
      ctx.beginPath()
      currentSim.frames.forEach((f, i) => {
        const [px, py] = toScreen(f[0], f[1])
        if (i) {
          ctx.lineTo(px, py)
        } else {
          ctx.moveTo(px, py)
        }
      })
      ctx.strokeStyle = 'rgba(76,141,255,.45)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      const f = currentSim.frames[Math.min(currentSim.playIdx, currentSim.frames.length - 1)]
      if (f) {
        const [bx2, by2] = toScreen(f[0], f[1])
        ctx.beginPath()
        ctx.arc(bx2, by2, BALL_R * view.s, 0, 7)
        ctx.fillStyle = currentSim.result ? '#3ecf8e' : '#ff6b6b'
        ctx.globalAlpha = 0.9
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.strokeStyle = '#fff'
        ctx.stroke()
      }
    }
  }, [
    toScreen,
    bgOpacity,
    showGrid,
    showOob,
    mapState,
    selection,
    editorWaterFlows,
    tool,
    showBoxes,
    poses,
    showPoses,
  ])

  /**
   * 항상 최신 draw를 가리키는 ref.
   *
   * draw는 mapState/selection/tool이 바뀔 때마다 새 함수가 되므로,
   * 이미지 onload처럼 나중에 실행되는 콜백이 draw를 직접 캡처하면
   * "예전 맵"을 다시 그리게 된다. 비동기 경로에서는 drawRef.current()를 쓴다.
   */
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  }, [draw])

  /**
   * Canvas 리사이즈.
   *
   * draw를 의존성에 넣으면 mapState가 바뀔 때마다 이 effect가 재실행되어
   * fitView()가 호출되고, 사용자가 맞춰둔 줌/팬이 매번 초기화된다.
   * 원본 HTML처럼 window resize에만 반응하도록 의존성을 고정한다.
   */
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    fitView()
    drawRef.current()
    paintHud()
  }, [fitView, paintHud])

  useEffect(() => {
    handleResize()
    window.addEventListener('resize', handleResize)

    // 이 effect는 이제 마운트 시 한 번만 돌기 때문에, 창 크기와 무관한 레이아웃 변화
    // (마운트 직후 clientWidth가 0인 경우, 폰트·CSS 지연 로드, 사이드바 변화)는
    // window resize로 잡히지 않는다. 캔버스 컨테이너를 직접 관찰한다.
    const observed = canvasRef.current?.parentElement ?? canvasRef.current
    const observer = observed ? new ResizeObserver(() => handleResize()) : null
    if (observed && observer) observer.observe(observed)

    return () => {
      window.removeEventListener('resize', handleResize)
      observer?.disconnect()
    }
  }, [handleResize])

  useEffect(() => {
    draw()
  }, [draw])

  /* ============ 히트 테스트 ============ */
  const hitTest = useCallback(
    (wx: number, wy: number): Selection | null => {
      const r = 10 / viewRef.current.s
      if (selection?.kind === 'terrain' && selection.index !== undefined) {
        const poly = mapState.terrain[selection.index]
        if (poly) {
          for (let vi = 0; vi < poly.length; vi++) {
            if (near(poly[vi], wx, wy, r)) {
              return { kind: 'terrain', index: selection.index, vertex: vi }
            }
          }
        }
      }
      if (near(mapState.startPoint, wx, wy, Math.max(r, BALL_R))) return { kind: 'start' }
      if (near(mapState.endPoint, wx, wy, Math.max(r, 15))) return { kind: 'end' }
      for (let i = 0; i < mapState.players.length; i++) {
        if (near(mapState.players[i], wx, wy, r)) return { kind: 'player', index: i }
      }
      for (let i = 0; i < mapState.gimmicks.length; i++) {
        const g = mapState.gimmicks[i]
        if (g.type === 'WATER_PIPE' && g.outlet) {
          if (near(g.outlet, wx, wy, Math.max(r, 12))) return { kind: 'pad', index: i }
          continue
        }
        if (g.type === 'WIND' && g.band) {
          // 경계선(핸들)은 우선 선택, 밴드 몸통은 지형보다 후순위 (아래 별도 루프)
          if (Math.abs(wy - g.band[0]) <= r) return { kind: 'pad', index: i, vertex: 0 }
          if (Math.abs(wy - g.band[1]) <= r) return { kind: 'pad', index: i, vertex: 1 }
          continue
        }
        if (!g.position) continue
        if (g.type === 'JUMP_PAD' && g.size) {
          if (
            Math.abs(wx - g.position[0]) <= g.size[0] / 2 + r / 2 &&
            Math.abs(wy - g.position[1]) <= g.size[1] / 2 + r / 2
          ) {
            return { kind: 'pad', index: i }
          }
        } else if (near(g.position, wx, wy, r)) return { kind: 'pad', index: i }
      }
      for (let i = 0; i < mapState.terrain.length; i++) {
        const poly = mapState.terrain[i]
        for (let vi = 0; vi < poly.length; vi++) {
          if (near(poly[vi], wx, wy, r)) return { kind: 'terrain', index: i, vertex: vi }
        }
        if (pointInPoly([wx, wy], poly)) return { kind: 'terrain', index: i }
      }
      // 넓은 영역형 기믹 몸통 (지형을 가리지 않게 최후순위)
      for (let i = 0; i < mapState.gimmicks.length; i++) {
        const g = mapState.gimmicks[i]
        if (g.type === 'WIND' && g.band && wy >= g.band[0] && wy <= g.band[1]) {
          return { kind: 'pad', index: i }
        }
        if (g.type === 'KILL_ZONE' && g.area
            && wx >= g.area[0] && wx <= g.area[0] + g.area[2]
            && wy >= g.area[1] && wy <= g.area[1] + g.area[3]) {
          return { kind: 'pad', index: i }
        }
      }
      // 클리어 구역 몸통 (킬존과 같은 최후순위 — 지형 편집을 가리지 않게)
      if (mapState.clearZone) {
        const cz = mapState.clearZone
        if (wx >= cz[0] && wx <= cz[0] + cz[2] && wy >= cz[1] && wy <= cz[1] + cz[3]) {
          return { kind: 'clearzone' }
        }
      }
      return null
    },
    [selection, mapState]
  )

  /* ============ 도구 설정 ============ */
  const changeTool = useCallback((t: Tool) => {
    setTool(t)
    draftRef.current = null
    poseDraftRef.current = null
    const hints: Record<Tool, string> = {
      terrain: '클릭: 꼭짓점 추가 · Enter/첫 점 클릭: 완료 · Esc: 취소',
      jumppad: '드래그로 점프패드 영역을 지정하세요',
      wind: '클릭한 높이를 중심으로 바람 밴드(높이 120)를 생성합니다 — 경계선 드래그로 조절',
      killzone: '드래그로 즉사 구역을 지정하세요 — 공 외곽(반경 13)이 닿으면 라운드 실패',
      clearzone: '드래그로 클리어 구역을 지정하세요 — 공 외곽(반경 13)이 닿는 순간 클리어 (깃발은 존 중앙으로 이동)',
      waterpipe: '클릭 위치에 물 배출구를 놓습니다 — 물길은 포즈·지형 기준으로 실시간 표시',
      pose: '① 프레임 클릭으로 선택(Tab: 겹친 프레임 전환) → ② 클릭으로 점 추가 → Enter 완료',
      player: '클릭한 위치가 플레이어 영역(230×180)의 중심이 됩니다',
      start: '클릭으로 시작점(S)을 배치합니다',
      end: '클릭으로 도착점(🏁)을 배치합니다',
      select: '드래그: 이동 · 더블클릭(지형 변): 꼭짓점 추가 · Delete: 삭제 · 휠: 줌 · 우클릭 드래그: 이동',
    }
    setHint(hints[t] || null)
  }, [])

  const finishTerrain = useCallback(() => {
    const draft = draftRef.current
    if (draft && draft.length >= 3) {
      const nextState: MapState = {
        ...mapState,
        terrain: [...mapState.terrain, draft],
      }
      draftRef.current = null
      setHint(null)
      setSelection({ kind: 'terrain', index: nextState.terrain.length - 1 })
      commitState(nextState, poses)
    } else {
      showToast('꼭짓점이 3개 이상 필요합니다.')
    }
  }, [mapState, poses, commitState, showToast])

  const finishPose = useCallback(() => {
    const poseDraft = poseDraftRef.current
    if (poseDraft && poseDraft.pts.length >= 2) {
      const nextPoses = [...poses]
      nextPoses[poseDraft.player] = poseDraft.pts
      poseDraftRef.current = null
      setHint(null)
      commitState(mapState, nextPoses)
    } else {
      showToast('포즈 점이 2개 이상 필요합니다.')
    }
  }, [mapState, poses, commitState, showToast])

  const deleteSelection = useCallback(() => {
    if (!selection) return
    const nextState: MapState = JSON.parse(JSON.stringify(mapState))
    const nextPoses: PoseList = [...poses]

    if (selection.kind === 'terrain' && selection.index !== undefined) {
      if (selection.vertex !== undefined && nextState.terrain[selection.index].length > 3) {
        nextState.terrain[selection.index].splice(selection.vertex, 1)
        setSelection({ kind: 'terrain', index: selection.index })
      } else {
        nextState.terrain.splice(selection.index, 1)
        setSelection(null)
      }
    } else if (selection.kind === 'player' && selection.index !== undefined) {
      nextState.players.splice(selection.index, 1)
      nextPoses.splice(selection.index, 1)
      setSelection(null)
    } else if (selection.kind === 'pad' && selection.index !== undefined) {
      nextState.gimmicks.splice(selection.index, 1)
      setSelection(null)
    } else if (selection.kind === 'clearzone') {
      delete nextState.clearZone
      setSelection(null)
      showToast('클리어 구역을 삭제했습니다 — 판정이 기존 방식(공.x ≥ 도착점.x)으로 돌아갑니다.')
    } else if (selection.kind === 'start' || selection.kind === 'end') {
      showToast('시작점/도착점은 필수 항목이라 삭제할 수 없습니다. 드래그로 이동하세요.')
      return
    }
    commitState(nextState, nextPoses)
  }, [selection, mapState, poses, commitState, showToast])

  /* ============ 마우스/키보드 이벤트 렌더러 ============ */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) {
        if (e.button === 1 || e.button === 2) {
          panRef.current = { x: e.clientX, y: e.clientY }
        }
        return
      }
      const rect = canvas.getBoundingClientRect()
      const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top)

      if (tool === 'terrain') {
        if (!draftRef.current) draftRef.current = []
        if (draftRef.current.length >= 3 && near(draftRef.current[0], wx, wy, 12 / viewRef.current.s)) {
          finishTerrain()
          return
        }
        draftRef.current.push([clampMap(wx), clampMap(wy)])
        setHint('클릭: 꼭짓점 추가 · Enter/첫 점 클릭: 완료 · Esc: 취소')
        draw()
        return
      }

      if (tool === 'start') {
        const nextState = { ...mapState, startPoint: [clampMap(wx), clampMap(wy)] as [number, number] }
        commitState(nextState, poses)
        return
      }

      if (tool === 'end') {
        const nextState = { ...mapState, endPoint: [clampMap(wx), clampMap(wy)] as [number, number] }
        commitState(nextState, poses)
        return
      }

      if (tool === 'player') {
        if (mapState.players.length >= MAX_PLAYERS) {
          showToast('플레이어는 최대 4명입니다.')
          return
        }
        const nextState = {
          ...mapState,
          players: [...mapState.players, [clampMap(wx), clampMap(wy)] as [number, number]],
        }
        const nextPoses = [...poses, null]
        setSelection({ kind: 'player', index: nextState.players.length - 1 })
        commitState(nextState, nextPoses)
        return
      }

      if (tool === 'jumppad') {
        padDraftRef.current = { x0: wx, y0: wy, x1: wx, y1: wy, kind: 'jumppad' }
        return
      }

      if (tool === 'killzone') {
        padDraftRef.current = { x0: wx, y0: wy, x1: wx, y1: wy, kind: 'killzone' }
        return
      }

      if (tool === 'clearzone') {
        padDraftRef.current = { x0: wx, y0: wy, x1: wx, y1: wy, kind: 'clearzone' }
        return
      }

      if (tool === 'waterpipe') {
        const nextState: MapState = {
          ...mapState,
          gimmicks: [
            ...mapState.gimmicks,
            {
              type: 'WATER_PIPE',
              outlet: [clampMap(wx), clampMap(wy)],
              flowDirection: [0, 1],
              flowSpeed: 180,
              width: 36,
            },
          ],
        }
        setSelection({ kind: 'pad', index: nextState.gimmicks.length - 1 })
        changeTool('select')
        commitState(nextState, poses)
        return
      }

      if (tool === 'wind') {
        const half = 60
        const top = Math.max(0, Math.min(MAP - half * 2, wy - half))
        const nextState: MapState = {
          ...mapState,
          gimmicks: [
            ...mapState.gimmicks,
            { type: 'WIND', band: [clampMap(top), clampMap(top + half * 2)], strength: 700 },
          ],
        }
        setSelection({ kind: 'pad', index: nextState.gimmicks.length - 1 })
        changeTool('select')
        commitState(nextState, poses)
        return
      }

      if (tool === 'pose') {
        if (!poseDraftRef.current) {
          const cands = mapState.players
            .map((c, i) => ({
              i,
              c,
              b: { x: c[0] - PLAYER_W / 2, y: c[1] - PLAYER_H / 2, w: PLAYER_W, h: PLAYER_H },
            }))
            .filter((o) => wx >= o.b.x && wx <= o.b.x + o.b.w && wy >= o.b.y && wy <= o.b.y + o.b.h)
            .sort((a, b) => Math.hypot(wx - a.c[0], wy - a.c[1]) - Math.hypot(wx - b.c[0], wy - b.c[1]))

          if (!cands.length) {
            showToast('플레이어 영역(점선 박스) 안을 클릭해 프레임을 먼저 선택하세요.')
            return
          }
          poseDraftRef.current = { player: cands[0].i, pts: [] }
          setSelection({ kind: 'player', index: cands[0].i })
          setHint(`P${cands[0].i + 1} 프레임 선택됨 — 클릭으로 점 추가 · Tab: 겹친 프레임 전환 · Enter: 완료 · Esc: 취소`)
          draw()
          return
        }

        const b = {
          x: mapState.players[poseDraftRef.current.player][0] - PLAYER_W / 2,
          y: mapState.players[poseDraftRef.current.player][1] - PLAYER_H / 2,
          w: PLAYER_W,
          h: PLAYER_H,
        }
        poseDraftRef.current.pts.push([
          Math.max(0, Math.min(1, (wx - b.x) / b.w)),
          Math.max(0, Math.min(1, (wy - b.y) / b.h)),
        ])
        setHint(`P${poseDraftRef.current.player + 1} 포즈 그리는 중 (${poseDraftRef.current.pts.length}점) · Enter: 완료 · Esc: 취소`)
        draw()
        return
      }

      // tool === 'select'
      const hit = hitTest(wx, wy)
      setSelection(hit)
      if (hit) {
        dragRef.current = {
          hit,
          wx,
          wy,
          orig: snapshot(mapState, poses),
          polyOrig:
            hit.kind === 'terrain' && hit.index !== undefined && hit.vertex === undefined
              ? mapState.terrain[hit.index].map((p) => [...p] as [number, number])
              : undefined,
        }
      }
      draw()
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      hudRef.current = { x: wx, y: wy }
      paintHud()

      if (padDraftRef.current) {
        padDraftRef.current.x1 = wx
        padDraftRef.current.y1 = wy
        draw()
        return
      }

      if (panRef.current) {
        const dx = e.clientX - panRef.current.x
        const dy = e.clientY - panRef.current.y
        viewRef.current.ox += dx
        viewRef.current.oy += dy
        panRef.current = { x: e.clientX, y: e.clientY }
        draw()
        return
      }

      if (!dragRef.current) return

      const h = dragRef.current.hit
      const dx = wx - dragRef.current.wx
      const dy = wy - dragRef.current.wy
      const nextState: MapState = JSON.parse(JSON.stringify(mapState))

      if (h.kind === 'start') nextState.startPoint = [clampMap(wx), clampMap(wy)]
      else if (h.kind === 'end') nextState.endPoint = [clampMap(wx), clampMap(wy)]
      else if (h.kind === 'clearzone' && nextState.clearZone) {
        // 몸통 드래그: 커서를 사각형 중심으로 (킬존과 동일)
        const zw = nextState.clearZone[2]
        const zh = nextState.clearZone[3]
        nextState.clearZone = [
          clampMap(Math.max(0, Math.min(MAP - zw, wx - zw / 2))),
          clampMap(Math.max(0, Math.min(MAP - zh, wy - zh / 2))),
          zw,
          zh,
        ]
      }
      else if (h.kind === 'player' && h.index !== undefined) nextState.players[h.index] = [clampMap(wx), clampMap(wy)]
      else if (h.kind === 'pad' && h.index !== undefined) {
        const g = nextState.gimmicks[h.index]
        if (g.type === 'WIND' && g.band) {
          if (h.vertex === 0) g.band[0] = Math.min(clampMap(wy), g.band[1] - 10)
          else if (h.vertex === 1) g.band[1] = Math.max(clampMap(wy), g.band[0] + 10)
          else {
            // 몸통 드래그: 커서 높이를 밴드 중심으로
            const bh = g.band[1] - g.band[0]
            const top = Math.max(0, Math.min(MAP - bh, wy - bh / 2))
            g.band = [clampMap(top), clampMap(top + bh)]
          }
        } else if (g.type === 'WATER_PIPE' && g.outlet) {
          g.outlet = [clampMap(wx), clampMap(wy)]
        } else if (g.type === 'KILL_ZONE' && g.area) {
          // 몸통 드래그: 커서를 사각형 중심으로
          const zw = g.area[2]
          const zh = g.area[3]
          g.area = [
            clampMap(Math.max(0, Math.min(MAP - zw, wx - zw / 2))),
            clampMap(Math.max(0, Math.min(MAP - zh, wy - zh / 2))),
            zw,
            zh,
          ]
        } else if (g.position) {
          g.position = [clampMap(wx), clampMap(wy)]
        }
      }
      else if (h.kind === 'terrain' && h.index !== undefined && h.vertex !== undefined) {
        nextState.terrain[h.index][h.vertex] = [clampMap(wx), clampMap(wy)]
      } else if (h.kind === 'terrain' && h.index !== undefined && dragRef.current.polyOrig) {
        nextState.terrain[h.index] = dragRef.current.polyOrig.map((p) => [
          clampMap(p[0] + dx),
          clampMap(p[1] + dy),
        ])
      }
      setMapState(nextState)
      draw()
    }

    const onMouseUp = () => {
      panRef.current = null

      if (padDraftRef.current) {
        const pd = padDraftRef.current
        const w = Math.abs(pd.x1 - pd.x0)
        const h = Math.abs(pd.y1 - pd.y0)
        if (w >= 5 && h >= 5) {
          if (pd.kind === 'clearzone') {
            const zone: [number, number, number, number] = [
              clampMap(Math.min(pd.x0, pd.x1)),
              clampMap(Math.min(pd.y0, pd.y1)),
              Math.round(w),
              Math.round(h),
            ]
            // 깃발(endPoint)은 표시용 — 존 생성 시 존 중앙으로 자동 배치
            const nextState: MapState = {
              ...mapState,
              clearZone: zone,
              endPoint: [clampMap(zone[0] + zone[2] / 2), clampMap(zone[1] + zone[3] / 2)],
            }
            setSelection({ kind: 'clearzone' })
            changeTool('select')
            commitState(nextState, poses)
            if (mapState.clearZone) showToast('클리어 구역을 새 영역으로 교체했습니다. (구역은 맵당 1개)')
          } else {
            const gimmick: Gimmick = pd.kind === 'killzone'
              ? {
                  type: 'KILL_ZONE',
                  area: [
                    clampMap(Math.min(pd.x0, pd.x1)),
                    clampMap(Math.min(pd.y0, pd.y1)),
                    Math.round(w),
                    Math.round(h),
                  ],
                }
              : {
                  type: 'JUMP_PAD',
                  position: [clampMap((pd.x0 + pd.x1) / 2), clampMap((pd.y0 + pd.y1) / 2)],
                  size: [Math.round(w), Math.round(h)],
                  launchVelocity: [0, -600],
                }
            const nextState: MapState = {
              ...mapState,
              gimmicks: [...mapState.gimmicks, gimmick],
            }
            setSelection({ kind: 'pad', index: nextState.gimmicks.length - 1 })
            commitState(nextState, poses)
          }
        } else {
          showToast('드래그해서 영역 크기를 지정하세요.')
        }
        padDraftRef.current = null
        draw()
        return
      }

      if (dragRef.current) {
        const changed = dragRef.current.orig !== snapshot(mapState, poses)
        if (changed) {
          historyRef.current.push(dragRef.current.orig)
          if (historyRef.current.length > 100) historyRef.current.shift()
          futureRef.current = []
          lastSnapRef.current = snapshot(mapState, poses)
          /*
           * 드래그 이동은 commitState를 거치지 않는다. (드래그 중 setMapState만 한다)
           * 그래서 무효화도 여기서 직접 해야 한다.
           * 빠뜨리면 지형을 옮겨 놓고도 검증 완료로 남아, 옛 포즈로 공개 저장이 통과한다.
           * 드래그가 건드리는 것은 지형·기믹·시작/도착점·플레이어뿐이라
           * changed 가 참이면 곧 맵이 바뀐 것이다.
           */
          invalidateClearStatus()
          // 드래그가 끝난 이 시점에 JSON textarea를 맞춰 준다. (원본의 refreshAll과 동일)
          syncJsonTexts(mapState, poses)
        }
        dragRef.current = null
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const ns = Math.max(0.2, Math.min(8, viewRef.current.s * f))
      viewRef.current.ox = mx - (mx - viewRef.current.ox) * (ns / viewRef.current.s)
      viewRef.current.oy = my - (my - viewRef.current.oy) * (ns / viewRef.current.s)
      viewRef.current.s = ns
      draw()
      paintHud()
    }

    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    const onDblClick = (e: MouseEvent) => {
      if (tool !== 'select' || selection?.kind !== 'terrain' || selection.index === undefined) return
      const rect = canvas.getBoundingClientRect()
      const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      const poly = mapState.terrain[selection.index]
      if (!poly) return

      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]
        const b = poly[(i + 1) % poly.length]
        const t = Math.max(
          0,
          Math.min(
            1,
            ((wx - a[0]) * (b[0] - a[0]) + (wy - a[1]) * (b[1] - a[1])) /
              ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1)
          )
        )
        const px = a[0] + t * (b[0] - a[0])
        const py = a[1] + t * (b[1] - a[1])
        if (Math.hypot(wx - px, wy - py) < 8 / viewRef.current.s) {
          const nextPoly = [...poly]
          nextPoly.splice(i + 1, 0, [clampMap(wx), clampMap(wy)])
          const nextTerrain = [...mapState.terrain]
          nextTerrain[selection.index] = nextPoly
          const nextState = { ...mapState, terrain: nextTerrain }
          setSelection({ kind: 'terrain', index: selection.index, vertex: i + 1 })
          commitState(nextState, poses)
          return
        }
      }
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('dblclick', onDblClick)

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('dblclick', onDblClick)
    }
  }, [tool, selection, mapState, poses, toWorld, hitTest, commitState, draw, paintHud, finishTerrain, showToast, snapshot, syncJsonTexts, changeTool, invalidateClearStatus])

  /* ============ 키보드 숏컷 ============ */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault()
        redo()
        return
      }
      if (e.key === 'Tab' && poseDraftRef.current) {
        e.preventDefault()
        if (poseDraftRef.current.pts.length) {
          showToast('점을 찍기 전에만 프레임을 전환할 수 있습니다 (Esc 후 다시 선택).')
          return
        }
        poseDraftRef.current.player = (poseDraftRef.current.player + 1) % mapState.players.length
        setSelection({ kind: 'player', index: poseDraftRef.current.player })
        setHint(`P${poseDraftRef.current.player + 1} 프레임 선택됨 — 클릭으로 점 추가 · Tab: 프레임 전환 · Enter: 완료 · Esc: 취소`)
        draw()
        return
      }
      if (e.key === 'Enter') {
        if (draftRef.current) finishTerrain()
        else if (poseDraftRef.current) finishPose()
        return
      }
      if (e.key === 'Escape') {
        draftRef.current = null
        poseDraftRef.current = null
        padDraftRef.current = null
        setSelection(null)
        setHint(null)
        draw()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection()
        return
      }

      const keys: Record<string, Tool> = {
        v: 'select',
        t: 'terrain',
        s: 'start',
        e: 'end',
        p: 'player',
        j: 'jumppad',
        d: 'pose',
        c: 'clearzone',
      }
      const t = keys[e.key.toLowerCase()]
      if (t) changeTool(t)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, finishTerrain, finishPose, deleteSelection, changeTool, mapState.players.length, draw, showToast])

  /* ============ 유효성 검사 ============ */
  const validateMap = useCallback(() => {
    const out: { l: 'err' | 'warn'; m: string }[] = []
    const E = (m: string) => out.push({ l: 'err', m })
    const W = (m: string) => out.push({ l: 'warn', m })
    const inMap = (p: [number, number]) => p[0] >= 0 && p[0] <= MAP && p[1] >= 0 && p[1] <= MAP

    if (!inMap(mapState.startPoint)) W('startPoint가 맵(0~1000) 밖에 있습니다.')
    if (!inMap(mapState.endPoint)) W('endPoint가 맵 밖에 있습니다.')
    if (!mapState.clearZone && mapState.endPoint[0] <= mapState.startPoint[0]) {
      W('endPoint.x ≤ startPoint.x — 클리어 판정은 x 기준이라 시작하자마자 성공 처리됩니다.')
    }
    if (mapState.clearZone) {
      const [zx, zy, zw, zh] = mapState.clearZone.map(Number)
      if (!(Number.isFinite(zx) && Number.isFinite(zy)
          && Number.isFinite(zw) && zw > 0 && Number.isFinite(zh) && zh > 0)) {
        E(`클리어 구역: [x, y, w, h] (w·h > 0) 숫자 배열이어야 합니다. (현재: ${JSON.stringify(mapState.clearZone)})`)
      } else {
        if (zx + zw < 0 || zx > MAP || zy + zh < 0 || zy > MAP) {
          W('클리어 구역이 맵(0~1000) 밖에 있어 도달할 수 없습니다.')
        }
        // 시작점이 구역에 닿으면 시작 즉시 클리어 (BE 판정과 동일 수식: 공 외곽 접촉)
        const cx = Math.max(zx, Math.min(zx + zw, mapState.startPoint[0]))
        const cy = Math.max(zy, Math.min(zy + zh, mapState.startPoint[1]))
        if (Math.hypot(mapState.startPoint[0] - cx, mapState.startPoint[1] - cy) <= BALL_R) {
          W('클리어 구역: 시작점이 구역에 닿아 있어 시작하자마자 클리어 처리됩니다.')
        }
      }
    }
    if (!mapState.players.length) E('플레이어가 없습니다 (최소 1명).')
    if (mapState.players.length > MAX_PLAYERS) E(`플레이어가 ${MAX_PLAYERS}명을 초과했습니다.`)

    mapState.players.forEach((p, i) => {
      if (
        p[0] - PLAYER_W / 2 < 0 ||
        p[0] + PLAYER_W / 2 > MAP ||
        p[1] - PLAYER_H / 2 < 0 ||
        p[1] + PLAYER_H / 2 > MAP
      ) {
        W(`P${i + 1} 영역(230×180)이 맵 밖으로 나갑니다.`)
      }
    })

    mapState.terrain.forEach((poly, i) => {
      if (poly.length < 3) E(`지형 #${i + 1}: 꼭짓점이 3개 미만입니다 (백엔드 예외 발생).`)
      else if (selfIntersects(poly)) E(`지형 #${i + 1}: 변이 서로 교차합니다 (법선 계산 오류 유발).`)
    })

    mapState.gimmicks.forEach((g, i) => {
      if (g.type === 'WIND') {
        // 문자열 숫자(JSON 직접 작성)도 허용 — Number 강제 변환 후 판정
        const yTop = Array.isArray(g.band) ? Number(g.band[0]) : NaN
        const yBottom = Array.isArray(g.band) ? Number(g.band[1]) : NaN
        const strength = Number(g.strength)
        if (!(Number.isFinite(yTop) && Number.isFinite(yBottom) && yTop < yBottom)) {
          E(`WIND #${i + 1}: band는 [yTop, yBottom] (yTop < yBottom) 숫자 배열이어야 합니다.`
              + ` (현재: ${JSON.stringify(g.band)})`)
        }
        if (!(Number.isFinite(strength) && strength > 0)) {
          E(`WIND #${i + 1}: strength는 0보다 큰 숫자여야 합니다. (현재: ${JSON.stringify(g.strength)})`)
        } else if (strength <= 450) {
          W(`WIND #${i + 1}: strength ${strength} ≤ 450 — 공이 버티기만 하고 역밀림은 없습니다.`)
        }
        return
      }
      if (g.type === 'KILL_ZONE') {
        const [zx, zy, zw, zh] = Array.isArray(g.area) ? g.area.map(Number) : [NaN, NaN, NaN, NaN]
        if (!(Number.isFinite(zx) && Number.isFinite(zy)
            && Number.isFinite(zw) && zw > 0 && Number.isFinite(zh) && zh > 0)) {
          E(`KILL_ZONE #${i + 1}: area는 [x, y, w, h] (w·h > 0) 숫자 배열이어야 합니다.`
              + ` (현재: ${JSON.stringify(g.area)})`)
          return
        }
        // 시작점이 구역에 닿으면 스폰 즉사
        const cx = Math.max(zx, Math.min(zx + zw, mapState.startPoint[0]))
        const cy = Math.max(zy, Math.min(zy + zh, mapState.startPoint[1]))
        if (Math.hypot(mapState.startPoint[0] - cx, mapState.startPoint[1] - cy) <= BALL_R) {
          E(`KILL_ZONE #${i + 1}: 시작점이 구역에 닿아 있어 스폰 즉시 사망합니다.`)
        }
        return
      }
      if (g.type === 'WATER_PIPE') {
        if (!(Array.isArray(g.outlet) && Number.isFinite(Number(g.outlet[0])) && Number.isFinite(Number(g.outlet[1])))) {
          E(`WATER_PIPE #${i + 1}: outlet은 [x, y] 숫자 배열이어야 합니다. (현재: ${JSON.stringify(g.outlet)})`)
        }
        const fd = g.flowDirection
        if (!(Array.isArray(fd) && (Number(fd[0]) !== 0 || Number(fd[1]) !== 0))) {
          E(`WATER_PIPE #${i + 1}: flowDirection은 영벡터가 아닌 [x, y]여야 합니다.`)
        }
        if (!(Number.isFinite(Number(g.flowSpeed)) && Number(g.flowSpeed) > 0)) {
          E(`WATER_PIPE #${i + 1}: flowSpeed는 0보다 큰 숫자여야 합니다.`)
        }
        if (g.width !== undefined && !(Number.isFinite(Number(g.width)) && Number(g.width) > 0)) {
          E(`WATER_PIPE #${i + 1}: width는 0보다 큰 숫자여야 합니다.`)
        }
        return
      }
      if (g.type !== 'JUMP_PAD') {
        W(`기믹 #${i + 1} (${g.type}): 물리 미구현 — 백엔드가 무시합니다.`)
        return
      }
      if (!(g.size?.[0] && g.size[0] > 0 && g.size[1] && g.size[1] > 0)) E(`점프패드 #${i + 1}: size는 양수여야 합니다.`)
      if (!(g.launchVelocity?.[1] && g.launchVelocity[1] < 0)) E(`점프패드 #${i + 1}: launchVelocity.y는 음수(위 방향)여야 합니다.`)
    })

    return out
  }, [mapState])

  /* ============ 시뮬레이션 제어 ============ */
  const stopSim = useCallback(() => {
    simRef.current.playing = false
    setSim((prev) => ({ ...prev, playing: false }))
    if (simRafRef.current) cancelAnimationFrame(simRafRef.current)
  }, [])

  const playSim = useCallback(() => {
    stopSim()
    if (!simRef.current.frames || !simRef.current.frames.length) return

    simRef.current.playing = true
    simRef.current.playIdx = 0
    simT0Ref.current = performance.now()
    setSim((prev) => ({ ...prev, playing: true, playIdx: 0 }))

    const step = (ts: number) => {
      if (!simRef.current.playing || !simRef.current.frames) return
      const idx = Math.min(
        Math.floor((ts - simT0Ref.current) / simRef.current.intervalMs),
        simRef.current.frames.length - 1
      )
      simRef.current.playIdx = idx
      setSim((prev) => ({ ...prev, playIdx: idx }))
      draw()

      if (idx < simRef.current.frames.length - 1) {
        simRafRef.current = requestAnimationFrame(step)
      } else {
        simRef.current.playing = false
        setSim((prev) => ({ ...prev, playing: false }))
      }
    }
    simRafRef.current = requestAnimationFrame(step)
  }, [stopSim, draw])

  const applySimResult = useCallback(
    (data: { frames: [number, number, ...number[]][]; intervalMs: number; result: boolean | null }, sourceLabel: string) => {
      simRef.current = {
        frames: data.frames,
        intervalMs: data.intervalMs,
        result: data.result,
        playIdx: 0,
        playing: true,
      }
      setSim({
        frames: data.frames,
        intervalMs: data.intervalMs,
        result: data.result,
        playIdx: 0,
        playing: true,
      })
      const secs = (((data.frames.length - 1) * data.intervalMs) / 1000).toFixed(1)
      const badge =
        data.result === true
          ? '<span class="success">✔ 클리어!</span>'
          : data.result === false
          ? '<span class="fail">✖ 실패</span> (낙사 또는 15초 초과)'
          : '<span style="color:var(--muted)">결과 정보 없음</span>'

      setSimStatusMsg(`${badge} · ${secs}초 · ${data.frames.length}프레임 · ${sourceLabel}`)
      playSim()
    },
    [playSim]
  )

  const runServerSim = useCallback(async () => {
    const errs = validateMap().filter((v) => v.l === 'err')
    if (errs.length) {
      showToast('유효성 오류를 먼저 해결하세요: ' + errs[0].m)
      return
    }

    const currentMapConfig = JSON.parse(exportJson(mapState))
    // 빈 포즈는 빈 그대로 전송 — 실제 게임과 동일하게 동작해야 QA가 유효하다.
    // (과거에는 기본 수평 포즈로 몰래 치환해서, 포즈 없이도 '성공'하는 착시가 있었음)
    const currentPoses = mapState.players.map((_, i) =>
      poses[i] && poses[i]!.length >= 2 ? poses[i]! : []
    )
    if (currentPoses.every((p) => p.length < 2)) {
      showToast('유효한 포즈가 없습니다 — 실제 게임처럼 즉시 실패 처리됩니다.')
    }

    if (isWorkshop && isOverLimit) {
      showToast('한도를 초과했습니다: ' + limitIssues[0])
      return
    }

    const body = {
      mapConfig: currentMapConfig,
      poses: currentPoses,
    }

    setSimStatusMsg('⏳ 서버 호출 중…')
    try {
      let data: any
      const cleanedUrl = serverUrl.trim().replace(/\/+$/, '')
      if (isWorkshop) {
        /*
         * 창작마당은 `/api/v1/custom-maps/simulate`를 쓴다.
         * `/api/v1/dev/**`는 SecurityConfig에서 hasRole("ADMIN")이라 일반 유저는 403이다.
         * 요청 키도 map_config(snake_case)로 바뀌므로 전용 API 함수를 통해 보낸다.
         */
        data = await simulateCustomMap({ mapConfig: currentMapConfig, poses: currentPoses })
      } else if (!cleanedUrl || cleanedUrl === 'http://localhost:8080' || cleanedUrl.endsWith('/api/v1/dev/simulate')) {
        data = await request<{ points?: [number, number][]; frames?: [number, number][]; intervalMs?: number; result?: boolean }>('/api/v1/dev/simulate', {
          method: 'POST',
          body: JSON.stringify(body),
        })
      } else {
        const fullUrl = cleanedUrl.includes('/api/v1') ? cleanedUrl : `${cleanedUrl}/api/v1/dev/simulate`
        const res = await fetch(fullUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`)
        }
        data = await res.json()
        if (data && typeof data === 'object' && 'data' in data) {
          data = data.data
        }
      }

      const frames = data.points || data.frames || data.coordinates
      if (!Array.isArray(frames) || !frames.length) {
        throw new Error('서버 응답 데이터에 시뮬레이션 프레임(points)이 없습니다.')
      }

      const simResult = data.result ?? data.success ?? null

      applySimResult(
        {
          frames,
          intervalMs: data.intervalMs ?? data.interval_ms ?? 30,
          result: simResult,
        },
        '서버'
      )

      /*
       * 클리어 검증. 성공한 그 순간의 포즈를 들고 있다가 저장 시 함께 보낸다.
       * (currentPoses 는 이번 요청에 실제로 보낸 값이라 서버가 재현할 수 있다)
       * 관리자 에디터는 공개 업로드 개념이 없어 창작마당에서만 다룬다.
       */
      if (isWorkshop) {
        if (simResult === true) {
          setIsMapCleared(true)
          setLastClearedPoses(currentPoses)
          showToast('🎉 클리어 검증 완료! 이제 창작마당에 공개 업로드할 수 있습니다.')
        } else {
          invalidateClearStatus()
          showToast('❌ 클리어에 실패했습니다. 맵 디자인이나 포즈를 수정해 보세요.')
        }
      }
    } catch (err: any) {
      const hint = isWorkshop
        ? '백엔드 서버가 실행 중이고 로그인되어 있는지 확인하세요.'
        : '백엔드 서버가 실행 중이고, ADMIN 권한으로 로그인되어 있는지 확인하세요.'
      setSimStatusMsg(
        `<span class="fail">요청 실패:</span> ${err.message}<br><span style="color:var(--muted);font-size:11px">${hint}</span>`
      )
    }
  }, [
    validateMap, mapState, poses, serverUrl, applySimResult, showToast,
    isWorkshop, isOverLimit, limitIssues, invalidateClearStatus,
  ])

  /* ============ 배경 이미지 ============ */
  /**
   * 배경 이미지를 URL로 적용한다.
   *
   * 예전 하드코딩 목록은 `/frontend/maps/...`를 가리켜 dev·prod 모두 404였다.
   * 이제는 mapDesign.ts가 번들러로 import한 URL(라운드 자동 매칭)이나
   * createObjectURL(수동 업로드)만 들어온다.
   */
  const applyBackground = useCallback((url: string | null, revokeAfterLoad = false) => {
    // 늦게 도착한 onload가 그 뒤의 "배경 제거"나 다른 이미지를 덮어쓰지 않도록 하는 세대 번호
    const gen = ++bgGenRef.current
    if (!url) {
      bgImgRef.current = null
      setBgTrigger((prev) => prev + 1)
      drawRef.current()
      return
    }
    const img = new Image()
    const finish = (next: HTMLImageElement | null) => {
      if (revokeAfterLoad) URL.revokeObjectURL(url)
      if (gen !== bgGenRef.current) return // 이미 다른 배경 요청이 뒤따랐다
      bgImgRef.current = next
      setBgTrigger((prev) => prev + 1)
      drawRef.current()
    }
    img.onload = () => finish(img)
    img.onerror = () => {
      if (gen === bgGenRef.current) showToast('배경 이미지를 불러오지 못했습니다.')
      finish(null)
    }
    img.src = url
  }, [showToast])

  const handleBgFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    applyBackground(URL.createObjectURL(file), true)
    setBgLabel(file.name)
    e.target.value = ''
  }

  /* ============ DB 라운드 불러오기 / 저장 ============ */
  useEffect(() => {
    // 창작마당은 관리자 전용 `/api/v1/dev/rounds`를 호출하면 403이 난다.
    if (isWorkshop) return
    let cancelled = false
    getDevRounds()
      .then((list) => {
        if (!cancelled) setRounds(list)
      })
      .catch((err: any) => {
        if (!cancelled) setRoundStatus(`라운드 목록 조회 실패: ${err.message}`)
      })
    return () => {
      cancelled = true
    }
  }, [isWorkshop])

  /** 라운드의 stage-round 조합으로 게임과 동일한 배경을 자동 적용한다. */
  const applyRoundBackground = useCallback(
    (stageId: number, roundNo: number) => {
      const design = findMapDesign(stageId, roundNo)
      if (design) {
        applyBackground(design.backgroundImage)
        setBgLabel(design.name)
      } else {
        applyBackground(null)
        setBgLabel('')
      }
    },
    [applyBackground],
  )

  const loadRound = useCallback(
    async (roundId: number) => {
      setRoundBusy(true)
      setRoundStatus('⏳ 불러오는 중…')
      try {
        const detail = await getDevRound(roundId)
        const raw = extractMapConfig(detail.mapConfig)
        if (!raw) throw new Error('map_config를 해석할 수 없습니다.')
        const { cfg, scaled } = normalizeConfig(raw)
        setSelection(null)
        commitState(cfg, cfg.players.map(() => null))
        applyRoundBackground(detail.stageId, detail.roundNo)
        setRoundStatus(
          `✔ ${detail.stageId}-${detail.roundNo} 불러옴${scaled ? ' (레거시 스케일 변환됨)' : ''}`,
        )
      } catch (err: any) {
        setRoundStatus(`✖ 불러오기 실패: ${err.message}`)
        showToast('라운드 불러오기 실패: ' + err.message)
      } finally {
        setRoundBusy(false)
      }
    },
    [commitState, applyRoundBackground, showToast],
  )

  const saveRound = useCallback(async () => {
    if (selectedRoundId === '') {
      showToast('저장할 라운드를 먼저 선택하세요.')
      return
    }
    const errs = validateMap().filter((v) => v.l === 'err')
    if (errs.length) {
      showToast('유효성 오류를 먼저 해결하세요: ' + errs[0].m)
      return
    }
    const target = rounds.find((r) => r.roundId === selectedRoundId)
    const label = target ? formatRoundLabel(target) : `#${selectedRoundId}`
    if (!window.confirm(`${label} 라운드의 map_config를 덮어씁니다. 계속할까요?`)) return

    setRoundBusy(true)
    setRoundStatus('⏳ 저장 중…')
    try {
      await saveDevRound(selectedRoundId, JSON.parse(exportJson(mapState)))
      setRoundStatus(`✔ ${label} 저장 완료`)
      showToast('DB에 저장했습니다.')
    } catch (err: any) {
      setRoundStatus(`✖ 저장 실패: ${err.message}`)
      showToast('저장 실패: ' + err.message)
    } finally {
      setRoundBusy(false)
    }
  }, [selectedRoundId, rounds, validateMap, mapState, showToast])

  /* ============ 창작마당 맵 불러오기 / 저장 ============ */

  /** 수정 진입 시 기존 맵의 지형과 메타데이터를 함께 불러온다. */
  useEffect(() => {
    if (!isWorkshop || !editingStageId) return
    let cancelled = false
    setWorkshopBusy(true)
    setWorkshopStatus('⏳ 맵을 불러오는 중…')
    getCustomMap(editingStageId)
      .then((detail) => {
        if (cancelled) return
        const raw = extractMapConfig(detail.mapConfig)
        if (!raw) throw new Error('map_config를 해석할 수 없습니다.')
        const { cfg, scaled } = normalizeConfig(raw)
        setSelection(null)
        commitState(cfg, cfg.players.map(() => null))
        setMapTitle(detail.title)
        setMapDescription(detail.description)
        setMapDifficulty(detail.difficulty)
        if (detail.palette.length === 3) setMapPalette(detail.palette)
        setMapIsPublic(detail.isPublic)
        /*
         * 불러온 맵은 미검증에서 시작한다. 서버의 is_cleared 를 그대로 옮기지 않는다.
         *
         * 서버(CustomMapService.verifyClear)는 공개 저장 요청에 poses 가 없으면 저장된
         * 검증 결과와 무관하게 곧바로 ST004 를 던진다. "클라이언트의 성공 플래그는 믿지 않고
         * 매번 물리 시뮬레이션으로 재현한다"는 설계다.
         * 포즈는 서버에만 있어 불러올 때 받지 못하므로, 배지를 ✅ 로 띄우면
         * "검증 완료라는데 저장은 400" 이 되어 버린다.
         *
         * 그래서 배지는 **이 세션에서 검증 포즈를 들고 있는가**를 뜻한다.
         * 저장된 상태는 아래 savedIsCleared 로 따로 알려 준다.
         */
        setSavedIsCleared(detail.isCleared)
        setWorkshopStatus(`✔ "${detail.title}" 불러옴${scaled ? ' (레거시 스케일 변환됨)' : ''}`)
      })
      .catch((err: any) => {
        if (!cancelled) setWorkshopStatus(`✖ 불러오기 실패: ${err.message}`)
      })
      .finally(() => {
        if (!cancelled) setWorkshopBusy(false)
      })
    return () => {
      cancelled = true
    }
    // commitState는 매 렌더 새로 만들어지므로 의존성에 넣으면 무한 재조회가 된다.
    // 이 효과는 진입 시 1회만 돌면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkshop, editingStageId])

  const saveCustomMapConfig = useCallback(async () => {
    if (!mapTitle.trim()) {
      showToast('맵 제목을 입력하세요.')
      return
    }
    if (!mapDescription.trim()) {
      showToast('맵 설명을 입력하세요.')
      return
    }
    const errs = validateMap().filter((v) => v.l === 'err')
    if (errs.length) {
      showToast('유효성 오류를 먼저 해결하세요: ' + errs[0].m)
      return
    }
    if (isOverLimit) {
      showToast('한도를 초과했습니다: ' + limitIssues[0])
      return
    }
    /*
     * 공개 업로드는 클리어 검증을 마쳐야 한다.
     * 비공개 저장은 막지 않는다 — 만드는 도중에도 작업물을 남길 수 있어야 한다.
     */
    if (mapIsPublic && !isMapCleared) {
      setWorkshopStatus('⚠️ 클리어 검증이 필요합니다.')
      showToast('클리어 검증(테스트 플레이 성공)을 완료해야 공개 업로드가 가능합니다.')
      return
    }

    setWorkshopBusy(true)
    setWorkshopStatus('⏳ 저장 중…')
    try {
      const mapConfig = JSON.parse(exportJson(mapState))
      const payload = {
        description: mapDescription.trim(),
        difficulty: mapDifficulty,
        palette: mapPalette,
        isPublic: mapIsPublic,
        mapConfig,
        /*
         * 공개 저장이면 검증 포즈를 반드시 함께 보낸다.
         * 서버는 poses 가 없으면 저장된 검증 결과와 무관하게 ST004 를 던지므로,
         * 위 가드에서 이미 lastClearedPoses 가 있는 경우만 여기 도달한다.
         * 비공개 저장에는 굳이 싣지 않는다. (서버가 임시 저장으로 처리한다)
         */
        poses: mapIsPublic ? lastClearedPoses ?? undefined : undefined,
      }
      const saved = editingStageId
        ? await updateCustomMap(editingStageId, payload)
        : await createCustomMap({ ...payload, title: mapTitle.trim() })
      setWorkshopStatus(`✔ "${saved.title}" 저장 완료 (STAGE ${saved.stageId})`)
      showToast('창작마당에 저장했습니다.')
      // 신규 저장 뒤에는 수정 모드로 넘어가야 다시 저장할 때 사본이 생기지 않는다.
      if (!editingStageId) navigate(`/workshop/editor?stageId=${saved.stageId}`, { replace: true })
    } catch (err: any) {
      // 서버 검증 메시지를 그대로 노출한다. (UI 검증은 편의 기능일 뿐 진실의 원천이 아니다)
      setWorkshopStatus(`✖ 저장 실패: ${err.message}`)
      showToast('저장 실패: ' + err.message)
    } finally {
      setWorkshopBusy(false)
    }
  }, [
    mapTitle, mapDescription, mapDifficulty, mapPalette, mapIsPublic,
    validateMap, isOverLimit, limitIssues, mapState, editingStageId, navigate, showToast,
    isMapCleared, lastClearedPoses,
  ])

  const applyJsonClick = useCallback((rawText?: string) => {
    try {
      const textToParse = rawText ?? jsonText
      if (!textToParse.trim()) throw new Error('JSON 코드를 입력하거나 파일을 선택하세요.')
      const j = JSON.parse(textToParse)
      const raw = extractMapConfig(j)
      if (!raw) throw new Error('map_config를 찾을 수 없습니다.')
      const { cfg, scaled } = normalizeConfig(raw)
      const nextPoses = cfg.players.map(() => null)
      setSelection(null)
      commitState(cfg, nextPoses)
      showToast(scaled ? '레거시 스케일을 1000×1000으로 변환해 불러왔습니다.' : '불러오기 완료')
    } catch (err: any) {
      showToast('불러오기 실패: ' + err.message)
    }
  }, [jsonText, commitState, showToast])

  const applyPoseJsonClick = useCallback((rawText?: string) => {
    try {
      const txt = (rawText ?? poseJsonText).trim()
      if (!txt) throw new Error('JSON 코드를 입력하거나 파일을 선택하세요.')
      const parsed = JSON.parse(txt)
      const cfg = extractPoseConfig(parsed)
      if (!cfg) throw new Error('올바른 포즈 JSON 형식이 아닙니다.')

      let appliedCount = 0
      const nextPoses = [...poses]
      const maxCount = Math.max(mapState.players.length, 4)

      for (let i = 0; i < maxCount; i++) {
        let pts: any = null
        if (Array.isArray(cfg)) {
          pts = cfg[i]
        } else if (typeof cfg === 'object') {
          const targetNum = i + 1
          for (const k of Object.keys(cfg)) {
            const match = k.match(/^p(?:layer)?(\d+)(?:_?bridge)?$/i)
            if (match && parseInt(match[1], 10) === targetNum) {
              pts = cfg[k]
              break
            }
          }
          if (!pts) pts = cfg[`p${targetNum}Bridge`] || cfg[`p${targetNum}`]
        }

        if (Array.isArray(pts)) {
          const validPts: [number, number][] = pts
            .filter((p: any) => Array.isArray(p) && p.length >= 2 && !isNaN(+p[0]) && !isNaN(+p[1]))
            .map((p: any) => [+p[0], +p[1]])
          if (validPts.length >= 2) {
            nextPoses[i] = validPts
            appliedCount++
          } else {
            nextPoses[i] = null
          }
        }
      }

      commitState(mapState, nextPoses)
      showToast(`플레이어 좌표 JSON 적용 완료 (${appliedCount}명 포즈 반영)`)
    } catch (err: any) {
      showToast('포즈 적용 실패: ' + err.message)
    }
  }, [poseJsonText, poses, mapState, commitState, showToast])

  const validationItems = validateMap()

  return (
    <div className="map-editor-container">
      <header className="map-editor-header">
        <h1>{isWorkshop ? '🎨 창작마당 맵 에디터' : '🗺️ BodyBuilder 맵 에디터'}</h1>
        {isWorkshop && (
          <button className="btn" onClick={() => navigate('/workshop')} title="창작마당 목록으로 돌아갑니다">
            ‹ 창작마당
          </button>
        )}
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            let nextState: MapState
            if (v === 'sampleA') nextState = JSON.parse(JSON.stringify(SAMPLE_A))
            else if (v === 'sampleB') nextState = JSON.parse(JSON.stringify(SAMPLE_B))
            else nextState = { startPoint: [50, 500], endPoint: [950, 500], players: [], terrain: [], gimmicks: [] }
            const nextPoses = nextState.players.map(() => null)
            setSelection(null)
            commitState(nextState, nextPoses)
          }}
        >
          <option value="">프리셋 선택…</option>
          <option value="sampleA">샘플: 대각선 상승 4인 맵</option>
          <option value="sampleB">샘플: 평지 + 점프패드 2인</option>
          <option value="empty">빈 맵</option>
        </select>
        {/*
          DB 라운드 불러오기 / 저장 — 관리자 전용.
          창작마당에서는 라운드 드롭다운 대신 쿼리스트링의 stageId로 내 맵을 불러온다.
        */}
        {!isWorkshop && (
          <>
            <select
              value={selectedRoundId}
              disabled={roundBusy || !rounds.length}
              onChange={(e) => {
                const v = e.target.value
                if (!v) {
                  setSelectedRoundId('')
                  return
                }
                const id = Number(v)
                setSelectedRoundId(id)
                void loadRound(id)
              }}
              title="DB의 stage_rounds에서 map_config를 불러옵니다"
            >
              <option value="">{rounds.length ? 'DB 라운드 선택…' : '라운드 없음'}</option>
              {rounds.map((r) => (
                <option key={r.roundId} value={r.roundId}>
                  {formatRoundLabel(r)}
                </option>
              ))}
            </select>
            <button
              className="btn"
              onClick={() => selectedRoundId !== '' && void loadRound(selectedRoundId)}
              disabled={roundBusy || selectedRoundId === ''}
              title="선택한 라운드를 DB에서 다시 불러옵니다"
            >
              ⟳ 다시 불러오기
            </button>
            <button
              className="btn primary"
              onClick={() => void saveRound()}
              disabled={roundBusy || selectedRoundId === ''}
              title="현재 맵을 선택한 라운드의 map_config로 덮어씁니다"
            >
              💾 DB 저장
            </button>
          </>
        )}
        {isWorkshop && (
          <>
            {/* 클리어 검증 배지 — 공개 업로드 가능 여부를 항상 보이게 둔다. */}
            <span
              className={`clear-badge ${isMapCleared ? 'clear-badge--ok' : 'clear-badge--warn'}`}
              title={
                isMapCleared
                  ? '테스트 플레이에 성공했습니다. 공개 업로드할 수 있습니다.'
                  : '테스트 플레이를 성공해야 공개 업로드할 수 있습니다.'
              }
            >
              {isMapCleared ? '✅ 클리어 검증 완료' : '⚠️ 클리어 미검증'}
            </span>
            <button
              className="btn primary"
              onClick={() => void saveCustomMapConfig()}
              disabled={workshopBusy || isOverLimit}
              title={
                isOverLimit
                  ? `한도 초과: ${limitIssues[0]}`
                  : mapIsPublic && !isMapCleared
                    ? '공개 업로드하려면 먼저 테스트 플레이를 성공해야 합니다.'
                    : '창작마당에 저장합니다'
              }
            >
              {editingStageId ? '💾 변경 사항 저장' : '💾 창작마당에 저장'}
            </button>
          </>
        )}
        <input type="file" id="bg-file-input" accept="image/*" style={{ display: 'none' }} onChange={handleBgFileUpload} />
        <button className="btn" onClick={() => document.getElementById('bg-file-input')?.click()} title="배경 이미지를 직접 지정합니다">
          배경 파일…
        </button>
        {bgLabel && (
          <button className="btn" onClick={() => { applyBackground(null); setBgLabel('') }} title="배경 이미지 제거">
            ✕ {bgLabel}
          </button>
        )}
        <label className="chk" style={{ minWidth: 130 }}>
          투명도{' '}
          <input
            type="range"
            min="0"
            max="100"
            value={bgOpacity}
            onChange={(e) => {
              setBgOpacity(+e.target.value)
              draw()
            }}
          />
        </label>
        <div className="spacer" />
        {!isWorkshop && roundStatus && (
          <span style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 260 }}>{roundStatus}</span>
        )}
        {isWorkshop && workshopStatus && (
          <span style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 260 }}>{workshopStatus}</span>
        )}
        <button className="btn" onClick={undo} title="Ctrl+Z">
          ↩ 실행취소
        </button>
        <button className="btn" onClick={redo} title="Ctrl+Y">
          ↪ 다시실행
        </button>
      </header>

      <main className="map-editor-main">
        <div id="toolbar">
          <button
            className={`tool-btn ${tool === 'select' ? 'active' : ''}`}
            onClick={() => changeTool('select')}
            title="선택/이동 (V)"
          >
            ➤
          </button>
          <button
            className={`tool-btn ${tool === 'terrain' ? 'active' : ''}`}
            onClick={() => changeTool('terrain')}
            title="지형 폴리곤 그리기 (T) — 클릭으로 꼭짓점, Enter/첫점 클릭으로 닫기"
          >
            ⬟
          </button>
          <button
            className={`tool-btn ${tool === 'start' ? 'active' : ''}`}
            onClick={() => changeTool('start')}
            title="시작점 배치 (S)"
          >
            🔵
          </button>
          <button
            className={`tool-btn ${tool === 'end' ? 'active' : ''}`}
            onClick={() => changeTool('end')}
            title="도착점 배치 (E)"
          >
            🏁
          </button>
          <button
            className={`tool-btn ${tool === 'player' ? 'active' : ''}`}
            onClick={() => changeTool('player')}
            title="플레이어 추가 (P) — 최대 4명"
          >
            👤
          </button>
          <button
            className={`tool-btn ${tool === 'jumppad' ? 'active' : ''}`}
            onClick={() => changeTool('jumppad')}
            title="점프패드 (J) — 드래그로 크기 지정"
          >
            ⏫
          </button>
          <button
            className={`tool-btn ${tool === 'wind' ? 'active' : ''}`}
            onClick={() => changeTool('wind')}
            title="바람 밴드 — 클릭한 높이에 생성, -x 방향 바람 (포즈 로드가 차폐물)"
          >
            💨
          </button>
          <button
            className={`tool-btn ${tool === 'killzone' ? 'active' : ''}`}
            onClick={() => changeTool('killzone')}
            title="즉사 구역 — 드래그로 지정, 공 외곽이 닿으면 라운드 실패"
          >
            ☠️
          </button>
          <button
            className={`tool-btn ${tool === 'clearzone' ? 'active' : ''}`}
            onClick={() => changeTool('clearzone')}
            title="클리어 구역 (C) — 드래그로 지정, 공 외곽이 닿는 순간 클리어. 없으면 기존 x 기준 판정"
          >
            🏁
          </button>
          <button
            className={`tool-btn ${tool === 'waterpipe' ? 'active' : ''}`}
            onClick={() => changeTool('waterpipe')}
            title="물 배출구 — 클릭으로 배치, 물길은 포즈·지형 기준 실시간 프리뷰"
          >
            💧
          </button>
          <button
            className={`tool-btn ${tool === 'pose' ? 'active' : ''}`}
            onClick={() => changeTool('pose')}
            title="포즈(길) 그리기 (D) — ① 프레임 클릭 선택(Tab 전환) ② 클릭으로 점 추가, Enter 완료"
          >
            ✏️
          </button>
        </div>

        <div id="canvas-wrap">
          <canvas ref={canvasRef} id="canvas" />
          {/* 내용은 paintHud()가 DOM에 직접 기록한다. (리렌더 회피) */}
          <div id="hud" ref={hudElRef} />
          {hint && <div id="hint">{hint}</div>}
        </div>

        <div id="sidebar">
          {/* 창작마당 맵 정보 — 카드·상세 모달에 쓰이는 값이라 저장 전에 반드시 채워야 한다. */}
          {isWorkshop && (
            <div className="card">
              <h2>맵 정보</h2>
              <div className="row">
                <label>제목</label>
                <input
                  type="text"
                  value={mapTitle}
                  maxLength={100}
                  // PUT이 title을 받지 않는다. 수정 중에는 읽기 전용이어야 저장 후 값이 어긋나지 않는다.
                  readOnly={Boolean(editingStageId)}
                  onChange={(e) => setMapTitle(e.target.value)}
                  style={{ flex: 1 }}
                  placeholder="맵 이름"
                />
              </div>
              {editingStageId && (
                <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  제목은 수정할 수 없습니다. (스테이지 이름이 고유 값이라 서버가 변경을 지원하지 않습니다)
                </div>
              )}
              <div className="row">
                <label>설명</label>
                <input
                  type="text"
                  value={mapDescription}
                  maxLength={255}
                  onChange={(e) => setMapDescription(e.target.value)}
                  style={{ flex: 1 }}
                  placeholder="어떤 맵인지 알려 주세요 (최대 255자)"
                />
              </div>
              <div className="row">
                <label>난이도</label>
                <select
                  value={mapDifficulty}
                  onChange={(e) => setMapDifficulty(e.target.value as CustomMapDifficulty)}
                >
                  {DIFFICULTIES.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div className="row">
                <label>팔레트</label>
                {mapPalette.map((color, index) => (
                  <input
                    key={index}
                    type="color"
                    value={color}
                    aria-label={`썸네일 색 ${index + 1}`}
                    onChange={(e) => {
                      const next = [...mapPalette]
                      next[index] = e.target.value
                      setMapPalette(next)
                    }}
                    style={{ width: 34, height: 28, padding: 0, border: 'none', background: 'none' }}
                  />
                ))}
              </div>
              <div
                className="row"
                title="창작마당 카드 썸네일 미리보기"
                style={{
                  height: 46,
                  borderRadius: 6,
                  background: `linear-gradient(135deg, ${mapPalette[0]} 0%, ${mapPalette[1]} 60%, ${mapPalette[2]} 100%)`,
                }}
              />
              <label className="chk">
                <input
                  type="checkbox"
                  checked={mapIsPublic}
                  onChange={(e) => setMapIsPublic(e.target.checked)}
                />{' '}
                공개 (다른 유저가 찾아 플레이할 수 있습니다)
              </label>
              {/* 공개를 켰는데 미검증이면 저장 단계에서 막히므로 그 전에 알려 준다. */}
              {mapIsPublic && !isMapCleared && (
                <div className="row clear-warning">
                  ⚠️ 공개 업로드하려면 <b>테스트 플레이</b>를 성공해야 합니다.
                  비공개로는 지금도 저장할 수 있습니다.
                  {savedIsCleared && (
                    <>
                      <br />
                      이 맵은 이미 검증된 상태로 저장돼 있지만, 서버가 저장할 때마다 포즈로
                      다시 확인하므로 <b>수정 없이 저장할 때도 한 번 실행</b>해야 합니다.
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 창작마당 한도 게이지 — 서버 MapConfigValidator와 같은 상한 */}
          {isWorkshop && (
            <div className="card">
              <h2>맵 한도</h2>
              <div className="row" style={{ fontSize: 12 }}>
                지형 폴리곤 <b>{mapState.terrain.length}</b> / {MAP_LIMITS.polygons}
              </div>
              <div className="row" style={{ fontSize: 12 }}>
                기믹 <b>{mapState.gimmicks.length}</b> / {MAP_LIMITS.gimmicks}
              </div>
              <div className="row" style={{ fontSize: 12 }}>
                플레이어 <b>{mapState.players.length}</b> / {MAP_LIMITS.posePlayers}
              </div>
              <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                폴리곤당 정점 {MAP_LIMITS.verticesMin}~{MAP_LIMITS.verticesMax}개 ·
                기믹 {ALLOWED_GIMMICK_TYPES.join(' / ')}
              </div>
              {isOverLimit ? (
                <div id="validate-list">
                  {limitIssues.map((issue) => (
                    <div key={issue} className="err">✖ {issue}</div>
                  ))}
                </div>
              ) : (
                <div className="ok">✔ 한도 이내</div>
              )}
            </div>
          )}

          {/* 인스펙터 */}
          <div className="card">
            <h2>선택 항목</h2>
            <div id="inspector">
              {!selection && <div className="empty">항목을 선택하세요 (Delete 키로 삭제)</div>}
              {selection?.kind === 'start' && (
                <div>
                  <div className="row">
                    <b>🔵 시작점</b>
                  </div>
                  <div className="row">
                    <label>x</label>
                    <NumberField
                      value={mapState.startPoint[0]}
                      onCommit={(v) =>
                        commitState({ ...mapState, startPoint: [v, mapState.startPoint[1]] }, poses)
                      }
                    />
                  </div>
                  <div className="row">
                    <label>y</label>
                    <NumberField
                      value={mapState.startPoint[1]}
                      onCommit={(v) =>
                        commitState({ ...mapState, startPoint: [mapState.startPoint[0], v] }, poses)
                      }
                    />
                  </div>
                </div>
              )}
              {selection?.kind === 'end' && (
                <div>
                  <div className="row">
                    <b>🏁 도착점</b>
                  </div>
                  <div className="row">
                    <label>x</label>
                    <NumberField
                      value={mapState.endPoint[0]}
                      onCommit={(v) =>
                        commitState({ ...mapState, endPoint: [v, mapState.endPoint[1]] }, poses)
                      }
                    />
                  </div>
                  <div className="row">
                    <label>y</label>
                    <NumberField
                      value={mapState.endPoint[1]}
                      onCommit={(v) =>
                        commitState({ ...mapState, endPoint: [mapState.endPoint[0], v] }, poses)
                      }
                    />
                  </div>
                  <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {mapState.clearZone
                      ? '클리어 판정: 클리어 구역 접촉 (깃발은 표시용)'
                      : '클리어 판정: 공.x ≥ 도착점.x (y는 표시용)'}
                  </div>
                </div>
              )}
              {selection?.kind === 'clearzone' && mapState.clearZone && (
                <div>
                  <div className="row">
                    <b>🏁 클리어 구역</b>{' '}
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>공 외곽(반경 13) 접촉 시 클리어</span>
                  </div>
                  {(['x', 'y', 'w', 'h'] as const).map((label, fi) => (
                    <div className="row" key={label}>
                      <label>{label}</label>
                      <NumberField
                        value={mapState.clearZone![fi]}
                        onCommit={(v) => {
                          const zone = [...mapState.clearZone!] as [number, number, number, number]
                          zone[fi] = fi >= 2 ? Math.max(1, v) : v
                          commitState({ ...mapState, clearZone: zone }, poses)
                        }}
                      />
                    </div>
                  ))}
                  <div className="row">
                    <button
                      className="btn"
                      onClick={deleteSelection}
                      title="구역을 삭제하면 판정이 기존 방식(공.x ≥ 도착점.x)으로 돌아갑니다"
                    >
                      구역 삭제
                    </button>
                  </div>
                  <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    구역이 있으면 x 기준 판정 대신 이 사각형 접촉으로 클리어됩니다.
                  </div>
                </div>
              )}
              {selection?.kind === 'player' && selection.index !== undefined && mapState.players[selection.index] && (
                <div>
                  <div className="row">
                    <b>👤 플레이어 P{selection.index + 1}</b>{' '}
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>영역 230×180 중심</span>
                  </div>
                  <div className="row">
                    <label>x</label>
                    <NumberField
                      value={mapState.players[selection.index][0]}
                      onCommit={(v) => {
                        const nextState: MapState = JSON.parse(JSON.stringify(mapState))
                        nextState.players[selection.index!][0] = v
                        commitState(nextState, poses)
                      }}
                    />
                  </div>
                  <div className="row">
                    <label>y</label>
                    <NumberField
                      value={mapState.players[selection.index][1]}
                      onCommit={(v) => {
                        const nextState: MapState = JSON.parse(JSON.stringify(mapState))
                        nextState.players[selection.index!][1] = v
                        commitState(nextState, poses)
                      }}
                    />
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn danger" onClick={deleteSelection}>
                      삭제
                    </button>
                    <button
                      className="btn danger"
                      onClick={() => {
                        const nextPoses = [...poses]
                        nextPoses[selection.index!] = null
                        commitState(mapState, nextPoses)
                      }}
                    >
                      포즈 지우기
                    </button>
                  </div>
                </div>
              )}
              {selection?.kind === 'pad' && selection.index !== undefined && mapState.gimmicks[selection.index] && (
                <div>
                  {(() => {
                    const g = mapState.gimmicks[selection.index!]
                    /** 기믹의 [x,y] 필드 한 축을 갱신해 커밋한다. */
                    const commitField = (field: 'position' | 'size' | 'launchVelocity' | 'band' | 'outlet' | 'flowDirection', axis: 0 | 1) =>
                      (v: number) => {
                        const nextState: MapState = JSON.parse(JSON.stringify(mapState))
                        const target = nextState.gimmicks[selection.index!][field] as [number, number]
                        target[axis] = v
                        commitState(nextState, poses)
                      }
                    return (
                      <>
                        <div className="row">
                          <b>
                            {g.type === 'WIND' ? '💨' : g.type === 'KILL_ZONE' ? '☠️'
                              : g.type === 'WATER_PIPE' ? '💧' : '⏫'} {g.type}
                          </b>
                          {!['JUMP_PAD', 'WIND', 'KILL_ZONE', 'WATER_PIPE'].includes(g.type) && (
                            <span style={{ color: 'var(--warn)', fontSize: 11 }}>물리 미구현</span>
                          )}
                        </div>
                        {g.type === 'WATER_PIPE' && g.outlet && (
                          <>
                            <div className="row">
                              <label>배출구 x</label>
                              <NumberField value={g.outlet[0]} onCommit={commitField('outlet', 0)} />
                            </div>
                            <div className="row">
                              <label>배출구 y</label>
                              <NumberField value={g.outlet[1]} onCommit={commitField('outlet', 1)} />
                            </div>
                            <div className="row">
                              <label>분사 방향 x</label>
                              <NumberField value={g.flowDirection?.[0] ?? 0} onCommit={commitField('flowDirection', 0)} />
                            </div>
                            <div className="row">
                              <label>분사 방향 y</label>
                              <NumberField value={g.flowDirection?.[1] ?? 1} onCommit={commitField('flowDirection', 1)} />
                            </div>
                            <div className="row">
                              <label>물살 속도</label>
                              <NumberField
                                value={g.flowSpeed ?? 180}
                                onCommit={(v) => {
                                  const nextState: MapState = JSON.parse(JSON.stringify(mapState))
                                  nextState.gimmicks[selection.index!].flowSpeed = v
                                  commitState(nextState, poses)
                                }}
                              />
                            </div>
                            <div className="row">
                              <label>물줄기 폭</label>
                              <NumberField
                                value={g.width ?? 36}
                                onCommit={(v) => {
                                  const nextState: MapState = JSON.parse(JSON.stringify(mapState))
                                  nextState.gimmicks[selection.index!].width = v
                                  commitState(nextState, poses)
                                }}
                              />
                            </div>
                            <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                              물에 닿은 공은 흐름 속도로 끌려감 · 다리로 물길 유도 가능
                            </div>
                          </>
                        )}
                        {g.type === 'KILL_ZONE' && g.area && (
                          <>
                            {(['x', 'y', '가로', '세로'] as const).map((label, axis) => (
                              <div className="row" key={label}>
                                <label>{label}</label>
                                <NumberField
                                  value={g.area![axis]}
                                  onCommit={(v) => {
                                    const nextState: MapState = JSON.parse(JSON.stringify(mapState))
                                    nextState.gimmicks[selection.index!].area![axis] = v
                                    commitState(nextState, poses)
                                  }}
                                />
                              </div>
                            ))}
                            <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                              공 외곽(반경 13)이 닿으면 즉시 라운드 실패
                            </div>
                          </>
                        )}
                        {g.type === 'WIND' && g.band && (
                          <>
                            <div className="row">
                              <label>밴드 yTop</label>
                              <NumberField value={g.band[0]} onCommit={commitField('band', 0)} />
                            </div>
                            <div className="row">
                              <label>밴드 yBottom</label>
                              <NumberField value={g.band[1]} onCommit={commitField('band', 1)} />
                            </div>
                            <div className="row">
                              <label>세기</label>
                              <NumberField
                                value={g.strength ?? 700}
                                onCommit={(v) => {
                                  const nextState: MapState = JSON.parse(JSON.stringify(mapState))
                                  nextState.gimmicks[selection.index!].strength = v
                                  commitState(nextState, poses)
                                }}
                              />
                            </div>
                            <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                              ≤450: 버티기 · 550+: 역밀림 (권장 700) · 포즈 로드가 차폐물
                            </div>
                          </>
                        )}
                        {g.position && (
                          <>
                            <div className="row">
                              <label>중심 x</label>
                              <NumberField value={g.position[0]} onCommit={commitField('position', 0)} />
                            </div>
                            <div className="row">
                              <label>중심 y</label>
                              <NumberField value={g.position[1]} onCommit={commitField('position', 1)} />
                            </div>
                          </>
                        )}
                        {g.size && (
                          <>
                            <div className="row">
                              <label>가로</label>
                              <NumberField value={g.size[0]} onCommit={commitField('size', 0)} />
                            </div>
                            <div className="row">
                              <label>세로</label>
                              <NumberField value={g.size[1]} onCommit={commitField('size', 1)} />
                            </div>
                          </>
                        )}
                        {g.launchVelocity && (
                          <>
                            <div className="row">
                              <label>발사 vx</label>
                              <NumberField value={g.launchVelocity[0]} onCommit={commitField('launchVelocity', 0)} />
                            </div>
                            <div className="row">
                              <label>발사 vy</label>
                              <NumberField value={g.launchVelocity[1]} onCommit={commitField('launchVelocity', 1)} />
                            </div>
                            <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                              예상 최대 상승 높이 ≈ {Math.round((g.launchVelocity[1] ** 2) / 1440)}px (vy²/1440)
                            </div>
                          </>
                        )}
                        <div className="row">
                          <button className="btn danger" onClick={deleteSelection}>
                            삭제
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
              {selection?.kind === 'terrain' && selection.index !== undefined && mapState.terrain[selection.index] && (
                <div>
                  <div className="row">
                    <b>⬟ 지형 #{selection.index + 1}</b>{' '}
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      꼭짓점 {mapState.terrain[selection.index].length}개
                    </span>
                  </div>
                  {selection.vertex !== undefined && mapState.terrain[selection.index][selection.vertex] && (
                    <>
                      <div className="row">
                        <label>꼭짓점 {selection.vertex + 1} x</label>
                        <NumberField
                          value={mapState.terrain[selection.index][selection.vertex][0]}
                          onCommit={(v) => {
                            const nextState: MapState = JSON.parse(JSON.stringify(mapState))
                            nextState.terrain[selection.index!][selection.vertex!][0] = v
                            commitState(nextState, poses)
                          }}
                        />
                      </div>
                      <div className="row">
                        <label>꼭짓점 {selection.vertex + 1} y</label>
                        <NumberField
                          value={mapState.terrain[selection.index][selection.vertex][1]}
                          onCommit={(v) => {
                            const nextState: MapState = JSON.parse(JSON.stringify(mapState))
                            nextState.terrain[selection.index!][selection.vertex!][1] = v
                            commitState(nextState, poses)
                          }}
                        />
                      </div>
                      <div className="row">
                        <button className="btn danger" onClick={deleteSelection}>
                          꼭짓점 삭제
                        </button>
                      </div>
                    </>
                  )}
                  <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    변 위를 더블클릭하면 꼭짓점이 추가됩니다
                  </div>
                  <div className="row">
                    <button
                      className="btn danger"
                      onClick={() => {
                        const nextState = JSON.parse(JSON.stringify(mapState))
                        nextState.terrain.splice(selection.index!, 1)
                        setSelection(null)
                        commitState(nextState, poses)
                      }}
                    >
                      지형 전체 삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 표시 옵션 */}
          <div className="card">
            <h2>표시 옵션</h2>
            <div className="row">
              <label className="chk">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> 그리드
              </label>
              <label className="chk">
                <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> 플레이어 영역
              </label>
              <label className="chk">
                <input type="checkbox" checked={showPoses} onChange={(e) => setShowPoses(e.target.checked)} /> 포즈
              </label>
              <label className="chk">
                <input type="checkbox" checked={showOob} onChange={(e) => setShowOob(e.target.checked)} /> 낙사 경계
              </label>
            </div>
          </div>

          {/* 유효성 검사 */}
          <div className="card">
            <h2>유효성 검사</h2>
            <div id="validation">
              {validationItems.length ? (
                validationItems.map((item, idx) => (
                  <div key={idx} className={item.l}>
                    {item.m}
                  </div>
                ))
              ) : (
                <div className="ok">✔ 문제 없음</div>
              )}
            </div>
          </div>

          {/* 시뮬레이션 */}
          <div className="card">
            <h2>{isWorkshop ? '테스트 플레이' : '시뮬레이션'}</h2>
            {/* 임의 서버 주소 입력은 관리자 디버깅용이다. 창작마당은 항상 이 앱의 API를 쓴다. */}
            {!isWorkshop && (
              <div className="row">
                <label>서버 주소</label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            )}
            <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
              포즈 도구(✏️)로 각 플레이어 영역에 길을 그린 뒤 실행하세요. 안 그리면 수평선이 기본 적용됩니다.
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn primary"
                onClick={runServerSim}
                disabled={isWorkshop && isOverLimit}
                title={isWorkshop && isOverLimit ? `한도 초과: ${limitIssues[0]}` : undefined}
              >
                {isWorkshop ? '▶ 테스트 플레이' : '▶ 서버 시뮬레이션'}
              </button>
              <button className="btn" onClick={playSim} disabled={!sim.frames}>
                ⟳ 다시재생
              </button>
              <button
                className="btn"
                onClick={() => {
                  stopSim()
                  simRef.current = { frames: null, intervalMs: 30, result: null, playIdx: 0, playing: false }
                  setSim({ frames: null, intervalMs: 30, result: null, playIdx: 0, playing: false })
                  setSimStatusMsg('')
                }}
                disabled={!sim.frames}
              >
                ✕ 지우기
              </button>
            </div>
            <div className="row">
              <input
                type="range"
                min="0"
                max={sim.frames ? sim.frames.length - 1 : 0}
                value={sim.playIdx}
                disabled={!sim.frames}
                onChange={(e) => {
                  stopSim()
                  const idx = +e.target.value
                  simRef.current.playIdx = idx
                  setSim((prev) => ({ ...prev, playIdx: idx }))
                  draw()
                }}
              />
            </div>
            {simStatusMsg && (
              <div id="sim-status" dangerouslySetInnerHTML={{ __html: simStatusMsg }} />
            )}

            <details style={{ marginTop: 8 }}>
              <summary>결과 JSON 직접 입력해서 재생</summary>
              <textarea
                id="sim-json"
                className="io"
                spellCheck={false}
                value={simJsonText}
                onChange={(e) => setSimJsonText(e.target.value)}
                placeholder='{"intervalMs":30,"points":[[90,870,0,0], …],"result":true}&#10;프레임 배열( [[x,y,vx,vy], …] )만 붙여넣어도 됩니다.'
              />
              <div className="row" style={{ marginTop: 6, gap: 6 }}>
                <button
                  className="btn primary"
                  onClick={() => {
                    if (!simJsonText.trim()) {
                      showToast('결과 JSON을 붙여넣으세요.')
                      return
                    }
                    try {
                      const parsed = extractSimResult(JSON.parse(simJsonText))
                      if (!parsed) throw new Error('프레임 배열(points/frames)을 찾을 수 없습니다.')
                      applySimResult(parsed, '직접 입력')
                    } catch (err: any) {
                      showToast('재생 실패: ' + err.message)
                    }
                  }}
                >
                  ▶ 재생
                </button>
                <input
                  type="file"
                  id="sim-file-input"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    f.text().then((t) => {
                      setSimJsonText(t)
                      try {
                        const parsed = extractSimResult(JSON.parse(t))
                        if (!parsed) throw new Error('프레임 배열을 찾을 수 없습니다.')
                        applySimResult(parsed, '직접 입력')
                      } catch (err: any) {
                        showToast('재생 실패: ' + err.message)
                      }
                    })
                    e.target.value = ''
                  }}
                />
                <button className="btn" onClick={() => document.getElementById('sim-file-input')?.click()}>
                  파일 열기…
                </button>
              </div>
              <div className="row" style={{ fontSize: 11, color: 'var(--muted)' }}>
                points/frames, intervalMs/interval_ms, result/success 및 WS 페이로드 래핑을 자동 인식합니다.
              </div>
            </details>
          </div>

          {/* 플레이어 JSON 좌표 */}
          <div className="card">
            <h2>플레이어 JSON 좌표 (Bridge)</h2>
            <textarea
              id="pose-json-io"
              className="io"
              spellCheck={false}
              value={poseJsonText}
              onChange={(e) => setPoseJsonText(e.target.value)}
              placeholder='{\n  "p1Bridge": [\n    [0.09, 0.58],\n    [0.26, 0.46]\n  ]\n}'
            />
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              <button className="btn primary" onClick={() => applyPoseJsonClick()}>
                ↑ 적용 (import)
              </button>
              <button className="btn" onClick={() => setPoseJsonText(exportPoseJson(mapState, poses))}>
                ↓ 현재 포즈 표시
              </button>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard.writeText(exportPoseJson(mapState, poses)).then(() => showToast('클립보드에 복사했습니다.'))
                }}
              >
                복사
              </button>
              <button
                className="btn"
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(new Blob([exportPoseJson(mapState, poses)], { type: 'application/json' }))
                  a.download = 'player_bridges.json'
                  a.click()
                }}
              >
                다운로드
              </button>
              <input
                type="file"
                id="pose-file-input"
                accept=".json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  f.text().then((t) => {
                    setPoseJsonText(t)
                    applyPoseJsonClick(t)
                  })
                  e.target.value = ''
                }}
              />
              <button className="btn" onClick={() => document.getElementById('pose-file-input')?.click()}>
                파일 열기…
              </button>
            </div>
            <div className="row" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              p1Bridge ~ p4Bridge 키 또는 2D 좌표 배열(0~1 정규화)을 입력하여 포즈를 적용합니다.
            </div>
          </div>

          {/* JSON (map_config) */}
          <div className="card">
            <h2>JSON (map_config)</h2>
            <textarea
              id="json-io"
              className="io"
              spellCheck={false}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              <button className="btn" onClick={() => applyJsonClick()}>
                ↑ 적용 (import)
              </button>
              <button className="btn" onClick={() => setJsonText(exportJson(mapState))}>
                ↓ 현재 맵 표시
              </button>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard.writeText(exportJson(mapState)).then(() => showToast('클립보드에 복사했습니다.'))
                }}
              >
                복사
              </button>
              <button
                className="btn"
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(new Blob([exportJson(mapState)], { type: 'application/json' }))
                  a.download = 'map_config.json'
                  a.click()
                }}
              >
                다운로드
              </button>
              <input
                type="file"
                id="json-file-input"
                accept=".json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  f.text().then((t) => {
                    setJsonText(t)
                    applyJsonClick(t)
                  })
                  e.target.value = ''
                }}
              />
              <button className="btn" onClick={() => document.getElementById('json-file-input')?.click()}>
                파일 열기…
              </button>
            </div>
            <div className="row" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              WS 페이로드/round 래핑, snake_case, 레거시 스케일(0~1, 10×6)도 자동 인식합니다.
            </div>
          </div>
        </div>
      </main>

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  )
}
