import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import bodyBuilderLogo from '../../assets/BodyBuilder_Horizontal.png'
import {
  getActiveGames,
  getArchivedGames,
  getErrorDetail,
  getErrors,
  getRoundReplays,
  getSessionEvents,
  type ActiveGame,
  type ArchivedGame,
  type ErrorDetail,
  type ErrorSummary,
  type RoundReplay,
  type SessionEvent,
} from '../../features/admin/services/adminLogsApi'
import {
  connectAdminLogs,
  type AdminErrorDelta,
  type AdminLiveEvent,
  type AdminSessionDelta,
} from '../../features/admin/services/adminLogsSocket'
import {
  applyActiveGameDelta,
  applyArchivedGameDelta,
  applyErrorDelta,
} from '../../features/admin/services/adminLogsState'
import { useAuth } from '../../features/auth/context/authContext'
import { ProfileMenu } from '../../shared/components/ProfileMenu'
import type { SharedStompStatus } from '../../shared/services/sharedStompConnection'
import './AdminLogsPage.css'

type View = 'active' | 'archived' | 'errors'
type CopyStatus = 'idle' | 'copied' | 'failed'

const EVENT_LABELS: Record<string, string> = {
  GAME_STARTED: '게임 시작',
  ROUND_STARTED: '라운드 시작',
  CAPTURE_REQUESTED: '촬영 요청',
  POSE_ACCEPTED: '포즈 접수',
  POSE_CAPTURE_FAILED: '포즈 촬영 실패',
  POSE_CAPTURE_TIMED_OUT: '포즈 응답 시간 초과',
  ROUND_COMPLETED: '라운드 완료',
  GAME_COMPLETED: '게임 종료',
  GAME_ERROR: '게임 오류',
  GAME_ABORTED: '게임 중단',
}

const FINAL_STATUS_LABELS: Record<string, string> = {
  COMPLETED: '정상 종료',
  ERROR: '오류 종료',
  ABORTED: '중단',
}

const EVENT_ACCENT_CLASSES: Record<string, string> = {
  GAME_STARTED: 'is-game-start',
  ROUND_STARTED: 'is-round-start',
  ROUND_COMPLETED: 'is-round-complete',
  GAME_COMPLETED: 'is-game-complete',
  POSE_CAPTURE_FAILED: 'is-pose-failed',
  POSE_CAPTURE_TIMED_OUT: 'is-pose-failed',
}

const POSE_FAILURE_REASON_LABELS: Record<string, string> = {
  LANDMARKER_NOT_READY: '포즈 모델이 아직 준비되지 않음',
  VIDEO_PAUSED: '카메라 영상이 일시 정지됨',
  VIDEO_ENDED: '카메라 영상이 종료됨',
  VIDEO_READY_STATE_INSUFFICIENT: '분석 가능한 비디오 프레임이 준비되지 않음',
  NO_LANDMARKS: '프레임에서 사람의 관절을 찾지 못함',
  DETECTION_EXCEPTION: 'MediaPipe 분석 중 예외 발생',
  VIDEO_ELEMENT_UNAVAILABLE: '분석 대상 비디오 요소를 찾지 못함',
  CANVAS_UNAVAILABLE: '포즈 캔버스를 준비하지 못함',
  CAMERA_UNAVAILABLE: '카메라 스트림을 사용할 수 없음',
  NO_VALID_POSE: '제출 가능한 유효 포즈가 없음',
  CLIENT_RESPONSE_NOT_RECEIVED: '제한 시간 내 클라이언트 응답을 받지 못함',
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const formatTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const shortId = (value?: string | null) => value ? value.slice(0, 8) : '-'
const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback

export function AdminLogsPage() {
  const { user } = useAuth()
  const [view, setView] = useState<View>('active')
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([])
  const [archivedGames, setArchivedGames] = useState<ArchivedGame[]>([])
  const [errors, setErrors] = useState<ErrorSummary[]>([])
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null)
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [roundReplays, setRoundReplays] = useState<RoundReplay[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null)
  const [isOverviewLoading, setIsOverviewLoading] = useState(true)
  const [isEventsLoading, setIsEventsLoading] = useState(false)
  const [isReplaysLoading, setIsReplaysLoading] = useState(false)
  const [isErrorLoading, setIsErrorLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [replayError, setReplayError] = useState('')
  const [socketStatus, setSocketStatus] =
    useState<SharedStompStatus>('disconnected')
  const [detailSocketSyncVersion, setDetailSocketSyncVersion] = useState(0)
  const isOverviewSyncingRef = useRef(false)
  const overviewRequestIdRef = useRef(0)
  const overviewRequestCountRef = useRef(0)
  const pendingSessionDeltasRef = useRef<AdminSessionDelta[]>([])
  const pendingErrorDeltasRef = useRef<AdminErrorDelta[]>([])
  const seenSessionDeltaIdsRef = useRef(new Set<string>())
  const seenErrorDeltaIdsRef = useRef(new Set<string>())
  const hasConnectedOnceRef = useRef(false)
  const lastSocketStatusRef = useRef<SharedStompStatus>('disconnected')

  const applySessionDelta = useCallback((delta: AdminSessionDelta) => {
    setActiveGames((current) => applyActiveGameDelta(current, delta))
    setArchivedGames((current) => applyArchivedGameDelta(current, delta))
  }, [])

  const applyCreatedError = useCallback((delta: AdminErrorDelta) => {
    setErrors((current) => applyErrorDelta(current, delta))
  }, [])

  const handleSessionDelta = useCallback((delta: AdminSessionDelta) => {
    const seen = seenSessionDeltaIdsRef.current
    if (seen.has(delta.eventId)) return
    if (seen.size >= 2_000) seen.clear()
    seen.add(delta.eventId)
    if (isOverviewSyncingRef.current) {
      pendingSessionDeltasRef.current.push(delta)
      return
    }
    applySessionDelta(delta)
  }, [applySessionDelta])

  const handleErrorDelta = useCallback((delta: AdminErrorDelta) => {
    const seen = seenErrorDeltaIdsRef.current
    if (seen.has(delta.error.errorId)) return
    if (seen.size >= 2_000) seen.clear()
    seen.add(delta.error.errorId)
    if (isOverviewSyncingRef.current) {
      pendingErrorDeltasRef.current.push(delta)
      return
    }
    applyCreatedError(delta)
  }, [applyCreatedError])

  const loadOverview = useCallback(async (silent = false) => {
    const requestId = ++overviewRequestIdRef.current
    overviewRequestCountRef.current += 1
    if (!silent) setIsOverviewLoading(true)
    isOverviewSyncingRef.current = true
    try {
      const results = await Promise.allSettled([
        getActiveGames(),
        getArchivedGames(),
        getErrors(),
      ])

      if (requestId === overviewRequestIdRef.current) {
        if (results[0].status === 'fulfilled') setActiveGames(results[0].value)
        if (results[1].status === 'fulfilled') setArchivedGames(results[1].value)
        if (results[2].status === 'fulfilled') setErrors(results[2].value)

        const failed = results.filter((result) => result.status === 'rejected')
        setPageError(
          failed.length > 0
            ? '일부 관리자 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
            : '',
        )
      }
    } finally {
      overviewRequestCountRef.current -= 1
      if (overviewRequestCountRef.current === 0) {
        setIsOverviewLoading(false)
        isOverviewSyncingRef.current = false

        const pendingSessions = pendingSessionDeltasRef.current.splice(0)
        const pendingErrors = pendingErrorDeltasRef.current.splice(0)
        pendingSessions.forEach(applySessionDelta)
        pendingErrors.forEach(applyCreatedError)
      }
    }
  }, [applyCreatedError, applySessionDelta])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  useEffect(() => {
    if (view === 'active') {
      if (!activeGames.some((game) => game.gameSessionId === selectedGameId)) {
        setSelectedGameId(activeGames[0]?.gameSessionId ?? null)
      }
      return
    }
    if (view === 'archived' &&
        !archivedGames.some((game) => game.gameSessionId === selectedGameId)) {
      setSelectedGameId(archivedGames[0]?.gameSessionId ?? null)
    }
  }, [activeGames, archivedGames, selectedGameId, view])

  useEffect(() => {
    if (view !== 'errors') return
    if (!errors.some((error) => error.errorId === selectedErrorId)) {
      setSelectedErrorId(errors[0]?.errorId ?? null)
    }
  }, [errors, selectedErrorId, view])

  useEffect(() => {
    if (!selectedGameId || view === 'errors') {
      setEvents([])
      setSelectedEventId(null)
      return
    }
    let cancelled = false
    setIsEventsLoading(true)
    setDetailError('')
    getSessionEvents(selectedGameId)
      .then((loadedEvents) => {
        if (!cancelled) {
          setEvents(loadedEvents)
          setSelectedEventId((current) =>
            loadedEvents.some((event) => event.eventId === current)
              ? current
              : null,
          )
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setEvents([])
          setDetailError(messageOf(cause, '세션 이벤트를 불러오지 못했습니다.'))
        }
      })
      .finally(() => {
        if (!cancelled) setIsEventsLoading(false)
      })
    return () => { cancelled = true }
  }, [detailSocketSyncVersion, selectedGameId, view])

  useEffect(() => {
    if (!selectedGameId || view !== 'archived') {
      setRoundReplays([])
      setReplayError('')
      return
    }
    let cancelled = false
    setIsReplaysLoading(true)
    setReplayError('')
    getRoundReplays(selectedGameId)
      .then((loadedReplays) => {
        if (!cancelled) setRoundReplays(loadedReplays)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setRoundReplays([])
          setReplayError(messageOf(cause, '라운드 리플레이를 불러오지 못했습니다.'))
        }
      })
      .finally(() => {
        if (!cancelled) setIsReplaysLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedGameId, view])

  useEffect(() => {
    if (!selectedErrorId || view !== 'errors') {
      setErrorDetail(null)
      return
    }
    let cancelled = false
    setIsErrorLoading(true)
    setDetailError('')
    getErrorDetail(selectedErrorId)
      .then((detail) => {
        if (!cancelled) setErrorDetail(detail)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setErrorDetail(null)
          setDetailError(messageOf(cause, '오류 상세를 불러오지 못했습니다.'))
        }
      })
      .finally(() => {
        if (!cancelled) setIsErrorLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedErrorId, view])

  useEffect(() => {
    if (!user) return
    const handleSessionEvent = (liveEvent: AdminLiveEvent) => {
      if (liveEvent.gameSessionId !== selectedGameId) return
      setEvents((current) => {
        if (current.some((event) => event.eventId === liveEvent.event.eventId)) {
          return current
        }
        const sequenceNo = (current.at(-1)?.sequenceNo ?? 0) + 1
        return [...current, { ...liveEvent.event, sequenceNo }]
      })
    }
    const handleStatusChange = (nextStatus: SharedStompStatus) => {
      const previousStatus = lastSocketStatusRef.current
      lastSocketStatusRef.current = nextStatus
      setSocketStatus(nextStatus)
      if (nextStatus !== 'connected') return
      setDetailSocketSyncVersion((current) => current + 1)
      if (!hasConnectedOnceRef.current || previousStatus === 'disconnected') {
        void loadOverview(true)
      }
      hasConnectedOnceRef.current = true
    }
    const registration = connectAdminLogs({
      userId: user.uuid,
      selectedGameSessionId: selectedGameId ?? undefined,
      onSessionDelta: handleSessionDelta,
      onErrorDelta: handleErrorDelta,
      onSessionEvent: handleSessionEvent,
      onStatusChange: handleStatusChange,
    })
    return () => { void registration.disconnect() }
  }, [handleErrorDelta, handleSessionDelta, loadOverview, selectedGameId, user])

  const selectedSession = useMemo(
    () =>
      activeGames.find((game) => game.gameSessionId === selectedGameId) ??
      archivedGames.find((game) => game.gameSessionId === selectedGameId) ??
      null,
    [activeGames, archivedGames, selectedGameId],
  )
  const selectedEvent = events.find((event) => event.eventId === selectedEventId) ?? null
  const sessionList = view === 'active' ? activeGames : archivedGames

  const openError = (errorId: string) => {
    setView('errors')
    setSelectedErrorId(errorId)
  }

  return (
    <div className="admin-log-page">
      <header className="admin-log-header">
        <Link to="/rooms" className="admin-log-header__brand">
          <img src={bodyBuilderLogo} alt="BodyBuilder" />
        </Link>
        <div className="admin-log-header__title">
          <span>ADMIN CONSOLE</span>
          <strong>게임 세션 관측</strong>
        </div>
        <div className="admin-log-header__actions">
          <span className={`admin-socket admin-socket--${socketStatus}`}>
            <i />
            {socketStatus === 'connected' ? '실시간 연결됨' :
              socketStatus === 'connecting' ? '연결 중' : '연결 끊김'}
          </span>
          <button type="button" onClick={() => void loadOverview()}>
            새로고침
          </button>
          <ProfileMenu />
        </div>
      </header>

      <section className="admin-summary" aria-label="로그 현황">
        <div>
          <span>진행 중 게임</span>
          <strong>{activeGames.length}</strong>
          <small>Valkey Stream</small>
        </div>
        <div>
          <span>최근 종료 게임</span>
          <strong>{archivedGames.length}</strong>
          <small>MySQL archive</small>
        </div>
        <div className={errors.length > 0 ? 'is-alert' : ''}>
          <span>보관 중 오류</span>
          <strong>{errors.length}</strong>
          <small>최근 7일</small>
        </div>
        <div>
          <span>최근 동기화</span>
          <strong className="admin-summary__time">
            {new Date().toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </strong>
        </div>
      </section>

      <nav className="admin-tabs" aria-label="관리자 로그 분류">
        <button
          type="button"
          className={view === 'active' ? 'is-active' : ''}
          onClick={() => setView('active')}
        >
          진행 중 <b>{activeGames.length}</b>
        </button>
        <button
          type="button"
          className={view === 'archived' ? 'is-active' : ''}
          onClick={() => setView('archived')}
        >
          종료 이력 <b>{archivedGames.length}</b>
        </button>
        <button
          type="button"
          className={view === 'errors' ? 'is-active' : ''}
          onClick={() => setView('errors')}
        >
          서버 오류 <b>{errors.length}</b>
        </button>
      </nav>

      {pageError && <p className="admin-page-error" role="alert">{pageError}</p>}

      <main className="admin-workspace">
        <aside className="admin-log-list">
          <div className="admin-panel-title">
            <div>
              <span>{view === 'errors' ? 'ERROR INDEX' : 'SESSION INDEX'}</span>
              <h2>
                {view === 'active' ? '진행 중인 게임' :
                  view === 'archived' ? '종료된 게임' : '상세 오류'}
              </h2>
            </div>
            {isOverviewLoading && <i className="admin-mini-spinner" aria-label="불러오는 중" />}
          </div>

          {view === 'errors' ? (
            <div className="admin-list-scroll">
              {errors.map((error) => (
                <button
                  type="button"
                  key={error.errorId}
                  className={`admin-error-row${
                    selectedErrorId === error.errorId ? ' is-selected' : ''
                  }`}
                  onClick={() => setSelectedErrorId(error.errorId)}
                >
                  <span className="admin-error-row__top">
                    <b>{error.errorCode ?? 'INTERNAL'}</b>
                    <time>{formatDateTime(error.createdAt)}</time>
                  </span>
                  <strong>{error.source}</strong>
                  <p>{error.message}</p>
                  <code>{shortId(error.errorId)}</code>
                </button>
              ))}
              {!isOverviewLoading && errors.length === 0 && (
                <EmptyList message="보관 중인 서버 오류가 없습니다." />
              )}
            </div>
          ) : (
            <div className="admin-list-scroll">
              {sessionList.map((game) => (
                <SessionRow
                  key={game.gameSessionId}
                  game={game}
                  active={view === 'active'}
                  selected={selectedGameId === game.gameSessionId}
                  onClick={() => {
                    setSelectedGameId(game.gameSessionId)
                    setSelectedEventId(null)
                  }}
                />
              ))}
              {!isOverviewLoading && sessionList.length === 0 && (
                <EmptyList
                  message={view === 'active'
                    ? '현재 진행 중인 게임이 없습니다.'
                    : '저장된 게임 이력이 없습니다.'}
                />
              )}
            </div>
          )}
        </aside>

        {view === 'errors' ? (
          <ErrorDetailPanel
            detail={errorDetail}
            loading={isErrorLoading}
            error={detailError}
          />
        ) : (
          <SessionDetailPanel
            session={selectedSession}
            active={view === 'active'}
            events={events}
            roundReplays={roundReplays}
            selectedEvent={selectedEvent}
            loading={isEventsLoading}
            replaysLoading={isReplaysLoading}
            error={detailError}
            replayError={replayError}
            onSelectEvent={setSelectedEventId}
            onOpenError={openError}
          />
        )}
      </main>
    </div>
  )
}

function SessionRow({
  game,
  active,
  selected,
  onClick,
}: {
  game: ActiveGame | ArchivedGame
  active: boolean
  selected: boolean
  onClick: () => void
}) {
  const activeGame = 'latestEventType' in game ? game : null
  const archived = 'finalStatus' in game ? game : null
  return (
    <button
      type="button"
      className={`admin-session-row${selected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <span className="admin-session-row__top">
        <i className={active ? 'is-live' : `is-${archived?.finalStatus.toLowerCase()}`} />
        <b>{game.roomTitle || '제목 없는 방'}</b>
        <time>{formatDateTime(activeGame?.lastEventAt ?? archived?.endedAt)}</time>
      </span>
      <span className="admin-session-row__meta">
        <code>{game.roomCode}</code>
        <span>STAGE {game.stageId}</span>
        {activeGame && <span>{activeGame.participantCount}명</span>}
      </span>
      <span className="admin-session-row__bottom">
        <code title={game.gameSessionId}>{shortId(game.gameSessionId)}</code>
        <em>{activeGame
          ? EVENT_LABELS[activeGame.latestEventType] ?? activeGame.latestEventType
          : FINAL_STATUS_LABELS[archived?.finalStatus ?? ''] ?? archived?.finalStatus}
        </em>
      </span>
    </button>
  )
}

function SessionDetailPanel({
  session,
  active,
  events,
  roundReplays,
  selectedEvent,
  loading,
  replaysLoading,
  error,
  replayError,
  onSelectEvent,
  onOpenError,
}: {
  session: ActiveGame | ArchivedGame | null
  active: boolean
  events: SessionEvent[]
  roundReplays: RoundReplay[]
  selectedEvent: SessionEvent | null
  loading: boolean
  replaysLoading: boolean
  error: string
  replayError: string
  onSelectEvent: (eventId: string) => void
  onOpenError: (errorId: string) => void
}) {
  if (!session) {
    return <section className="admin-detail-empty">왼쪽에서 게임 세션을 선택하세요.</section>
  }
  const activeSession = 'latestEventType' in session ? session : null
  const archived = 'finalStatus' in session ? session : null
  return (
    <section className="admin-session-detail">
      <header className="admin-session-heading">
        <div>
          <span>{active ? 'LIVE SESSION' : 'ARCHIVED SESSION'}</span>
          <h1>{session.roomTitle}</h1>
          <p>
            room <code>{session.roomCode}</code>
            <i />
            game <code title={session.gameSessionId}>{session.gameSessionId}</code>
          </p>
        </div>
        <span className={`admin-status-badge admin-status-badge--${
          active ? 'playing' : archived?.finalStatus.toLowerCase()
        }`}>
          {active ? 'PLAYING' : archived?.finalStatus}
        </span>
      </header>

      <div className="admin-session-facts">
        <div><span>스테이지</span><b>{session.stageId}</b></div>
        <div>
          <span>참가 인원</span>
          <b>{activeSession ? `${activeSession.participantCount}명` : '-'}</b>
        </div>
        <div><span>시작</span><b>{formatDateTime(session.startedAt)}</b></div>
        <div>
          <span>{active ? '최근 이벤트' : '종료'}</span>
          <b>{formatDateTime(activeSession?.lastEventAt ?? archived?.endedAt)}</b>
        </div>
        {!active && (
          <div>
            <span>결과</span>
            <b>{archived?.gameResult ?? '-'}</b>
          </div>
        )}
      </div>

      {!active && (
        <RoundReplayPanel
          replays={roundReplays}
          loading={replaysLoading}
          error={replayError}
        />
      )}

      {error && <p className="admin-detail-error" role="alert">{error}</p>}
      <div className={`admin-timeline-layout${selectedEvent ? ' has-inspector' : ''}`}>
        <div className="admin-timeline">
          <div className="admin-timeline__header">
            <div><span>EVENT STREAM</span><h2>이벤트 타임라인</h2></div>
            <b>{events.length} events</b>
          </div>
          {loading ? (
            <div className="admin-detail-loading">이벤트를 불러오는 중입니다.</div>
          ) : events.length === 0 ? (
            <div className="admin-detail-loading">기록된 SUMMARY 이벤트가 없습니다.</div>
          ) : (
            <ol>
              {events.map((event) => (
                <li
                  key={event.eventId}
                  className={EVENT_ACCENT_CLASSES[event.eventType]}
                >
                  <time>{formatTime(event.serverReceivedAt)}</time>
                  <i className={`is-${event.severity.toLowerCase()}`} />
                  <button
                    type="button"
                    className={selectedEvent?.eventId === event.eventId ? 'is-selected' : ''}
                    onClick={() => onSelectEvent(event.eventId)}
                  >
                    <span>
                      <strong>{EVENT_LABELS[event.eventType] ?? event.eventType}</strong>
                      <code>{event.eventType}</code>
                    </span>
                    <EventSummary summary={event.summary} />
                    <em>{event.result}</em>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {selectedEvent && (
          <EventInspector event={selectedEvent} onOpenError={onOpenError} />
        )}
      </div>
    </section>
  )
}

function EventSummary({ summary }: { summary: Record<string, unknown> }) {
  if (typeof summary.primaryReason === 'string') {
    const videoState = summary.videoState && typeof summary.videoState === 'object'
      ? summary.videoState as Record<string, unknown>
      : null
    return (
      <small className="admin-pose-failure-summary">
        <span><b>원인</b> {POSE_FAILURE_REASON_LABELS[summary.primaryReason] ?? summary.primaryReason}</span>
        {typeof summary.detectionAttempts === 'number' && (
          <span><b>감지</b> {String(summary.successfulDetections ?? 0)}/{String(summary.detectionAttempts)}</span>
        )}
        {videoState && <span><b>readyState</b> {String(videoState.readyState ?? '-')}</span>}
      </small>
    )
  }
  const entries = Object.entries(summary ?? {}).slice(0, 4)
  if (entries.length === 0) return <small>추가 요약 없음</small>
  return (
    <small>
      {entries.map(([key, value]) => (
        <span key={key}><b>{key}</b> {String(value)}</span>
      ))}
    </small>
  )
}

function RoundReplayPanel({
  replays,
  loading,
  error,
}: {
  replays: RoundReplay[]
  loading: boolean
  error: string
}) {
  const [selectedRoundNo, setSelectedRoundNo] = useState<number | null>(null)

  useEffect(() => {
    setSelectedRoundNo((current) =>
      replays.some((replay) => replay.roundNo === current)
        ? current
        : replays[0]?.roundNo ?? null)
  }, [replays])

  const selectedReplay = replays.find(
    (replay) => replay.roundNo === selectedRoundNo,
  ) ?? null

  return (
    <section className="admin-round-replays">
      <header>
        <div>
          <span>ROUND REPLAY</span>
          <h2>라운드 데이터</h2>
        </div>
        {replays.length > 0 && (
          <nav aria-label="리플레이 라운드 선택">
            {replays.map((replay) => (
              <button
                type="button"
                key={replay.roundNo}
                className={replay.roundNo === selectedRoundNo ? 'is-selected' : ''}
                onClick={() => setSelectedRoundNo(replay.roundNo)}
              >
                ROUND {replay.roundNo}
              </button>
            ))}
          </nav>
        )}
      </header>

      {loading ? (
        <p>라운드 데이터를 불러오는 중입니다.</p>
      ) : error ? (
        <p className="is-error" role="alert">{error}</p>
      ) : !selectedReplay ? (
        <p>저장된 라운드 데이터가 없습니다.</p>
      ) : (
        <div className="admin-round-replays__content">
          <CopyableCodeBlock
            label="POSES"
            value={JSON.stringify(selectedReplay.poses, null, 2)}
          />
          <CopyableCodeBlock
            label="SIMULATION RESULT"
            value={JSON.stringify(selectedReplay.simulation, null, 2)}
          />
        </div>
      )}
    </section>
  )
}

function EventInspector({
  event,
  onOpenError,
}: {
  event: SessionEvent
  onOpenError: (errorId: string) => void
}) {
  return (
    <aside className="admin-inspector">
      <div className="admin-inspector__eyebrow">EVENT DETAIL</div>
      <h2>{EVENT_LABELS[event.eventType] ?? event.eventType}</h2>
      {(event.eventType === 'POSE_CAPTURE_FAILED' || event.eventType === 'POSE_CAPTURE_TIMED_OUT') && (
        <PoseCaptureFailureDetail summary={event.summary} />
      )}
      <dl>
        <div><dt>이벤트 ID</dt><dd title={event.eventId}>{event.eventId}</dd></div>
        <div><dt>메시지 타입</dt><dd>{event.messageType ?? '-'}</dd></div>
        <div><dt>방향</dt><dd>{event.direction}</dd></div>
        <div><dt>처리 결과</dt><dd>{event.result}</dd></div>
        <div><dt>처리 시간</dt><dd>{event.durationMs == null ? '-' : `${event.durationMs}ms`}</dd></div>
        <div>
          <dt>Payload 크기</dt>
          <dd>{event.payloadSizeBytes == null ? '-' : `${event.payloadSizeBytes} bytes`}</dd>
        </div>
        <div><dt>사용자</dt><dd title={event.actorId ?? ''}>{shortId(event.actorId)}</dd></div>
        <div><dt>서버 수신</dt><dd>{formatDateTime(event.serverReceivedAt)}</dd></div>
      </dl>
      <CopyableCodeBlock
        label="SUMMARY"
        value={JSON.stringify(event.summary, null, 2)}
      />
      {event.errorId && (
        <button
          type="button"
          className="admin-open-error"
          onClick={() => onOpenError(event.errorId!)}
        >
          상세 오류 열기
          <code>{shortId(event.errorId)}</code>
        </button>
      )}
    </aside>
  )
}

function PoseCaptureFailureDetail({ summary }: { summary: Record<string, unknown> }) {
  const primaryReason = typeof summary.primaryReason === 'string'
    ? summary.primaryReason
    : 'NO_VALID_POSE'
  const videoState = summary.videoState && typeof summary.videoState === 'object'
    ? summary.videoState as Record<string, unknown>
    : null
  return (
    <section className="admin-pose-failure-detail" role="status">
      <strong>{POSE_FAILURE_REASON_LABELS[primaryReason] ?? primaryReason}</strong>
      <dl>
        <div><dt>촬영 번호</dt><dd>{String(summary.captureNo ?? '-')}</dd></div>
        {typeof summary.detectionAttempts === 'number' && (
          <div><dt>감지 성공/시도</dt><dd>{String(summary.successfulDetections ?? 0)} / {String(summary.detectionAttempts)}</dd></div>
        )}
        {typeof summary.cameraOn === 'boolean' && (
          <div><dt>카메라 활성</dt><dd>{summary.cameraOn ? '예' : '아니요'}</dd></div>
        )}
        {typeof summary.poseModelLoading === 'boolean' && (
          <div><dt>모델 로딩</dt><dd>{summary.poseModelLoading ? '진행 중' : '완료'}</dd></div>
        )}
        {videoState && <div><dt>비디오 readyState</dt><dd>{String(videoState.readyState ?? '-')}</dd></div>}
        {typeof summary.exceptionName === 'string' && (
          <div><dt>예외 종류</dt><dd>{summary.exceptionName}</dd></div>
        )}
      </dl>
    </section>
  )
}

function ErrorDetailPanel({
  detail,
  loading,
  error,
}: {
  detail: ErrorDetail | null
  loading: boolean
  error: string
}) {
  if (loading) return <section className="admin-detail-empty">오류 상세를 불러오는 중입니다.</section>
  if (error) return <section className="admin-detail-empty is-error">{error}</section>
  if (!detail) return <section className="admin-detail-empty">왼쪽에서 오류를 선택하세요.</section>

  return (
    <section className="admin-error-detail">
      <header>
        <div>
          <span>ERROR DETAIL</span>
          <h1>{detail.errorCode ?? 'INTERNAL ERROR'}</h1>
          <p>{detail.exceptionClass}</p>
        </div>
        <b>{detail.severity}</b>
      </header>
      <div className="admin-error-message">{detail.message}</div>
      <dl>
        <div><dt>errorId</dt><dd>{detail.errorId}</dd></div>
        <div><dt>source</dt><dd>{detail.source}</dd></div>
        <div><dt>gameSessionId</dt><dd>{detail.gameSessionId ?? '-'}</dd></div>
        <div><dt>roomSessionId</dt><dd>{detail.roomSessionId ?? '-'}</dd></div>
        <div><dt>userId</dt><dd>{detail.userId ?? '-'}</dd></div>
        <div><dt>requestId</dt><dd>{detail.requestId ?? '-'}</dd></div>
        <div><dt>traceId</dt><dd>{detail.traceId ?? '-'}</dd></div>
        <div><dt>발생 시각</dt><dd>{formatDateTime(detail.createdAt)}</dd></div>
      </dl>
      <div className="admin-error-grid">
        <CopyableCodeBlock
          label="CONTEXT"
          value={JSON.stringify(detail.context ?? {}, null, 2)}
        />
        <CopyableCodeBlock
          label="STACK TRACE"
          value={detail.stackTrace ?? ''}
          emptyMessage="저장된 stack trace가 없습니다."
          variant="stack"
        />
      </div>
    </section>
  )
}

function CopyableCodeBlock({
  label,
  value,
  emptyMessage = '표시할 내용이 없습니다.',
  variant = 'json',
}: {
  label: string
  value: string
  emptyMessage?: string
  variant?: 'json' | 'stack'
}) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')

  useEffect(() => {
    if (copyStatus === 'idle') return
    const timer = window.setTimeout(() => setCopyStatus('idle'), 1800)
    return () => window.clearTimeout(timer)
  }, [copyStatus])

  const copy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  return (
    <div className={variant === 'stack' ? 'admin-stack-block' : 'admin-json-block'}>
      <div className="admin-code-block__header">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!value}
          aria-label={`${label} 내용 복사`}
        >
          {copyStatus === 'copied' ? '복사됨' : copyStatus === 'failed' ? '복사 실패' : '복사'}
        </button>
      </div>
      <pre>{value || emptyMessage}</pre>
    </div>
  )
}

function EmptyList({ message }: { message: string }) {
  return (
    <div className="admin-list-empty">
      <i />
      <p>{message}</p>
    </div>
  )
}
