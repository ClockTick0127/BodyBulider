import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StageClearModal } from './StageClearModal'

describe('GamePage 로비 이동 로직 테스트', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('StageClearModal에서 onLobby가 호출되면 전달받은 로비 이동 콜백이 작동한다', async () => {
    const user = userEvent.setup()
    const handleLobby = vi.fn()

    render(
      <StageClearModal
        isSuccess={true}
        stageNumber={1}
        rounds={[{ round: 1, time: '00:30' }]}
        totalClearTime="00:30"
        onLobby={handleLobby}
      />,
    )

    const lobbyButton = screen.getByRole('button', { name: /로비/i })
    await user.click(lobbyButton)

    expect(handleLobby).toHaveBeenCalledTimes(1)
  })
})
