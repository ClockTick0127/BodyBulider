import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/authContext'

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isSessionLoading } = useAuth()
  const location = useLocation()

  if (isSessionLoading) {
    return (
      <main className="session-loading" aria-busy="true" aria-live="polite">
        관리자 권한을 확인하는 중입니다.
      </main>
    )
  }
  if (!user) return <Navigate to="/" replace state={{ from: location.pathname }} />
  if (user.role !== 'ADMIN') return <Navigate to="/rooms" replace />
  return children
}
