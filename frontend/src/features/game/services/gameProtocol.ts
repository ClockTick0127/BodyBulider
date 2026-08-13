export type Vec2 = [number, number]
export type SimulationFrame = [number, number, number, number]

export type PoseCaptureDiagnostic = {
  primaryReason: string
  reasonCounts: Record<string, number>
  detectionAttempts: number
  successfulDetections: number
  cameraOn: boolean
  poseModelLoading: boolean
  visibilityState: string
  videoState: {
    readyState: number
    paused: boolean
    ended: boolean
    width: number
    height: number
    currentTime: number
  } | null
  exceptionName?: string
}

export type GameGimmick = {
  type: string
  position?: Vec2
  size?: Vec2
  launchVelocity?: Vec2
  band?: Vec2
  area?: [number, number, number, number]
  outlet?: Vec2
  flowDirection?: Vec2
  flowSpeed?: number
  width?: number
  strength?: number
  delayMs?: number
  [key: string]: unknown
}

export type GameMap = {
  mapNum: number
  startPoint: Vec2
  endPoint: Vec2
  players: Vec2[]
  terrain: Vec2[][]
  gimmicks?: GameGimmick[]
  /**
   * 클리어 구역 [x, y, w, h] (좌상단 + 크기, KILL_ZONE area와 동일 포맷).
   * 있으면 BE가 공 외곽 접촉으로 클리어 판정, 없으면 기존 공.x ≥ endPoint.x.
   * endPoint는 항상 존재 — clearZone이 있어도 GOAL 마커 표시용으로 유지.
   */
  clearZone?: [number, number, number, number]
}

export type GameParticipant = {
  userId: string
  playerNo: number
}

export type GamePlacement = GameParticipant & {
  captureNo: number
}

/**
 * BE 권위형 물길 세그먼트 [x1, y1, x2, y2, halfWidth] (게임좌표 px).
 * 개발명세서_BE_물기믹_유니온물길 §3 — 빈 배열은 "물 없음"(권위적),
 * 필드 부재(undefined)는 구버전 BE 또는 계산 실패 강등 → 로컬 계산 폴백.
 */
export type WaterFlowRow = [number, number, number, number, number]

export type GameStartedEvent = {
  type: 'GAME_STARTED'
  gameSessionId: string
  roundNo: number
  map: GameMap
  participants: GameParticipant[]
  placements: GamePlacement[]
  initialDelayMs: number
  waterFlows?: WaterFlowRow[]
}
export type RoundStartedEvent = {
  type: 'ROUND_STARTED'
  gameSessionId: string
  roundNo: number
  map: GameMap
  participants: GameParticipant[]
  placements: GamePlacement[]
  initialDelayMs: number
  waterFlows?: WaterFlowRow[]
}
export type PlayerFilmingEvent = {
  type: 'PLAYER_FILMING'
  player: number
  captureNo: number
  durationMs: number
}
export type PoseBroadcastEvent = {
  type: 'POSE_BROADCAST'
  player: number
  captureNo: number
  points: Vec2[]
  waterFlows?: WaterFlowRow[]
}
export type SimulationResultEvent = {
  type: 'SIMULATION_RESULT'
  intervalMs: number
  points: SimulationFrame[]
  result: boolean
}
export type GameResultEvent = {
  type: 'GAME_RESULT'
  stars: number
  elapsedTimeMs: number
  result: boolean
}
export type GameErrorEvent = {
  type: 'ERROR'
  message: string
}
export type RoundBeginningEvent = GameStartedEvent | RoundStartedEvent
export type GameEvent =
  | RoundBeginningEvent
  | PlayerFilmingEvent
  | PoseBroadcastEvent
  | SimulationResultEvent
  | GameResultEvent
  | GameErrorEvent

export const GAME_MESSAGE_DESTINATION = '/app/game/message'

export const GAME_MESSAGE_TYPE = {
  START_REQUEST: 100,
  START_RESPONSE: 101,
  CAPTURING_REQUEST: 102,
  CAPTURING_RESPONSE: 103,
  SIMULATING_RESPONSE: 104,
  ROUND_START_RESPONSE: 105,
  RESULT_RESPONSE: 106,
  POSE_BROADCAST: 107,
  ERROR: 999,
} as const

/** 서버의 첫 촬영 요청 스케줄 기본 대기 시간. */
export const DEFAULT_INITIAL_DELAY_MS = 5000

export type GameMessageEnvelope = {
  type: number
  eventId: string
  roomSessionId: string
  gameSessionId: string | null
  occurredAt: string
  payload: unknown
}

const localDateTime = () => new Date().toISOString().replace(/Z$/, '')

export const createGameEnvelope = (
  type: number,
  roomSessionId: string,
  gameSessionId: string | null,
  payload: unknown,
): GameMessageEnvelope => ({
  type,
  eventId: crypto.randomUUID(),
  roomSessionId,
  gameSessionId,
  occurredAt: localDateTime(),
  payload,
})

const record = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' ? value as Record<string, unknown> : null

const numberValue = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const vec2 = (value: unknown): Vec2 | null => {
  if (!Array.isArray(value) || value.length < 2) return null
  const x = numberValue(value[0], Number.NaN)
  const y = numberValue(value[1], Number.NaN)
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

const vec2List = (value: unknown): Vec2[] =>
  Array.isArray(value) ? value.map(vec2).filter((point): point is Vec2 => point != null) : []

const numberTuple4 = (value: unknown): [number, number, number, number] | null => {
  if (!Array.isArray(value) || value.length < 4) return null
  const tuple = value.slice(0, 4).map((item) => numberValue(item, Number.NaN))
  return tuple.every(Number.isFinite) ? tuple as [number, number, number, number] : null
}

function toGameMap(payload: Record<string, unknown>): GameMap | null {
  const round = record(payload.round)
  const config = record(round?.mapConfig ?? round?.map_config ?? payload.mapConfig ?? payload.map_config)
  if (!config) return null

  const startPoint = vec2(config.startPoint ?? config.start_point)
  const endPoint = vec2(config.endPoint ?? config.end_point)
  if (!startPoint || !endPoint) return null

  const rawTerrain = config.terrain ?? config.terrains
  const terrain = Array.isArray(rawTerrain) ? rawTerrain.map(vec2List).filter((item) => item.length > 0) : []
  const gimmicks = Array.isArray(config.gimmicks)
    ? config.gimmicks.map((value): GameGimmick | null => {
      const gimmick = record(value)
      if (!gimmick || typeof gimmick.type !== 'string') return null
      const outlet = vec2(gimmick.outlet)
      const flowDirection = vec2(gimmick.flowDirection ?? gimmick.flow_direction)
      const position = vec2(gimmick.position)
      const size = vec2(gimmick.size)
      const launchVelocity = vec2(gimmick.launchVelocity ?? gimmick.launch_velocity)
      const band = vec2(gimmick.band)
      const area = numberTuple4(gimmick.area)
      return {
        ...gimmick,
        type: gimmick.type,
        ...(position ? { position } : {}),
        ...(size ? { size } : {}),
        ...(launchVelocity ? { launchVelocity } : {}),
        ...(band ? { band } : {}),
        ...(area ? { area } : {}),
        ...(outlet ? { outlet } : {}),
        ...(flowDirection ? { flowDirection } : {}),
        flowSpeed: numberValue(gimmick.flowSpeed ?? gimmick.flow_speed, Number.NaN),
        width: numberValue(gimmick.width, Number.NaN),
        strength: numberValue(gimmick.strength, Number.NaN),
        delayMs: numberValue(gimmick.delayMs ?? gimmick.delay_ms, Number.NaN),
      }
    }).filter((item): item is GameGimmick => item != null)
    : []

  const clearZone = numberTuple4(config.clearZone ?? config.clear_zone)

  return {
    mapNum: numberValue(config.mapNum ?? config.map_num ?? payload.mapId ?? payload.map_id, 1),
    startPoint,
    endPoint,
    players: vec2List(config.players ?? config.playerPoints ?? config.player_points),
    terrain,
    ...(Array.isArray(config.gimmicks) ? { gimmicks } : {}),
    ...(clearZone && clearZone[2] > 0 && clearZone[3] > 0 ? { clearZone } : {}),
  }
}

const toParticipants = (value: unknown): GameParticipant[] => {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const participant = record(item)
    if (!participant) return null
    const userId = participant.userId ?? participant.user_id
    const playerNo = numberValue(participant.playerNo ?? participant.player_no)
    return typeof userId === 'string' && userId && playerNo > 0
      ? { userId, playerNo }
      : null
  }).filter((item): item is GameParticipant => item != null)
}

const toPlacements = (value: unknown): GamePlacement[] => {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const placement = record(item)
    if (!placement) return null
    const userId = placement.userId ?? placement.user_id
    const playerNo = numberValue(placement.playerNo ?? placement.player_no)
    const captureNo = numberValue(placement.captureNo ?? placement.capture_no)
    return typeof userId === 'string' && userId
      && Number.isInteger(playerNo) && playerNo > 0
      && Number.isInteger(captureNo) && captureNo >= 1 && captureNo <= 4
      ? { userId, playerNo, captureNo }
      : null
  }).filter((item): item is GamePlacement => item != null)
}

/**
 * BE 물길 필드 파싱 (개발명세서_FE_물기믹_유니온물길 FE-WATER-01).
 * 부재·형식 불량 → undefined (로컬 계산 폴백). 빈 배열은 그대로 반환 —
 * "물 없음"이라는 권위적 결과이므로 truthiness로 폴백시키면 안 된다.
 */
const toWaterFlows = (value: unknown): WaterFlowRow[] | undefined => {
  if (value == null || !Array.isArray(value)) return undefined
  const rows: WaterFlowRow[] = []
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 5) return undefined
    const row = item.map((entry) => numberValue(entry, Number.NaN))
    if (!row.every(Number.isFinite)) return undefined
    rows.push(row as WaterFlowRow)
  }
  return rows
}

/** `/topic/rooms/{roomSessionId}/game`의 숫자형 서버 envelope를 화면 이벤트로 변환한다. */
export function parseGameEvent(value: unknown): GameEvent | null {
  const envelope = record(value)
  if (!envelope || typeof envelope.type !== 'number') return null
  const payload = record(envelope.payload) ?? {}

  if (envelope.type === GAME_MESSAGE_TYPE.START_RESPONSE
    || envelope.type === GAME_MESSAGE_TYPE.ROUND_START_RESPONSE) {
    const gameSessionId = envelope.gameSessionId ?? payload.gameSessionId ?? payload.game_session_id
    const map = toGameMap(payload)
    const round = record(payload.round)
    const roundNo = numberValue(round?.roundNo ?? round?.round_no, 1)
    const initialDelayMs = numberValue(
      payload.initialDelayMs
        ?? payload.initial_delay_ms
        ?? round?.initialDelayMs
        ?? round?.initial_delay_ms,
      DEFAULT_INITIAL_DELAY_MS,
    )
    return typeof gameSessionId === 'string' && gameSessionId && map
      && Number.isInteger(roundNo) && roundNo > 0
      ? {
          type: envelope.type === GAME_MESSAGE_TYPE.START_RESPONSE
            ? 'GAME_STARTED'
            : 'ROUND_STARTED',
          gameSessionId,
          roundNo,
          map,
          participants: toParticipants(payload.participants),
          placements: toPlacements(payload.placements),
          initialDelayMs: Math.max(0, initialDelayMs),
          waterFlows: toWaterFlows(payload.waterFlows ?? payload.water_flows),
        }
      : null
  }

  if (envelope.type === GAME_MESSAGE_TYPE.CAPTURING_REQUEST) {
    const player = numberValue(payload.player ?? payload.playerNo ?? payload.player_no)
    const captureNo = numberValue(payload.captureNo ?? payload.capture_no)
    const durationMs = numberValue(payload.durationMs ?? payload.duration_ms)
    return player > 0
      && Number.isInteger(captureNo)
      && captureNo >= 1
      && captureNo <= 4
      && durationMs > 0
      ? { type: 'PLAYER_FILMING', player, captureNo, durationMs }
      : null
  }

  if (envelope.type === GAME_MESSAGE_TYPE.POSE_BROADCAST) {
    const player = numberValue(payload.player)
    const captureNo = numberValue(payload.captureNo ?? payload.capture_no)
    const rawPoints = payload.points
    if (!Number.isInteger(player) || player <= 0
      || !Number.isInteger(captureNo) || captureNo < 1 || captureNo > 4
      || !Array.isArray(rawPoints) || rawPoints.length === 0) {
      return null
    }
    const points = rawPoints.map(vec2)
    return points.every((point): point is Vec2 =>
      point != null
      && point[0] >= 0 && point[0] <= 1
      && point[1] >= 0 && point[1] <= 1)
      ? {
          type: 'POSE_BROADCAST',
          player,
          captureNo,
          points,
          waterFlows: toWaterFlows(payload.waterFlows ?? payload.water_flows),
        }
      : null
  }

  if (envelope.type === GAME_MESSAGE_TYPE.SIMULATING_RESPONSE) {
    const rawPoints = payload.points
    if (!Array.isArray(rawPoints)) return null
    const points = rawPoints.map((point): SimulationFrame | null => {
      if (!Array.isArray(point) || point.length !== 4) return null
      const values = point.map((item) => numberValue(item, Number.NaN))
      return values.every(Number.isFinite) ? values as SimulationFrame : null
    })
    const intervalMs = numberValue(payload.intervalMs ?? payload.interval_ms)
    return intervalMs > 0 && points.length > 0 && points.every((point) => point != null)
      ? { type: 'SIMULATION_RESULT', intervalMs, points, result: payload.result === true }
      : null
  }

  if (envelope.type === GAME_MESSAGE_TYPE.RESULT_RESPONSE) {
    const stars = numberValue(payload.stars, Number.NaN)
    const elapsedTimeMs = numberValue(
      payload.elapsedTimeMs ?? payload.elapsed_time_ms,
      Number.NaN,
    )
    return Number.isInteger(stars)
      && stars >= 0
      && Number.isFinite(elapsedTimeMs)
      && elapsedTimeMs >= 0
      && typeof payload.result === 'boolean'
      ? { type: 'GAME_RESULT', stars, elapsedTimeMs, result: payload.result }
      : null
  }

  if (envelope.type === GAME_MESSAGE_TYPE.ERROR) {
    const message = typeof payload.message === 'string' ? payload.message : '게임 오류가 발생했습니다.'
    return { type: 'ERROR', message }
  }

  return null
}
