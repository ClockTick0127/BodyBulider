import { useEffect, useRef, useState, type CSSProperties } from 'react'
import happyDuck from '../../assets/happy-duck.png'
import './FloatingDuckEasterEgg.css'

type DuckConfig = {
  topVh: number
  size: number
  duration: number
  elapsed: number
}

type Point = { x: number; y: number }
type CursorSample = Point & { time: number }

const CURSOR_RADIUS = 10
const DUCK_COLLISION_SCALE = 0.36
const PHYSICS_STEP = 1 / 120
const PADDLE_RESTITUTION = 1.08
const PADDLE_GRIP = 0.16
const IMPACT_STRENGTH = 0.7
const MIN_IMPACT_SPEED = 10
const MAX_DUCK_SPEED = 1250
const MAX_ANGULAR_SPEED = 9
const LINEAR_DRAG = 0.12
const ANGULAR_DRAG = 0.45

export function FloatingDuckEasterEgg() {
  const [duck] = useState<DuckConfig | null>(() => {
    if (Math.random() >= 0.3) return null

    return {
      topVh: 12 + Math.random() * 62,
      size: 110 + Math.random() * 70,
      duration: 13 + Math.random() * 7,
      // The old negative animation delay made the duck begin partway across.
      elapsed: Math.random() * 8,
    }
  })
  const [removed, setRemoved] = useState(false)
  const duckRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!duck) return

    const element = duckRef.current
    if (!element) return

    const startX = -duck.size - window.innerWidth * 0.05
    const endX = window.innerWidth * 1.05
    const progress = Math.min(duck.elapsed / duck.duration, 1)
    const position: Point = {
      x: startX + (endX - startX) * progress,
      y: (window.innerHeight * duck.topVh) / 100 - window.innerHeight * 0.05 * progress,
    }
    const velocity: Point = {
      x: (endX - startX) / duck.duration,
      y: (-window.innerHeight * 0.05) / duck.duration,
    }
    const cursorVelocity: Point = { x: 0, y: 0 }
    let cursor: Point | null = null
    let lastCursor: CursorSample | null = null
    let isPhysicsActive = false
    let angle = 0
    let angularVelocity = 0
    let hasEnteredViewport = false
    let previousTime = performance.now()
    let accumulator = 0
    let animationFrame = 0

    const duckRadius = duck.size * DUCK_COLLISION_SCALE

    const limitSpeed = () => {
      const speed = Math.hypot(velocity.x, velocity.y)
      if (speed <= MAX_DUCK_SPEED) return
      const ratio = MAX_DUCK_SPEED / speed
      velocity.x *= ratio
      velocity.y *= ratio
    }

    const collideWithCursor = (collisionPoint: Point, pointerVelocity: Point) => {
      const centerX = position.x + duck.size / 2
      const centerY = position.y + element.offsetHeight / 2
      const dx = centerX - collisionPoint.x
      const dy = centerY - collisionPoint.y
      const distance = Math.hypot(dx, dy)
      const contactDistance = duckRadius + CURSOR_RADIUS
      if (distance >= contactDistance) return false

      const pointerSpeed = Math.hypot(pointerVelocity.x, pointerVelocity.y)
      const nx = distance > 0.01
        ? dx / distance
        : pointerSpeed > 0.01 ? pointerVelocity.x / pointerSpeed : 1
      const ny = distance > 0.01
        ? dy / distance
        : pointerSpeed > 0.01 ? pointerVelocity.y / pointerSpeed : 0

      position.x += nx * (contactDistance - distance + 0.5)
      position.y += ny * (contactDistance - distance + 0.5)

      // Match MainPage's ball: reflect in the moving cursor's frame and carry
      // some of the swipe's tangential force into both travel and rotation.
      const relativeX = velocity.x - pointerVelocity.x
      const relativeY = velocity.y - pointerVelocity.y
      const normalSpeed = relativeX * nx + relativeY * ny
      if (normalSpeed >= -MIN_IMPACT_SPEED) return false

      const impulse = -(1 + PADDLE_RESTITUTION) * normalSpeed * IMPACT_STRENGTH
      const tangentX = -ny
      const tangentY = nx
      const pointerTangentSpeed = (
        pointerVelocity.x * tangentX + pointerVelocity.y * tangentY
      ) * IMPACT_STRENGTH
      velocity.x += impulse * nx + pointerTangentSpeed * PADDLE_GRIP * tangentX
      velocity.y += impulse * ny + pointerTangentSpeed * PADDLE_GRIP * tangentY
      angularVelocity += pointerTangentSpeed / Math.max(duckRadius, 1) * 0.7
      angularVelocity = Math.max(-MAX_ANGULAR_SPEED, Math.min(MAX_ANGULAR_SPEED, angularVelocity))
      limitSpeed()

      if (!isPhysicsActive) {
        isPhysicsActive = true
        element.classList.add('is-physics-active')
      }
      return true
    }

    const closestPointOnCursorPath = (from: Point, to: Point) => {
      const centerX = position.x + duck.size / 2
      const centerY = position.y + element.offsetHeight / 2
      const dx = to.x - from.x
      const dy = to.y - from.y
      const lengthSquared = dx * dx + dy * dy
      if (lengthSquared < 0.01) return to
      const projection = Math.max(0, Math.min(1,
        ((centerX - from.x) * dx + (centerY - from.y) * dy) / lengthSquared,
      ))
      return { x: from.x + dx * projection, y: from.y + dy * projection }
    }

    const simulatePhysics = (delta: number) => {
      const linearDrag = Math.max(0, 1 - LINEAR_DRAG * delta)
      velocity.x *= linearDrag
      velocity.y *= linearDrag
      position.x += velocity.x * delta
      position.y += velocity.y * delta

      angularVelocity *= Math.max(0, 1 - ANGULAR_DRAG * delta)
      angle += angularVelocity * delta

      if (cursor) {
        const activeCursorVelocity = lastCursor && performance.now() - lastCursor.time < 70
          ? cursorVelocity
          : { x: 0, y: 0 }
        collideWithCursor(cursor, activeCursorVelocity)
      }
    }

    const paint = () => {
      element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) rotate(${angle}rad)`
    }

    const isOutsideViewport = () => {
      const rect = element.getBoundingClientRect()
      const isVisible =
        rect.right > 0 &&
        rect.left < window.innerWidth &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      hasEnteredViewport ||= isVisible
      return hasEnteredViewport && !isVisible
    }

    const animate = (time: number) => {
      const frameDelta = Math.min((time - previousTime) / 1000, 0.05)
      previousTime = time

      if (isPhysicsActive) {
        accumulator += frameDelta
        while (accumulator >= PHYSICS_STEP) {
          simulatePhysics(PHYSICS_STEP)
          accumulator -= PHYSICS_STEP
        }
      } else {
        position.x += velocity.x * frameDelta
        position.y += velocity.y * frameDelta
        if (cursor) {
          const activeCursorVelocity = lastCursor && performance.now() - lastCursor.time < 70
            ? cursorVelocity
            : { x: 0, y: 0 }
          collideWithCursor(cursor, activeCursorVelocity)
        }
      }

      paint()
      if (isOutsideViewport()) {
        setRemoved(true)
        return
      }
      animationFrame = requestAnimationFrame(animate)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const nextCursor = { x: event.clientX, y: event.clientY }
      const now = performance.now()
      const elapsed = lastCursor ? Math.max((now - lastCursor.time) / 1000, 1 / 240) : 0
      const measuredVelocity = lastCursor
        ? { x: (nextCursor.x - lastCursor.x) / elapsed, y: (nextCursor.y - lastCursor.y) / elapsed }
        : { x: 0, y: 0 }
      cursorVelocity.x = cursorVelocity.x * 0.35 + measuredVelocity.x * 0.65
      cursorVelocity.y = cursorVelocity.y * 0.35 + measuredVelocity.y * 0.65

      const collisionPoint = lastCursor
        ? closestPointOnCursorPath(lastCursor, nextCursor)
        : nextCursor
      collideWithCursor(collisionPoint, cursorVelocity)
      cursor = nextCursor
      lastCursor = { ...nextCursor, time: now }
    }

    const handlePointerLeave = () => {
      cursor = null
      cursorVelocity.x = 0
      cursorVelocity.y = 0
      lastCursor = null
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', handlePointerLeave)
    animationFrame = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationFrame)
      window.removeEventListener('pointermove', handlePointerMove)
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [duck])

  if (!duck || removed) return null

  return (
    <div
      ref={duckRef}
      className="floating-duck-easter-egg"
      style={{ '--duck-size': `${duck.size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <img src={happyDuck} alt="" draggable={false} />
    </div>
  )
}
