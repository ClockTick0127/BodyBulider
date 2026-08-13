import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/setupTests'
import { authStore } from '../../mocks/stores/auth.store'
import { defaultUsers } from '../../mocks/data/users'
import { renderWithProviders } from '../../test/renderWithProviders'
import { RankingPage } from './RankingPage'

beforeEach(() => {
  authStore.setSessionUser(defaultUsers[0])
})

describe('RankingPage', () => {
  it('진입하면 스테이지 목록 + 스테이지별 1위를 조합해 전체보기를 표시한다', async () => {
    renderWithProviders(<RankingPage />, { route: '/ranking' })

    expect(screen.getByText('랭킹을 불러오는 중…')).toBeInTheDocument()
    await waitForElementToBeRemoved(() => screen.queryByText('랭킹을 불러오는 중…'))

    expect(await screen.findByText('1위 : 다리 건설가')).toBeInTheDocument()
    expect(screen.getByText(/기록 1:03\.12/)).toBeInTheDocument()
  })

  it('기록이 없는 스테이지는 안내 문구를 표시한다', async () => {
    server.use(
      http.get('*/api/v1/stages/2/rankings', () => HttpResponse.json([])),
    )
    renderWithProviders(<RankingPage />, { route: '/ranking' })

    expect(await screen.findByText('아직 기록이 없습니다')).toBeInTheDocument()
  })

  it('스테이지 탭을 선택하면 해당 랭킹을 시간 오름차순으로 보여준다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RankingPage />, { route: '/ranking' })

    await waitForElementToBeRemoved(() => screen.queryByText('랭킹을 불러오는 중…'))
    await user.click(await screen.findByRole('tab', { name: '하수도' }))

    expect(await screen.findByText('1:03.12')).toBeInTheDocument()
    const rows = within(screen.getByRole('region', { name: '랭킹' }))
      .getAllByRole('listitem')

    expect(rows).toHaveLength(6)
    expect(rows[0]).toHaveTextContent('다리 건설가')
    expect(rows[0]).toHaveTextContent('1:03.12')
    expect(rows[5]).toHaveTextContent('브릿지 헌터')
  })

  it('바로가기 버튼을 누르면 해당 스테이지 탭으로 전환된다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RankingPage />, { route: '/ranking' })

    const goButtons = await screen.findAllByRole('button', { name: '바로가기' })
    await user.click(goButtons[0])

    expect(await screen.findByRole('tab', { name: '하수도' })).toHaveAttribute('aria-selected', 'true')
  })

  it('기록이 없는 스테이지 탭은 빈 목록 안내를 표시한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/stages/2/rankings', () => HttpResponse.json([])),
    )
    renderWithProviders(<RankingPage />, { route: '/ranking' })

    await waitForElementToBeRemoved(() => screen.queryByText('랭킹을 불러오는 중…'))
    await user.click(await screen.findByRole('tab', { name: '강가' }))

    expect(await screen.findByText('아직 등록된 기록이 없습니다.')).toBeInTheDocument()
  })

  it('전체보기에서는 현재 최고 순위와 달성 스테이지를 표시한다', async () => {
    renderWithProviders(<RankingPage />, { route: '/ranking' })

    await screen.findByText('1위 : 다리 건설가')
    const card = screen.getByLabelText('내 랭킹 요약')
    expect(card).toHaveTextContent('3위')
    expect(within(card).getByText('강가')).toBeInTheDocument()
  })

  it('스테이지 탭에서는 선택한 스테이지의 내 순위를 표시한다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RankingPage />, { route: '/ranking' })

    await waitForElementToBeRemoved(() => screen.queryByText('랭킹을 불러오는 중…'))
    await user.click(await screen.findByRole('tab', { name: '하수도' }))

    const card = screen.getByLabelText('내 랭킹 요약')
    expect(card).toHaveTextContent('나의 순위 · 하수도')
    expect(card).toHaveTextContent('4위')
  })

  it('서브바에서 랭킹 탭이 선택되고 마이 페이지 탭은 /mypage로 이동한다', async () => {
    renderWithProviders(<RankingPage />, { route: '/ranking' })
    await screen.findByText('1위 : 다리 건설가')

    expect(screen.getByRole('tab', { name: '랭킹' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '마이 페이지' })).toHaveAttribute('href', '/mypage')
    // 상단바의 텍스트 링크는 제거되었다.
    expect(screen.queryByRole('link', { name: '마이페이지' })).not.toBeInTheDocument()
  })

  it('스테이지 목록 조회가 실패하면 오류 문구와 다시 시도 버튼을 표시한다', async () => {
    server.use(
      http.get('*/api/v1/stages', () =>
        HttpResponse.json({ code: 'ST999', message: '스테이지 서버 오류' }, { status: 500 }),
      ),
    )

    renderWithProviders(<RankingPage />, { route: '/ranking' })

    expect(await screen.findByRole('alert')).toHaveTextContent('스테이지 서버 오류')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})
