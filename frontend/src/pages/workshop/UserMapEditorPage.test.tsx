import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/renderWithProviders'
import { server } from '../../mocks/setupTests'
import { authStore } from '../../mocks/stores/auth.store'
import { customMapsStore } from '../../mocks/stores/customMaps.store'
import { defaultUsers } from '../../mocks/data/users'
import { UserMapEditorPage } from './UserMapEditorPage'

/**
 * 클리어 검증 흐름.
 *
 * 명세서는 이 검증을 `WorkshopPage.test.tsx`에 두라고 했으나, 검증 상태는 에디터
 * (`MapEditorPage` 의 workshop variant)가 들고 있다. WorkshopPage에는 에디터가 없으므로
 * 실제 동작을 확인할 수 있는 이 파일에 둔다.
 */
beforeEach(() => {
  authStore.setSessionUser(defaultUsers[0])
  customMapsStore.reset()
})

/** 테스트 플레이가 클리어에 성공/실패했다고 응답하게 만든다. */
const mockSimulation = (cleared: boolean) => {
  server.use(
    http.post('*/api/v1/custom-maps/simulate', () =>
      HttpResponse.json({
        intervalMs: 30,
        points: [[0, 0, 0, 0], [10, 10, 1, 1]],
        result: cleared,
        grounded: null,
      }),
    ),
  )
}

const newMapRoute = '/workshop/editor?title=%EA%B2%80%EC%A6%9D%20%ED%85%8C%EC%8A%A4%ED%8A%B8'

describe('클리어 검증', () => {
  it('새 맵은 미검증 상태로 시작한다', async () => {
    renderWithProviders(<UserMapEditorPage />, { route: newMapRoute })

    expect(await screen.findByText('⚠️ 클리어 미검증')).toBeInTheDocument()
    expect(screen.queryByText('✅ 클리어 검증 완료')).not.toBeInTheDocument()
  })

  it('테스트 플레이에 성공하면 검증 완료로 바뀐다', async () => {
    const user = userEvent.setup()
    mockSimulation(true)
    renderWithProviders(<UserMapEditorPage />, { route: newMapRoute })
    await screen.findByText('⚠️ 클리어 미검증')

    await user.click(screen.getByRole('button', { name: /테스트 플레이/ }))

    expect(await screen.findByText('✅ 클리어 검증 완료')).toBeInTheDocument()
  })

  it('테스트 플레이에 실패하면 미검증을 유지한다', async () => {
    const user = userEvent.setup()
    mockSimulation(false)
    renderWithProviders(<UserMapEditorPage />, { route: newMapRoute })
    await screen.findByText('⚠️ 클리어 미검증')

    await user.click(screen.getByRole('button', { name: /테스트 플레이/ }))

    expect(await screen.findByText(/클리어에 실패했습니다/)).toBeInTheDocument()
    expect(screen.getByText('⚠️ 클리어 미검증')).toBeInTheDocument()
  })

  it('맵을 수정하면 검증이 무효화된다', async () => {
    const user = userEvent.setup()
    mockSimulation(true)
    renderWithProviders(<UserMapEditorPage />, { route: newMapRoute })
    await user.click(await screen.findByRole('button', { name: /테스트 플레이/ }))
    await screen.findByText('✅ 클리어 검증 완료')

    // 프리셋을 바꾸면 지형이 통째로 달라진다. (commitState 경유)
    await user.selectOptions(screen.getByDisplayValue('프리셋 선택…'), 'sampleB')

    expect(await screen.findByText('⚠️ 클리어 미검증')).toBeInTheDocument()
  })

  /**
   * 회귀 방지: 드래그 이동은 commitState 를 거치지 않는다.
   * 드래그 중에는 setMapState 만 하고 mouseup 에서 히스토리를 직접 쌓기 때문에,
   * 무효화를 mouseup 에도 걸어 두지 않으면 지형을 옮겨 놓고도 검증 완료로 남는다.
   * 그러면 옛 포즈 그대로 공개 저장이 통과한다.
   */
  it('요소를 드래그로 옮기면 검증이 무효화된다', async () => {
    const user = userEvent.setup()
    mockSimulation(true)
    const { container } = renderWithProviders(<UserMapEditorPage />, { route: newMapRoute })
    await user.click(await screen.findByRole('button', { name: /테스트 플레이/ }))
    await screen.findByText('✅ 클리어 검증 완료')

    const canvas = container.querySelector('canvas')!
    /*
     * jsdom 은 레이아웃을 계산하지 않아 clientWidth 가 0이고, 그러면 fitView 가 조기 반환한다.
     * 결과적으로 뷰 변환은 초기값(배율 1, 오프셋 0)이라 화면 좌표 = 맵 좌표다.
     * getBoundingClientRect 도 0이므로 clientX 가 그대로 맵 x 가 된다.
     */
    /*
     * fireEvent 를 쓴다. 이벤트를 직접 dispatch 하면 mousemove 의 setMapState 가
     * 다음 이벤트 전에 반영되지 않아, mouseup 이 옛 mapState 를 보고 "안 바뀜"으로 판단한다.
     */
    // 시작점(맵 좌표 90,870)을 잡아 끈다.
    fireEvent.mouseDown(canvas, { clientX: 90, clientY: 870, button: 0 })
    fireEvent.mouseMove(window, { clientX: 200, clientY: 800 })
    fireEvent.mouseUp(window)

    expect(await screen.findByText('⚠️ 클리어 미검증')).toBeInTheDocument()
  })

  it('미검증 상태로 공개 저장을 시도하면 차단하고 안내한다', async () => {
    const user = userEvent.setup()
    let saveCalled = false
    server.use(
      http.post('*/api/v1/custom-maps', () => {
        saveCalled = true
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    renderWithProviders(<UserMapEditorPage />, { route: newMapRoute })
    await screen.findByText('⚠️ 클리어 미검증')

    await user.type(screen.getByPlaceholderText(/어떤 맵인지/), '설명')
    // 공개 체크박스는 기본값이 켜져 있다.
    await user.click(screen.getByRole('button', { name: /창작마당에 저장/ }))

    expect(
      await screen.findByText(/클리어 검증\(테스트 플레이 성공\)을 완료해야/),
    ).toBeInTheDocument()
    // 서버로 요청 자체가 나가면 안 된다.
    await waitFor(() => expect(saveCalled).toBe(false))
  })

  it('공개를 켜 두면 저장 전에 경고 문구를 보여 준다', async () => {
    renderWithProviders(<UserMapEditorPage />, { route: newMapRoute })

    expect(await screen.findByText(/공개 업로드하려면/)).toBeInTheDocument()
  })

  it('비공개로 내리면 경고가 사라지고 검증 없이 저장할 수 있다', async () => {
    const user = userEvent.setup()
    let savedBody: Record<string, unknown> | null = null
    server.use(
      http.post('*/api/v1/custom-maps', async ({ request }) => {
        savedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...savedBody, stage_id: 10100, is_mine: true }, { status: 201 })
      }),
    )
    renderWithProviders(<UserMapEditorPage />, { route: newMapRoute })
    await screen.findByText('⚠️ 클리어 미검증')

    await user.type(screen.getByPlaceholderText(/어떤 맵인지/), '설명')
    await user.click(screen.getByRole('checkbox', { name: /공개/ }))

    await waitFor(() => expect(screen.queryByText(/공개 업로드하려면/)).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /창작마당에 저장/ }))

    await waitFor(() => expect(savedBody).not.toBeNull())
    expect(savedBody!.is_public).toBe(false)
    // 비공개 저장에는 검증 포즈를 싣지 않는다.
    expect(savedBody!.poses).toBeUndefined()
  })

  it('검증 후 공개 저장하면 그때 성공한 포즈를 함께 보낸다', async () => {
    const user = userEvent.setup()
    let savedBody: Record<string, unknown> | null = null
    mockSimulation(true)
    server.use(
      http.post('*/api/v1/custom-maps', async ({ request }) => {
        savedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...savedBody, stage_id: 10100, is_mine: true }, { status: 201 })
      }),
    )
    renderWithProviders(<UserMapEditorPage />, { route: newMapRoute })
    await user.click(await screen.findByRole('button', { name: /테스트 플레이/ }))
    await screen.findByText('✅ 클리어 검증 완료')

    await user.type(screen.getByPlaceholderText(/어떤 맵인지/), '설명')
    await user.click(screen.getByRole('button', { name: /창작마당에 저장/ }))

    await waitFor(() => expect(savedBody).not.toBeNull())
    expect(savedBody!.is_public).toBe(true)
    expect(Array.isArray(savedBody!.poses)).toBe(true)
  })

  /*
   * 서버는 공개 저장 요청에 poses 가 없으면 저장된 is_cleared 와 무관하게 ST004 를 던진다.
   * 포즈는 불러올 때 받지 못하므로, 배지를 ✅ 로 띄우면 "검증 완료인데 저장은 400"이 된다.
   * 그래서 불러온 맵은 항상 미검증에서 시작한다.
   */
  it('검증된 기존 맵도 미검증으로 열리고 재실행을 안내한다', async () => {
    renderWithProviders(<UserMapEditorPage />, { route: '/workshop/editor?stageId=10000' })

    await screen.findByDisplayValue('하늘 위의 도전')
    expect(screen.getByText('⚠️ 클리어 미검증')).toBeInTheDocument()
    expect(screen.getByText(/수정 없이 저장할 때도 한 번 실행/)).toBeInTheDocument()
  })

  it('미검증 상태로 저장된 기존 맵은 재실행 안내 없이 미검증만 표시한다', async () => {
    renderWithProviders(<UserMapEditorPage />, { route: '/workshop/editor?stageId=10006' })

    await screen.findByDisplayValue('비공개 테스트맵')
    expect(screen.getByText('⚠️ 클리어 미검증')).toBeInTheDocument()
    // 비공개 맵이라 공개 경고 자체가 뜨지 않는다.
    expect(screen.queryByText(/수정 없이 저장할 때도/)).not.toBeInTheDocument()
  })
})
