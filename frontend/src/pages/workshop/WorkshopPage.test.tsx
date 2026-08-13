import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/renderWithProviders'
import { authStore } from '../../mocks/stores/auth.store'
import { customMapsStore } from '../../mocks/stores/customMaps.store'
import { defaultUsers } from '../../mocks/data/users'
import { WorkshopPage } from './WorkshopPage'

beforeEach(() => {
  authStore.setSessionUser(defaultUsers[0])
  customMapsStore.reset()
})

const findMineTab = () => screen.findByRole('tab', { name: /내 맵/ })

describe('WorkshopPage', () => {
  it('공개 맵 목록과 개수를 표시한다', async () => {
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })

    expect(await screen.findByText('하늘 위의 도전')).toBeInTheDocument()
    // 비공개 맵은 탐색 탭에 나오면 안 된다.
    expect(screen.queryByText('비공개 테스트맵')).not.toBeInTheDocument()
    expect(await screen.findByText('6개의 맵')).toBeInTheDocument()
  })

  it('검색어를 넣으면 결과가 좁혀진다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await screen.findByText('하늘 위의 도전')

    await user.type(screen.getByPlaceholderText('맵 이름 또는 제작자 검색'), '빙하')

    expect(await screen.findByText('빙하 점프')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('하늘 위의 도전')).not.toBeInTheDocument())
  })

  it('난이도 칩으로 필터링한다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await screen.findByText('하늘 위의 도전')

    await user.click(screen.getByRole('button', { name: '상' }))

    expect(await screen.findByText('용암 지대 탈출')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('초보자 코스')).not.toBeInTheDocument())
  })

  it('결과가 없으면 빈 상태 문구를 보여준다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await screen.findByText('하늘 위의 도전')

    await user.type(screen.getByPlaceholderText('맵 이름 또는 제작자 검색'), '존재하지않는맵이름')

    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument()
  })

  it('내 맵 탭에서 비공개 맵을 볼 수 있다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await user.click(await findMineTab())

    expect(await screen.findByText('비공개 테스트맵')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '○ 비공개' })).toBeInTheDocument()
  })

  it('공개 토글을 누르면 카드 상태가 즉시 반영된다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await user.click(await findMineTab())
    await screen.findByText('하늘 위의 도전')

    // 10000은 검증이 끝난 공개 맵이다. 비공개로 내려 본다.
    await user.click(screen.getByRole('button', { name: '● 공개 중' }))

    expect(await screen.findByRole('button', { name: '○ 비공개' })).toBeInTheDocument()
    expect(await screen.findByText('비공개로 변경되었습니다.')).toBeInTheDocument()
    // 서버 상태도 실제로 바뀌어야 한다. (낙관적 갱신만 하고 끝나면 안 된다)
    expect(customMapsStore.find(10000)?.is_public).toBe(false)
    /*
     * 검증 결과는 사라진다. 서버는 저장할 때마다 이번 요청의 poses 로만 판정하는데
     * 목록에는 포즈가 없어 미검증으로 저장된다. 다시 공개하려면 에디터에서 재검증해야 한다.
     */
    expect(customMapsStore.find(10000)?.is_cleared).toBe(false)
  })

  it('비공개 맵은 목록에서 공개로 올릴 수 없다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await user.click(await findMineTab())
    await screen.findByText('비공개 테스트맵')

    expect(screen.getByText('⚠️ 클리어 미검증')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: '○ 비공개' })
    expect(toggle).toBeDisabled()
    // 공개는 에디터에서만 가능하다. (목록에는 검증 포즈를 만들 수단이 없다)
    expect(toggle).toHaveAttribute('title', expect.stringContaining('편집'))
    expect(customMapsStore.find(10006)?.is_public).toBe(false)
  })

  it('검증된 맵에는 미검증 표시가 없다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await user.click(await findMineTab())
    await screen.findByText('하늘 위의 도전')

    // 미검증 뱃지는 10006 하나뿐이어야 한다.
    expect(screen.getAllByText('⚠️ 클리어 미검증')).toHaveLength(1)
  })

  it('맵 카드를 누르면 상세 모달이 열린다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await user.click(await screen.findByRole('button', { name: /하늘 위의 도전/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('CUSTOM MAP · STAGE 10000')).toBeInTheDocument()
    expect(within(dialog).getByText('정상화')).toBeInTheDocument()
    // Phase 1에서 평점은 값이 없다는 뜻의 —로 둔다.
    expect(within(dialog).getByText('—')).toBeInTheDocument()
    // 좋아요는 Phase 2라 비활성이어야 한다.
    expect(within(dialog).getByRole('button', { name: /♡/ })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: /이 맵으로 방 만들기/ })).toBeEnabled()
  })

  it('상세 모달에서 방 만들기를 누르면 맵이 지정된 방 생성 모달이 열린다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await user.click(await screen.findByRole('button', { name: /하늘 위의 도전/ }))
    await user.click(await screen.findByRole('button', { name: /이 맵으로 방 만들기/ }))

    expect(await screen.findByRole('heading', { name: '방 만들기' })).toBeInTheDocument()
    expect(screen.getByLabelText('방 제목')).toHaveValue('하늘 위의 도전 방')
  })

  it('새 맵 만들기 모달은 서버 검증 기준을 안내한다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WorkshopPage />, { route: '/workshop' })
    await user.click(await screen.findByRole('button', { name: '+ 새 맵 만들기' }))

    expect(await screen.findByRole('heading', { name: '새 맵 만들기' })).toBeInTheDocument()
    expect(screen.getByText(/JUMP_PAD, WIND, KILL_ZONE, WATER_PIPE/)).toBeInTheDocument()
    // 제목이 비어 있으면 에디터로 넘어갈 수 없다.
    expect(screen.getByRole('button', { name: /에디터 열기/ })).toBeDisabled()
  })
})
