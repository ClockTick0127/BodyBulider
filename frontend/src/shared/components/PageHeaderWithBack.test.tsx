import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PageHeaderWithBack } from './PageHeaderWithBack'

describe('PageHeaderWithBack', () => {
  it('나가기 버튼 클릭 시 /rooms (방 목록 화면)로 이동한다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/mypage']}>
        <Routes>
          <Route path="/mypage" element={<PageHeaderWithBack />} />
          <Route path="/rooms" element={<div>방 목록 화면</div>} />
        </Routes>
      </MemoryRouter>,
    )

    const exitBtn = screen.getByRole('button', { name: '나가기' })
    await user.click(exitBtn)

    expect(screen.getByText('방 목록 화면')).toBeInTheDocument()
  })

  it('마이페이지에서 랭킹 진입 후 나가기 버튼 클릭 시 이전 화면이 아니라 /rooms로 이동한다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/rooms', '/mypage', '/ranking']} initialIndex={2}>
        <Routes>
          <Route path="/ranking" element={<PageHeaderWithBack />} />
          <Route path="/mypage" element={<div>마이페이지 화면</div>} />
          <Route path="/rooms" element={<div>방 목록 화면</div>} />
        </Routes>
      </MemoryRouter>,
    )

    const exitBtn = screen.getByRole('button', { name: '나가기' })
    await user.click(exitBtn)

    expect(screen.queryByText('마이페이지 화면')).not.toBeInTheDocument()
    expect(screen.getByText('방 목록 화면')).toBeInTheDocument()
  })
})
