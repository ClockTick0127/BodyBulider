import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { enableMocking } from './mocks/enableMocking'
import cursor1 from './assets/cursor/cursor1-cursor.png'
import cursor2 from './assets/cursor/cursor2-cursor.png'

const cursors = [
  `url("${cursor1}") 2 2, auto`,
  `url("${cursor2}") 2 2, auto`,
]

document.documentElement.style.setProperty(
  '--app-cursor',
  cursors[Math.floor(Math.random() * cursors.length)],
)

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* 렌더링 예외로 화면 전체가 빈 페이지가 되는 것을 막는 최상위 경계 */}
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
})
