import React from 'react'
import './StageClearModal.css'

export interface RoundTime {
  round: number
  time: string
  isFailed?: boolean
}

export interface StageResultModalProps {
  isSuccess?: boolean // true: CLEAR, false: FAILED
  stageNumber?: number
  topPercentile?: string
  failedReason?: string
  rounds?: RoundTime[]
  totalClearTime?: string
  errorText?: string
  onLobby?: () => void
  onRetry?: () => void
  onNext?: () => void
}

export const StageResultModal: React.FC<StageResultModalProps> = ({
  isSuccess = true,
  // stageNumber = 1,
  topPercentile = 'Top 1%',
  failedReason = '아기 오리는 과연 넘어갈 수 있을까요?',
  rounds = [
    { round: 1, time: '00:55' },
    { round: 2, time: '01:10' },
    { round: 3, time: '00:40' },
  ],
  totalClearTime = '02:45',
  errorText,
  onLobby,
  onRetry,
  onNext,
}) => {
  const actionCount = [onLobby, onRetry, isSuccess ? onNext : undefined].filter(Boolean).length

  return (
    <div className="stage-clear-overlay">
      {/* Background Decorative Sparkle */}
      <svg className="stage-clear-sparkle" width="40" height="40" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z"
          fill={isSuccess ? '#B0C4DE' : '#EF6E6A'}
        />
      </svg>

      {/* Header: Stage Result Title & Badge */}
      <header className="stage-clear-header">
        <h1 className={`stage-clear-title ${!isSuccess ? 'stage-clear-title--failed' : ''}`}>
          STAGE {isSuccess ? 'CLEAR' : 'FAILED'}
        </h1>

        {isSuccess ? (
          topPercentile && (
            <div className="stage-clear-badge">
              <svg viewBox="0 0 24 24">
                <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H8v2h8v-2h-3v-2.1c2.09-.43 3.68-2.18 3.96-4.36C19.33 11.23 21 9.3 21 7V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
              </svg>
              <span>{topPercentile}</span>
            </div>
          )
        ) : (
          <div className="stage-clear-badge stage-clear-badge--failed">
            <svg viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span>STAGE FAILED</span>
          </div>
        )}
      </header>

      {/* Main Wrapper */}
      <div className="stage-clear-wrapper">
        {/* 3D Egg Banner (Fresh Eggs on Clear, Broken Eggs on Fail) */}
        <div className={`stage-clear-stars stage-clear-eggs ${!isSuccess ? 'stage-clear-eggs--failed' : ''}`}>
          {isSuccess ? (
            <>
              {/* Side Fresh Egg */}
              <svg className="star-icon star-icon--side" viewBox="0 0 32 32" fill="none">
                <defs>
                  <linearGradient id="eggGradSide" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FFFBE6" />
                    <stop offset="50%" stopColor="#FFE58F" />
                    <stop offset="100%" stopColor="#FFC53D" />
                  </linearGradient>
                </defs>
                <path
                  d="M16 3 C10.5 3 6.5 11 6.5 19 C6.5 25.2 10.8 29.5 16 29.5 C21.2 29.5 25.5 25.2 25.5 19 C25.5 11 21.5 3 16 3 Z"
                  fill="url(#eggGradSide)"
                  stroke="#182033"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M11.5 8.5 C9.8 12.5 9.5 16.5 9.8 19"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              </svg>

              {/* Center Fresh Egg (Larger) */}
              <svg className="star-icon star-icon--center" viewBox="0 0 32 32" fill="none">
                <defs>
                  <linearGradient id="eggGradCenter" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="45%" stopColor="#FFF1B8" />
                    <stop offset="100%" stopColor="#FADB14" />
                  </linearGradient>
                </defs>
                <path
                  d="M16 3 C10.5 3 6.5 11 6.5 19 C6.5 25.2 10.8 29.5 16 29.5 C21.2 29.5 25.5 25.2 25.5 19 C25.5 11 21.5 3 16 3 Z"
                  fill="url(#eggGradCenter)"
                  stroke="#182033"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M11.5 8.5 C9.8 12.5 9.5 16.5 9.8 19"
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.9"
                />
              </svg>

              {/* Side Fresh Egg */}
              <svg className="star-icon star-icon--side" viewBox="0 0 32 32" fill="none">
                <path
                  d="M16 3 C10.5 3 6.5 11 6.5 19 C6.5 25.2 10.8 29.5 16 29.5 C21.2 29.5 25.5 25.2 25.5 19 C25.5 11 21.5 3 16 3 Z"
                  fill="url(#eggGradSide)"
                  stroke="#182033"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M11.5 8.5 C9.8 12.5 9.5 16.5 9.8 19"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              </svg>
            </>
          ) : (
            <>
              {/* Broken Egg Left */}
              <svg className="star-icon star-icon--side star-icon--left" viewBox="0 0 32 36" fill="none">
                <defs>
                  <linearGradient id="eggGradSide" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FFFBE6" />
                    <stop offset="50%" stopColor="#FFE58F" />
                    <stop offset="100%" stopColor="#FFC53D" />
                  </linearGradient>
                </defs>
                <path
                  d="M6.8 17.5 C6.5 11.5 10.5 4.5 16 4.5 C21.5 4.5 25.5 11.5 25.2 17.5 L21.5 15 L18.5 18 L13.5 14 L9.5 17 Z"
                  fill="url(#eggGradSide)"
                  stroke="#182033"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  transform="translate(-0.5, -3) rotate(-6 16 12)"
                />
                <path
                  d="M11.5 8.5 C9.8 11.5 9.5 13.5 9.8 15"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.8"
                  transform="translate(-0.5, -3) rotate(-6 16 12)"
                />
                <path
                  d="M6.8 17.5 L9.5 17 L13.5 14 L18.5 18 L21.5 15 L25.2 17.5 C25.5 24 21.2 30 16 30 C10.8 30 6.5 24 6.8 17.5 Z"
                  fill="url(#eggGradSide)"
                  stroke="#182033"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Broken Egg Center */}
              <svg className="star-icon star-icon--center" viewBox="0 0 32 36" fill="none">
                <defs>
                  <linearGradient id="eggGradCenter" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="45%" stopColor="#FFF1B8" />
                    <stop offset="100%" stopColor="#FADB14" />
                  </linearGradient>
                </defs>
                <path
                  d="M6.8 17.5 C6.5 11.5 10.5 4.5 16 4.5 C21.5 4.5 25.5 11.5 25.2 17.5 L21.5 15 L18.5 18 L13.5 14 L9.5 17 Z"
                  fill="url(#eggGradCenter)"
                  stroke="#182033"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  transform="translate(0.5, -3.5) rotate(6 16 12)"
                />
                <path
                  d="M11.5 8.5 C9.8 11.5 9.5 13.5 9.8 15"
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.9"
                  transform="translate(0.5, -3.5) rotate(6 16 12)"
                />
                <path
                  d="M6.8 17.5 L9.5 17 L13.5 14 L18.5 18 L21.5 15 L25.2 17.5 C25.5 24 21.2 30 16 30 C10.8 30 6.5 24 6.8 17.5 Z"
                  fill="url(#eggGradCenter)"
                  stroke="#182033"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Broken Egg Right */}
              <svg className="star-icon star-icon--side star-icon--right" viewBox="0 0 32 36" fill="none">
                <path
                  d="M6.8 17.5 C6.5 11.5 10.5 4.5 16 4.5 C21.5 4.5 25.5 11.5 25.2 17.5 L21.5 15 L18.5 18 L13.5 14 L9.5 17 Z"
                  fill="url(#eggGradSide)"
                  stroke="#182033"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  transform="translate(0.5, -3) rotate(6 16 12)"
                />
                <path
                  d="M11.5 8.5 C9.8 11.5 9.5 13.5 9.8 15"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.8"
                  transform="translate(0.5, -3) rotate(6 16 12)"
                />
                <path
                  d="M6.8 17.5 L9.5 17 L13.5 14 L18.5 18 L21.5 15 L25.2 17.5 C25.5 24 21.2 30 16 30 C10.8 30 6.5 24 6.8 17.5 Z"
                  fill="url(#eggGradSide)"
                  stroke="#182033"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </>
          )}
        </div>

        {/* Modal Card Box */}
        <div className={`stage-clear-card ${!isSuccess ? 'stage-clear-card--failed' : ''}`}>
          <h2 className="card-title">
            STAGE {isSuccess ? 'CLEAR TIMES' : 'FAILED'}
          </h2>

          {/* Rounds Clear Time */}
          <div className="rounds-list">
            {rounds.map((r) => (
              <div
                key={r.round}
                className={`round-item ${r.isFailed ? 'round-item--failed' : ''}`}
              >
                <span className="round-label">ROUND {r.round}</span>
                <span className="round-divider">|</span>
                <span className="round-time">{r.isFailed ? 'FAILED ❌' : r.time}</span>
              </div>
            ))}
          </div>

          <hr className="clear-time-divider" />

          {/* Total Clear Time or Failed Reason */}
          {isSuccess ? (
            <div className="total-clear-time">
              <span className="total-label">TOTAL CLEAR TIME</span>
              <span className="total-divider">|</span>
              <span className="total-time">{totalClearTime}</span>
            </div>
          ) : (
            <div className="failed-reason-box">
              <p>{failedReason}</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {actionCount > 0 && <div
          className={`stage-clear-actions ${!isSuccess ? 'stage-clear-actions--failed' : ''}`}
          style={{ gridTemplateColumns: `repeat(${actionCount}, minmax(0, 1fr))` }}
        >
          {/* Lobby Button */}
          {onLobby && <button className="action-btn action-btn--lobby" onClick={onLobby}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H9v2H7v-2H5v-2h2V9h2v2h2v2zm4.5 1c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5S17.67 9 18.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
            </svg>
            <span>로비</span>
          </button>}

          {/* Retry Button */}
          {onRetry && <button
            className={`action-btn action-btn--retry ${!isSuccess ? 'action-btn--retry-primary' : ''}`}
            onClick={onRetry}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>다시하기</span>
          </button>}

          {/* Next Button (Only in SUCCESS mode) */}
          {isSuccess && onNext && (
            <button className="action-btn action-btn--next" onClick={onNext}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
              <span>다음</span>
            </button>
          )}
        </div>}

        {errorText && (
          <div className="stage-clear-error-msg">
            {errorText}
          </div>
        )}
      </div>
    </div>
  )
}

// Alias for backwards compatibility
export const StageClearModal = StageResultModal
