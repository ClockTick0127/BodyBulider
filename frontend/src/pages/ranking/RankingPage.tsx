import { useCallback, useEffect, useState } from 'react'
import {
  getMyRanking,
  getStageRanking,
  type MyRankingSummary,
  type StageRankingEntry,
} from '../../features/records/services/recordsApi'
import {
  getStages,
  toStageCode,
  type StageListItem,
} from '../../features/stages/services/stagesApi'
import { AppHeader } from '../../shared/components/AppHeader'
import { PageHeaderWithBack } from '../../shared/components/PageHeaderWithBack'
import { ProfileCard } from '../../shared/components/ProfileCard'
import { formatClearTime } from '../../shared/utils/formatClearTime'
import { JourneyDuckDecor } from '../../shared/components/JourneyDuckDecor'

type Tab = 'all' | number

/** 전체보기 카드 1개 = 스테이지 + 그 스테이지 1위 기록 */
type SummaryItem = {
  stage: StageListItem
  topEntry: StageRankingEntry | null
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback

export function RankingPage() {
  const [tab, setTab] = useState<Tab>('all')

  const [summary, setSummary] = useState<SummaryItem[] | null>(null)
  const [summaryError, setSummaryError] = useState('')
  const [isSummaryLoading, setIsSummaryLoading] = useState(true)
  const [myRanking, setMyRanking] = useState<MyRankingSummary | null>(null)

  const [board, setBoard] = useState<StageRankingEntry[] | null>(null)
  const [boardError, setBoardError] = useState('')
  const [isBoardLoading, setIsBoardLoading] = useState(false)

  /**
   * 전체보기 전용 API가 없으므로 스테이지 목록을 먼저 조회한 뒤,
   * 각 스테이지의 1위만 limit=1로 병렬 조회해 조합한다.
   */
  const loadSummary = useCallback(() => {
    setIsSummaryLoading(true)
    setSummaryError('')
    Promise.all([
      getStages(),
      getMyRanking().catch(() => null),
    ])
      .then(async ([stages, ranking]) => {
        setMyRanking(ranking)
        const tops = await Promise.all(
          stages.map((stage) =>
            getStageRanking(stage.stageId, 1).catch(() => [] as StageRankingEntry[]),
          ),
        )
        return stages.map((stage, index) => ({ stage, topEntry: tops[index][0] ?? null }))
      })
      .then(setSummary)
      .catch((cause: unknown) => setSummaryError(messageOf(cause, '랭킹을 불러오지 못했습니다.')))
      .finally(() => setIsSummaryLoading(false))
  }, [])

  useEffect(loadSummary, [loadSummary])

  // 스테이지 탭을 열 때마다 해당 보드를 새로 조회한다.
  // 조회 상태는 탭마다 초기화되어, 이전 탭의 오류 문구가 남지 않는다.
  const loadBoard = useCallback((stageId: number) => {
    setIsBoardLoading(true)
    setBoardError('')
    setBoard(null)
    let cancelled = false
    getStageRanking(stageId)
      .then((entries) => { if (!cancelled) setBoard(entries) })
      .catch((cause: unknown) => {
        if (!cancelled) setBoardError(messageOf(cause, '랭킹을 불러오지 못했습니다.'))
      })
      .finally(() => { if (!cancelled) setIsBoardLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (tab === 'all') {
      setBoard(null)
      setBoardError('')
      setIsBoardLoading(false)
      return
    }
    return loadBoard(tab)
  }, [tab, loadBoard])

  const selectedStage = tab === 'all'
    ? null
    : summary?.find((item) => item.stage.stageId === tab)?.stage ?? null
  const selectedMyRanking = tab === 'all'
    ? null
    : myRanking?.stages.find((stage) => stage.stageId === tab) ?? null
  const profileRank = tab === 'all'
    ? myRanking?.bestRank ?? null
    : selectedMyRanking?.rank ?? null
  const profileStages = tab === 'all'
    ? myRanking?.bestStages ?? []
    : selectedMyRanking ? [selectedMyRanking] : []

  return (
    <div className="record-page">
      <JourneyDuckDecor />
      <AppHeader />
      <PageHeaderWithBack />
      <main className="record-layout">
        <section aria-label="랭킹">
          <div className="rank-tabs" role="tablist" aria-label="랭킹 맵 선택">
            <button
              className={`rank-tab${tab === 'all' ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              onClick={() => setTab('all')}
            >
              전체보기
            </button>
            {summary?.map(({ stage }) => (
              <button
                key={stage.stageId}
                className={`rank-tab${tab === stage.stageId ? ' is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={tab === stage.stageId}
                onClick={() => setTab(stage.stageId)}
              >
                {stage.name}
              </button>
            ))}
          </div>

          {/* 전체보기 */}
          {tab === 'all' && (
            <div className="record-card">
              <div className="record-card__head">
                <h2>전체 랭킹</h2>
              </div>
              {summaryError && (
                <p className="record-error" role="alert">
                  {summaryError}
                  <button className="record-retry" type="button" onClick={loadSummary}>다시 시도</button>
                </p>
              )}
              {isSummaryLoading && !summaryError && <p className="record-loading">랭킹을 불러오는 중…</p>}
              {!isSummaryLoading && !summaryError && summary && (
                summary.length === 0 ? (
                  <p className="record-loading">등록된 맵이 없습니다.</p>
                ) : (
                  <ul className="board-summary">
                    {summary.map(({ stage, topEntry }) => (
                      <li key={stage.stageId} className="board-card">
                        <span className="board-card__chip">{toStageCode(stage.stageId)}</span>
                        <span className="board-card__info">
                          <strong>{topEntry ? `1위 : ${topEntry.nickname}` : '아직 기록이 없습니다'}</strong>
                          <small>
                            맵: {stage.name}
                            {topEntry && ` · 기록 ${formatClearTime(topEntry.stageClearTimeMs)}`}
                          </small>
                        </span>
                        <button className="board-card__go" type="button" onClick={() => setTab(stage.stageId)}>
                          바로가기
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          )}

          {/* 스테이지별 랭킹 */}
          {tab !== 'all' && (
            <div className="record-card">
              {boardError && (
                <p className="record-error" role="alert">
                  {boardError}
                  <button className="record-retry" type="button" onClick={() => loadBoard(tab)}>다시 시도</button>
                </p>
              )}
              {isBoardLoading && !boardError && <p className="record-loading">랭킹을 불러오는 중…</p>}

              {!isBoardLoading && !boardError && board && (
                <>
                  <div className="record-card__head">
                    <h2>{selectedStage?.name ?? '스테이지 랭킹'}</h2>
                    {board.length > 0 && <span className="ranking-badge">TOP {board.length}</span>}
                  </div>
                  {board.length === 0 ? (
                    <p className="record-loading">아직 등록된 기록이 없습니다.</p>
                  ) : (
                    <ol className="board-list">
                      {board.map((entry) => (
                        <li
                          key={entry.uuid}
                          className={`board-row${entry.rank <= 3 ? ' board-row--top' : ''}`}
                        >
                          <span className="board-row__rank">{entry.rank}</span>
                          <span className="board-row__nickname">{entry.nickname}</span>
                          <b className="board-row__time">{formatClearTime(entry.stageClearTimeMs)}</b>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </div>
          )}
        </section>
        <ProfileCard
          rankLabel={tab === 'all' ? '현재 최고 순위' : `나의 순위 · ${selectedStage?.name ?? ''}`}
          rank={profileRank}
          stages={profileStages}
          rankUnavailable={myRanking == null}
        />
      </main>
    </div>
  )
}
