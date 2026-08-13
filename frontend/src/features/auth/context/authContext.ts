import { createContext, useContext } from 'react'
import type { ServiceUser } from '../services/authApi'

export type AuthContextValue = {
  user: ServiceUser | null
  isSessionLoading: boolean
  setAuthenticatedUser: (user: ServiceUser) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
