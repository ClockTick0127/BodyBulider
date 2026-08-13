import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../shared/components/AppHeader'
import { CreateRoomModal } from '../../features/rooms/components/CreateRoomModal'
import { createRoom } from '../../features/rooms/services/roomsApi'
import { MapCard, MyMapCard } from '../../features/workshop/components/MapCard'
import { MapDetailModal } from '../../features/workshop/components/MapDetailModal'
import { NewMapModal } from '../../features/workshop/components/NewMapModal'
import {
  DIFFICULTIES,
  getCustomMap,
  getCustomMaps,
  getMyCustomMaps,
  setCustomMapVisibility,
  type CustomMapDifficulty,
  type CustomMapSummary,
} from '../../features/workshop/services/customMapApi'
import './WorkshopPage.css'
import { JourneyDuckDecor } from '../../shared/components/JourneyDuckDecor'

type WorkshopTab = 'browse' | 'mine'
type DifficultyFilter = '전체' | CustomMapDifficulty

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback

export function WorkshopPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<WorkshopTab>('browse')

  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('전체')

  const [publicMaps, setPublicMaps] = useState<CustomMapSummary[] | null>(null)
  const [publicError, setPublicError] = useState('')
  const [isPublicLoading, setIsPublicLoading] = useState(true)

  const [myMaps, setMyMaps] = useState<CustomMapSummary[] | null>(null)
  const [myError, setMyError] = useState('')
  const [isMyLoading, setIsMyLoading] = useState(true)

  const [detailMap, setDetailMap] = useState<CustomMapSummary | null>(null)
  const [isNewMapOpen, setIsNewMapOpen] = useState(false)
  /** 방을 만들 대상 맵. null이면 방 만들기 모달을 닫는다. */
  const [roomMap, setRoomMap] = useState<CustomMapSummary | null>(null)
  const [togglingStageId, setTogglingStageId] = useState<number | null>(null)
  const [toast, setToast] = useState('')

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }, [])

  /**
   * 검색·난이도는 서버 쿼리 파라미터다. 입력할 때마다 요청이 나가지 않도록
   * 300ms 디바운스한 뒤 조회한다.
   */
  const loadPublicMaps = useCallback((query: { search: string; difficulty: DifficultyFilter }) => {
    setIsPublicLoading(true)
    setPublicError('')
    let cancelled = false
    getCustomMaps({
      search: query.search,
      difficulty: query.difficulty === '전체' ? undefined : query.difficulty,
    })
      .then((maps) => { if (!cancelled) setPublicMaps(maps) })
      .catch((cause: unknown) => {
        if (!cancelled) setPublicError(messageOf(cause, '맵 목록을 불러오지 못했습니다.'))
      })
      .finally(() => { if (!cancelled) setIsPublicLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cleanup: (() => void) | undefined
    const timer = window.setTimeout(() => {
      cleanup = loadPublicMaps({ search, difficulty })
    }, 300)
    return () => {
      window.clearTimeout(timer)
      cleanup?.()
    }
  }, [search, difficulty, loadPublicMaps])

  const loadMyMaps = useCallback(() => {
    setIsMyLoading(true)
    setMyError('')
    getMyCustomMaps()
      .then(setMyMaps)
      .catch((cause: unknown) => setMyError(messageOf(cause, '내 맵을 불러오지 못했습니다.')))
      .finally(() => setIsMyLoading(false))
  }, [])

  useEffect(loadMyMaps, [loadMyMaps])

  const myMapCount = myMaps?.length ?? 0

  const handleTogglePublic = async (map: CustomMapSummary) => {
    setTogglingStageId(map.stageId)
    try {
      const updated = await setCustomMapVisibility(map.stageId, !map.isPublic)
      setMyMaps((prev) =>
        prev?.map((item) =>
          item.stageId === map.stageId ? { ...item, isPublic: updated.isPublic } : item,
        ) ?? prev,
      )
      // 공개 상태가 바뀌면 탐색 목록의 구성도 달라진다.
      loadPublicMaps({ search, difficulty })
      showToast(updated.isPublic ? '공개로 변경되었습니다.' : '비공개로 변경되었습니다.')
    } catch (cause) {
      showToast(messageOf(cause, '공개 설정을 바꾸지 못했습니다.'))
    } finally {
      setTogglingStageId(null)
    }
  }

  /** 내 맵 카드에서 상세를 열 때는 목록 요약만 있으면 충분하다. */
  const openDetail = (map: CustomMapSummary) => setDetailMap(map)

  const openDetailById = async (stageId: number) => {
    try {
      setDetailMap(await getCustomMap(stageId))
    } catch (cause) {
      showToast(messageOf(cause, '맵 정보를 불러오지 못했습니다.'))
    }
  }

  const handleCreateRoom = async (title: string, password: string | null) => {
    if (!roomMap) return
    // stageId 를 실어 보내야 서버가 이 방을 창작마당 방으로 만든다. (커스텀 맵은 10000 이상)
    const room = await createRoom({ title, password, stageId: roomMap.stageId })
    setRoomMap(null)
    /*
     * 로비는 방 정보(room)만으로도 창작마당 방인지 판별할 수 있지만(selectedStageId >= 10000),
     * 맵 상세를 함께 넘겨 두면 진입 즉시 이름·난이도를 그릴 수 있어 깜빡임이 없다.
     * 새로고침이나 코드로 들어온 참가자는 로비가 stageId 로 다시 조회한다.
     */
    navigate(`/rooms/${room.roomCode}`, {
      state: { room, isWorkshopRoom: true, customMap: roomMap },
    })
  }

  const filterChips = useMemo<DifficultyFilter[]>(() => ['전체', ...DIFFICULTIES], [])

  return (
    <div className="workshop-page">
      <JourneyDuckDecor />
      <AppHeader />

      <main className="workshop-layout">
        <header className="workshop-head">
          <div>
            <p className="workshop-head__kicker">02 — WORKSHOP</p>
            <h1>창작마당</h1>
            <p className="workshop-head__lead">
              유저가 만든 맵을 탐색하고, 나만의 맵을 만들어보세요.
            </p>
          </div>
          <button
            className="workshop-button workshop-button--accent"
            type="button"
            onClick={() => setIsNewMapOpen(true)}
          >
            + 새 맵 만들기
          </button>
        </header>

        <div className="workshop-tabs" role="tablist" aria-label="창작마당 탭">
          <button
            className={`workshop-tab${tab === 'browse' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={tab === 'browse'}
            onClick={() => setTab('browse')}
          >
            공개 맵 탐색
          </button>
          <button
            className={`workshop-tab${tab === 'mine' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={tab === 'mine'}
            onClick={() => setTab('mine')}
          >
            내 맵 ({myMapCount})
          </button>
        </div>

        {tab === 'browse' && (
          <section className="workshop-panel" aria-label="공개 맵 탐색">
            <div className="workshop-filters">
              <label className="workshop-search">
                <span className="sr-only">맵 이름 또는 제작자 검색</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="맵 이름 또는 제작자 검색"
                  type="search"
                />
              </label>
              <div className="workshop-chips">
                {filterChips.map((level) => (
                  <button
                    key={level}
                    className={`workshop-chip${difficulty === level ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={difficulty === level}
                    onClick={() => setDifficulty(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <p className="workshop-count">{publicMaps?.length ?? 0}개의 맵</p>
            </div>

            {publicError && (
              <p className="workshop-error" role="alert">
                {publicError}
                <button type="button" onClick={() => loadPublicMaps({ search, difficulty })}>
                  다시 시도
                </button>
              </p>
            )}
            {isPublicLoading && !publicError && <p className="workshop-loading">맵을 불러오는 중…</p>}
            {!isPublicLoading && !publicError && publicMaps && (
              publicMaps.length === 0 ? (
                <div className="workshop-empty">
                  <strong>검색 결과가 없습니다.</strong>
                  <span>필터를 변경하거나 직접 맵을 만들어보세요!</span>
                </div>
              ) : (
                <div className="workshop-grid">
                  {publicMaps.map((map) => (
                    <MapCard key={map.stageId} map={map} onClick={() => openDetail(map)} />
                  ))}
                </div>
              )
            )}
          </section>
        )}

        {tab === 'mine' && (
          <section className="workshop-panel" aria-label="내 맵">
            <div className="workshop-mine-head">
              <p>내가 만든 맵 목록입니다. 편집하거나 공개 여부를 변경할 수 있어요.</p>
              <button
                className="workshop-button workshop-button--ghost"
                type="button"
                onClick={() => setIsNewMapOpen(true)}
              >
                + 새로 만들기
              </button>
            </div>

            {myError && (
              <p className="workshop-error" role="alert">
                {myError}
                <button type="button" onClick={loadMyMaps}>다시 시도</button>
              </p>
            )}
            {isMyLoading && !myError && <p className="workshop-loading">내 맵을 불러오는 중…</p>}
            {!isMyLoading && !myError && myMaps && (
              myMaps.length === 0 ? (
                <div className="workshop-empty">
                  <strong>아직 만든 맵이 없습니다.</strong>
                  <span>새 맵 만들기로 첫 맵을 만들어보세요!</span>
                </div>
              ) : (
                <div className="workshop-grid">
                  {myMaps.map((map) => (
                    <MyMapCard
                      key={map.stageId}
                      map={map}
                      isToggling={togglingStageId === map.stageId}
                      onOpenDetail={() => openDetailById(map.stageId)}
                      onTogglePublic={() => handleTogglePublic(map)}
                      onEdit={() => navigate(`/workshop/editor?stageId=${map.stageId}`)}
                    />
                  ))}
                </div>
              )
            )}
          </section>
        )}
      </main>

      {detailMap && (
        <MapDetailModal
          map={detailMap}
          onClose={() => setDetailMap(null)}
          onCreateRoom={(map) => {
            setDetailMap(null)
            setRoomMap(map)
          }}
        />
      )}

      {isNewMapOpen && (
        <NewMapModal
          onClose={() => setIsNewMapOpen(false)}
          onConfirm={(title) => {
            setIsNewMapOpen(false)
            navigate(`/workshop/editor?title=${encodeURIComponent(title)}`)
          }}
        />
      )}

      {roomMap && (
        <CreateRoomModal
          defaultTitle={`${roomMap.title} 방`}
          selectedMapLabel={roomMap.title}
          onClose={() => setRoomMap(null)}
          onSubmit={handleCreateRoom}
        />
      )}

      {toast && <p className="workshop-toast" role="status">{toast}</p>}
    </div>
  )
}
