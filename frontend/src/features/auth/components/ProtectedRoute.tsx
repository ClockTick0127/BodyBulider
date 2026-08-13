import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/authContext'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: ('USER' | 'ADMIN')[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isSessionLoading } = useAuth()
  const location = useLocation()

  if (isSessionLoading) {
    return <main className="session-loading" aria-busy="true" aria-live="polite">세션을 확인하는 중입니다.</main>
  }

  if (!user || (allowedRoles && (!user.role || !allowedRoles.includes(user.role)))) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  return children
}
