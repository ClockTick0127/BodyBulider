import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  forgetSession,
  getSessionUser,
  logout as requestLogout,
  rememberSession,
  type ServiceUser,
} from '../services/authApi'
import { AuthContext } from './authContext'
import { SESSION_UNAUTHORIZED_EVENT } from '../../../shared/api/request'

type AuthProviderProps = {
  children: ReactNode
  restoreSession?: boolean
}

export function AuthProvider({ children, restoreSession = true }: AuthProviderProps) {
  const [user, setUser] = useState<ServiceUser | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(restoreSession)

  useEffect(() => {
    const clearExpiredSession = () => {
      forgetSession()
      setUser(null)
    }
    window.addEventListener(SESSION_UNAUTHORIZED_EVENT, clearExpiredSession)
    return () => window.removeEventListener(SESSION_UNAUTHORIZED_EVENT, clearExpiredSession)
  }, [])

  useEffect(() => {
    if (!restoreSession) {
      setIsSessionLoading(false)
      return
    }

    let cancelled = false
    setIsSessionLoading(true)
    getSessionUser()
      .then((sessionUser) => {
        if (!cancelled) {
          if (sessionUser) rememberSession()
          else forgetSession()
          setUser(sessionUser)
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setIsSessionLoading(false)
      })
    return () => { cancelled = true }
  }, [restoreSession])

  const setAuthenticatedUser = useCallback((authenticatedUser: ServiceUser) => {
    rememberSession()
    setUser(authenticatedUser)
  }, [])

  const logout = useCallback(async () => {
    try {
      await requestLogout()
    } finally {
      forgetSession()
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, isSessionLoading, setAuthenticatedUser, logout }),
    [user, isSessionLoading, setAuthenticatedUser, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
