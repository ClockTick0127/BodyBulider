import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../features/auth/context/AuthProvider'
import { BgmProvider } from '../shared/context/BgmContext'

/**
 * 페이지 컴포넌트 테스트용 렌더 헬퍼.
 * AppHeader(라우터)와 ProfileCard(useAuth)가 컨텍스트를 요구하므로 함께 감싼다.
 */
export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BgmProvider>
        <AuthProvider>{ui}</AuthProvider>
      </BgmProvider>
    </MemoryRouter>,
  )
}
