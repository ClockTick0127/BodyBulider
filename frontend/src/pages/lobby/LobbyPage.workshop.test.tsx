import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '../../test/renderWithProviders'
import { server } from '../../mocks/setupTests'
import { authStore } from '../../mocks/stores/auth.store'
import { customMapsStore } from '../../mocks/stores/customMaps.store'
import { defaultUsers } from '../../mocks/data/users'
import { stages } from '../../mocks/data/game'
import { LobbyPage } from './LobbyPage'

/**
 * 창작마당(UGC) 맵 격리.
 *
 * 커스텀 맵은 `/workshop` 의 "이 맵으로 방 만들기" 로만 방에 걸려야 한다.
 * 일반 방 캐러셀에 섞이면 방장이 남의 UGC 맵을 마음대로 고를 수 있다.
 */
beforeEach(() => {
  authStore.setSessionUser(defaultUsers[0])
  customMapsStore.reset()
  // 로비는 WebRTC·STOMP를 붙잡는다. 테스트에서는 미디어 접근이 없으므로 경고만 무시한다.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** 지정한 stageId 가 걸린 방으로 응답하게 만든다. */
const mockRoom = (selectedStageId: number) => {
  server.use(
    http.get('*/api/v1/rooms/:roomCode', () =>
      HttpResponse.json({
        roomId: '00000000-0000-4000-8000-000000000009',
        roomCode: 'TEST',
        title: '테스트 방',
        isSecret: false,
        slotId: 1,
        isHost: true,
        selectedStageId,
        cutscenesEnabled: false,
        participants: [
          { userId: 'u-1', nickname: 'syncup', slotId: 1, isHost: true, isReady: true },
        ],
      }),
    ),
  )
}

/**
 * LobbyPage 는 useParams() 로 방 코드를 읽는다.
 * Route 정의 없이 렌더하면 params 가 비어 방 조회 자체가 일어나지 않는다.
 */
const renderLobby = () =>
  renderWithProviders(
    <Routes>
      <Route path="/rooms/:code" element={<LobbyPage />} />
    </Routes>,
    { route: '/rooms/TEST' },
  )

describe('일반 방 로비', () => {
  it('캐러셀에 공식 맵만 나오고 창작마당 맵은 나오지 않는다', async () => {
    mockRoom(1)
    renderLobby()

    // 공식 맵은 그대로 나온다.
    expect(await screen.findByText(stages[0].name)).toBeInTheDocument()
    expect(screen.getByText(stages[1].name)).toBeInTheDocument()

    // 창작마당 공개 맵은 캐러셀에 없어야 한다.
    for (const title of ['하늘 위의 도전', '용암 지대 탈출', '빙하 점프']) {
      expect(screen.queryByText(title)).not.toBeInTheDocument()
    }
    expect(screen.queryByText('UGC')).not.toBeInTheDocument()
  })

  it('서버 목록에 커스텀 stageId가 섞여 와도 걸러 낸다', async () => {
    mockRoom(1)
    server.use(
      http.get('*/api/v1/stages', () =>
        HttpResponse.json([
          ...stages.map(({ rounds: _rounds, ...stage }) => stage),
          {
            stage_id: 10000,
            name: '몰래 섞인 UGC',
            description: '여기 있으면 안 된다',
            difficulty: '중',
            thumbnail_url: null,
          },
        ]),
      ),
    )
    renderLobby()

    await screen.findByText(stages[0].name)
    expect(screen.queryByText('몰래 섞인 UGC')).not.toBeInTheDocument()
  })

  it('맵 선택 제목과 캐러셀을 보여 준다', async () => {
    mockRoom(1)
    renderLobby()

    expect(await screen.findByRole('heading', { name: '맵 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 맵' })).toBeInTheDocument()
  })
})

describe('창작마당 전용 방', () => {
  it('캐러셀 대신 걸린 맵 하나만 고정으로 보여 준다', async () => {
    mockRoom(10000)
    renderLobby()

    expect(await screen.findByText('하늘 위의 도전')).toBeInTheDocument()
    expect(screen.getByText('UGC')).toBeInTheDocument()
    expect(screen.getByText('창작마당 전용 맵')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '창작마당 맵' })).toBeInTheDocument()

    // 맵을 바꿀 수단이 화면에 없어야 한다.
    expect(screen.queryByRole('button', { name: '다음 맵' })).not.toBeInTheDocument()
    expect(screen.queryByText(stages[0].name)).not.toBeInTheDocument()
  })

  it('맵을 바꿀 수 없다고 안내한다', async () => {
    mockRoom(10000)
    renderLobby()

    expect(await screen.findByText(/이 방의 맵은 바꿀 수 없어요/)).toBeInTheDocument()
  })

  /**
   * 참가자 동기화: 라우트 state 없이 코드로 들어와도 stageId 로 상세를 다시 조회해
   * 이름·난이도·설명이 깨지지 않아야 한다.
   */
  it('코드로 들어온 참가자도 맵 정보를 정상 로딩한다', async () => {
    mockRoom(10002)
    renderLobby()

    expect(await screen.findByText('빙하 점프')).toBeInTheDocument()
    expect(screen.getByText(/미끄러운 빙판/)).toBeInTheDocument()
    // 시작 버튼 라벨에도 맵 이름이 들어간다.
    await waitFor(() => expect(screen.getAllByText('빙하 점프').length).toBeGreaterThan(0))
  })

  it('맵 상세 조회에 실패해도 화면이 깨지지 않는다', async () => {
    mockRoom(10000)
    server.use(
      http.get('*/api/v1/custom-maps/:stageId', () =>
        HttpResponse.json({ code: 'CM002', message: 'not found' }, { status: 404 }),
      ),
    )
    renderLobby()

    // 이름을 못 받아도 자리는 유지된다.
    expect(await screen.findByText('창작마당 전용 맵')).toBeInTheDocument()
    expect(screen.getByText('UGC')).toBeInTheDocument()
  })
})
