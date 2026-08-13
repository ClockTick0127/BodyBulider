import { useCallback, useEffect, useState } from 'react'
import {
  getMyRanking,
  getMyRecords,
  type MyRankingSummary,
} from '../../features/records/services/recordsApi'
import { StageRecordModal } from '../../features/records/components/StageRecordModal'
import {
  getStages,
  toStageCode,
  type StageListItem,
} from '../../features/stages/services/stagesApi'
import { AppHeader } from '../../shared/components/AppHeader'
import { PageHeaderWithBack } from '../../shared/components/PageHeaderWithBack'
import { ProfileCard } from '../../shared/components/ProfileCard'
import { formatClearTime } from '../../shared/utils/formatClearTime'
import { formatClearedAt } from '../../shared/utils/formatClearedAt'
import { JourneyDuckDecor } from '../../shared/components/JourneyDuckDecor'

/** 스테이지 목록 + 내 최고기록을 합친 한 줄. 미클리어면 기록이 null이다. */
type StageRow = {
  stageId: number
  name: string
  bestTimeMs: number | null
  clearedAt: string | null
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback

export function MyPage() {
  const [rows, setRows] = useState<StageRow[] | null>(null)
  const [myRanking, setMyRanking] = useState<MyRankingSummary | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // 스테이지를 고르면 역대 기록 모달을 띄운다.
  const [selectedStage, setSelectedStage] = useState<StageRow | null>(null)

  /**
   * 내 최고기록 API는 클리어한 스테이지만 내려준다.
   * 미클리어 스테이지까지 보여주기 위해 스테이지 목록과 조합한다.
   */
  const loadRecords = useCallback(() => {
    setIsLoading(true)
    setError('')
    Promise.all([
      getStages(),
      getMyRecords(),
      getMyRanking().catch(() => null),
    ])
      .then(([stages, records, ranking]) => {
        setMyRanking(ranking)
        const byStageId = new Map(records.map((record) => [record.stageId, record]))
        setRows(
          stages.map((stage: StageListItem) => {
            const record = byStageId.get(stage.stageId)
            return {
              stageId: stage.stageId,
              name: stage.name,
              bestTimeMs: record?.stageClearTimeMs ?? null,
              clearedAt: record?.createdAt ?? null,
            }
          }),
        )
      })
      .catch((cause: unknown) => setError(messageOf(cause, '기록을 불러오지 못했습니다.')))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(loadRecords, [loadRecords])

  return (
    <div className="record-page">
      <JourneyDuckDecor />
      <AppHeader />
      <PageHeaderWithBack />
      <main className="record-layout">
        <section aria-label="내 최고 기록">
          <div className="record-card">
            <div className="record-card__head">
              <h2>최고 기록</h2>
            </div>
            <p className="record-caption">
              스테이지별 클리어 시간입니다. 각 스테이지의 라운드 기록을 모두 합산한 값이에요.
              기록이 있는 스테이지를 선택하면 역대 기록을 볼 수 있습니다.
            </p>

            {error && (
              <p className="record-error" role="alert">
                {error}
                <button className="record-retry" type="button" onClick={loadRecords}>다시 시도</button>
              </p>
            )}
            {isLoading && !error && <p className="record-loading">기록을 불러오는 중…</p>}

            {!isLoading && !error && rows && (
              <ul className="record-list">
                {rows.map((row) => {
                  const cleared = row.bestTimeMs != null
                  return (
                    <li key={row.stageId}>
                      <button
                        type="button"
                        className={`record-row record-row--action${cleared ? '' : ' is-disabled'}`}
                        disabled={!cleared}
                        aria-label={cleared ? `${row.name} 역대 기록 보기` : `${row.name} 미클리어`}
                        onClick={() => cleared && setSelectedStage(row)}
                      >
                        <span className="stage-chip">{toStageCode(row.stageId)}</span>
                        <span className="record-row__name">{row.name}</span>
                        <span className={`record-row__value${cleared ? '' : ' record-row__value--empty'}`}>
                          <b>{cleared ? formatClearTime(row.bestTimeMs!) : '--:--.--'}</b>
                          {/* 개인 순위는 이 API가 제공하지 않아 달성 일시를 표시한다. */}
                          <small>{row.clearedAt ? formatClearedAt(row.clearedAt) : '미클리어'}</small>
                        </span>
                        <span className="record-row__chevron" aria-hidden="true">
                          {cleared ? '›' : ''}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
        <ProfileCard
          rankLabel="현재 최고 순위"
          rank={myRanking?.bestRank ?? null}
          stages={myRanking?.bestStages ?? []}
          rankUnavailable={myRanking == null}
        />
      </main>

      {selectedStage && (
        <StageRecordModal
          stageId={selectedStage.stageId}
          stageName={selectedStage.name}
          onClose={() => setSelectedStage(null)}
        />
      )}
    </div>
  )
}
