import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const BALL_RADIUS = 11
const CURSOR_RADIUS = 10
const PHYSICS_STEP = 1 / 120
const WALL_RESTITUTION = 0.96
const PADDLE_RESTITUTION = 1.08
const PADDLE_GRIP = 0.16
const AIR_DRAG = 1.0
const STOP_SPEED = 8
const MIN_IMPACT_SPEED = 10
const MAX_BALL_SPEED = 1250
const BUTTON_RESTITUTION = 0.9
const BUTTON_INVERSE_MASS = 0.38
const BUTTON_DRAG = 0.75
const MAX_BUTTON_SPEED = 900
const BUTTON_ANGULAR_DRAG = 1.15
const MAX_BUTTON_ANGULAR_SPEED = 9
const STOP_ANGULAR_SPEED = 0.04
// Keep the button's downward shadow/hover lift inside the scroll viewport. CSS
// transforms contribute to scrollable overflow even though they do not affect
// layout, which otherwise makes the landing page scrollbar flash on impact.
const BUTTON_EDGE_INSET = 28

type Point = { x: number; y: number }
type CursorSample = Point & { time: number }

type GameLogoProps = {
  startButtonRef: RefObject<HTMLSpanElement | null>
}

export function GameLogo({ startButtonRef }: GameLogoProps) {
  const anchorRef = useRef<SVGCircleElement>(null)
  const ballRef = useRef<HTMLSpanElement>(null)
  const positionRef = useRef<Point>({ x: 0, y: 0 })
  const velocityRef = useRef<Point>({ x: 0, y: 0 })
  const cursorRef = useRef<Point | null>(null)
  const cursorVelocityRef = useRef<Point>({ x: 0, y: 0 })
  const lastCursorRef = useRef<CursorSample | null>(null)
  const isMovingRef = useRef(false)
  const buttonOffsetRef = useRef<Point>({ x: 0, y: 0 })
  const buttonVelocityRef = useRef<Point>({ x: 0, y: 0 })
  const buttonAngleRef = useRef(0)
  const buttonAngularVelocityRef = useRef(0)
  const isButtonInteractiveRef = useRef(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const anchor = anchorRef.current
    const ball = ballRef.current
    if (!anchor || !ball) return
    const scrollContainer = anchor.closest<HTMLElement>('.landing')

    let animationFrame = 0
    let previousTime = performance.now()
    let accumulator = 0

    const paint = () => {
      const { x, y } = positionRef.current
      ball.style.transform = `translate3d(${x - BALL_RADIUS}px, ${y - BALL_RADIUS}px, 0)`
      const startButton = startButtonRef.current
      if (!startButton) return
      const buttonOffset = buttonOffsetRef.current
      startButton.style.transform = `translate3d(${buttonOffset.x}px, ${buttonOffset.y}px, 0) rotate(${buttonAngleRef.current}rad)`
    }

    const syncWithLogo = () => {
      if (isMovingRef.current) return
      const bounds = anchor.getBoundingClientRect()
      positionRef.current = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      }
      paint()
      setIsReady(true)
    }

    const limitBallSpeed = () => {
      const velocity = velocityRef.current
      const speed = Math.hypot(velocity.x, velocity.y)
      if (speed <= MAX_BALL_SPEED) return
      const ratio = MAX_BALL_SPEED / speed
      velocity.x *= ratio
      velocity.y *= ratio
    }

    const limitButtonSpeed = () => {
      const velocity = buttonVelocityRef.current
      const speed = Math.hypot(velocity.x, velocity.y)
      if (speed <= MAX_BUTTON_SPEED) return
      const ratio = MAX_BUTTON_SPEED / speed
      velocity.x *= ratio
      velocity.y *= ratio
    }

    const collideWithStartButton = () => {
      const startButton = startButtonRef.current
      if (!startButton) return
      const position = positionRef.current
      const velocity = velocityRef.current
      const buttonVelocity = buttonVelocityRef.current
      const bounds = startButton.getBoundingClientRect()
      const centerX = bounds.left + bounds.width / 2
      const centerY = bounds.top + bounds.height / 2
      const angle = buttonAngleRef.current
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      // Transform the ball into the button's local (unrotated) coordinate
      // system so the collision follows the visible rotated rectangle rather
      // than its larger axis-aligned bounding box.
      const relativeX = position.x - centerX
      const relativeY = position.y - centerY
      const localX = relativeX * cos + relativeY * sin
      const localY = -relativeX * sin + relativeY * cos
      const halfWidth = startButton.offsetWidth / 2
      const halfHeight = startButton.offsetHeight / 2
      let closestLocalX = Math.max(-halfWidth, Math.min(localX, halfWidth))
      let closestLocalY = Math.max(-halfHeight, Math.min(localY, halfHeight))
      let localNormalX = localX - closestLocalX
      let localNormalY = localY - closestLocalY
      const outsideDistance = Math.hypot(localNormalX, localNormalY)
      let penetration = BALL_RADIUS - outsideDistance

      if (outsideDistance >= BALL_RADIUS) return

      if (!isButtonInteractiveRef.current) {
        isButtonInteractiveRef.current = true
        startButton.classList.add('is-interactive')
      }

      if (outsideDistance < 0.01) {
        const edges = [
          { distance: localX + halfWidth, x: -1, y: 0, contactX: -halfWidth, contactY: localY },
          { distance: halfWidth - localX, x: 1, y: 0, contactX: halfWidth, contactY: localY },
          { distance: localY + halfHeight, x: 0, y: -1, contactX: localX, contactY: -halfHeight },
          { distance: halfHeight - localY, x: 0, y: 1, contactX: localX, contactY: halfHeight },
        ]
        const nearest = edges.reduce((best, edge) => edge.distance < best.distance ? edge : best)
        localNormalX = nearest.x
        localNormalY = nearest.y
        closestLocalX = nearest.contactX
        closestLocalY = nearest.contactY
        penetration = BALL_RADIUS + nearest.distance
      } else {
        localNormalX /= outsideDistance
        localNormalY /= outsideDistance
      }

      const nx = localNormalX * cos - localNormalY * sin
      const ny = localNormalX * sin + localNormalY * cos
      const correctionShare = 1 / (1 + BUTTON_INVERSE_MASS)
      position.x += nx * penetration * correctionShare
      position.y += ny * penetration * correctionShare
      buttonOffsetRef.current.x -= nx * penetration * (1 - correctionShare)
      buttonOffsetRef.current.y -= ny * penetration * (1 - correctionShare)

      const relativeNormalSpeed = (velocity.x - buttonVelocity.x) * nx
        + (velocity.y - buttonVelocity.y) * ny
      if (relativeNormalSpeed >= -MIN_IMPACT_SPEED) return

      const impulse = -(1 + BUTTON_RESTITUTION) * relativeNormalSpeed / (1 + BUTTON_INVERSE_MASS)
      velocity.x += impulse * nx
      velocity.y += impulse * ny
      buttonVelocity.x -= impulse * BUTTON_INVERSE_MASS * nx
      buttonVelocity.y -= impulse * BUTTON_INVERSE_MASS * ny

      // The off-center impulse creates torque: edge hits spin the button more
      // strongly, while a hit through its center produces almost no rotation.
      const contactX = closestLocalX * cos - closestLocalY * sin
      const contactY = closestLocalX * sin + closestLocalY * cos
      const impulseOnButtonX = -impulse * nx
      const impulseOnButtonY = -impulse * ny
      const inverseInertia = 12 * BUTTON_INVERSE_MASS
        / Math.max(1, startButton.offsetWidth ** 2 + startButton.offsetHeight ** 2)
      buttonAngularVelocityRef.current += (
        contactX * impulseOnButtonY - contactY * impulseOnButtonX
      ) * inverseInertia
      buttonAngularVelocityRef.current = Math.max(
        -MAX_BUTTON_ANGULAR_SPEED,
        Math.min(MAX_BUTTON_ANGULAR_SPEED, buttonAngularVelocityRef.current),
      )
      limitBallSpeed()
      limitButtonSpeed()
    }

    const collideWithCursor = (cursor: Point, cursorVelocity: Point) => {
      const position = positionRef.current
      const velocity = velocityRef.current
      const dx = position.x - cursor.x
      const dy = position.y - cursor.y
      const distance = Math.hypot(dx, dy)
      const contactDistance = BALL_RADIUS + CURSOR_RADIUS
      if (distance >= contactDistance) return false

      const cursorSpeed = Math.hypot(cursorVelocity.x, cursorVelocity.y)
      const nx = distance > 0.01
        ? dx / distance
        : cursorSpeed > 0.01 ? cursorVelocity.x / cursorSpeed : 1
      const ny = distance > 0.01
        ? dy / distance
        : cursorSpeed > 0.01 ? cursorVelocity.y / cursorSpeed : 0

      positionRef.current = {
        x: cursor.x + nx * (contactDistance + 0.5),
        y: cursor.y + ny * (contactDistance + 0.5),
      }

      // Reflect the ball in the moving paddle's frame, then transfer a small
      // amount of tangential mouse velocity to make angled swipes controllable.
      const relativeX = velocity.x - cursorVelocity.x
      const relativeY = velocity.y - cursorVelocity.y
      const normalSpeed = relativeX * nx + relativeY * ny
      if (normalSpeed < -MIN_IMPACT_SPEED) {
        const impulse = -(1 + PADDLE_RESTITUTION) * normalSpeed
        const tangentX = -ny
        const tangentY = nx
        const cursorTangentSpeed = cursorVelocity.x * tangentX + cursorVelocity.y * tangentY
        velocityRef.current = {
          x: velocity.x + impulse * nx + cursorTangentSpeed * PADDLE_GRIP * tangentX,
          y: velocity.y + impulse * ny + cursorTangentSpeed * PADDLE_GRIP * tangentY,
        }
        limitBallSpeed()
        return true
      }
      return false
    }

    const closestPointOnCursorPath = (from: Point, to: Point) => {
      const position = positionRef.current
      const dx = to.x - from.x
      const dy = to.y - from.y
      const lengthSquared = dx * dx + dy * dy
      if (lengthSquared < 0.01) return to
      const projection = Math.max(0, Math.min(1,
        ((position.x - from.x) * dx + (position.y - from.y) * dy) / lengthSquared,
      ))
      return { x: from.x + dx * projection, y: from.y + dy * projection }
    }

    const startPhysics = () => {
      if (isMovingRef.current) return
      isMovingRef.current = true
      ball.classList.add('is-moving')
      previousTime = performance.now()
      accumulator = 0
      animationFrame = requestAnimationFrame(animate)
    }

    const simulate = (delta: number) => {
      const position = positionRef.current
      const velocity = velocityRef.current
      const drag = Math.max(0, 1 - AIR_DRAG * delta)
      velocity.x *= drag
      velocity.y *= drag
      if (Math.hypot(velocity.x, velocity.y) < STOP_SPEED) {
        velocity.x = 0
        velocity.y = 0
      }
      position.x += velocity.x * delta
      position.y += velocity.y * delta

      const minX = BALL_RADIUS
      const maxX = Math.max(minX, window.innerWidth - BALL_RADIUS)
      const minY = BALL_RADIUS
      const maxY = Math.max(minY, window.innerHeight - BALL_RADIUS)

      if (position.x < minX) {
        position.x = minX
        velocity.x = Math.abs(velocity.x) * WALL_RESTITUTION
      } else if (position.x > maxX) {
        position.x = maxX
        velocity.x = -Math.abs(velocity.x) * WALL_RESTITUTION
      }
      if (position.y < minY) {
        position.y = minY
        velocity.y = Math.abs(velocity.y) * WALL_RESTITUTION
      } else if (position.y > maxY) {
        position.y = maxY
        velocity.y = -Math.abs(velocity.y) * WALL_RESTITUTION
      }

      if (cursorRef.current) {
        const lastCursor = lastCursorRef.current
        const cursorVelocity = lastCursor && performance.now() - lastCursor.time < 70
          ? cursorVelocityRef.current
          : { x: 0, y: 0 }
        collideWithCursor(cursorRef.current, cursorVelocity)
      }

      const buttonVelocity = buttonVelocityRef.current
      const buttonDrag = Math.max(0, 1 - BUTTON_DRAG * delta)
      buttonVelocity.x *= buttonDrag
      buttonVelocity.y *= buttonDrag
      if (Math.hypot(buttonVelocity.x, buttonVelocity.y) < STOP_SPEED) {
        buttonVelocity.x = 0
        buttonVelocity.y = 0
      }
      buttonOffsetRef.current.x += buttonVelocity.x * delta
      buttonOffsetRef.current.y += buttonVelocity.y * delta
      buttonAngularVelocityRef.current *= Math.max(0, 1 - BUTTON_ANGULAR_DRAG * delta)
      if (Math.abs(buttonAngularVelocityRef.current) < STOP_ANGULAR_SPEED) {
        buttonAngularVelocityRef.current = 0
      }
      buttonAngleRef.current += buttonAngularVelocityRef.current * delta

      const startButton = startButtonRef.current
      if (startButton && isButtonInteractiveRef.current) {
        const buttonBounds = startButton.getBoundingClientRect()
        // On very small viewports the button can nearly fill an axis. Reduce
        // the inset there instead of creating an impossible pair of bounds.
        const insetX = Math.min(BUTTON_EDGE_INSET, Math.max(0, (window.innerWidth - buttonBounds.width) / 2))
        const insetY = Math.min(BUTTON_EDGE_INSET, Math.max(0, (window.innerHeight - buttonBounds.height) / 2))
        const minButtonX = insetX
        const maxButtonX = window.innerWidth - insetX
        const minButtonY = insetY
        const maxButtonY = window.innerHeight - insetY
        if (buttonBounds.left < minButtonX) {
          buttonOffsetRef.current.x += minButtonX - buttonBounds.left
          buttonVelocity.x = Math.abs(buttonVelocity.x) * WALL_RESTITUTION
        } else if (buttonBounds.right > maxButtonX) {
          buttonOffsetRef.current.x -= buttonBounds.right - maxButtonX
          buttonVelocity.x = -Math.abs(buttonVelocity.x) * WALL_RESTITUTION
        }
        if (buttonBounds.top < minButtonY) {
          buttonOffsetRef.current.y += minButtonY - buttonBounds.top
          buttonVelocity.y = Math.abs(buttonVelocity.y) * WALL_RESTITUTION
        } else if (buttonBounds.bottom > maxButtonY) {
          buttonOffsetRef.current.y -= buttonBounds.bottom - maxButtonY
          buttonVelocity.y = -Math.abs(buttonVelocity.y) * WALL_RESTITUTION
        }
      }

      collideWithStartButton()
    }

    function animate(time: number) {
      accumulator += Math.min((time - previousTime) / 1000, 0.05)
      previousTime = time
      while (accumulator >= PHYSICS_STEP) {
        simulate(PHYSICS_STEP)
        accumulator -= PHYSICS_STEP
      }
      paint()
      animationFrame = requestAnimationFrame(animate)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const cursor = { x: event.clientX, y: event.clientY }
      const previous = lastCursorRef.current
      const now = performance.now()
      const elapsed = previous ? Math.max((now - previous.time) / 1000, 1 / 240) : 0
      const measuredVelocity = previous
        ? { x: (cursor.x - previous.x) / elapsed, y: (cursor.y - previous.y) / elapsed }
        : { x: 0, y: 0 }
      const oldVelocity = cursorVelocityRef.current
      const cursorVelocity = {
        x: oldVelocity.x * 0.35 + measuredVelocity.x * 0.65,
        y: oldVelocity.y * 0.35 + measuredVelocity.y * 0.65,
      }
      cursorRef.current = cursor
      cursorVelocityRef.current = cursorVelocity
      lastCursorRef.current = { ...cursor, time: now }

      const collisionPoint = previous
        ? closestPointOnCursorPath(previous, cursor)
        : cursor
      if (collideWithCursor(collisionPoint, cursorVelocity)) startPhysics()
    }

    const handlePointerLeave = () => {
      cursorRef.current = null
      cursorVelocityRef.current = { x: 0, y: 0 }
      lastCursorRef.current = null
    }

    const handleResize = () => {
      if (isMovingRef.current) {
        positionRef.current.x = Math.min(window.innerWidth - BALL_RADIUS, Math.max(BALL_RADIUS, positionRef.current.x))
        positionRef.current.y = Math.min(window.innerHeight - BALL_RADIUS, Math.max(BALL_RADIUS, positionRef.current.y))
        paint()
      } else {
        syncWithLogo()
      }
    }

    syncWithLogo()
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', handlePointerLeave)
    window.addEventListener('resize', handleResize)
    scrollContainer?.addEventListener('scroll', syncWithLogo, { passive: true })

    return () => {
      cancelAnimationFrame(animationFrame)
      window.removeEventListener('pointermove', handlePointerMove)
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
      window.removeEventListener('resize', handleResize)
      scrollContainer?.removeEventListener('scroll', syncWithLogo)
    }
  }, [startButtonRef])

  return (
    <div className="logo-lockup" aria-label="Body Builder - 몸으로 길을 잇는 협동 게임">
      <div className="logo-content">
      <div className="logo-kicker">
        <span className="logo-kicker__line" />
        <span>CONNECT THE WAY</span>
        <span className="logo-kicker__line" />
      </div>

      <div className="logo-main">
        <svg className="logo-bridge" viewBox="0 0 390 70" aria-hidden="true">
          <path className="logo-bridge__road" d="M19 52h77l24-20h31" />
          <path className="logo-bridge__road" d="M371 52h-77l-24-20h-31" />
          <path className="logo-bridge__body" d="M151 32c9 0 15 7 20 13l12 13c7 7 17 7 24 0l12-13c5-6 11-13 20-13" />
          <circle ref={anchorRef} className={`logo-bridge__head${isReady ? ' is-replaced' : ''}`} cx="195" cy="16" r="9" />
          <circle className="logo-bridge__start" cx="80" cy="52" r="5" />
          <path className="logo-bridge__finish" d="M310 50V20m0 1h15l-5 6 5 6h-15" />
        </svg>

        <h1 id="main-title">
          <span className="logo-word logo-word--body">BODY</span>
          <span className="logo-word logo-word--builder">BUILDER</span>
        </h1>
      </div>

      <div className="logo-ribbon">
        <span aria-hidden="true">●</span>
        YOUR BODY IS THE BRIDGE
        <span aria-hidden="true">●</span>
      </div>
      </div>
      {createPortal(
        <span ref={ballRef} className={`logo-bouncing-ball${isReady ? ' is-ready' : ''}`} aria-hidden="true" />,
        document.body,
      )}
    </div>
  )
}
