import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StageResultModal } from './StageResultModal'

export function StageClearPage() {
  const navigate = useNavigate()
  const [isSuccess, setIsSuccess] = useState(true)

  const handleLobby = () => {
    navigate('/rooms')
  }

  const handleRetry = () => {
    alert('다시하기가 클릭되었습니다.')
  }

  const handleNext = () => {
    alert('다음 스테이지로 이동합니다.')
  }

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh' }}>
      {/* Top Controller Bar to toggle CLEAR vs FAILED demo state */}
      <div
        style={{
          position: 'fixed',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2000,
          background: '#182033',
          padding: '8px 16px',
          borderRadius: '99px',
          display: 'flex',
          gap: '10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          border: '2px solid #ffffff',
        }}
      >
        <button
          onClick={() => setIsSuccess(true)}
          style={{
            background: isSuccess ? '#f5d652' : 'transparent',
            color: isSuccess ? '#182033' : '#ffffff',
            border: 'none',
            borderRadius: '20px',
            padding: '6px 16px',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: '0.85rem',
            transition: 'all 0.15s ease',
          }}
        >
          🎉 클리어 (CLEAR) 보기
        </button>
        <button
          onClick={() => setIsSuccess(false)}
          style={{
            background: !isSuccess ? '#ef6e6a' : 'transparent',
            color: '#ffffff',
            border: 'none',
            borderRadius: '20px',
            padding: '6px 16px',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: '0.85rem',
            transition: 'all 0.15s ease',
          }}
        >
          💥 실패 (FAILED) 보기
        </button>
      </div>

      {/* Render Modal */}
      {isSuccess ? (
        <StageResultModal
          isSuccess={true}
          stageNumber={1}
          topPercentile="Top 1%"
          rounds={[
            { round: 1, time: '00:55' },
            { round: 2, time: '01:10' },
            { round: 3, time: '00:40' },
          ]}
          totalClearTime="02:45"
          onLobby={handleLobby}
          onRetry={handleRetry}
          onNext={handleNext}
        />
      ) : (
        <StageResultModal
          isSuccess={false}
          stageNumber={1}
          failedReason="아기 오리는 과연 넘어갈 수 있을까요?"
          rounds={[
            { round: 1, time: '00:55' },
            { round: 2, time: '01:10' },
            { round: 3, time: '00:40', isFailed: true },
          ]}
          onLobby={handleLobby}
          onRetry={handleRetry}
        />
      )}
    </div>
  )
}
