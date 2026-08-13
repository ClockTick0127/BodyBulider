import duckIdle from '@/assets/character/duck_idle.png'
import duckMove from '@/assets/character/duck_move.png'
import duckFall from '@/assets/character/duck_fall.png'
import duckFloat from '@/assets/character/duck_float.png'
import duckLanding from '@/assets/character/duck_landing.png'
import type { CharacterAction } from './buildActionTimeline'

export type SheetDef = {
  url: string
  /** 시트에 실제로 구워진 프레임 수 (핑퐁 복제 포함) */
  frames: number
  fps: number
  loop: boolean
}

/**
 * 프레임 수는 여기 한 곳에만 둔다. CSS 에 숫자를 복제하지 말 것.
 *
 * 값은 `scripts/build_character_sprites.mjs` 가 굽는 시트와 일치해야 하며,
 * `characterSheets.test.ts` 가 manifest.json 과 대조해 검증한다.
 */
export const SHEETS: Record<CharacterAction, SheetDef> = {
  idle: { url: duckIdle, frames: 10, fps: 8, loop: true },
  move: { url: duckMove, frames: 8, fps: 12, loop: true },
  fall: { url: duckFall, frames: 10, fps: 12, loop: true },
  float: { url: duckFloat, frames: 6, fps: 12, loop: false },
  landing: { url: duckLanding, frames: 6, fps: 16, loop: false },
}
