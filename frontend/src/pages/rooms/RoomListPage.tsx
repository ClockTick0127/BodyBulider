import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { quickStartRoom } from '../../features/rooms/services/roomsApi'
import { disconnectRetainedRoomSocket } from '../../features/rooms/hooks/useRoomSocket'
import { disconnectRetainedGameSocket } from '../../features/game/hooks/useGameSocket'
import { ProfileMenu } from '../../shared/components/ProfileMenu'
import { BgmToggleButton } from '../../shared/components/BgmToggleButton'
import { TopNav } from '../../shared/components/TopNav'
import { useBgm } from '../../shared/hooks/useBgm'
import { ApiError } from '../../shared/api/request'
import logoHorizontal from '../../assets/BodyBuilder_Horizontal.png'
import noMapExist from '../../assets/no-map-exist.png'
import {
  createRoom,
  getWaitingRooms,
  joinRoom,
  type QuickStartResult,
  type RoomSummary,
} from '../../features/rooms/services/roomsApi'
import { CreateRoomModal } from '../../features/rooms/components/CreateRoomModal'
import { JoinPasswordModal } from '../../features/rooms/components/JoinPasswordModal'
import { JourneyDuckDecor } from '../../shared/components/JourneyDuckDecor'

function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10M6 10h12v10H6z" /><circle cx="12" cy="15" r="1" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 10V7.5a4.5 4.5 0 0 0-8.7-1.6M6 10h12v10H6z" /><circle cx="12" cy="15" r="1" /></svg>
  )
}

function UsersIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3.5 19c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M15 14c3.1 0 4.8 1.6 5 5" /></svg>
}

export function RoomListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const justLeft = (location.state as { justLeft?: { roomCode: string; isHost: boolean; participantCount: number } } | null)?.justLeft

  const { isBgmOn, toggleBgm } = useBgm('/sounds/RoomListPage_bgm.mp3')
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [isQuickMatching, setIsQuickMatching] = useState(false)

  const [roomCode, setRoomCode] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  /** 비밀번호 입력이 필요한 방 (비밀방 클릭 시 설정) */
  const [secretRoom, setSecretRoom] = useState<RoomSummary | null>(null)

  const availableCount = useMemo(
    () => rooms.filter((room) => room.currentCapacity < room.maxCapacity).length,
    [rooms],
  )

  const applyJustLeftFilter = useCallback(
    (fetchedRooms: RoomSummary[]): RoomSummary[] => {
      if (!justLeft) return fetchedRooms
      const code = justLeft.roomCode.toUpperCase()
      return fetchedRooms
        .filter((room) => {
          // 퇴장 당시 남아있던 인원이 1명 이하(퇴장으로 인해 0명이 되어 해제)인 경우에만 방 목록에서 제거
          if (justLeft.participantCount <= 1 && room.roomCode.toUpperCase() === code) {
            return false
          }
          return true
        })
        .map((room) => {
          // 다른 참가자가 남아있는 경우 내 인원(-1) 차감 반영
          if (room.roomCode.toUpperCase() === code) {
            return {
              ...room,
              currentCapacity: Math.max(1, Math.min(room.currentCapacity, justLeft.participantCount - 1)),
            }
          }
          return room
        })
    },
    [justLeft],
  )

  const loadRooms = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const fetched = await getWaitingRooms()
      setRooms(applyJustLeftFilter(fetched))
    } catch {
      setLoadError('방 목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [applyJustLeftFilter])

  useEffect(() => {
    void disconnectRetainedRoomSocket()
    void disconnectRetainedGameSocket()
    void loadRooms()

    // 배포 서버의 소켓 해제 수신 지연(1~3초) 보완용 700ms 백그라운드 재조회
    const timer = setTimeout(() => {
      getWaitingRooms()
        .then((latest) => setRooms(applyJustLeftFilter(latest)))
        .catch(() => {})
    }, 700)

    return () => clearTimeout(timer)
  }, [loadRooms, applyJustLeftFilter])

  /** 입장 성공 시 방 대기실로 이동. 응답 전체를 라우트 state로 넘겨 재조회를 아낀다. */
  const enterRoom = (room: QuickStartResult) => {
    navigate(`/rooms/${room.roomCode}`, { state: { title: room.title, room } })
  }

  /**
   * 입장 실패 코드별 처리.
   * RM003(비밀번호 불일치)은 모달을 유지해야 하므로 예외를 그대로 다시 던진다.
   */
  const handleJoinError = (error: unknown, options: { keepPasswordModal?: boolean } = {}) => {
    const code = error instanceof ApiError ? error.code : null

    if (code === 'RM003') {
      if (options.keepPasswordModal) throw new Error('비밀번호가 일치하지 않습니다. 다시 입력해주세요.')
      setMessage('비밀번호가 일치하지 않습니다. 다시 입력해주세요.')
      return
    }
    if (code === 'RM004') {
      setSecretRoom(null)
      setMessage('방 정원이 초과되어 입장할 수 없습니다.')
      void loadRooms()
      return
    }
    if (code === 'RM001') {
      setSecretRoom(null)
      setMessage('존재하지 않거나 이미 종료된 방입니다.')
      void loadRooms()
      return
    }
    setSecretRoom(null)
    setMessage(error instanceof Error ? error.message : '방에 입장하지 못했습니다.')
  }

  /** 방 카드 클릭: 공개방은 바로 입장, 비밀방은 비밀번호 모달을 띄운다. */
  const handleRoomClick = async (room: RoomSummary) => {
    if (room.isSecret) {
      setMessage('')
      setSecretRoom(room)
      return
    }
    setMessage('')
    try {
      enterRoom(await joinRoom({ roomCode: room.roomCode, password: null }))
    } catch (error) {
      handleJoinError(error)
    }
  }

  /** 비밀방 비밀번호 제출. 실패 시 예외를 던져 모달을 유지한다. */
  const handleSecretSubmit = async (password: string) => {
    if (!secretRoom) return
    try {
      const result = await joinRoom({ roomCode: secretRoom.roomCode, password })
      setSecretRoom(null)
      enterRoom(result)
    } catch (error) {
      handleJoinError(error, { keepPasswordModal: true })
    }
  }

  /** 방 코드 직접 입력 입장 */
  const handleCodeJoin = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    const code = roomCode.toUpperCase()
    const known = rooms.find((room) => room.roomCode.toUpperCase() === code)
    if (known?.isSecret) {
      setSecretRoom(known)
      return
    }
    try {
      enterRoom(await joinRoom({ roomCode: code, password: null }))
    } catch (error) {
      handleJoinError(error)
    }
  }

  const handleCreate = async (title: string, password: string | null) => {
    const created = await createRoom({ title, password })
    setIsCreateOpen(false)
    enterRoom(created)
  }

  const quickMatch = async () => {
    setIsQuickMatching(true)
    setMessage('')
    try {
      const room = await quickStartRoom()
      navigate(`/rooms/${room.roomCode}`, { state: { room } })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '퀵매치 방 입장에 실패했습니다.')
    } finally {
      setIsQuickMatching(false)
    }
  }

  return (
    <main className="room-page">
      <div className="room-riverside" aria-hidden="true">
        <i className="room-riverside__far-bank" />
        <i className="room-riverside__water" />
        <i className="room-riverside__near-bank" />
      </div>
      <JourneyDuckDecor variant="riverside" />
      <div className="room-page__grid" />
      <header className="room-header">
        <Link className="room-brand" to="/" aria-label="메인 화면으로 이동">
          <img src={logoHorizontal} alt="Body Builder" className="room-brand__logo" />
        </Link>
        {/* 고정 라벨(LOBBY 모집)이던 자리를 최상위 네비로 바꿔 창작마당 진입 경로를 만든다. */}
        <TopNav />
        <div className="room-profile" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BgmToggleButton isBgmOn={isBgmOn} onToggle={toggleBgm} />
          <ProfileMenu triggerAriaLabel="프로필 메뉴 열기" align="right" />
        </div>
      </header>

      <section className="room-shell" aria-labelledby="lobby-title">
        <div className="room-shell__heading">
          <div><span className="section-kicker">01 — FIND YOUR TEAM</span><h1 id="lobby-title">함께할 방을 찾아보세요</h1></div>
          <div className="room-summary"><strong>{availableCount}</strong><span>개의 방에<br />지금 참여 가능</span></div>
        </div>

        {message && <div className="room-toast" role="status"><span>!</span>{message}<button onClick={() => setMessage('')} aria-label="알림 닫기">×</button></div>}

        <div className="room-layout">
          <section className="room-list-section" aria-label="현재 개설된 방 목록">
            <div className="list-toolbar">
              <span>OPEN ROOMS</span>
              <span className="list-toolbar__right">
                {rooms.length.toString().padStart(2, '0')} ROOMS
                <button className="room-refresh" type="button" onClick={() => void loadRooms()} disabled={isLoading}>
                  {isLoading ? '불러오는 중…' : '↻ 새로고침'}
                </button>
              </span>
            </div>

            <div className="room-list">
              {isLoading && <p className="room-empty">방 목록을 불러오는 중…</p>}
              {!isLoading && loadError && <p className="room-empty room-empty--error" role="alert">{loadError}</p>}
              {!isLoading && !loadError && rooms.length === 0 && (
                <div className="room-empty-visual">
                  <img
                    className="room-empty-visual__image"
                    src={noMapExist}
                    alt=""
                  />
                  <p className="room-empty-visual__message">아직 참가할 수 있는 방이 없네요!</p>
                </div>
              )}

              {!isLoading && !loadError && rooms.map((room, index) => {
                const isFull = room.currentCapacity >= room.maxCapacity
                return (
                  <article className={`room-card ${room.isSecret ? 'room-card--yellow' : ''} ${isFull ? 'is-disabled' : ''}`} key={room.roomId}>
                    <div className="room-card__number">{String(index + 1).padStart(2, '0')}</div>
                    <div className="room-card__symbol" aria-hidden="true">{room.isSecret ? '🔒' : '⌁'}</div>
                    <div className="room-card__content">
                      <div className="room-card__title">
                        <h2>{room.title}</h2>
                        <span className={`room-status ${isFull ? 'room-status--playing' : ''}`}>{isFull ? '정원 초과' : '참여 가능'}</span>
                      </div>
                      <p>방장: {room.hostNickname}</p>
                      <div className="room-card__meta">
                        <span><UsersIcon /> {room.currentCapacity} / {room.maxCapacity}</span>
                        <span className="privacy"><LockIcon locked={room.isSecret} /> {room.isSecret ? 'PRIVATE' : 'PUBLIC'}</span>
                        <span>CODE {room.roomCode}</span>
                      </div>
                    </div>
                    <button
                      className="room-card__join"
                      type="button"
                      disabled={isFull}
                      onClick={() => void handleRoomClick(room)}
                      aria-label={`${room.title} 방 입장`}
                    >
                      →
                    </button>
                  </article>
                )
              })}
            </div>
          </section>

          <aside className="room-actions">
            <div className="action-card action-card--join">
              <div className="action-card__heading"><span className="action-icon action-icon--plus">＋</span><div><small>NEW ADVENTURE</small><h2>방 만들기</h2></div></div>
              <p className="privacy-hint"><span /> 제목을 정하고 비밀방 여부를 선택할 수 있어요.</p>
              <button className="action-submit action-submit--blue" type="button" onClick={() => setIsCreateOpen(true)}>
                방 만들기 <span>＋</span>
              </button>
            </div>

            <div className="action-card action-card--quick">
              <div className="action-card__heading"><span className="action-icon action-icon--quick">↯</span><div><small>QUICK MATCH</small><h2>빠른 매칭</h2></div></div>
              <p className="privacy-hint"><span /> 참여 가능한 방을 자동으로 찾아드려요.</p>
              <button className="quick-match-button" type="button" onClick={quickMatch} disabled={isQuickMatching}>
                {isQuickMatching ? '매칭 중...' : '빠른 매칭'} <span aria-hidden="true">→</span>
              </button>
            </div>

            <form className="action-card" onSubmit={handleCodeJoin}>
              <div className="action-card__heading"><span className="action-icon">⌘</span><div><small>QUICK JOIN</small><h2>방 코드로 입장</h2></div></div>
              <label htmlFor="room-code">방 코드 <span>4 CHARACTERS</span></label>
              <input
                id="room-code"
                className="code-input"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase())}
                placeholder="A B C D"
                maxLength={4}
                autoComplete="off"
              />
              <button className="action-submit action-submit--yellow" disabled={roomCode.length !== 4}>입장하기 <span>→</span></button>
            </form>
          </aside>
        </div>
      </section>

      <footer className="room-footer"><span>© 2026 SYNCUP</span><span>BUILD TOGETHER, PLAY TOGETHER</span><span>VER 1.0.0</span></footer>

      {isCreateOpen && <CreateRoomModal onClose={() => setIsCreateOpen(false)} onSubmit={handleCreate} />}
      {secretRoom && (
        <JoinPasswordModal
          roomTitle={secretRoom.title}
          onClose={() => setSecretRoom(null)}
          onSubmit={handleSecretSubmit}
        />
      )}
    </main>
  )
}
