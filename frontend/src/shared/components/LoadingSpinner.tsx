import './LoadingSpinner.css'

type LoadingSpinnerProps = {
  /** 스피너 아래에 표시할 안내 문구. */
  label?: string
}

/**
 * 라우트 청크를 내려받는 동안 보여주는 전체 화면 로딩 표시.
 * App.tsx의 <Suspense fallback>으로 사용한다.
 */
export function LoadingSpinner({ label = '화면을 불러오는 중입니다…' }: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-spinner__mark" />
      <p className="loading-spinner__text">{label}</p>
    </div>
  )
}
