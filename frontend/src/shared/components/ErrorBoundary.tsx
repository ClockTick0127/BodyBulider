import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import './ErrorBoundary.css'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

/**
 * 렌더링 중 발생한 예외를 가로채 전역 트리가 파괴되는 것을 막는다.
 *
 * WebRTC 비디오 스트림·MediaPipe 캔버스 처리에서 예외가 나면 화면 전체가 빈 페이지가
 * 되어 사용자가 복구할 방법이 없어진다. 이 경계에서 잡아 새로고침 UI를 제공한다.
 *
 * 주의: ErrorBoundary는 렌더링·생명주기 예외만 잡는다. 이벤트 핸들러나
 * Promise rejection(비동기)은 잡히지 않으므로 해당 지점은 개별 try/catch가 필요하다.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Unhandled Render Error]:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary__mark" aria-hidden="true">!</div>
          <h2>서비스 이용 중 문제가 발생했습니다.</h2>
          <p className="error-boundary__message">
            {this.state.error?.message ?? '알 수 없는 오류가 발생했습니다.'}
          </p>
          <button
            className="error-boundary__reload"
            type="button"
            onClick={() => window.location.reload()}
          >
            페이지 새로고침
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
