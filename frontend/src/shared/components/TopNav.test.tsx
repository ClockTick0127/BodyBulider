import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import { authStore } from '../../mocks/stores/auth.store'
import { defaultUsers } from '../../mocks/data/users'
import { RoomListPage } from '../../pages/rooms/RoomListPage'
import { WorkshopPage } from '../../pages/workshop/WorkshopPage'

/**
 * 회귀 방지: 창작마당 진입 경로가 실제로 화면에 있는지 확인한다.
 *
 * 처음에는 네비를 `AppHeader`에만 넣었는데, `AppHeader`는 마이페이지·랭킹·창작마당에서만
 * 쓰이고 **방 목록(`/rooms`)은 자체 헤더(`.room-header`)를 쓴다.** 그 결과 주 진입 화면에서
 * 창작마당으로 갈 방법이 없었다. 두 헤더가 같은 TopNav를 쓰는지 여기서 고정한다.
 */
beforeEach(() => {
  authStore.setSessionUser(defaultUsers[0])
})

describe('최상위 네비 노출', () => {
  it('방 목록(/rooms) 헤더에 창작마당 링크가 있다', async () => {
    renderWithProviders(<RoomListPage />, { route: '/rooms' })

    const workshopLink = await screen.findByRole('link', { name: /창작마당/ })
    expect(workshopLink).toHaveAttribute('href', '/workshop')
    expect(screen.getByRole('link', { name: /모집/ })).toHaveAttribute('href', '/rooms')
  })

  it('방 목록에서는 모집 탭이 활성이다', async () => {
    renderWithProviders(<RoomListPage />, { route: '/rooms' })

    const lobbyLink = await screen.findByRole('link', { name: /모집/ })
    expect(lobbyLink).toHaveClass('is-active')
    expect(screen.getByRole('link', { name: /창작마당/ })).not.toHaveClass('is-active')
  })

  it('창작마당(/workshop) 헤더에도 같은 네비가 있고 창작마당이 활성이다', async () => {
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })

    const workshopLink = await screen.findByRole('link', { name: /창작마당/ })
    expect(workshopLink).toHaveClass('is-active')
    expect(screen.getByRole('link', { name: /모집/ })).toHaveAttribute('href', '/rooms')
  })
})
