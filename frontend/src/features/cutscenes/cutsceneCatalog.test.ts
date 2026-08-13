import { describe, expect, it } from 'vitest'
import { getStageCutscene, hasStageCutscenes } from './cutsceneCatalog'

describe('cutsceneCatalog', () => {
  it('1스테이지 시작·성공·실패 컷씬을 제공한다', () => {
    expect(getStageCutscene(1, 'start')).toMatchObject({
      src: '/cutscenes/stage-1-start.mp4',
      durationMs: 10_000,
    })
    expect(getStageCutscene(1, 'success')?.src).toBe('/cutscenes/stage-1-success.mp4')
    expect(getStageCutscene(1, 'failure')).toMatchObject({
      src: '/cutscenes/stage-1-failure.mp4',
      durationMs: 1_000,
    })
  })

  it('2스테이지 시작·성공·실패 컷씬을 제공한다', () => {
    expect(getStageCutscene(2, 'start')).toEqual({
      src: '/cutscenes/stage-2-start.mp4',
      durationMs: 8_000,
    })
    expect(getStageCutscene(2, 'success')).toEqual({
      src: '/cutscenes/stage-2-success.mp4',
      durationMs: 8_000,
    })
    expect(getStageCutscene(2, 'failure')).toEqual({
      src: '/cutscenes/stage-2-failure.mp4',
      durationMs: 2_000,
    })
  })

  it('등록된 컷씬이 하나라도 있는 스테이지만 사용 가능하다', () => {
    expect(hasStageCutscenes(1)).toBe(true)
    expect(hasStageCutscenes(2)).toBe(true)
    expect(hasStageCutscenes(999)).toBe(false)
  })
})
