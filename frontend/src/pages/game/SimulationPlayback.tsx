import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { buildActionTimeline } from '@/features/character/buildActionTimeline'
import { SpriteCharacter } from '@/features/character/SpriteCharacter'
import type { GameGimmick, SimulationFrame } from '@/features/game/services/gameProtocol'
import { formatClearTime } from '@/shared/utils/formatClearTime'
import { hasMapGimmick } from './mapGimmickUtils'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

type PlaybackView = { index: number }

type SimulationPlaybackProps = {
  active: boolean
  finished: boolean
  failed: boolean
  frames: SimulationFrame[]
  intervalMs: number
  maxDurationMs: number
  mapWidth: number
  gimmicks: GameGimmick[]
  worldRef: RefObject<HTMLDivElement | null>
  hudRoot: HTMLElement | null
  cameraScale: number
  percentX: (value: number) => number
  percentY: (value: number) => number
  clampCamera: (percent: number, scale: number) => number
  isSfxOn: boolean
  sfxVolume: number
  onComplete: () => void
}

/** Isolates the high-frequency server-frame clock from the complete GamePage. */
export const SimulationPlayback = memo(function SimulationPlayback({
  active, finished, failed, frames, intervalMs, maxDurationMs, mapWidth, gimmicks,
  worldRef, hudRoot, cameraScale, percentX, percentY, clampCamera,
  isSfxOn, sfxVolume, onComplete,
}: SimulationPlaybackProps) {
  const [view, setView] = useState<PlaybackView>(() => {
    const index = finished ? Math.max(0, frames.length - 1) : 0
    return { index }
  })
  const characterRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const lastProcessedIndexRef = useRef(0)
  const jumpSoundPlayedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const audioSettingsRef = useRef({ isSfxOn, sfxVolume })
  const gimmicksRef = useRef(gimmicks)
  const visualConfigRef = useRef({ cameraScale, clampCamera, percentX, percentY, worldRef })
  onCompleteRef.current = onComplete
  audioSettingsRef.current = { isSfxOn, sfxVolume }
  gimmicksRef.current = gimmicks
  visualConfigRef.current = { cameraScale, clampCamera, percentX, percentY, worldRef }

  const actionTimeline = useMemo(
    () => buildActionTimeline(frames, intervalMs, mapWidth),
    [frames, intervalMs, mapWidth],
  )

  const applyVisualPosition = useCallback((x: number, y: number) => {
    const visualConfig = visualConfigRef.current
    const xPercent = visualConfig.percentX(x)
    const yPercent = visualConfig.percentY(y)
    const character = characterRef.current
    const world = visualConfig.worldRef.current

    if (character) {
      character.style.setProperty('--position-x', `${xPercent}cqw`)
      character.style.setProperty('--position-y', `${yPercent}cqh`)
    }
    if (world) {
      world.style.setProperty('--camera-x', `${visualConfig.clampCamera(xPercent, visualConfig.cameraScale)}%`)
      world.style.setProperty('--camera-y', `${visualConfig.clampCamera(yPercent, visualConfig.cameraScale)}%`)
    }
  }, [])

  useEffect(() => {
    const index = finished ? Math.max(0, frames.length - 1) : 0
    lastProcessedIndexRef.current = index
    jumpSoundPlayedRef.current = false
    setView({ index })
  }, [finished, frames])

  useLayoutEffect(() => {
    if (active) return
    const index = finished ? Math.max(0, frames.length - 1) : 0
    const [x = 0, y = 0] = frames[index] ?? []
    applyVisualPosition(x, y)
  }, [active, applyVisualPosition, finished, frames])

  useEffect(() => {
    if (!active || frames.length === 0 || intervalMs <= 0) return
    const startedAt = performance.now()
    let displayedIndex = -1

    const processSkippedFrameEvents = (nextIndex: number) => {
      const audioSettings = audioSettingsRef.current
      if (!audioSettings.isSfxOn || jumpSoundPlayedRef.current || !hasMapGimmick(gimmicksRef.current, 'JUMP_PAD')) {
        lastProcessedIndexRef.current = nextIndex
        return
      }
      for (let index = lastProcessedIndexRef.current + 1; index <= nextIndex; index += 1) {
        const previousVy = frames[index - 1]?.[3] ?? 0
        const currentVy = frames[index]?.[3] ?? 0
        const launched = actionTimeline[index] !== 'move'
          && currentVy < -3.5
          && currentVy - previousVy < -3.5
        if (!launched) continue
        jumpSoundPlayedRef.current = true
        const audio = new Audio('/sounds/Jump_Platforms.mp3')
        audio.volume = audioSettings.sfxVolume
        audio.play().catch(() => {})
        break
      }
      lastProcessedIndexRef.current = nextIndex
    }

    const play = (now: number) => {
      const elapsed = Math.max(0, now - startedAt)
      const frameIndex = Math.min(frames.length - 1, Math.floor(elapsed / intervalMs))
      const nextFrameIndex = Math.min(frames.length - 1, frameIndex + 1)
      const frameProgress = Math.min(1, (elapsed - frameIndex * intervalMs) / intervalMs)
      const [x, y] = frames[frameIndex]
      const [nextX, nextY] = frames[nextFrameIndex]

      applyVisualPosition(
        x + (nextX - x) * frameProgress,
        y + (nextY - y) * frameProgress,
      )

      if (frameIndex !== displayedIndex) {
        displayedIndex = frameIndex
        processSkippedFrameEvents(frameIndex)
        setView({ index: frameIndex })
      }
      if (frameIndex === frames.length - 1) {
        onCompleteRef.current()
        return
      }
      rafRef.current = requestAnimationFrame(play)
    }

    const [x, y] = frames[0]
    applyVisualPosition(x, y)
    setView({ index: 0 })
    rafRef.current = requestAnimationFrame(play)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, actionTimeline, applyVisualPosition, frames, intervalMs])

  const action = finished && failed ? 'float' : actionTimeline[view.index] ?? 'idle'
  const facing = (frames[view.index]?.[2] ?? 0) < 0 ? 'left' : 'right'
  const isWalking = active && action === 'move'

  useEffect(() => {
    if (!isWalking || !isSfxOn) return
    const audio = new Audio('/sounds/Walking_Wet.mp3')
    audio.loop = true
    audio.volume = sfxVolume * 0.8
    audio.play().catch(() => {})
    return () => {
      audio.pause()
      audio.currentTime = 0
    }
  }, [isWalking, isSfxOn, sfxVolume])

  const remainingMs = Math.max(0, maxDurationMs - view.index * intervalMs)
  const remainingTime = formatClearTime(remainingMs)
  const progress = clamp01(remainingMs / maxDurationMs)
  const timerStyle = {
    '--simulation-progress': progress,
    '--simulation-step-ms': `${intervalMs}ms`,
  } as CSSProperties

  return (
    <>
      <SpriteCharacter
        className="game-ball"
        action={action}
        facing={facing}
        xPercent={0}
        yPercent={0}
        positionManagedExternally
        elementRef={characterRef}
      />
      {active && hudRoot && createPortal(
        <div className="simulation-timer" role="timer" aria-label={`시뮬레이션 남은 시간 ${remainingTime}`}>
          <div className="simulation-timer__row">
            <span><i aria-hidden="true">⏱</i> 남은 시간</span>
            <strong>{remainingTime}</strong>
            <small>/ {formatClearTime(maxDurationMs)}</small>
          </div>
          <div className="simulation-timer__track" aria-hidden="true"><i style={timerStyle} /></div>
        </div>,
        hudRoot,
      )}
    </>
  )
})
