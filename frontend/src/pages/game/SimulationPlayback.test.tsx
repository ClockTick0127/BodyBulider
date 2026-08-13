import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimulationPlayback } from './SimulationPlayback'

describe('SimulationPlayback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not restart playback when coordinate callback identities change', () => {
    let nextRafId = 1
    const callbacks = new Map<number, FrameRequestCallback>()
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = nextRafId++
      callbacks.set(id, callback)
      return id
    })
    const cancelAnimationFrame = vi.fn((id: number) => callbacks.delete(id))
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const world = document.createElement('div')
    const worldRef = createRef<HTMLDivElement>()
    worldRef.current = world
    const frames = [
      [0, 0, 1, 0],
      [10, 10, 1, 0],
      [20, 20, 1, 0],
    ] as const
    const commonProps = {
      active: true,
      finished: false,
      failed: false,
      frames: frames.map((frame) => [...frame]) as [number, number, number, number][],
      intervalMs: 50,
      maxDurationMs: 15000,
      mapWidth: 1000,
      gimmicks: [],
      worldRef,
      hudRoot: null,
      cameraScale: 2,
      clampCamera: (percent: number) => percent,
      isSfxOn: false,
      sfxVolume: 1,
      onComplete: vi.fn(),
    }

    const { rerender } = render(
      <SimulationPlayback {...commonProps} percentX={(value) => value} percentY={(value) => value} />,
    )
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    act(() => {
      rerender(
        <SimulationPlayback {...commonProps} percentX={(value) => value * 2} percentY={(value) => value * 2} />,
      )
    })

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).not.toHaveBeenCalled()
  })
})
