import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/setupTests'
import { authStore } from '../../mocks/stores/auth.store'
import { defaultUsers } from '../../mocks/data/users'
import { renderWithProviders } from '../../test/renderWithProviders'
import { MyPage } from './MyPage'

beforeEach(() => {
  authStore.setSessionUser(defaultUsers[0])
})

describe('MyPage 최고 기록', () => {
  it('스테이지 목록과 내 최고기록을 조합해 전체 스테이지를 표시한다', async () => {
    renderWithProviders(<MyPage />, { route: '/mypage' })

    expect(screen.getByText('기록을 불러오는 중…')).toBeInTheDocument()
    await waitForElementToBeRemoved(() => screen.queryByText('기록을 불러오는 중…'))

    expect(await screen.findByText('1:24.21')).toBeInTheDocument()
    const region = screen.getByRole('region', { name: '내 최고 기록' })
    expect(within(region).getByText('하수도')).toBeInTheDocument()
    expect(within(region).getByText('강가')).toBeInTheDocument()
    expect(within(region).getAllByRole('listitem')).toHaveLength(2)
  })

  it('미클리어 스테이지는 비활성 상태로 표시한다', async () => {
    server.use(
      http.get('*/api/v1/users/me/records', () =>
        HttpResponse.json([
          {
            stage_id: 1,
            name: '하수도',
            stage_clear_time_ms: 84210,
            created_at: '2026-07-24T12:14:00.000Z',
          },
        ]),
      ),
    )
    renderWithProviders(<MyPage />, { route: '/mypage' })

    const notCleared = await screen.findByRole('button', { name: '강가 미클리어' })
    expect(notCleared).toBeDisabled()
    expect(screen.getAllByText('--:--.--')).toHaveLength(1)
  })

  it('현재 최고 순위와 해당 스테이지를 표시한다', async () => {
    renderWithProviders(<MyPage />, { route: '/mypage' })

    await screen.findByText('1:24.21')
    const card = screen.getByLabelText('내 랭킹 요약')
    expect(card).toHaveTextContent('3위')
    expect(within(card).getByText('강가')).toBeInTheDocument()
    expect(card).toHaveTextContent('전체 4명 중')
  })

  it('동일한 최고 순위를 달성한 스테이지가 여러 개면 모두 표시한다', async () => {
    server.use(
      http.get('*/api/v1/users/me/rankings', () =>
        HttpResponse.json({
          best_rank: 1,
          best_stage_count: 2,
          best_stages: [
            {
              stage_id: 1,
              stage_name: '하수도',
              rank: 1,
              total_participants: 20,
              stage_clear_time_ms: 84210,
              created_at: '2026-07-24T12:14:00.000Z',
            },
            {
              stage_id: 2,
              stage_name: '강가',
              rank: 1,
              total_participants: 15,
              stage_clear_time_ms: 77300,
              created_at: '2026-07-25T12:14:00.000Z',
            },
          ],
          stages: [],
        }),
      ),
    )
    renderWithProviders(<MyPage />, { route: '/mypage' })

    await screen.findByText('1:24.21')
    const card = screen.getByLabelText('내 랭킹 요약')
    expect(card).toHaveTextContent('1위')
    expect(card).toHaveTextContent('2개 스테이지에서 달성')
    expect(within(card).getByText('하수도')).toBeInTheDocument()
    expect(within(card).getByText('강가')).toBeInTheDocument()
  })

  it('노란색 RANKING 배지를 더 이상 노출하지 않는다', async () => {
    renderWithProviders(<MyPage />, { route: '/mypage' })

    await screen.findByText('1:24.21')
    expect(screen.queryByRole('link', { name: 'RANKING' })).not.toBeInTheDocument()
  })

  it('기록 조회가 실패하면 오류 문구와 다시 시도 버튼을 표시한다', async () => {
    server.use(
      http.get('*/api/v1/users/me/records', () =>
        HttpResponse.json({ code: 'RC999', message: '기록 서버 오류' }, { status: 500 }),
      ),
    )

    renderWithProviders(<MyPage />, { route: '/mypage' })

    expect(await screen.findByRole('alert')).toHaveTextContent('기록 서버 오류')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})

describe('MyPage 상단바 · 서브바', () => {
  it('상단바에서 마이페이지·랭킹 링크가 제거되었다', async () => {
    renderWithProviders(<MyPage />, { route: '/mypage' })
    await screen.findByText('1:24.21')

    // 서브바의 세그먼트 탭(role=tab)만 남고, 상단바 텍스트 링크는 없다.
    expect(screen.queryByRole('link', { name: '마이페이지' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '랭킹' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'BodyBuilder' })).toBeInTheDocument()
  })

  it('서브바에 뒤로가기와 세그먼트 탭이 노출되고 마이 페이지 탭이 선택된다', async () => {
    renderWithProviders(<MyPage />, { route: '/mypage' })
    await screen.findByText('1:24.21')

    expect(screen.getByRole('button', { name: '나가기' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '마이 페이지' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '랭킹' })).toHaveAttribute('aria-selected', 'false')
  })

  it('랭킹 탭은 /ranking으로 이동하는 링크다', async () => {
    renderWithProviders(<MyPage />, { route: '/mypage' })
    await screen.findByText('1:24.21')

    expect(screen.getByRole('tab', { name: '랭킹' })).toHaveAttribute('href', '/ranking')
  })
})

describe('MyPage 역대 기록 모달', () => {
  it('스테이지를 선택하면 모달이 열린다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MyPage />, { route: '/mypage' })

    await user.click(await screen.findByRole('button', { name: '하수도 역대 기록 보기' }))

    expect(await screen.findByRole('dialog', { name: /하수도 · 역대 기록/ })).toBeInTheDocument()
  })

  it('모달에서 이력을 고르면 라운드 상세가 열리고, 닫기로 모달을 닫는다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MyPage />, { route: '/mypage' })

    await user.click(await screen.findByRole('button', { name: '하수도 역대 기록 보기' }))
    await user.click(await screen.findByRole('button', { name: /1:24\.21 기록의 라운드 상세 보기/ }))

    expect(screen.getByRole('complementary', { name: '라운드별 기록' })).toHaveClass('is-open')
    expect(await screen.findByText('1라운드')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
