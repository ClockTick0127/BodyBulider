import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CutscenePlayer } from './CutscenePlayer'

describe('CutscenePlayer', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  })

  it('영상이 끝나기 전에는 진행하지 않고 ended 이후 한 번만 진행한다', () => {
    const onEnded = vi.fn()
    render(<CutscenePlayer src="/cutscene.mp4" label="시작 컷씬" onEnded={onEnded} />)

    const video = screen.getByLabelText('시작 컷씬').querySelector('video')
    expect(video).not.toBeNull()
    expect(screen.queryByText('시작 컷씬')).not.toBeInTheDocument()
    expect(onEnded).not.toHaveBeenCalled()

    fireEvent.ended(video!)
    fireEvent.ended(video!)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('영상 로드 실패 시 게임 흐름을 계속한다', () => {
    const onEnded = vi.fn()
    render(<CutscenePlayer src="/missing.mp4" label="실패 컷씬" onEnded={onEnded} />)

    const video = screen.getByLabelText('실패 컷씬').querySelector('video')
    fireEvent.error(video!)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })
})
