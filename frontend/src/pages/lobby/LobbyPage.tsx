import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ProfileMenu } from '../../shared/components/ProfileMenu'
import { BgmToggleButton } from '../../shared/components/BgmToggleButton'
import { useBgm } from '../../shared/hooks/useBgm'
import { useAuth } from '../../features/auth/context/authContext'
import {
  changeRoomStage,
  changeRoomCutsceneSetting,
  getRoomInfo,
  toggleReady,
  type QuickStartResult,
  type RoomParticipant,
} from '../../features/rooms/services/roomsApi'
import type { RoomEvent, SignalMessage } from '../../features/rooms/services/roomSocket'
import { useRoomSocket } from '../../features/rooms/hooks/useRoomSocket'
import {
  disconnectRetainedGameSocket,
  useGameSocket,
} from '../../features/game/hooks/useGameSocket'
import type { GameEvent, GameMap, GamePlacement } from '../../features/game/services/gameProtocol'
import { isMockingEnabled } from '../../mocks/enableMocking'
import { useWebRTC } from '../../features/webrtc/hooks/useWebRTC'
import { VideoGrid } from '../../features/webrtc/components/VideoGrid'
import { getStages, toStageCode, type StageDifficulty, type StageListItem } from '../../features/stages/services/stagesApi'
import {
  getCustomMap,
  isCustomStageId,
  paletteGradient,
  type CustomMapSummary,
} from '../../features/workshop/services/customMapApi'
import { getStageCutscene, hasStageCutscenes } from '../../features/cutscenes/cutsceneCatalog'
import { preloadGame, type GamePreloadProgress } from '../../features/game/services/preloadGame'
import logoHorizontal from '../../assets/BodyBuilder_Horizontal.png'
import defaultStageThumb from '../../assets/example_image.png'
import './LobbyPage.css'
import { JourneyDuckDecor } from '../../shared/components/JourneyDuckDecor'

/**
 * 캐러셀 카드 1장. 공식 스테이지와 창작마당 맵을 같은 모양으로 다룬다.
 * 썸네일은 공식이 이미지(thumbnailUrl), 창작마당이 palette 그라디언트다.
 */
type LobbyMapCard = {
  stageId: number
  name: string
  description: string
  difficulty: StageDifficulty
  thumbnailUrl: string | null
  palette: string[] | null
  isCustom: boolean
}

/**
 * 스테이지(맵) 목록은 `GET /api/v1/stages`에서 가져온다.
 *
 * 목록 API가 제공하지 않아 카드에서 뺀 항목:
 *   - subtitle(부제)
 *   - bestTimeMs / myRank (맵별 내 기록 — 별도 API 없음, 마이페이지에서 확인)
 * 표시용 코드(01·02…)는 API에 code 필드가 없어 stageId로 만든다.
 */

// 확정 규칙: 방 정원 4명. 방장은 시작, 나머지는 준비. (아래는 실시간 상태 연동 전 placeholder)
type LobbyPlayer = {
  /** 참가자 userId(UUID). placeholder는 고유 문자열 키를 사용한다. */
  id: string
  nickname: string
  online: boolean
  camReady: boolean
  isHost: boolean
  isMe: boolean
  isReady: boolean
}

export function LobbyPage() {
  const navigate = useNavigate()
  const { isBgmOn, toggleBgm } = useBgm('/sounds/RoomListPage_bgm.mp3')
  const params = useParams<{ code: string }>()
  const location = useLocation()
  const state = location.state as {
    title?: string
    room?: QuickStartResult
    /** 창작마당에서 방을 만들며 넘겨 준 맵. 진입 직후 깜빡임을 없애는 용도다. */
    customMap?: CustomMapSummary
  } | null
  const quickStart = state?.room ?? null

  // 방 정보는 라우트 state(Quick Start 응답)로 시작하고, 없으면 API로 복구한다.
  const [roomData, setRoomData] = useState<QuickStartResult | null>(quickStart)
  const [isRoomLoading, setIsRoomLoading] = useState(false)

  const roomCode = (roomData?.roomCode ?? params.code ?? '----').toUpperCase()
  // 방 제목은 서버 응답을 최우선으로 사용한다. (라우트 state는 진입 시 임시값)
  const roomTitle = roomData?.title ?? state?.title ?? '대기방'

  const { user } = useAuth()

  // 내 userId는 로그인 프로필의 uuid를 최우선으로 사용하고, 없으면 방 응답의 참가자 목록에서 내 슬롯으로 구한다.
  const myUserId = useMemo(
    () => user?.uuid ?? roomData?.participants.find((p) => p.slotId === roomData.slotId)?.userId ?? null,
    [roomData, user],
  )

  // 참가자 목록은 방 응답으로 초기화하고, 이후 STOMP 이벤트로 갱신한다.
  const [participants, setParticipants] = useState<RoomParticipant[]>(quickStart?.participants ?? [])
  const [notice, setNotice] = useState('')
  const [isCopyToastVisible, setIsCopyToastVisible] = useState(false)
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current)
  }, [])

  const handleCopyRoomCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      setIsCopyToastVisible(true)
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current)
      copyToastTimerRef.current = setTimeout(() => {
        setIsCopyToastVisible(false)
        copyToastTimerRef.current = null
      }, 1800)
    } catch {
      setNotice('방 코드를 복사하지 못했습니다.')
    }
  }, [roomCode])
  const [decidedId, setDecidedId] = useState<number | null>(
    quickStart?.selectedStageId ?? null,
  )
  const [isLeaving, setIsLeaving] = useState(false)
  const [isReadyUpdating, setIsReadyUpdating] = useState(false)
  const [isStageUpdating, setIsStageUpdating] = useState(false)
  const [isCutsceneUpdating, setIsCutsceneUpdating] = useState(false)
  const [cutscenesEnabled, setCutscenesEnabled] = useState(
    quickStart?.cutscenesEnabled ?? false,
  )

  // 스테이지 목록은 서버에서 조회한다. 조회 성공 시 첫 스테이지를 기본 선택한다.
  const [stages, setStages] = useState<StageListItem[]>([])
  const [stagesError, setStagesError] = useState('')
  const [isStagesLoading, setIsStagesLoading] = useState(true)
  /**
   * 이 방에 걸린 창작마당 맵. 창작마당 방일 때만 채운다.
   *
   * 예전에는 공개 맵 목록 전체를 받아 캐러셀에 합쳤는데, 그러면 일반 방 방장이
   * 아무 UGC 맵이나 고를 수 있었다. 지금은 방에 이미 정해진 맵 하나만 조회한다.
   * 조회 실패는 화면에 띄우지 않는다. 공식 맵 플레이를 막을 이유가 없다.
   */
  const [roomCustomMap, setRoomCustomMap] = useState<CustomMapSummary | null>(
    state?.customMap ?? null,
  )
  const [preloadProgress, setPreloadProgress] = useState<GamePreloadProgress>({
    step: 'code',
    message: '게임 준비를 시작하는 중…',
  })
  const [preloadError, setPreloadError] = useState('')
  const [preloadAttempt, setPreloadAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsStagesLoading(true)
    getStages()
      .then((data) => {
        if (cancelled) return
        setStages(data)
        setDecidedId((current) => current ?? data[0]?.stageId ?? null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setStagesError(cause instanceof Error ? cause.message : '맵 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setIsStagesLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  /** 이 방이 창작마당 전용 방인가. 서버가 준 selectedStageId 하나로 판단한다. */
  const isWorkshopRoom = isCustomStageId(decidedId)

  /**
   * 창작마당 방이면 걸린 맵 상세를 한 건만 조회한다.
   *
   * 방장뿐 아니라 코드로 들어온 참가자도 같은 경로를 타므로, 참가자 화면에서도
   * 맵 이름·난이도·설명이 그대로 나온다. (라우트 state 가 없어도 복구된다)
   */
  useEffect(() => {
    if (!isWorkshopRoom || decidedId == null) {
      setRoomCustomMap(null)
      return
    }
    // 이미 같은 맵을 들고 있으면 다시 조회하지 않는다.
    if (roomCustomMap?.stageId === decidedId) return

    let cancelled = false
    getCustomMap(decidedId)
      .then((detail) => { if (!cancelled) setRoomCustomMap(detail) })
      .catch(() => { /* 조회 실패해도 방 진입 자체는 막지 않는다. */ })
    return () => { cancelled = true }
  }, [isWorkshopRoom, decidedId, roomCustomMap?.stageId])

  /**
   * 캐러셀에는 **공식 맵만** 올린다.
   *
   * 커스텀 맵을 섞으면 일반 방 방장이 남의 UGC 맵을 마음대로 걸 수 있다.
   * 창작마당 맵은 /workshop 의 "이 맵으로 방 만들기" 로만 들어와야 한다.
   * 서버가 커스텀 stageId 를 목록에 흘리더라도 여기서 한 번 더 걸러 낸다.
   */
  const officialMapCards = useMemo<LobbyMapCard[]>(
    () => stages
      .filter((stage) => !isCustomStageId(stage.stageId))
      .map((stage) => ({
        stageId: stage.stageId,
        name: stage.name,
        description: stage.description,
        difficulty: stage.difficulty,
        thumbnailUrl: stage.thumbnailUrl,
        palette: null,
        isCustom: false,
      })),
    [stages],
  )

  /** 이 방에 걸린 창작마당 맵의 카드 표현. 고정 뷰와 이름 조회에 함께 쓴다. */
  const workshopMapCard = useMemo<LobbyMapCard | null>(() => {
    if (!isWorkshopRoom || decidedId == null) return null
    if (!roomCustomMap) {
      // 상세가 아직 안 왔거나 실패했을 때도 카드 자리는 유지한다.
      return {
        stageId: decidedId,
        name: '창작마당 맵',
        description: '맵 정보를 불러오는 중입니다…',
        difficulty: '중',
        thumbnailUrl: null,
        palette: null,
        isCustom: true,
      }
    }
    return {
      stageId: roomCustomMap.stageId,
      name: roomCustomMap.title,
      description: roomCustomMap.description,
      difficulty: roomCustomMap.difficulty,
      // 커스텀 맵은 업로드 썸네일이 없다. palette 그라디언트로 그린다.
      thumbnailUrl: null,
      palette: roomCustomMap.palette,
      isCustom: true,
    }
  }, [isWorkshopRoom, decidedId, roomCustomMap])

  /**
   * 맵 이름 조회용 목록. 캐러셀에 안 뜨더라도 이름은 나와야 한다.
   * (게임 진입 state, STAGE_CHANGED 안내, 시작 버튼 라벨)
   */
  const knownMapCards = useMemo<LobbyMapCard[]>(
    () => (workshopMapCard ? [...officialMapCards, workshopMapCard] : officialMapCards),
    [officialMapCards, workshopMapCard],
  )

  // 새로 입장하거나 새로고침한 참가자도 서버에 저장된 현재 선택을 그대로 본다.
  useEffect(() => {
    if (roomData?.selectedStageId != null) {
      setDecidedId(roomData.selectedStageId)
    }
  }, [roomData?.selectedStageId])

  useEffect(() => {
    if (roomData) setCutscenesEnabled(roomData.cutscenesEnabled)
  }, [roomData])

  // 새로고침(F5)·URL 직접 진입으로 라우트 state가 없거나, 다른 방 코드로 이동했을 때
  // 방 정보를 다시 조회한다. (같은 라우트라 컴포넌트가 언마운트되지 않으므로 코드 비교가 필요)
  useEffect(() => {
    if (!params.code) return
    if (roomData && roomData.roomCode.toUpperCase() === params.code.toUpperCase()) return
    let cancelled = false

    setIsRoomLoading(true)
    getRoomInfo(params.code)
      .then((data) => {
        if (cancelled) return
        setRoomData(data)
        setParticipants(data.participants)
      })
      .catch(() => {
        if (cancelled) return
        setNotice('방 정보를 불러오지 못했습니다.')
        navigate('/rooms', { replace: true })
      })
      .finally(() => {
        if (!cancelled) setIsRoomLoading(false)
      })

    return () => { cancelled = true }
  }, [roomData, params.code, navigate])

  const navigateToGame = useCallback((
    initialMap?: GameMap,
    gameSessionId?: string,
    initialDelayMs?: number,
    placements?: GamePlacement[],
  ) => {
    // 커스텀 맵도 이름이 나와야 하므로 합친 목록에서 찾는다.
    const stage = knownMapCards.find((item) => item.stageId === decidedId)
    const code = roomData?.roomCode ?? params.code
    if (code) {
      sessionStorage.setItem('lastRoomCode', code)
    }
    navigate('/game', {
      state: {
        stageName: stage?.name ?? '토이 타운',
        mapNum: stage?.stageId ?? 1,
        stageId: stage?.stageId ?? 1,
        ...(initialMap ? { initialMap } : {}),
        initialDelayMs,
        gameStartedSignalAtMs: Date.now(),
        cutscenesEnabled,
        roomSessionId: roomData?.roomId,
        gameSessionId,
        slotId: roomData?.slotId,
        isHost: roomData?.isHost ?? false,
        participants,
        placements,
        roomCode: code,
      },
    })
  }, [cutscenesEnabled, decidedId, navigate, participants, roomData, knownMapCards, params.code])

  const enterGame = useCallback((event: GameEvent) => {
    if (event.type !== 'GAME_STARTED') return
    navigateToGame(event.map, event.gameSessionId, event.initialDelayMs, event.placements)
  }, [navigateToGame])

  const handleRoomEvent = useCallback((event: RoomEvent) => {
    if (event.type === 'PLAYER_JOINED') {
      setParticipants((prev) =>
        prev.some((p) => String(p.userId) === String(event.newParticipant.userId))
          ? prev
          : [...prev, event.newParticipant],
      )
      setNotice(`${event.newParticipant.nickname}님이 입장했어요.`)
      return
    }
    if (event.type === 'PLAYER_READY_CHANGED') {
      setParticipants((prev) =>
        prev.map((participant) =>
          String(participant.userId) === String(event.userId) || participant.slotId === event.slotId
            ? { ...participant, isReady: event.isReady }
            : participant,
        ),
      )
      return
    }
    if (event.type === 'STAGE_CHANGED') {
      setDecidedId(event.stageId)
      // 공식 목록에서만 찾으면 방장이 창작마당 맵을 골랐을 때 안내가 뜨지 않는다.
      const stageName = knownMapCards.find((card) => card.stageId === event.stageId)?.name
      if (stageName) setNotice(`방장이 ‘${stageName}’ 맵으로 변경했어요.`)
      return
    }
    if (event.type === 'CUTSCENE_SETTING_CHANGED') {
      setCutscenesEnabled(event.enabled)
      setNotice(`게임 컷씬이 ${event.enabled ? '켜졌어요.' : '꺼졌어요.'}`)
      return
    }
    // PLAYER_LEFT: 이탈자 제거 + 방장 승계 반영
    setParticipants((prev) =>
      prev
        .filter((p) => String(p.userId) !== String(event.leftUserId))
        .map((p) =>
          event.newHostUserId == null
            ? p
            : { ...p, isHost: String(p.userId) === String(event.newHostUserId) },
        ),
    )
    setNotice('플레이어가 퇴장했어요.')
  }, [knownMapCards])

  // WebRTC 시그널 핸들러는 useWebRTC가 준비된 뒤에 주입되므로 ref로 우회한다.
  const signalHandlerRef = useRef<((msg: SignalMessage) => void) | undefined>(undefined)

  const { status: socketStatus, clientRef, disconnect: disconnectRoomSocket } = useRoomSocket({
    roomId: roomData?.roomId ?? null,
    myUserId,
    onRoomEvent: handleRoomEvent,
    onSignal: (msg) => signalHandlerRef.current?.(msg),
    keepAliveOnUnmount: true,
  })

  const {
    localStream,
    remoteStreams,
    isVideoOn,
    isAudioOn,
    toggleVideo,
    toggleAudio,
    mediaError,
    retryMedia,
    handleSignal,
    remoteMediaStates,
  } = useWebRTC({
    roomId: roomData?.roomId ?? null,
    myUserId,
    participants,
    stompClient: clientRef,
    socketStatus,
  })

  // Signaling may arrive as soon as the retained STOMP subscription is adopted.
  // Assign during render so the first offer is not lost before effects run.
  signalHandlerRef.current = handleSignal

  const { status: gameSocketStatus, startGame } = useGameSocket({
    roomSessionId: roomData?.roomId ?? (isMockingEnabled ? '00000000-0000-4000-8000-000000000001' : null),
    onEvent: enterGame,
    keepAliveOnUnmount: true,
  })

  // 방 정보가 있을 때만 참가자를 렌더링한다. (가짜 placeholder 노출 방지)
  const players = useMemo<LobbyPlayer[]>(() => {
    if (roomData) {
      return [...participants]
        .sort((a, b) => a.slotId - b.slotId)
        .map((participant) => ({
          id: participant.userId,
          nickname: participant.nickname,
          online: true,
          camReady: remoteStreams.has(participant.userId) || String(participant.userId) === String(myUserId),
          isHost: participant.isHost, // 백엔드의 isHost 필드를 직접 참조
          isReady: participant.isReady,
          // UUID 문자열 기준 비교. 타입 혼용으로 isMe가 false가 되는 것을 막는다.
          isMe: String(participant.userId) === String(myUserId),
        }))
    }
    return []
  }, [roomData, participants, myUserId, remoteStreams])

  // 방장 승계가 반영되도록 참가자 목록에서 직접 판정한다.
  const isHost = players.find((player) => player.isMe)?.isHost ?? false
  const selectedStageHasCutscenes = decidedId != null && hasStageCutscenes(decidedId)
  const onlineCount = players.filter((player) => player.online).length
  const capacity = 4

  const ready = participants.find(
    (participant) => String(participant.userId) === String(myUserId),
  )?.isReady ?? false

  const handleReady = async () => {
    if (isReadyUpdating) return
    setIsReadyUpdating(true)
    try {
      const updatedParticipant = await toggleReady(roomCode)
      // 소켓 방송이 늦거나 유실되어도 API 응답을 즉시 반영한다.
      setParticipants((prev) =>
        prev.map((participant) =>
          String(participant.userId) === String(updatedParticipant.userId)
            ? updatedParticipant
            : participant,
        ),
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '준비 상태를 변경하지 못했습니다.')
    } finally {
      setIsReadyUpdating(false)
    }
  }

  const handleCutsceneSetting = async () => {
    if (!isHost || isCutsceneUpdating || !selectedStageHasCutscenes) return
    const nextEnabled = !cutscenesEnabled
    setIsCutsceneUpdating(true)
    try {
      const result = await changeRoomCutsceneSetting(roomCode, nextEnabled)
      setCutscenesEnabled(result.cutscenesEnabled)
      setNotice(`게임 컷씬을 ${result.cutscenesEnabled ? '사용합니다.' : '사용하지 않습니다.'}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '컷씬 설정을 변경하지 못했습니다.')
    } finally {
      setIsCutsceneUpdating(false)
    }
  }

  const trackRef = useRef<HTMLDivElement>(null)

  const scrollByCard = (direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    const card = track.querySelector<HTMLElement>('.lobby-map-card')
    const step = card ? card.offsetWidth + 18 : 320
    track.scrollBy({ left: step * direction, behavior: 'smooth' })
  }

  const decidedStage = knownMapCards.find((card) => card.stageId === decidedId) ?? null

  useEffect(() => {
    if (decidedId == null) return
    let cancelled = false
    setPreloadError('')
    setPreloadProgress({ step: 'code', message: '게임 준비를 시작하는 중…' })
    void preloadGame(decidedId, cutscenesEnabled, (progress) => {
      if (!cancelled) setPreloadProgress(progress)
    }).then(() => {
      if (!cancelled) setPreloadProgress({ step: 'ready', message: '게임 준비가 완료되었습니다.' })
    }).catch((error: unknown) => {
      if (cancelled) return
      setPreloadError(error instanceof Error ? error.message : '게임 사전 준비에 실패했습니다.')
    })
    return () => { cancelled = true }
  }, [cutscenesEnabled, decidedId, preloadAttempt])

  const isGamePreloaded = preloadProgress.step === 'ready' && !preloadError

  const autoDisableAttemptedStageRef = useRef<number | null>(null)

  useEffect(() => {
    if (!cutscenesEnabled || selectedStageHasCutscenes || decidedId == null) {
      autoDisableAttemptedStageRef.current = null
      return
    }
    if (!isHost || isCutsceneUpdating || autoDisableAttemptedStageRef.current === decidedId) return

    autoDisableAttemptedStageRef.current = decidedId
    setIsCutsceneUpdating(true)
    void changeRoomCutsceneSetting(roomCode, false)
      .then((result) => {
        setCutscenesEnabled(result.cutscenesEnabled)
        setNotice('선택한 스테이지에 컷씬이 없어 컷씬 설정을 껐습니다.')
      })
      .catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : '컷씬 설정을 끄지 못했습니다.')
      })
      .finally(() => setIsCutsceneUpdating(false))
  }, [cutscenesEnabled, decidedId, isCutsceneUpdating, isHost, roomCode, selectedStageHasCutscenes])

  useEffect(() => {
    if (!cutscenesEnabled || decidedId == null) return
    const startCutscene = getStageCutscene(decidedId, 'start')
    if (!startCutscene) return
    const video = document.createElement('video')
    video.preload = 'auto'
    video.src = startCutscene.src
    video.load()
    return () => {
      video.removeAttribute('src')
      video.load()
    }
  }, [cutscenesEnabled, decidedId])

  // 맵 카드를 클릭하면 바로 그 맵으로 결정한다. (확정 규칙: 맵 결정은 방장만)
  // 커스텀 맵도 같은 API를 쓴다. `PATCH /rooms/{code}/stage`에 stageId >= 10000을 넘기면 된다.
  const decideStage = async (stage: LobbyMapCard) => {
    if (!isHost || isStageUpdating) return
    /*
     * 창작마당 방은 맵을 바꿀 수 없다. UI 로도 캐러셀을 감췄지만,
     * 키보드·개발자도구로 호출되는 경로가 남지 않도록 여기서도 막는다.
     */
    if (isWorkshopRoom) {
      setNotice('창작마당 방은 맵을 바꿀 수 없어요. 새 맵으로 놀려면 창작마당에서 방을 만들어 주세요.')
      return
    }
    setIsStageUpdating(true)
    try {
      const result = await changeRoomStage(roomCode, stage.stageId)
      // STOMP 방송이 늦거나 유실되어도 요청한 방장 화면에는 즉시 반영한다.
      setDecidedId(result.selectedStageId)
      setNotice(`‘${stage.name}’ 맵으로 결정했어요.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '맵을 변경하지 못했습니다.')
    } finally {
      setIsStageUpdating(false)
    }
  }

  const handleStart = () => {
    if (!decidedStage) {
      setNotice('먼저 플레이할 맵을 결정해 주세요.')
      return
    }
    if (!isGamePreloaded) {
      setNotice('게임 리소스와 AI 모델 준비가 끝날 때까지 잠시 기다려 주세요.')
      return
    }
    if (gameSocketStatus !== 'connected') {
      setNotice('게임 서버에 연결 중입니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    try { startGame(decidedStage.stageId) } catch (error) {
      setNotice(error instanceof Error ? error.message : '게임을 시작하지 못했습니다.')
    }
  }

  const handleLeave = async () => {
    if (isLeaving) return
    setIsLeaving(true)
    // 소켓 종료에 따른 서버 퇴장 처리가 시작된 뒤 목록을 다시 조회하도록 순서를 보장한다.
    try {
      await Promise.all([disconnectRoomSocket(), disconnectRetainedGameSocket()])
    } finally {
      navigate('/rooms', {
        state: {
          justLeft: {
            roomCode,
            isHost,
            participantCount: participants.length,
          },
        },
      })
    }
  }

  // 조회 중에는 placeholder나 이전 방의 정보가 노출되지 않도록 로딩 화면을 보여준다.
  if (isRoomLoading) {
    return (
      <main className="lobby-page">
        <JourneyDuckDecor />
        <div className="lobby-page__grid" />
        <p className="lobby-loading" aria-busy="true" aria-live="polite">
          방 정보를 불러오는 중입니다…
        </p>
      </main>
    )
  }

  return (
    <main className="lobby-page">
      <JourneyDuckDecor />
      <div className="lobby-page__grid" />

      <div
        className={`lobby-copy-toast${isCopyToastVisible ? ' is-visible' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        복사되었습니다
      </div>

      <header className="lobby-header">
        <div className="lobby-brand" aria-label="Body Builder">
          <img src={logoHorizontal} alt="Body Builder" className="lobby-brand__logo" />
        </div>
        <div className="lobby-header__title">
          <h1>
            {roomData?.isSecret && <span className="lobby-header__secret" title="비밀방">🔒 비밀방</span>}
            <span>{roomTitle}</span>
            <button
              className="lobby-header__code"
              type="button"
              onClick={() => void handleCopyRoomCode()}
              aria-label={`방 코드 복사: ${roomCode}`}
              title="방 코드 복사"
            >
              {roomCode}
            </button>
          </h1>
        </div>
        <div className="lobby-header__actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BgmToggleButton isBgmOn={isBgmOn} onToggle={toggleBgm} />
          <ProfileMenu triggerAriaLabel="프로필 메뉴 열기" align="right" />
        </div>
      </header>

      <div className="lobby-body">
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-start' }}>
          <button
            className="back-button lobby-back-button"
            type="button"
            onClick={() => void handleLeave()}
            disabled={isLeaving}
            aria-label="방 나가기"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            <span>{isLeaving ? '나가는 중...' : '나가기'}</span>
          </button>
        </div>
        <section className="lobby-main">
          <section className="lobby-participants" aria-labelledby="lobby-participants-title">
            <div className="lobby-participants__head">
              <div>
                <h2 className="lobby-section-title" id="lobby-participants-title">참가자</h2>
                <span className="lobby-players__count">{onlineCount} / {capacity} ONLINE</span>
              </div>
              {roomData && (
                <p className={`lobby-socket lobby-socket--${socketStatus}`} role="status">
                  <i />
                  {socketStatus === 'connected' && '실시간 연결됨'}
                  {socketStatus === 'connecting' && '연결 중…'}
                  {socketStatus === 'disconnected' && '재연결 중…'}
                  {socketStatus === 'idle' && '연결 대기'}
                </p>
              )}
            </div>

            <VideoGrid
              localStream={localStream}
              remoteStreams={remoteStreams}
              remoteMediaStates={remoteMediaStates}
              isLocalVideoOn={isVideoOn}
              isLocalAudioOn={isAudioOn}
              players={players}
              myUserId={myUserId}
            />

            <div className="lobby-media-controls" aria-label="내 미디어 설정">
              <button className={`lobby-media-button${isVideoOn ? ' is-on' : ''}`} onClick={() => toggleVideo()} aria-pressed={isVideoOn}>
                <span aria-hidden="true">{isVideoOn ? '📹' : '📷'}</span>
                카메라 {isVideoOn ? '끄기' : '켜기'}
              </button>
              <button className={`lobby-media-button${isAudioOn ? ' is-on' : ''}`} onClick={() => toggleAudio()} aria-pressed={isAudioOn}>
                <span aria-hidden="true">{isAudioOn ? '🎙' : '🔇'}</span>
                마이크 {isAudioOn ? '끄기' : '켜기'}
              </button>
              {mediaError && <button className="lobby-media-button" onClick={() => retryMedia()}>🔄 다시 연결</button>}
            </div>
            {mediaError && <p className="lobby-media-error" role="alert">{mediaError}</p>}
          </section>

          <section className="lobby-map" aria-labelledby="lobby-stage-title">
            <h2 className="lobby-section-title" id="lobby-stage-title">
              {isWorkshopRoom ? '창작마당 맵' : '맵 선택'}
            </h2>

            {/*
              창작마당 방은 맵이 방 생성 시점에 정해진다. 캐러셀 대신 고정 카드만 보여 준다.
              여기서 공식 맵 캐러셀을 띄우면 방장이 UGC 방을 일반 스테이지로 바꿔 버릴 수 있다.
            */}
            {isWorkshopRoom && workshopMapCard && (
              <div className="lobby-workshop-map">
                <div className="lobby-map-card is-decided lobby-workshop-map__card">
                  <div className="lobby-map-card__art">
                    <div
                      className="lobby-map-card__thumb lobby-map-card__thumb--palette"
                      style={{ background: paletteGradient(workshopMapCard.palette ?? []) }}
                      role="img"
                      aria-label={`${workshopMapCard.name} 썸네일`}
                    />
                    <span className="lobby-map-card__ugc">UGC</span>
                    <span className="lobby-map-card__flag">창작마당 전용 맵</span>
                  </div>
                  <div className="lobby-map-card__body">
                    <div className="lobby-map-card__head">
                      <h3>{workshopMapCard.name}</h3>
                      <span className={`stage-difficulty-badge stage-difficulty-badge--${workshopMapCard.difficulty}`}>
                        {workshopMapCard.difficulty}
                      </span>
                    </div>
                    <p className="lobby-map-card__desc">{workshopMapCard.description}</p>
                  </div>
                </div>
                <p className="lobby-workshop-map__note">
                  창작마당에서 만든 방입니다. 이 방의 맵은 바꿀 수 없어요.
                  {isHost && ' 다른 맵으로 놀고 싶다면 창작마당에서 새 방을 만들어 주세요.'}
                </p>
              </div>
            )}

            {!isWorkshopRoom && (
            <div className="lobby-carousel">
              <button className="lobby-arrow" type="button" onClick={() => scrollByCard(-1)} aria-label="이전 맵">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              <div className="lobby-carousel__track" ref={trackRef}>
                {isStagesLoading && <p className="lobby-map-status">맵 목록을 불러오는 중…</p>}
                {!isStagesLoading && stagesError && (
                  <p className="lobby-map-status lobby-map-status--error" role="alert">{stagesError}</p>
                )}
                {!isStagesLoading && !stagesError && officialMapCards.length === 0 && (
                  <p className="lobby-map-status">등록된 맵이 없습니다.</p>
                )}

                {officialMapCards.map((stage) => {
                  const isDecided = stage.stageId === decidedId
                  const stageCode = toStageCode(stage.stageId)
                  return (
                    <article
                      className={`lobby-map-card${isDecided ? ' is-decided' : ''}${isHost ? ' is-selectable' : ''}`}
                      key={stage.stageId}
                      role={isHost ? 'button' : undefined}
                      tabIndex={isHost ? 0 : undefined}
                      aria-pressed={isHost ? isDecided : undefined}
                      aria-label={isHost ? `${stage.name} 맵으로 결정` : undefined}
                      title={isHost ? '클릭하여 이 맵으로 결정' : undefined}
                      onClick={isHost ? () => decideStage(stage) : undefined}
                      onKeyDown={
                        isHost
                          ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              decideStage(stage)
                            }
                          }
                          : undefined
                      }
                    >
                      {/*
                        공식 맵은 썸네일 이미지(없으면 기본 이미지)를 쓰고,
                        창작마당 맵은 이미지가 없으므로 palette 3색 그라디언트로 그린다.
                      */}
                      <div className={`lobby-map-card__art art--${stageCode}`}>
                        {stage.isCustom ? (
                          <div
                            className="lobby-map-card__thumb lobby-map-card__thumb--palette"
                            style={{ background: paletteGradient(stage.palette ?? []) }}
                            role="img"
                            aria-label={`${stage.name} 썸네일`}
                          />
                        ) : (
                          <img
                            className="lobby-map-card__thumb"
                            src={stage.thumbnailUrl || defaultStageThumb}
                            alt={stage.name}
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.onerror = null
                              e.currentTarget.src = defaultStageThumb
                            }}
                          />
                        )}
                        {stage.isCustom && <span className="lobby-map-card__ugc">UGC</span>}
                        {isDecided && <span className="lobby-map-card__flag">결정된 맵</span>}
                      </div>
                      <div className="lobby-map-card__body">
                        <div className="lobby-map-card__head">
                          <h3>{stage.name}</h3>
                          <span className={`stage-difficulty-badge stage-difficulty-badge--${stage.difficulty}`}>
                            {stage.difficulty}
                          </span>
                        </div>
                        <p className="lobby-map-card__desc">{stage.description}</p>
                      </div>
                    </article>
                  )
                })}

                {/* 등록된 맵 목록 가장 끝에 '추후 공개 (COMING SOON)' 카드 추가 */}
                {!isStagesLoading && !stagesError && officialMapCards.length > 0 && (
                  <article
                    className="lobby-map-card is-coming-soon"
                    aria-label="추후 공개 예정 스테이지"
                    title="새로운 스테이지가 준비 중입니다."
                  >
                    <div className="lobby-map-card__art art--coming-soon">
                      <img
                        className="lobby-map-card__thumb"
                        src="https://res.cloudinary.com/dkmtsb9k3/image/upload/v1785721787/locked_stage_card_padlock_chains_idmkl8.png"
                        alt="추후 공개"
                        loading="lazy"
                      />
                    </div>
                    <div className="lobby-map-card__body">
                      <div className="lobby-map-card__head">
                        <h3>추후 공개</h3>
                      </div>
                      <p className="lobby-map-card__desc">세상엔 아직 우리의 손길이 필요한 친구들이 가득하다네, 곧 찾아오지!</p>
                    </div>
                  </article>
                )}
              </div>

              <button className="lobby-arrow" type="button" onClick={() => scrollByCard(1)} aria-label="다음 맵">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
            )}
            <div className="lobby-cutscene-setting">
              <div>
                <strong>게임 컷씬</strong>
                <span>
                  {!selectedStageHasCutscenes
                    ? '선택한 스테이지에는 등록된 컷씬이 없습니다.'
                    : cutscenesEnabled
                    ? '등록된 시작·결과 영상을 재생합니다.'
                    : '컷씬 없이 바로 게임을 진행합니다.'}
                </span>
              </div>
              <button
                className={`lobby-cutscene-switch${cutscenesEnabled && selectedStageHasCutscenes ? ' is-on' : ''}`}
                type="button"
                role="switch"
                aria-checked={cutscenesEnabled && selectedStageHasCutscenes}
                aria-label="게임 컷씬 사용"
                onClick={() => void handleCutsceneSetting()}
                disabled={!isHost || isCutsceneUpdating || !selectedStageHasCutscenes}
                title={!selectedStageHasCutscenes
                  ? '선택한 스테이지에는 등록된 컷씬이 없습니다.'
                  : isHost
                    ? '게임 컷씬 사용 여부 변경'
                    : '방장만 변경할 수 있습니다.'}
              >
                <i aria-hidden="true" />
                <b>{isCutsceneUpdating
                  ? '반영 중'
                  : cutscenesEnabled && selectedStageHasCutscenes ? 'ON' : 'OFF'}</b>
              </button>
            </div>
            <p className={`lobby-notice${notice ? ' is-visible' : ''}`} role="status">
              {notice || ' '}
            </p>

            <div className={`lobby-preload-status${preloadError ? ' is-error' : ''}${isGamePreloaded ? ' is-ready' : ''}`} role="status" aria-live="polite">
              <span aria-hidden="true">{preloadError ? '!' : isGamePreloaded ? '✓' : '↻'}</span>
              <p>{preloadError || preloadProgress.message}</p>
              {preloadError && (
                <button type="button" onClick={() => setPreloadAttempt((value) => value + 1)}>다시 시도</button>
              )}
            </div>
            {isHost ? (
              <button className="lobby-start" type="button" onClick={handleStart} disabled={!decidedStage || !isGamePreloaded}>
                <span className="lobby-start__icon">▶</span> 게임 시작
                {decidedStage && <em>{decidedStage.name}</em>}
              </button>
            ) : (
              <button
                className={`lobby-start lobby-start--ready${ready ? ' is-ready' : ''}`}
                type="button"
                onClick={() => void handleReady()}
                disabled={isReadyUpdating || (!ready && !isGamePreloaded)}
              >
                <span className="lobby-start__icon">{ready ? '✔' : '▶'}</span>
                {isReadyUpdating ? '반영 중…' : ready ? '준비 완료됨' : '준비하기'}
              </button>
            )}
          </section>
        </section>

      </div>
    </main>
  )
}
