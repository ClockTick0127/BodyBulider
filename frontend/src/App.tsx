import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { AuthProvider } from './features/auth/context/AuthProvider'
import { BgmProvider } from './shared/context/BgmContext'
import { ProtectedRoute } from './features/auth/components/ProtectedRoute'
import { AdminRoute } from './features/auth/components/AdminRoute'
import { LoadingSpinner } from './shared/components/LoadingSpinner'
import { FloatingDuckEasterEgg } from './shared/components/FloatingDuckEasterEgg'
import { hasKnownSession } from './features/auth/services/authApi'

/**
 * 라우트 단위 코드 스플리팅.
 * MediaPipe(게임)·STOMP/WebRTC(로비) 등 무거운 의존성이 초기 번들에 들어가지 않도록
 * 각 페이지를 동적 import로 분리한다.
 *
 * 이 프로젝트의 페이지는 모두 named export이므로 default로 매핑해 lazy()에 전달한다.
 * (AuthProvider·ProtectedRoute는 첫 화면부터 필요하므로 정적 import를 유지한다.)
 */
const MainPage = lazy(() => import('./pages/main/MainPage').then((m) => ({ default: m.MainPage })))
const RoomListPage = lazy(() => import('./pages/rooms/RoomListPage').then((m) => ({ default: m.RoomListPage })))
const LobbyPage = lazy(() => import('./pages/lobby/LobbyPage').then((m) => ({ default: m.LobbyPage })))
const GamePage = lazy(() => import('./pages/game/GamePage').then((m) => ({ default: m.GamePage })))
const StageClearPage = lazy(() => import('./pages/game/StageClearPage').then((m) => ({ default: m.StageClearPage })))
const MyPage = lazy(() => import('./pages/mypage/MyPage').then((m) => ({ default: m.MyPage })))
const RankingPage = lazy(() => import('./pages/ranking/RankingPage').then((m) => ({ default: m.RankingPage })))
const CommunicationTestPage = lazy(() =>
  import('./pages/comm-test/CommunicationTestPage').then((m) => ({ default: m.CommunicationTestPage })),
)
const AdminLogsPage = lazy(() =>
  import('./pages/admin/AdminLogsPage').then((m) => ({ default: m.AdminLogsPage })),
)

const WebCamTestPage = lazy(() =>
  import('./pages/game/WebCamTestPage').then((m) => ({ default: m.WebCamTestPage })),
)
const MapEditorPage = lazy(() => import('./pages/dev/MapEditorPage').then((m) => ({ default: m.MapEditorPage })))

/**
 * 창작마당(워크숍). 일반 유저용이므로 allowedRoles를 붙이지 않는다.
 * (`/dev/map-editor`만 ADMIN 전용으로 남는다)
 */
const WorkshopPage = lazy(() =>
  import('./pages/workshop/WorkshopPage').then((m) => ({ default: m.WorkshopPage })),
)
const UserMapEditorPage = lazy(() =>
  import('./pages/workshop/UserMapEditorPage').then((m) => ({ default: m.UserMapEditorPage })),
)

export default function App() {
  const location = useLocation()

  return (
    <AuthProvider restoreSession={location.pathname !== '/' || hasKnownSession()}>
      <BgmProvider>
        {!location.pathname.startsWith('/game') && (
          <FloatingDuckEasterEgg key={location.key} />
        )}
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<MainPage />} />
            <Route path="/rooms" element={<ProtectedRoute><RoomListPage /></ProtectedRoute>} />
            <Route path="/rooms/:code" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
            <Route path="/game" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
            <Route path="/stage-clear" element={<StageClearPage />} />
            <Route path="/mypage" element={<ProtectedRoute><MyPage /></ProtectedRoute>} />
            <Route path="/ranking" element={<ProtectedRoute><RankingPage /></ProtectedRoute>} />
            <Route path="/workshop" element={<ProtectedRoute><WorkshopPage /></ProtectedRoute>} />
            <Route path="/workshop/editor" element={<ProtectedRoute><UserMapEditorPage /></ProtectedRoute>} />
            <Route path="/comm-test" element={<CommunicationTestPage />} />
            <Route path="/pose-test" element={<WebCamTestPage />} />
            <Route path="/dev/mediapipe" element={<WebCamTestPage />} />
            <Route
              path="/dev/map-editor"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <MapEditorPage />
                </ProtectedRoute>
              }
            />
            <Route path="/admin/logs" element={<AdminRoute><AdminLogsPage /></AdminRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BgmProvider>

    </AuthProvider>
  )
}
