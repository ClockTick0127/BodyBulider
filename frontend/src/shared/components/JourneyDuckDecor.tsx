import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import duckMove from '../../assets/character/duck_move.png'
import './JourneyDuckDecor.css'

type DuckWalk = {
  id: number
  direction: 'left' | 'right'
  lane: 'header' | 'ground'
  duration: number
}

const nextDelay = () => 10_000 + Math.random() * 12_000

/** Ambient duck silhouettes and a rare walking game character. */
export function JourneyDuckDecor({ variant = 'default' }: { variant?: 'default' | 'riverside' }) {
  const [walk, setWalk] = useState<DuckWalk | null>(null)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let disposed = false
    let launchTimer = 0
    let clearTimer = 0

    const schedule = (delay: number) => {
      launchTimer = window.setTimeout(() => {
        if (disposed || document.hidden) {
          schedule(4_000)
          return
        }

        const duration = 6.5 + Math.random() * 2.5
        setWalk({
          id: Date.now(),
          direction: Math.random() > .5 ? 'right' : 'left',
          lane: variant === 'riverside' ? 'ground' : Math.random() > .68 ? 'header' : 'ground',
          duration,
        })

        clearTimer = window.setTimeout(() => {
          setWalk(null)
          schedule(nextDelay())
        }, duration * 1_000)
      }, delay)
    }

    schedule(4_000 + Math.random() * 5_000)
    return () => {
      disposed = true
      window.clearTimeout(launchTimer)
      window.clearTimeout(clearTimer)
    }
  }, [variant])

  const walkingDuck = walk && (
    <div
      key={walk.id}
      className={`journey-duck-walk journey-duck-walk--${walk.direction} journey-duck-walk--${walk.lane}`}
      aria-hidden="true"
      style={{
        '--duck-walk-duration': `${walk.duration}s`,
        '--duck-move-sheet': `url("${duckMove}")`,
      } as CSSProperties}
    >
      <i />
    </div>
  )

  return (
    <div className={`journey-duck-decor journey-duck-decor--${variant}`} aria-hidden="true">
      <div className="journey-duck-clouds">
        {Array.from({ length: 6 }, (_, index) => (
          <i className={`journey-duck-shape journey-duck-shape--${index + 1}`} key={index} />
        ))}
      </div>
      {walk?.lane === 'header' ? createPortal(walkingDuck, document.body) : walkingDuck}
    </div>
  )
}
