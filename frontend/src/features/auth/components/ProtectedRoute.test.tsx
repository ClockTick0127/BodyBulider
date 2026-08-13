import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import * as authContextModule from '../context/authContext'
import type { ServiceUser } from '../services/authApi'

vi.mock('../context/authContext', () => ({
  useAuth: vi.fn(),
}))

describe('ProtectedRoute', () => {
  const useAuthMock = vi.mocked(authContextModule.useAuth)

  it('renders loading element when session is loading', () => {
    useAuthMock.mockReturnValue({
      user: null,
      isSessionLoading: true,
      setAuthenticatedUser: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/dev/map-editor']}>
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    )

    expect(screen.getByText('세션을 확인하는 중입니다.')).toBeInTheDocument()
  })

  it('redirects to main page (/) when user is not logged in', () => {
    useAuthMock.mockReturnValue({
      user: null,
      isSessionLoading: false,
      setAuthenticatedUser: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/dev/map-editor']}>
        <Routes>
          <Route path="/" element={<div>Main Page</div>} />
          <Route
            path="/dev/map-editor"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Main Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('redirects to main page (/) when user role is USER and ADMIN is required', () => {
    const user: ServiceUser = {
      uuid: 'user-uuid-1',
      nickname: '일반유저',
      role: 'USER',
    }

    useAuthMock.mockReturnValue({
      user,
      isSessionLoading: false,
      setAuthenticatedUser: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/dev/map-editor']}>
        <Routes>
          <Route path="/" element={<div>Main Page</div>} />
          <Route
            path="/dev/map-editor"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Main Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children when user role is ADMIN and allowedRoles includes ADMIN', () => {
    const adminUser: ServiceUser = {
      uuid: 'admin-uuid-1',
      nickname: '관리자',
      role: 'ADMIN',
    }

    useAuthMock.mockReturnValue({
      user: adminUser,
      isSessionLoading: false,
      setAuthenticatedUser: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/dev/map-editor']}>
        <Routes>
          <Route path="/" element={<div>Main Page</div>} />
          <Route
            path="/dev/map-editor"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <div>Admin Map Editor</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Admin Map Editor')).toBeInTheDocument()
  })
})
