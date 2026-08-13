import { useCallback, useEffect, useState } from 'react'
import {
  getMyRecordRounds,
  getMyStageRecords,
  type MyRecordRoundsResult,
  type MyStageHistoryResult,
} from '../services/recordsApi'
import { formatClearTime } from '../../../shared/utils/formatClearTime'
import { formatClearedAt } from '../../../shared/utils/formatClearedAt'
import { toStageCode } from '../../stages/services/stagesApi'

type StageRecordModalProps = {
  stageId: number
  /** 이력 응답에 스테이지명이 없어 목록에서 받은 값을 쓴다. */
  stageName: string
  onClose: () => void
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback

/**
 * 스테이지 역대 기록 모달.
 *
 * 좌측에 날짜별 클리어 이력을 보여주고, 항목을 고르면 우측 패널이 슬라이드로 열리며
 * 라운드별 클리어 시간을 표시한다. (모바일에서는 우측 패널이 전체를 덮는다)
 *
 * ⚠️ 이 화면이 쓰는 두 API는 백엔드 명세가 아직 제공되지 않아 MSW 목업으로만 동작한다.
 */
export function StageRecordModal({ stageId, stageName, onClose }: StageRecordModalProps) {
  const [history, setHistory] = useState<MyStageHistoryResult | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null)
  const [detail, setDetail] = useState<MyRecordRoundsResult | null>(null)
  const [detailError, setDetailError] = useState('')
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  // ESC로 닫기
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const loadHistory = useCallback(() => {
    setIsLoading(true)
    setError('')
    let cancelled = false
    getMyStageRecords(stageId)
      .then((data) => { if (!cancelled) setHistory(data) })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause, '클리어 이력을 불러오지 못했습니다.'))
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [stageId])

  useEffect(loadHistory, [loadHistory])

  const loadDetail = useCallback((recordId: number) => {
    setSelectedRecordId(recordId)
    setIsDetailLoading(true)
    setDetailError('')
    setDetail(null)
    getMyRecordRounds(recordId)
      .then(setDetail)
      .catch((cause: unknown) => setDetailError(messageOf(cause, '라운드 기록을 불러오지 못했습니다.')))
      .finally(() => setIsDetailLoading(false))
  }, [])

  const isDetailOpen = selectedRecordId != null

  return (
    <div
      className="stage-modal-backdrop"
      role="presentation"
      // 백드롭을 직접 눌렀을 때만 닫는다. (모달 내부 드래그로 닫히는 것 방지)
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        className="stage-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-record-modal-title"
      >
        <div className="stage-modal-head">
          <span className="stage-chip">{toStageCode(stageId)}</span>
          <h2 id="stage-record-modal-title">{stageName} · 역대 기록</h2>
          <button className="stage-modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="stage-modal-body">
          <div className="modal-history-list">
            {error && (
              <p className="record-error" role="alert">
                {error}
                <button className="record-retry" type="button" onClick={loadHistory}>다시 시도</button>
              </p>
            )}
            {isLoading && !error && <p className="record-loading">클리어 이력을 불러오는 중…</p>}

            {!isLoading && !error && history && (
              history.entries.length === 0 ? (
                <p className="modal-empty">아직 이 스테이지의 클리어 기록이 없습니다.</p>
              ) : (
                <>
                  <p className="record-caption">
                    총 {history.entries.length.toLocaleString()}회 클리어
                    {history.bestTimeMs != null && ` · 최고 기록 ${formatClearTime(history.bestTimeMs)}`}
                  </p>
                  <ul className="record-list">
                    {history.entries.map((entry) => (
                      <li key={entry.recordId}>
                        <button
                          type="button"
                          className="record-row record-row--action"
                          aria-label={`${formatClearedAt(entry.clearedAt)} · ${formatClearTime(entry.clearTimeMs)} 기록의 라운드 상세 보기`}
                          aria-pressed={selectedRecordId === entry.recordId}
                          onClick={() => loadDetail(entry.recordId)}
                        >
                          <span className="record-row__name">{formatClearedAt(entry.clearedAt)}</span>
                          <span className="record-row__value">
                            <b>{formatClearTime(entry.clearTimeMs)}</b>
                            <small>
                              {history.bestTimeMs === entry.clearTimeMs ? '최고 기록' : '총 클리어 시간'}
                            </small>
                          </span>
                          <span className="record-row__chevron" aria-hidden="true">›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )
            )}
          </div>

          <aside
            className={`modal-round-detail${isDetailOpen ? ' is-open' : ''}`}
            aria-hidden={!isDetailOpen}
            aria-label="라운드별 기록"
          >
            {/* 닫혀 있을 때는 화면 밖으로 밀려 있을 뿐 DOM에는 남으므로,
                내부 버튼으로 탭 이동되지 않도록 내용 자체를 렌더링하지 않는다. */}
            {isDetailOpen && (
              <div className="modal-round-detail__head">
                <button
                  className="modal-round-back"
                  type="button"
                  onClick={() => setSelectedRecordId(null)}
                >
                  <span aria-hidden="true">‹</span> 날짜 목록
                </button>
                <h3>라운드별 기록</h3>
              </div>
            )}

            {detailError && (
              <p className="record-error" role="alert">
                {detailError}
                <button
                  className="record-retry"
                  type="button"
                  onClick={() => selectedRecordId != null && loadDetail(selectedRecordId)}
                >
                  다시 시도
                </button>
              </p>
            )}
            {isDetailLoading && !detailError && <p className="record-loading">라운드 기록을 불러오는 중…</p>}

            {!isDetailLoading && !detailError && detail && (
              <>
                <p className="record-total">
                  <span>총 클리어 시간</span>
                  <b>{formatClearTime(detail.totalClearTimeMs)}</b>
                </p>
                {detail.rounds.length === 0 ? (
                  <p className="modal-empty">라운드 기록이 없습니다.</p>
                ) : (
                  <ul className="record-list">
                    {detail.rounds.map((round) => (
                      <li key={round.roundNo} className="record-row">
                        <span className="stage-chip stage-chip--round">R{round.roundNo}</span>
                        <span className="record-row__name">{round.roundNo}라운드</span>
                        <span className="record-row__value">
                          <b>{formatClearTime(round.clearTimeMs)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
