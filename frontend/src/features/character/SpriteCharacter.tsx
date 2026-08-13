import type { CSSProperties, Ref } from 'react'
import { SHEETS } from './characterSheets'
import type { CharacterAction } from './buildActionTimeline'
import './SpriteCharacter.css'

type SpriteCharacterProps = {
  action: CharacterAction
  facing: 'left' | 'right'
  /** 렌더링 월드 안에서의 위치(0~100). */
  xPercent: number
  yPercent: number
  /** 맵별 z-index 오버라이드(.game-ball)를 살리기 위한 추가 클래스 */
  className?: string
  /** Lets a playback controller update position variables in the same animation frame as its camera. */
  positionManagedExternally?: boolean
  elementRef?: Ref<HTMLDivElement>
}

/**
 * 인게임 캐릭터.
 *
 * React 는 속성과 CSS 변수만 바꾸고 프레임 진행은 CSS steps() 가 담당한다.
 * rAF 루프도 프레임 카운터도 없다.
 *
 * 위치 지정을 이 컴포넌트가 맡는 이유: 앵커가 상태별로 달라야 하는데(지상/공중)
 * CSS 변수는 아래로만 상속되므로 data-action 이 위치를 잡는 요소에 있어야 한다.
 */
export function SpriteCharacter({
  action,
  facing,
  xPercent,
  yPercent,
  className,
  positionManagedExternally = false,
  elementRef,
}: SpriteCharacterProps) {
  const sheet = SHEETS[action]

  return (
    <div
      ref={elementRef}
      className={`sprite-character${className ? ` ${className}` : ''}`}
      data-action={action}
      data-facing={facing}
      data-loop={sheet.loop ? 'yes' : 'no'}
      style={{
        ...(!positionManagedExternally && {
          '--position-x': `${xPercent}cqw`,
          '--position-y': `${yPercent}cqh`,
        }),
        '--sheet': `url("${sheet.url}")`,
        '--frames': sheet.frames,
        '--duration': `${sheet.frames / sheet.fps}s`,
      } as CSSProperties}
    >
      <i className="sprite-character__frame" />
    </div>
  )
}
