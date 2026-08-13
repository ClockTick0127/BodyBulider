import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useGameSocket } from '../../features/game/hooks/useGameSocket'
import { DEFAULT_INITIAL_DELAY_MS } from '../../features/game/services/gameProtocol'
import type { GameEvent, GameMap, GamePlacement, GameResultEvent, PoseCaptureDiagnostic, RoundBeginningEvent, SimulationFrame, Vec2 } from '../../features/game/services/gameProtocol'
import { INITIAL_JOINTS, usePoseLandmarker } from '../../features/pose/hooks/usePoseLandmarker'
import { readPoseVideoState } from '../../features/pose/hooks/usePoseLandmarker'
import type { PoseDetectionFailure, PoseDetectionFailureReason, TrackedJoints } from '../../features/pose/hooks/usePoseLandmarker'
import { drawSkeletonBridge } from '../../features/pose/utils/drawSkeletonBridge'
import { orderPosePoints, POSE_SEGMENTS } from '../../features/pose/utils/posePointOrder'
import { resolvePosePoints, resolveTrackedJoints } from '../../features/pose/utils/resolvePosePoints'
import type { RoomParticipant } from '../../features/rooms/services/roomsApi'
import { returnToLobby } from '../../features/rooms/services/roomsApi'
import { useRoomSocket } from '../../features/rooms/hooks/useRoomSocket'
import type { SignalMessage } from '../../features/rooms/services/roomSocket'
import { useWebRTC } from '../../features/webrtc/hooks/useWebRTC'
import { computeWaterFlows } from '../../features/game/utils/waterFlow'
import type { WaterFlowRow } from '../../features/game/services/gameProtocol'
import { isMockingEnabled } from '../../mocks/enableMocking'
import { useAuth } from '../../features/auth/context/authContext'
import { useBgmContext } from '../../shared/context/BgmContext'
import { useBgm } from '../../shared/hooks/useBgm'
import { formatClearTime } from '../../shared/utils/formatClearTime'
import { StageClearModal } from './StageClearModal'
import type { RoundTime } from './StageClearModal'
import { GameVideoFeed } from './GameVideoFeed'
import { MapEffects } from './MapEffects'
import { MapGimmicks } from './MapGimmicks'
import { resolveMapDesign } from './mapDesign'
import { SpriteCharacter } from '@/features/character/SpriteCharacter'
import { CutscenePlayer } from '@/features/cutscenes/CutscenePlayer'
import { getStageCutscene } from '@/features/cutscenes/cutsceneCatalog'
import { SimulationPlayback } from './SimulationPlayback'
import './GamePage.css'

type Phase = 'CONNECTING' | 'MAP_PREVIEW' | 'CAPTURING' | 'WAITING_RESULT' | 'WAITING_NEXT_ROUND' | 'SIMULATING' | 'PLAYING' | 'FINISHED'
type GameRouteState = {
  stageName?: string
  mapNum?: number
  roomSessionId?: string
  roomId?: string
  gameSessionId?: string
  slotId?: number
  isHost?: boolean
  participants?: RoomParticipant[]
  placements?: GamePlacement[]
  initialMap?: GameMap
  roomCode?: string
  stageId?: number
  initialDelayMs?: number
  gameStartedSignalAtMs?: number
  cutscenesEnabled?: boolean
}

const COLORS = ['#ff8a3d', '#60a5fa', '#c084fc', '#34d399']
const CAPTURE_DURATION_OFFSET_MS = 200
export const MAX_SIMULATION_DURATION_MS = 15_000
// 백엔드 GamePhysicsSimulator와 동일한 Pose → 맵 좌표 변환 영역
const PLAYER_POSE_AREA_WIDTH = 230
const PLAYER_POSE_AREA_HEIGHT = 180
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
export const shouldShowCaptureTimer = (phase: Phase, remainingMs: number) =>
  phase === 'CAPTURING' && remainingMs > 0
const MAP_HORIZONTAL_OVERSCAN_RATIO = 0.5
const CAMERA_SCALE = {
  overview: 1,
  player: 1.85,
  character: 2.15,
} as const

type RenderScale = {
  minX: number
  width: number
  height: number
}

type PoseDiagnosticAccumulator = {
  reasonCounts: Partial<Record<PoseDetectionFailureReason, number>>
  detectionAttempts: number
  successfulDetections: number
  exceptionName?: string
}

const createPoseDiagnosticAccumulator = (): PoseDiagnosticAccumulator => ({
  reasonCounts: {},
  detectionAttempts: 0,
  successfulDetections: 0,
})

const selectPrimaryPoseFailureReason = (
  reasonCounts: PoseDiagnosticAccumulator['reasonCounts'],
): PoseDetectionFailureReason => {
  const primaryReason = Object.entries(reasonCounts)
    .sort(([, leftCount], [, rightCount]) => (rightCount ?? 0) - (leftCount ?? 0))[0]?.[0]
  return primaryReason as PoseDetectionFailureReason | undefined ?? 'NO_VALID_POSE'
}

/** Extend only terrain vertices that already sit on a horizontal map edge. */
export const extendTerrainToOverscan = (
  polygon: Vec2[],
  mapWidth: number,
  overscan: number,
): Vec2[] => polygon.map(([x, y]) => {
  if (x === 0) return [-overscan, y]
  if (x === mapWidth) return [mapWidth + overscan, y]
  return [x, y]
})

/** Clamp one camera axis so its scaled viewport never reveals beyond the world. */
export const clampCameraPercent = (percent: number, scale: number) => {
  if (scale <= 1) return 50
  const visibleHalf = 50 / scale
  return Math.min(100 - visibleHalf, Math.max(visibleHalf, percent))
}

/** Keep score calculation identical to the backend's simulationDurationMs. */
export const calculateSimulationDurationMs = (pointCount: number, intervalMs: number) =>
  Math.max(0, (pointCount - 1) * intervalMs)

export const calculateSimulationElapsedMs = (
  playIndex: number,
  pointCount: number,
  intervalMs: number,
) => Math.min(
  calculateSimulationDurationMs(pointCount, intervalMs),
  Math.max(0, playIndex * intervalMs),
)

/** Count down from the server's 15-second simulation limit using server frame timing. */
export const calculateSimulationRemainingMs = (
  playIndex: number,
  intervalMs: number,
) => Math.max(0, MAX_SIMULATION_DURATION_MS - Math.max(0, playIndex * intervalMs))

export const calculateRemainingInitialDelayMs = (
  initialDelayMs: number,
  signalAtMs: number | undefined,
  nowMs: number,
) => Math.max(0, initialDelayMs - (signalAtMs == null ? 0 : Math.max(0, nowMs - signalAtMs)))


export function GamePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const route = (location.state as GameRouteState | null) ?? {}
  const isHost = route.isHost ?? isMockingEnabled
  const stageId = route.stageId ?? route.mapNum ?? 1
  const cutscenesEnabled = route.cutscenesEnabled ?? false
  const startCutscene = cutscenesEnabled ? getStageCutscene(stageId, 'start') : null
  const initialDelayMs = route.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
  const initialPreviewRemainingMs = calculateRemainingInitialDelayMs(
    initialDelayMs,
    route.gameStartedSignalAtMs,
    Date.now(),
  )
  const handleGoToLobby = useCallback(async () => {
    const targetRoomCode = route.roomCode ?? sessionStorage.getItem('lastRoomCode')
    if (targetRoomCode && !isHost) {
      try {
        await returnToLobby(targetRoomCode)
      } catch (error) {
        console.warn('Failed to unready on lobby return', error)
      }
    }
    if (targetRoomCode) {
      navigate(`/rooms/${targetRoomCode}`)
    } else {
      navigate('/rooms')
    }
  }, [isHost, navigate, route.roomCode])
  const roomSessionId = route.roomSessionId ?? route.roomId
    ?? (isMockingEnabled ? '00000000-0000-4000-8000-000000000001' : null)
  const gameSessionId = route.gameSessionId
    ?? (isMockingEnabled ? '00000000-0000-4000-8000-000000000002' : null)
  const [myPlayer, setMyPlayer] = useState<number | null>(route.slotId ?? (isMockingEnabled ? 1 : null))
  const participants = useMemo(
    () => [...(route.participants ?? [])]
      .filter((participant) => participant.slotId >= 1 && participant.slotId <= 4)
      .sort((a, b) => a.slotId - b.slotId),
    [route.participants],
  )
  const [placements, setPlacements] = useState<GamePlacement[]>(route.placements ?? [])
  const playerSlots = useMemo(() => placements.flatMap((placement) => {
    const participant = participants.find(({ userId }) =>
      String(userId) === String(placement.userId))
    return participant
      ? [{ slotNo: placement.captureNo as 1 | 2 | 3 | 4, participant }]
      : []
  }).sort((a, b) => a.slotNo - b.slotNo), [participants, placements])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoBySlotRef = useRef(new Map<number, HTMLVideoElement>())
  const latestPoseRef = useRef<Vec2[]>([])
  const poseDiagnosticRef = useRef<PoseDiagnosticAccumulator>(createPoseDiagnosticAccumulator())
  const missedCountsRef = useRef<number[]>([0, 0, 0, 0, 0, 0])
  const detectRafRef = useRef(0)
  const worldRef = useRef<HTMLDivElement>(null)
  const gameBoardRef = useRef<HTMLDivElement>(null)
  const startRequestedRef = useRef(false)
  const submittedTurnRef = useRef<string | null>(null)
  const activeDisplaySlotRef = useRef<number | null>(null)
  const signalHandlerRef = useRef<((message: SignalMessage) => void) | undefined>(undefined)
  const hasStartedRoundRef = useRef(route.initialMap != null)
  const successfulRoundInProgressRef = useRef(false)
  const pendingNextRoundRef = useRef<RoundBeginningEvent | null>(null)
  const gameResultRef = useRef<GameResultEvent | null>(null)
  const simulationPlaybackCompleteRef = useRef(false)
  const simulationReceivedRef = useRef(false)

  const [phase, setPhase] = useState<Phase>(route.initialMap ? 'MAP_PREVIEW' : 'CONNECTING')
  const [previewEndsAt, setPreviewEndsAt] = useState(
    route.initialMap ? performance.now() + initialPreviewRemainingMs : 0,
  )
  const [previewRemainingMs, setPreviewRemainingMs] = useState(
    route.initialMap ? initialPreviewRemainingMs : 0,
  )
  const [isStartCutscenePlaying, setIsStartCutscenePlaying] = useState(
    route.initialMap != null && startCutscene != null,
  )
  const [resultCutsceneComplete, setResultCutsceneComplete] = useState(false)
  const [roundStartedAt, setRoundStartedAt] = useState(() => performance.now())
  const [map, setMap] = useState<GameMap | null>(route.initialMap ?? null)
  const [currentPlayer, setCurrentPlayer] = useState(0)
  const [currentOwnerPlayer, setCurrentOwnerPlayer] = useState(0)
  const [currentCaptureNo, setCurrentCaptureNo] = useState(0)
  const [turnDurationMs, setTurnDurationMs] = useState(3000)
  const [turnEndsAt, setTurnEndsAt] = useState(0)
  const [remainingMs, setRemainingMs] = useState(0)
  const [submitted, setSubmitted] = useState([false, false, false, false])
  /**
   * BE 권위형 물길 (개발명세서_FE_물기믹_유니온물길 FE-WATER-01).
   * null = 필드 부재(구 BE 또는 계산 실패 강등) → 로컬 계산 폴백.
   * 빈 배열은 "물 없음"이라는 권위적 결과 — 폴백 금지.
   */
  const [serverWaterFlows, setServerWaterFlows] = useState<WaterFlowRow[] | null>(null)
  const [broadcastPoses, setBroadcastPoses] = useState<Map<string, {
    player: number
    captureNo: number
    points: Vec2[]
  }>>(new Map())
  const [poseReady, setPoseReady] = useState(false)
  const [frames, setFrames] = useState<SimulationFrame[]>([])
  /** 재생 중인 프레임 인덱스. 갱신을 빠뜨리면 캐릭터가 첫 동작으로 고정된다. */
  const [frameIntervalMs, setFrameIntervalMs] = useState(50)
  const [result, setResult] = useState<boolean | null>(null)
  const [gameResult, setGameResult] = useState<GameResultEvent | null>(null)
  const [currentRoundNo, setCurrentRoundNo] = useState(1)
  const [roundResults, setRoundResults] = useState<RoundTime[]>([])
  const [isRetryRequested, setIsRetryRequested] = useState(false)
  const [socketError, setSocketError] = useState('')

  const { isSfxOn, sfxVolume, pauseBgm, resumeBgm } = useBgmContext()
  const lastCaptureSoundTimeRef = useRef<number>(0)
  const playCaptureSound = useCallback(() => {
    if (!isSfxOn) return
    const now = performance.now()
    // 600ms 이내 연속 재생 요청은 중복 소리 방지를 위해 무시한다.
    if (now - lastCaptureSoundTimeRef.current < 600) return
    lastCaptureSoundTimeRef.current = now

    const audio = new Audio('/sounds/Shooting_Sound.mp3')
    audio.volume = sfxVolume
    audio.play().catch(() => { })
  }, [isSfxOn, sfxVolume])

  const registerSlotVideo = useCallback((slotNo: number, video: HTMLVideoElement | null) => {
    if (video) {
      videoBySlotRef.current.set(slotNo, video)
    } else {
      videoBySlotRef.current.delete(slotNo)
    }
  }, [])
  const slotVideoRefs = useMemo(
    () => [1, 2, 3, 4].map((slotNo) =>
      (video: HTMLVideoElement | null) => registerSlotVideo(slotNo, video)),
    [registerSlotVideo],
  )
  const { status: roomSocketStatus, clientRef: roomStompClient } = useRoomSocket({
    roomId: roomSessionId,
    myUserId: user?.uuid ?? null,
    onSignal: (message) => signalHandlerRef.current?.(message),
    keepAliveOnUnmount: true,
  })
  const {
    localStream,
    remoteStreams,
    mediaError: cameraError,
    retryMedia: startCamera,
    handleSignal,
  } = useWebRTC({
    roomId: roomSessionId,
    myUserId: user?.uuid ?? null,
    participants,
    stompClient: roomStompClient,
    socketStatus: roomSocketStatus,
  })
  const cameraOn = localStream?.getVideoTracks().some((track) => track.readyState === 'live') ?? false
  // The room socket is retained across route transitions. Make its signaling
  // target available immediately instead of waiting for a passive effect.
  signalHandlerRef.current = handleSignal
  const {
    isLoading: isPoseLoading,
    errorMsg: poseError,
    detectPose,
    minPosePresenceConfidence,
  } = usePoseLandmarker()

  const recordPoseDetectionFailure = useCallback((failure: PoseDetectionFailure) => {
    const diagnostics = poseDiagnosticRef.current
    diagnostics.reasonCounts[failure.reason] =
      (diagnostics.reasonCounts[failure.reason] ?? 0) + 1
    if (failure.exceptionName) diagnostics.exceptionName = failure.exceptionName
  }, [])

  const captureLatestPose = useCallback((video: HTMLVideoElement) => {
    const canvas = canvasRef.current
    const diagnostics = poseDiagnosticRef.current
    diagnostics.detectionAttempts += 1
    if (!canvas) {
      recordPoseDetectionFailure({
        reason: 'CANVAS_UNAVAILABLE',
        videoState: readPoseVideoState(video),
      })
      return null
    }
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    const found = detectPose(
      video,
      canvas.width,
      canvas.height,
      recordPoseDetectionFailure,
    )
    if (!found) {
      return null
    }
    diagnostics.successfulDetections += 1
    const ordered = orderPosePoints(found)
    const resolved = resolvePosePoints(
      ordered,
      latestPoseRef.current,
      canvas.width,
      canvas.height,
      0.35,
      0.7,
    )
    if (resolved) {
      latestPoseRef.current = resolved
    } else {
      recordPoseDetectionFailure({
        reason: 'NO_VALID_POSE',
        videoState: readPoseVideoState(video),
      })
    }
    setPoseReady(resolved != null)
    return found
  }, [detectPose, recordPoseDetectionFailure])

  const handleGameEvent = useCallback((event: GameEvent) => {
    if (event.type === 'ERROR') {
      setIsRetryRequested(false)
      setSocketError(event.message)
      return
    }
    if (event.type === 'GAME_STARTED' || event.type === 'ROUND_STARTED') {
      if (successfulRoundInProgressRef.current) {
        pendingNextRoundRef.current = event
        return
      }
      const beginRound = () => {
        // A type 101 response is the boundary of a new round. Clear every
        // round-scoped value before applying its mapConfig so no bridge or
        // simulation state from the previous round can be rendered again.
        cancelAnimationFrame(detectRafRef.current)
        latestPoseRef.current = []
        missedCountsRef.current = [0, 0, 0, 0, 0, 0]
        submittedTurnRef.current = null
        activeDisplaySlotRef.current = null
        successfulRoundInProgressRef.current = false
        pendingNextRoundRef.current = null
        gameResultRef.current = null
        simulationPlaybackCompleteRef.current = false
        simulationReceivedRef.current = false

        if (event.type === 'GAME_STARTED') {
          setRoundResults([])
          setIsRetryRequested(false)
          setIsStartCutscenePlaying(startCutscene != null)
          setResultCutsceneComplete(false)
        }

        setMap(event.map)
        setCurrentRoundNo(event.roundNo)
        setFrames([])
        setFrameIntervalMs(50)
        setResult(null)
        setGameResult(null)
        setCurrentPlayer(0)
        setCurrentOwnerPlayer(0)
        setCurrentCaptureNo(0)
        setTurnDurationMs(3000)
        setTurnEndsAt(0)
        setRemainingMs(0)
        setPoseReady(false)
        setPhase('MAP_PREVIEW')
        setRoundStartedAt(performance.now())
        setPreviewEndsAt(performance.now() + event.initialDelayMs)
        setPreviewRemainingMs(event.initialDelayMs)
        setSubmitted([false, false, false, false])
        setBroadcastPoses(new Map())
        // 라운드 전환 물길 리셋: 라운드 시작 페이로드의 지형-only 물길로 교체
        setServerWaterFlows(event.waterFlows ?? null)
        // type 105에는 participants가 없으므로 최초 시작(type 101)에서 받은
        // 플레이어 배정을 다음 라운드에도 그대로 유지한다.
        if (event.participants.length > 0) {
          const assignment = event.participants.find((participant) => participant.userId === user?.uuid)
          if (assignment) setMyPlayer(assignment.playerNo)
        }
        if (event.placements.length > 0) setPlacements(event.placements)
      }

      const documentWithTransitions = document as Document & {
        startViewTransition?: (update: () => void) => void
      }
      if (hasStartedRoundRef.current && documentWithTransitions.startViewTransition) {
        documentWithTransitions.startViewTransition(() => flushSync(beginRound))
      } else {
        beginRound()
      }
      hasStartedRoundRef.current = true
      return
    }
    if (event.type === 'POSE_BROADCAST') {
      playCaptureSound()
      // undefined(부재)면 폴백을 위해 null 유지 — []는 권위적 "물 없음"이므로 그대로 반영
      setServerWaterFlows(event.waterFlows ?? null)
      setBroadcastPoses((previous) => {
        const next = new Map(previous)
        next.set(`${event.player}:${event.captureNo}`, event)
        return next
      })
      setSubmitted((previous) => previous.map((done, index) =>
        index === event.captureNo - 1 ? true : done))
      return
    }
    if (event.type === 'PLAYER_FILMING') {
      latestPoseRef.current = []
      poseDiagnosticRef.current = createPoseDiagnosticAccumulator()
      setPoseReady(false)
      const adjustedDurationMs = Math.max(0, event.durationMs - CAPTURE_DURATION_OFFSET_MS)
      const displaySlot = event.captureNo
      const previousDisplaySlot = activeDisplaySlotRef.current
      if (previousDisplaySlot != null) {
        setSubmitted((previous) => previous.map((done, index) =>
          index === previousDisplaySlot - 1 ? true : done))
      }
      activeDisplaySlotRef.current = displaySlot
      setCurrentPlayer(displaySlot - 1)
      setCurrentOwnerPlayer(event.player)
      setCurrentCaptureNo(event.captureNo)
      setTurnDurationMs(adjustedDurationMs)
      setRemainingMs(adjustedDurationMs)
      setTurnEndsAt(performance.now() + adjustedDurationMs)
      submittedTurnRef.current = null
      setPhase('CAPTURING')
      return
    }
    if (event.type === 'GAME_RESULT') {
      gameResultRef.current = event
      setGameResult(event)
      setResult(event.result)
      successfulRoundInProgressRef.current = false
      if (simulationPlaybackCompleteRef.current) setPhase('FINISHED')
      return
    }
    if (event.points.length === 0 || event.intervalMs <= 0) {
      setSocketError('서버가 유효하지 않은 시뮬레이션 결과를 보냈습니다.')
      return
    }
    // A round has exactly one authoritative simulation. STOMP redelivery or a
    // duplicated server broadcast must not restart an already-running playback.
    if (simulationReceivedRef.current) return
    simulationReceivedRef.current = true
    setSubmitted([true, true, true, true])
    setFrames(event.points)
    setFrameIntervalMs(event.intervalMs)
    setResult(event.result)
    const roundTime = formatClearTime(
      calculateSimulationDurationMs(event.points.length, event.intervalMs),
    )
    setRoundResults((previous) => {
      const next = previous.filter(({ round }) => round !== currentRoundNo)
      next.push({ round: currentRoundNo, time: roundTime, isFailed: !event.result })
      return next.sort((a, b) => a.round - b.round)
    })
    simulationPlaybackCompleteRef.current = false
    successfulRoundInProgressRef.current = event.result
    setPhase('SIMULATING')
  }, [currentRoundNo, playCaptureSound, startCutscene, user?.uuid])

  const { status, startGame, submitPose } = useGameSocket({
    roomSessionId,
    gameSessionId,
    onEvent: handleGameEvent,
    keepAliveOnUnmount: true,
  })

  useEffect(() => {
    if (phase !== 'WAITING_NEXT_ROUND') return
    const nextRound = pendingNextRoundRef.current
    if (!nextRound) return
    pendingNextRoundRef.current = null
    handleGameEvent(nextRound)
  }, [handleGameEvent, phase])

  useEffect(() => {
    if (roomSessionId == null || gameSessionId == null) {
      setSocketError('게임 세션 정보가 없습니다. 로비에서 다시 게임을 시작해 주세요.')
    }
  }, [gameSessionId, roomSessionId])

  useEffect(() => {
    // 실제 서버에서는 로비에서 GAME_START/GAME_STARTED를 끝내고 진입한다.
    // 직접 /game 진입도 가능한 개발 Mock만 여기서 시나리오를 시작한다.
    if (!isMockingEnabled || status !== 'connected' || !isHost || startRequestedRef.current) return
    startRequestedRef.current = true
    try { startGame(route.mapNum ?? 1) } catch (error) {
      startRequestedRef.current = false
      setSocketError(error instanceof Error ? error.message : '게임 시작 요청에 실패했습니다.')
    }
  }, [isHost, route.mapNum, startGame, status])

  useEffect(() => () => {
    cancelAnimationFrame(detectRafRef.current)
  }, [])

  const isMyTurn = phase === 'CAPTURING' && myPlayer === currentOwnerPlayer
  useEffect(() => {
    if (!isMyTurn) return
    if (!cameraOn) {
      const video = videoBySlotRef.current.get(currentPlayer + 1)
      if (video) {
        recordPoseDetectionFailure({
          reason: 'CAMERA_UNAVAILABLE',
          videoState: readPoseVideoState(video),
        })
      }
      return
    }
    const canvas = canvasRef.current
    const video = videoBySlotRef.current.get(currentPlayer + 1)
    const context = canvas?.getContext('2d')
    if (!video) {
      poseDiagnosticRef.current.reasonCounts.VIDEO_ELEMENT_UNAVAILABLE = 1
      return
    }
    if (!canvas || !context) {
      recordPoseDetectionFailure({
        reason: 'CANVAS_UNAVAILABLE',
        videoState: readPoseVideoState(video),
      })
      return
    }
    latestPoseRef.current = []
    setPoseReady(false)
    let lastTime = -1
    let lastPoints: TrackedJoints = { ...INITIAL_JOINTS }
    const detect = () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        captureLatestPose(video)
      } else if (video.currentTime !== lastTime) {
        lastTime = video.currentTime
        const found = captureLatestPose(video)
        if (found) {
          lastPoints = resolveTrackedJoints(found, lastPoints, minPosePresenceConfidence)
        }
      }
      context.clearRect(0, 0, canvas.width, canvas.height)
      drawSkeletonBridge(context, lastPoints, { showSkeleton: true, minVisibility: minPosePresenceConfidence })
      detectRafRef.current = requestAnimationFrame(detect)
    }
    detect()
    return () => {
      cancelAnimationFrame(detectRafRef.current)
      context.clearRect(0, 0, canvas.width, canvas.height)
      setPoseReady(false)
    }
  }, [cameraOn, captureLatestPose, currentCaptureNo, currentPlayer, isMyTurn, minPosePresenceConfidence, recordPoseDetectionFailure])

  useEffect(() => {
    if (phase !== 'MAP_PREVIEW' || previewEndsAt === 0) return
    const tick = () => setPreviewRemainingMs(Math.max(0, previewEndsAt - performance.now()))
    tick()
    const timer = window.setInterval(tick, 50)
    return () => window.clearInterval(timer)
  }, [phase, previewEndsAt])

  useEffect(() => {
    if (phase !== 'CAPTURING') return
    const tick = () => setRemainingMs(Math.max(0, turnEndsAt - performance.now()))
    tick()
    const interval = window.setInterval(tick, 50)
    const timeout = window.setTimeout(() => {
      setRemainingMs(0)
      const completedSlot = activeDisplaySlotRef.current
      if (completedSlot != null) {
        setSubmitted((previous) => previous.map((done, index) =>
          index === completedSlot - 1 ? true : done))
      }
      setPhase((current) => current === 'CAPTURING' ? 'WAITING_RESULT' : current)
    }, Math.max(0, turnEndsAt - performance.now()))
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [phase, turnEndsAt])

  const finishMyTurn = useCallback((reason: 'deadline' | 'page-hidden' | 'page-visible') => {
    const turnKey = `${currentCaptureNo}:${turnEndsAt}`
    if (!isMyTurn || turnEndsAt === 0 || submittedTurnRef.current === turnKey) return
    submittedTurnRef.current = turnKey
    playCaptureSound()
    const points = latestPoseRef.current
    const accumulator = poseDiagnosticRef.current
    const video = videoBySlotRef.current.get(currentPlayer + 1)
    const diagnostic: PoseCaptureDiagnostic | undefined = points.length === 0
      ? {
          primaryReason: cameraOn
            ? selectPrimaryPoseFailureReason(accumulator.reasonCounts)
            : 'CAMERA_UNAVAILABLE',
          reasonCounts: Object.fromEntries(
            Object.entries(accumulator.reasonCounts)
              .filter((entry): entry is [string, number] => entry[1] != null),
          ),
          detectionAttempts: accumulator.detectionAttempts,
          successfulDetections: accumulator.successfulDetections,
          cameraOn,
          poseModelLoading: isPoseLoading,
          visibilityState: document.visibilityState,
          videoState: video ? readPoseVideoState(video) : null,
          ...(accumulator.exceptionName ? { exceptionName: accumulator.exceptionName } : {}),
        }
      : undefined
    try {
      console.info(`[GAME] Finishing pose capture (${reason})`, diagnostic ?? {
        detectionAttempts: accumulator.detectionAttempts,
        successfulDetections: accumulator.successfulDetections,
      })
      submitPose(currentCaptureNo, points, diagnostic)
    } catch (error) {
      setSocketError(error instanceof Error ? error.message : '촬영 결과를 전송하지 못했습니다.')
    }
    setSubmitted((previous) => previous.map((done, index) =>
      index === currentCaptureNo - 1 ? true : done))
    setPhase('WAITING_RESULT')
  }, [cameraOn, currentCaptureNo, currentPlayer, isMyTurn, isPoseLoading, playCaptureSound, submitPose, turnEndsAt])

  useEffect(() => {
    if (!isMyTurn || turnEndsAt === 0) return
    const delay = Math.max(0, turnEndsAt - performance.now() - 60)
    const timer = window.setTimeout(() => finishMyTurn('deadline'), delay)
    return () => window.clearTimeout(timer)
  }, [finishMyTurn, isMyTurn, turnEndsAt])

  useEffect(() => {
    if (!isMyTurn || turnEndsAt === 0) return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const video = videoBySlotRef.current.get(currentPlayer + 1)
        if (video) captureLatestPose(video)
        finishMyTurn('page-hidden')
        return
      }
      if (performance.now() >= turnEndsAt - 60) finishMyTurn('page-visible')
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [captureLatestPose, currentPlayer, finishMyTurn, isMyTurn, turnEndsAt])

  useEffect(() => {
    if (phase !== 'SIMULATING') return
    const timer = window.setTimeout(() => setPhase('PLAYING'), 500)
    return () => window.clearTimeout(timer)
  }, [phase])

  const handleSimulationPlaybackComplete = useCallback(() => {
    simulationPlaybackCompleteRef.current = true
    successfulRoundInProgressRef.current = false
    setPhase(gameResultRef.current ? 'FINISHED' : 'WAITING_NEXT_ROUND')
  }, [])

  const isCaptureActive = shouldShowCaptureTimer(phase, remainingMs)
  const progress = isCaptureActive && turnDurationMs > 0 ? 1 - remainingMs / turnDurationMs : 0
  const displayMapNum = map?.mapNum ?? route.mapNum ?? 1
  const mapDesign = useMemo(() => resolveMapDesign(displayMapNum), [displayMapNum])
  useBgm(mapDesign?.bgmPath ?? '/sounds/Main_bgm.mp3')
  // BLACKOUT은 맵 데이터에 선언된 라운드에서 delayMs가 지난 뒤 현재 촬영자에게만 적용한다.
  const isCurrentFilmingPlayer = myPlayer === currentOwnerPlayer || (isMockingEnabled && (myPlayer === 1 || myPlayer === null))
  const blackoutGimmick = map?.gimmicks?.find((gimmick) => gimmick.type === 'BLACKOUT')
  const blackoutDelayMs = typeof blackoutGimmick?.delayMs === 'number' && Number.isFinite(blackoutGimmick.delayMs)
    ? blackoutGimmick.delayMs
    : 0
  const isBlackout = blackoutGimmick != null && performance.now() - roundStartedAt >= blackoutDelayMs && phase === 'CAPTURING'
    && isCurrentFilmingPlayer
  const simulationTime = formatClearTime(
    calculateSimulationDurationMs(frames.length, frameIntervalMs),
  )
  const totalElapsedTime = formatClearTime(gameResult?.elapsedTimeMs ?? 0)
  const resultCutscene = cutscenesEnabled && result != null
    ? getStageCutscene(stageId, result ? 'success' : 'failure')
    : null
  const shouldPlayResultCutscene = phase === 'FINISHED'
    && gameResult != null
    && resultCutscene != null
    && !resultCutsceneComplete
  const activeCutscene = useMemo(() => {
    if (isStartCutscenePlaying && startCutscene) {
      return { ...startCutscene, label: `STAGE ${stageId} 시작 컷씬`, kind: 'start' as const }
    }
    if (shouldPlayResultCutscene && resultCutscene) {
      return {
        ...resultCutscene,
        label: `STAGE ${stageId} ${result ? '클리어' : '실패'} 컷씬`,
        kind: 'result' as const,
      }
    }
    return null
  }, [isStartCutscenePlaying, startCutscene, stageId, shouldPlayResultCutscene, resultCutscene, result])
  const isResultPresentationReady = resultCutscene == null || resultCutsceneComplete

  const handleCutsceneEnded = useCallback(() => {
    if (isStartCutscenePlaying) {
      setIsStartCutscenePlaying(false)
      return
    }
    setResultCutsceneComplete(true)
  }, [isStartCutscenePlaying])

  useEffect(() => {
    if (!activeCutscene) return
    pauseBgm()
    return () => resumeBgm()
  }, [activeCutscene, pauseBgm, resumeBgm])

  const handleRetry = useCallback(() => {
    if (!isHost || isRetryRequested) return
    if (status !== 'connected') {
      setSocketError('게임 서버 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }
    try {
      startGame(route.mapNum ?? 1)
      setIsRetryRequested(true)
    } catch (error) {
      setSocketError(error instanceof Error ? error.message : '게임을 다시 시작하지 못했습니다.')
    }
  }, [isHost, isRetryRequested, route.mapNum, startGame, status])
  const mapScale = useMemo(() => {
    if (!map) return { width: 1000, height: 1000 }
    const gimmickPoints = (map.gimmicks ?? []).flatMap((gimmick) => gimmick.outlet ? [gimmick.outlet] : [])
    const points = [map.startPoint, map.endPoint, ...map.players, ...map.terrain.flat(), ...gimmickPoints]
    const maxX = Math.max(1, ...points.map(([x]) => x))
    const maxY = Math.max(1, ...points.map(([, y]) => y))
    if (maxX <= 1 && maxY <= 1) return { width: 1, height: 1 }
    if (maxX <= 10 && maxY <= 6) return { width: 10, height: 6 }
    return { width: 1000, height: 1000 }
  }, [map])
  const renderScale = useMemo<RenderScale>(() => {
    const overscan = mapScale.width * MAP_HORIZONTAL_OVERSCAN_RATIO
    return {
      minX: -overscan,
      width: mapScale.width + overscan * 2,
      height: mapScale.height,
    }
  }, [mapScale])
  const percentXValue = (value: number) => clamp01((value - renderScale.minX) / renderScale.width) * 100
  const percentYValue = (value: number) => clamp01(value / mapScale.height) * 100
  const percentX = (value: number) => `${percentXValue(value)}%`
  const percentY = (value: number) => `${percentYValue(value)}%`
  const waterFlows = useMemo(() => {
    if (!map) return []
    // BE 권위형 물길이 있으면 그대로 렌더 (빈 배열 포함 — "물 없음" 권위적 결과).
    // 필드 부재(null)일 때만 기존 로컬 계산 폴백 (FE-WATER-01 폴백 계약).
    if (serverWaterFlows != null) {
      return serverWaterFlows.map(([x1, y1, x2, y2, halfWidth]) => ({
        x1, y1, x2, y2, width: halfWidth * 2,
      }))
    }
    const posePaths = [...broadcastPoses.values()].flatMap(({ captureNo, points }) => {
      const center = map.players[captureNo - 1]
      if (!center || points.length < 2) return []
      return [points.map(([x, y]): Vec2 => [
        center[0] - PLAYER_POSE_AREA_WIDTH / 2 + x * PLAYER_POSE_AREA_WIDTH,
        center[1] - PLAYER_POSE_AREA_HEIGHT / 2 + y * PLAYER_POSE_AREA_HEIGHT,
      ])]
    })
    return computeWaterFlows({
      gimmicks: map.gimmicks ?? [],
      terrain: map.terrain,
      posePaths,
      mapWidth: mapScale.width,
      mapHeight: mapScale.height,
    })
  }, [broadcastPoses, map, mapScale.height, mapScale.width, serverWaterFlows])

  const cameraMode = phase === 'CAPTURING'
    ? 'player'
    : phase === 'MAP_PREVIEW' || phase === 'CONNECTING'
      ? 'overview'
      : 'character'
  const cameraTarget = cameraMode === 'player'
    ? map?.players[currentPlayer] ?? map?.startPoint
    : cameraMode === 'character' ? map?.startPoint : null
  const cameraScale = CAMERA_SCALE[cameraMode]
  const playbackOwnsCamera = cameraMode === 'character' && frames.length > 0
  const worldStyle = {
    '--camera-scale': cameraScale,
    ...(!playbackOwnsCamera ? {
      '--camera-x': cameraTarget ? `${clampCameraPercent(percentXValue(cameraTarget[0]), cameraScale)}%` : '50%',
      '--camera-y': cameraTarget ? `${clampCameraPercent(percentYValue(cameraTarget[1]), cameraScale)}%` : '50%',
    } : {}),
    '--world-aspect-ratio': renderScale.width / renderScale.height,
  } as CSSProperties

  // 스테이지 클리어 / 실패 결과 효과음 (Success.mp3 / Failed.mp3) - SFX 설정과 연동
  useEffect(() => {
    if (phase !== 'FINISHED' || result === null || !isResultPresentationReady || !isSfxOn) return

    const soundUrl = result ? '/sounds/Success.mp3' : '/sounds/Failed.mp3'
    const audio = new Audio(soundUrl)
    audio.volume = sfxVolume
    audio.play().catch(() => {
      // 브라우저 자동 재생 제한 정책 예외 방지
    })

    return () => {
      audio.pause()
      audio.currentTime = 0
    }
  }, [phase, result, isResultPresentationReady, isSfxOn, sfxVolume])

  const currentNickname = playerSlots.find(({ slotNo }) => slotNo === currentPlayer + 1)
    ?.participant.nickname ?? '플레이어'
  const completedParticipantCount = submitted.filter(Boolean).length
  const allCapturesCompleted = completedParticipantCount === 4
  const streamFor = (participant: RoomParticipant) =>
    String(participant.userId) === String(user?.uuid)
      ? localStream
      : remoteStreams.get(participant.userId) ?? null

  return (
    <main className="ingame-page">
      {activeCutscene && (
        <CutscenePlayer
          key={`${activeCutscene.kind}:${activeCutscene.src}`}
          src={activeCutscene.src}
          label={activeCutscene.label}
          onEnded={handleCutsceneEnded}
        />
      )}
      <section className={`game-shell game-shell--${cameraMode}`}>
        <div className="game-board-viewport">
          <div
            ref={gameBoardRef}
            className={`game-board game-board--camera-${cameraMode}${mapDesign ? ` game-board--themed ${mapDesign.className}` : ''}${isBlackout ? ' game-board--blackout' : ''}`}
            style={mapDesign?.backgroundImage ? { backgroundImage: `url("${mapDesign.backgroundImage}")` } : undefined}
            aria-label={mapDesign ? `${mapDesign.name} 게임 맵` : '게임 맵'}
          >
            {isBlackout && (
              <div className="blackout-notice" role="status" aria-live="polite">
                <span className="blackout-notice__icon">⚡</span>
                <div>
                  <strong>정전 기믹 발생!</strong>
                  <small>어둠 속에서 카메라 영역을 활용해 다리를 연결하세요.</small>
                </div>
              </div>
            )}
            <div
              ref={worldRef}
              className="game-board__world"
              style={{
                ...worldStyle,
                ...(mapDesign?.backgroundImage ? { backgroundImage: `url("${mapDesign.backgroundImage}")` } : {}),
              }}
            >
              <div className="sky-deco sky-deco--one">☁</div><div className="sky-deco sky-deco--two">☁</div><div className="map-grid" />
              {map && (
                <svg className="map-terrain" viewBox={`${renderScale.minX} 0 ${renderScale.width} ${renderScale.height}`} preserveAspectRatio="none" aria-hidden="true">
                  {map.terrain.map((polygon, index) => (
                    <polygon
                      key={index}
                      points={extendTerrainToOverscan(
                        polygon,
                        mapScale.width,
                        mapScale.width * MAP_HORIZONTAL_OVERSCAN_RATIO,
                      ).map(([x, y]) => `${x},${y}`).join(' ')}
                    />
                  ))}
                </svg>
              )}
              {mapDesign && <MapEffects effects={mapDesign.effects} />}
              {map && <MapGimmicks gimmicks={map.gimmicks ?? []} mapWidth={mapScale.width} mapHeight={mapScale.height} minX={renderScale.minX} renderWidth={renderScale.width} />}
              {waterFlows.length > 0 && (
                <svg className="water-flow" viewBox={`${renderScale.minX} 0 ${renderScale.width} ${renderScale.height}`} preserveAspectRatio="none" aria-label="자세에 따라 흐르는 물길">
                  {waterFlows.map((flow, index) => (
                    <g key={`${flow.x1}:${flow.y1}:${flow.x2}:${flow.y2}:${index}`}>
                      <line className="water-flow__body" x1={flow.x1} y1={flow.y1} x2={flow.x2} y2={flow.y2} strokeWidth={flow.width} />
                      <line className="water-flow__shine" x1={flow.x1} y1={flow.y1} x2={flow.x2} y2={flow.y2} strokeWidth={Math.max(2, flow.width * 0.18)} />
                    </g>
                  ))}
                </svg>
              )}
              {map?.players.map(([x, y], index) => (
                <div className="map-player-spawn" key={index} style={{ left: percentX(x), top: percentY(y), background: COLORS[index % COLORS.length] }}>
                  P{index + 1}
                </div>
              ))}
              {/* clearZone은 플레이 화면에 표시하지 않는다 (판정은 BE 전담, 위치 힌트는 GOAL 깃발로 충분) */}
              {map && <><div className="start-marker" style={{ left: percentX(map.startPoint[0]), top: percentY(map.startPoint[1]) }}><span>START</span></div><div className="goal-marker" style={{ left: percentX(map.endPoint[0]), top: percentY(map.endPoint[1]) }}><span>GOAL</span><b>★</b></div></>}
              {map && (phase === 'MAP_PREVIEW' || isCaptureActive) && (
                <SpriteCharacter
                  className="start-character"
                  action="idle"
                  facing="right"
                  xPercent={percentXValue(map.startPoint[0])}
                  yPercent={percentYValue(map.startPoint[1])}
                />
              )}
              {playerSlots.map(({ slotNo, participant }) => {
                const spawnPoint = map?.players[slotNo - 1]
                if (!spawnPoint) return null
                const isMe = String(participant.userId) === String(user?.uuid)
                const isCurrent = isCaptureActive && currentPlayer === slotNo - 1
                const isObscured = (!isMe && !isMyTurn) || (isMe && isMyTurn && !isCurrent)
                const stream = streamFor(participant)
                return (
                  <section
                    className={`ingame-camera has-map-position ${isCurrent ? 'is-my-turn' : ''} ${isObscured ? 'is-obscured' : ''}`}
                    style={{ left: percentX(spawnPoint[0]), top: percentY(spawnPoint[1]) }}
                    aria-label={`플레이어 ${slotNo} ${participant.nickname} 웹캠`}
                    // A new server placement can assign a different camera to the
                    // same P position. Include its owner so React remounts the video
                    // element instead of retaining the previous position's feed.
                    key={`${slotNo}:${participant.userId}`}
                  >
                    <div className="ingame-camera__heading">
                      <strong>P{slotNo} · {participant.nickname}{isMe ? ' (나)' : ''}</strong>
                      <span className={stream ? 'is-live' : ''}>{stream ? '● LIVE' : 'OFF'}</span>
                    </div>
                    <div className="ingame-camera__viewport">
                      <GameVideoFeed
                        stream={stream}
                        muted={isMe}
                        videoRef={isMe ? slotVideoRefs[slotNo - 1] : undefined}
                      />
                      {isMe && isCurrent && <canvas ref={canvasRef} aria-hidden={!isMyTurn} />}
                      {isMe && !cameraOn && !isPoseLoading && <button onClick={() => void startCamera()}>카메라 켜기</button>}
                      {isMe && isPoseLoading && <span className="ingame-camera__message">포즈 모델 준비 중…</span>}
                    </div>
                    <p className={isMe && poseReady ? 'pose-ok' : ''}>
                      {isMe
                        ? isMyTurn && isCurrent
                          ? poseReady ? '✓ 자세가 잘 인식되고 있어요' : '상체와 양팔이 보이도록 서 주세요.'
                          : cameraError || poseError || '내 차례에 관절과 선분이 표시됩니다.'
                        : submitted[slotNo - 1] ? '촬영 완료' : isCurrent ? '촬영 중' : '대기 중'}
                    </p>
                  </section>
                )
              })}
              {phase === 'MAP_PREVIEW' && (
                <div className="map-preview-notice" role="status" aria-live="polite">
                  <strong>맵 탐색 시간</strong>
                  <span>첫 촬영 전까지 시작점과 목표 지형을 확인해 보세요.</span>
                  <b>{Math.ceil(previewRemainingMs / 1000)}초</b>
                </div>
              )}
              {[...broadcastPoses.values()].map(({ player, captureNo, points }) => {
                const center = map?.players[captureNo - 1]
                if (!center) return null

                const mapPoints = points.map(([x, y]): Vec2 => [
                  center[0] - PLAYER_POSE_AREA_WIDTH / 2 + x * PLAYER_POSE_AREA_WIDTH,
                  center[1] - PLAYER_POSE_AREA_HEIGHT / 2 + y * PLAYER_POSE_AREA_HEIGHT,
                ])

                return (
                  <svg
                    className="pose-bridge"
                    key={`${player}:${captureNo}`}
                    viewBox={`${renderScale.minX} 0 ${renderScale.width} ${renderScale.height}`}
                    preserveAspectRatio="none"
                    style={{ color: COLORS[(player - 1) % COLORS.length] }}
                    aria-label={`플레이어 ${player}의 ${captureNo}번째 포즈 길`}
                  >
                    {POSE_SEGMENTS.map(([from, to]) => {
                      const start = mapPoints[from]
                      const end = mapPoints[to]
                      return start && end ? (
                        <line
                          key={`${from}-${to}`}
                          x1={start[0]}
                          y1={start[1]}
                          x2={end[0]}
                          y2={end[1]}
                        />
                      ) : null
                    })}
                    {mapPoints.map(([x, y], index) => (
                      <circle
                        key={index}
                        cx={x}
                        cy={y}
                        r={Math.min(mapScale.width, mapScale.height) * 0.004}
                      />
                    ))}
                  </svg>
                )
              })}
              {frames.length > 0 && (phase === 'SIMULATING' || phase === 'PLAYING' || phase === 'FINISHED') && (
                <SimulationPlayback
                  active={phase === 'PLAYING'}
                  finished={phase === 'FINISHED'}
                  failed={result === false}
                  frames={frames}
                  intervalMs={frameIntervalMs}
                  maxDurationMs={MAX_SIMULATION_DURATION_MS}
                  mapWidth={mapScale.width}
                  gimmicks={map?.gimmicks ?? []}
                  worldRef={worldRef}
                  hudRoot={gameBoardRef.current}
                  cameraScale={CAMERA_SCALE.character}
                  percentX={percentXValue}
                  percentY={percentYValue}
                  clampCamera={clampCameraPercent}
                  isSfxOn={isSfxOn}
                  sfxVolume={sfxVolume}
                  onComplete={handleSimulationPlaybackComplete}
                />
              )}
            </div>
            {phase === 'CONNECTING' && <div className="center-overlay"><div className="spinner" /><h2>게임 서버 연결 중</h2><p>모든 플레이어와 게임 데이터를 동기화하고 있어요.</p></div>}
            {phase === 'SIMULATING' && <div className="center-overlay"><div className="simulation-icon">⚙</div><h2>경로 계산 완료</h2><p>서버가 계산한 병아리의 이동 경로를 재생할게요.</p></div>}
            {phase === 'WAITING_RESULT' && !allCapturesCompleted && <div className="center-overlay center-overlay--compact"><div className="spinner" /><h2>시뮬레이션 대기 중</h2><p>촬영 결과를 서버에 전송했습니다.</p></div>}
            {phase === 'WAITING_NEXT_ROUND' && <div className="center-overlay center-overlay--compact"><div className="spinner" /><h2>다음 라운드 준비 중</h2><p>새로운 맵을 불러오고 있어요.</p></div>}
            {socketError && phase !== 'FINISHED' && <div className="center-overlay"><h2>연결을 확인해 주세요</h2><p>{socketError}</p><button onClick={handleGoToLobby}>방 목록으로</button></div>}
            {phase === 'FINISHED' && gameResult !== null && result !== null && isResultPresentationReady && (
              <StageClearModal
                isSuccess={result}
                stageNumber={displayMapNum}
                topPercentile=""
                rounds={roundResults.length > 0
                  ? roundResults
                  : [{ round: currentRoundNo, time: simulationTime, isFailed: !result }]}
                totalClearTime={totalElapsedTime}
                failedReason="아기 오리는 과연 넘어갈 수 있을까요?"
                errorText={socketError || undefined}
                onLobby={handleGoToLobby}
                onRetry={isHost ? handleRetry : undefined}
              />
            )}
          </div>
        </div>

        <aside className="game-sidebar">
          {isCaptureActive && <section className="turn-card" aria-label="현재 차례 및 촬영 시간"><span className="eyebrow">CURRENT TURN</span><div className="turn-title"><span style={{ background: COLORS[currentPlayer] }}>P{currentPlayer + 1}</span><div><strong>{currentNickname}</strong><small>{isMyTurn ? '다리를 만들어 주세요!' : '다른 플레이어의 차례예요'}</small></div></div><div className="timer-row"><b>{Math.ceil(remainingMs / 1000)}초</b><span>{Math.round(clamp01(progress) * 100)}%</span></div><div className="timer-track"><i style={{ width: `${clamp01(progress) * 100}%` }} /></div></section>}
          <section className="players-card" tabIndex={0} aria-label="참가 중인 플레이어">
            <div className="card-heading"><strong>플레이어 슬롯</strong><span>{completedParticipantCount} / 4 완료</span></div>
            {playerSlots.length > 0 ? (
              <ul>{playerSlots.map(({ slotNo, participant }) => {
                const index = slotNo - 1
                return <li className={currentPlayer === index && isCaptureActive ? 'is-current' : ''} key={slotNo}><span className="player-avatar" style={{ background: COLORS[index] }}>P{slotNo}</span><b>{participant.nickname}</b><em>{submitted[index] ? '완료 ✓' : currentPlayer === index && isCaptureActive ? '촬영 중' : '대기'}</em></li>
              })}</ul>
            ) : <p className="players-card__empty">참여 중인 플레이어가 없습니다.</p>}
          </section>
        </aside>
      </section>
      <footer className="game-tip"><b>TIP</b> 팔과 어깨로 병아리가 지나갈 경사를 만들어 보세요. 내 차례가 끝나기 직전의 포즈가 자동 제출됩니다.</footer>
    </main>
  )
}
