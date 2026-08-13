import { describe, expect, it } from 'vitest'
import manifest from '@/assets/character/manifest.json'
import { SHEETS } from './characterSheets'
import type { CharacterAction } from './buildActionTimeline'

type ManifestState = {
  sheetFrames: number
  fps: number
  loop: boolean
  /** [width, height] — JSON import 는 튜플이 아닌 number[] 로 추론된다. */
  size: number[]
}

const states = manifest.states as Record<string, ManifestState>

/**
 * 원화가 늘거나 줄었는데 빌드 스크립트만 다시 돌리고 SHEETS 를 안 고치면
 * 애니메이션이 어긋난다. 이 테스트가 그 사고를 막는다.
 */
describe('characterSheets ↔ manifest.json 정합성', () => {
  it.each(Object.keys(SHEETS) as CharacterAction[])(
    '%s 의 프레임 수·fps·loop 가 실제로 구운 시트와 일치한다',
    (action) => {
      const built = states[action]
      expect(built, `manifest.json 에 ${action} 이 없습니다`).toBeDefined()
      expect(SHEETS[action].frames).toBe(built.sheetFrames)
      expect(SHEETS[action].fps).toBe(built.fps)
      expect(SHEETS[action].loop).toBe(built.loop)
    },
  )

  it('시트 폭이 프레임 수 × 256 과 일치한다', () => {
    for (const [action, def] of Object.entries(SHEETS)) {
      const [width, height] = states[action].size as [number, number]
      expect(height).toBe(256)
      expect(width).toBe(def.frames * 256)
    }
  })
})
