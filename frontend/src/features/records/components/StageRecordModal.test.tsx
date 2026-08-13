import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/setupTests'
import { authStore } from '../../../mocks/stores/auth.store'
import { defaultUsers } from '../../../mocks/data/users'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { StageRecordModal } from './StageRecordModal'

beforeEach(() => {
  authStore.setSessionUser(defaultUsers[0])
})

const renderModal = (onClose = vi.fn()) => {
  const view = renderWithProviders(
    <StageRecordModal stageId={1} stageName="하수도" onClose={onClose} />,
  )
  return { onClose, ...view }
}

describe('StageRecordModal', () => {
  it('스테이지 역대 기록 이력을 최근순으로 보여준다', async () => {
    renderModal()

    expect(await screen.findByRole('dialog', { name: /하수도 · 역대 기록/ })).toBeInTheDocument()
    expect(await screen.findByText(/총 3회 클리어/)).toBeInTheDocument()
    expect(screen.getByText('1:24.21')).toBeInTheDocument()
  })

  it('이력을 선택하면 라운드 상세 패널이 열린다 (is-open)', async () => {
    const user = userEvent.setup()
    const { container } = renderModal()

    // 닫힌 패널은 aria-hidden이라 role로 조회되지 않는다. 클래스로 상태만 확인한다.
    const panel = container.querySelector('.modal-round-detail') as HTMLElement
    expect(panel).not.toHaveClass('is-open')

    await user.click(await screen.findByRole('button', { name: /1:24\.21 기록의 라운드 상세 보기/ }))

    expect(panel).toHaveClass('is-open')
    expect(screen.getByRole('complementary', { name: '라운드별 기록' })).toBeInTheDocument()
    expect(await screen.findByText('1라운드')).toBeInTheDocument()
    expect(screen.getByText('0:27.40')).toBeInTheDocument()
  })

  it('닫힌 상태에서는 라운드 패널 내부 버튼이 탭 이동 대상에 없다', async () => {
    renderModal()
    await screen.findByText(/총 3회 클리어/)

    expect(screen.queryByRole('button', { name: /날짜 목록/ })).not.toBeInTheDocument()
  })

  it('X 버튼을 누르면 onClose가 호출된다', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(screen.getByRole('button', { name: '닫기' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ESC 키를 누르면 onClose가 호출된다', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('배경(Backdrop)을 누르면 onClose가 호출된다', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    // 백드롭은 dialog의 부모 요소다.
    const dialog = await screen.findByRole('dialog')
    await user.click(dialog.parentElement as HTMLElement)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('모달 내부를 눌러도 닫히지 않는다', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()

    await user.click(await screen.findByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('이력 조회 실패 시 오류와 다시 시도 버튼을 표시한다', async () => {
    server.use(
      http.get('*/api/v1/users/me/records/stages/:stageId', () =>
        HttpResponse.json({ code: 'RC999', message: '이력 서버 오류' }, { status: 500 }),
      ),
    )

    renderModal()

    expect(await screen.findByRole('alert')).toHaveTextContent('이력 서버 오류')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('기록이 없는 스테이지는 빈 상태 문구를 표시한다', async () => {
    server.use(
      http.get('*/api/v1/users/me/records/stages/1', () =>
        HttpResponse.json({ stageId: 1, entries: [], bestTimeMs: null }),
      ),
    )
    renderWithProviders(<StageRecordModal stageId={1} stageName="하수도" onClose={vi.fn()} />)

    await waitForElementToBeRemoved(() => screen.queryByText('클리어 이력을 불러오는 중…'))
    expect(screen.getByText('아직 이 스테이지의 클리어 기록이 없습니다.')).toBeInTheDocument()
  })
})
