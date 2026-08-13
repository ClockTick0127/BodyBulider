import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SpriteCharacter } from './SpriteCharacter'

describe('SpriteCharacter', () => {
  it('passes world coordinates through compositor-friendly CSS variables', () => {
    const { container } = render(
      <SpriteCharacter
        action="move"
        facing="right"
        xPercent={37.5}
        yPercent={62.25}
      />,
    )

    const character = container.firstElementChild as HTMLElement
    expect(character.style.getPropertyValue('--position-x')).toBe('37.5cqw')
    expect(character.style.getPropertyValue('--position-y')).toBe('62.25cqh')
    expect(character.style.left).toBe('')
    expect(character.style.top).toBe('')
  })
})
