import { describe, expect, it } from 'vitest'
import { resolveMapDesign } from './mapDesign'

/**
 * 맵 번호 인코딩은 `stageId * 1000 + roundNo` 하나뿐이다.
 * (`GameConstants.ROUND_MODULAR = 1_000`)
 *
 * 예전 테스트는 `10002`·`20001` 같은 5자리 형태도 함께 검증했는데, 이는
 * "첫 자리 = 스테이지, 끝 자리 = 라운드"로 자르던 구현에 맞춘 값이었다.
 * 그 규칙에서는 커스텀 맵 `10000001`(stage 10000)이 `'1-1'` 하수도로 잘못 매칭되어
 * 구현과 함께 폐기했다. 지금 인코딩에서 `10002`는 stage 10 · round 2를 뜻한다.
 */
describe('resolveMapDesign', () => {
  it.each([
    [1001, 1, 1],
    [1002, 1, 2],
    [1003, 1, 3],
    [2001, 2, 1],
    [2002, 2, 2],
    [2003, 2, 3],
  ])('resolves official map number %i', (mapNum, stage, round) => {
    expect(resolveMapDesign(mapNum)).toMatchObject({ stage, round })
  })

  it.each([
    [1003, ['falling-water']],
    [2001, ['rain', 'wind']],
    [2002, ['rain', 'jump-pad']],
    [2003, ['rain']],
  ])('provides the round effects for map %i', (mapNum, effects) => {
    expect(resolveMapDesign(mapNum)?.effects).toEqual(effects)
  })

  it.each([1, 999, 0, -1000, Number.NaN, 1.5])(
    'has no design for map number %s below the encoding range',
    (mapNum) => {
      expect(resolveMapDesign(mapNum)).toBeNull()
    },
  )

  /**
   * 회귀 방지: 커스텀 맵(stage_id >= 10000)이 공식 맵 배경을 가져가면 안 된다.
   * 자릿수를 자르던 예전 구현에서는 10000001 → stage 1 · round 1 이었다.
   */
  it.each([10000001, 10001001, 12345001])(
    'falls back to the custom design for user-made map %i',
    (mapNum) => {
      const design = resolveMapDesign(mapNum)
      expect(design).not.toBeNull()
      expect(design?.className).toBe('game-board--custom')
      expect(design?.stage).not.toBe(1)
      expect(design?.bgmPath).not.toBe('/sounds/Stage1_bgm.mp3')
    },
  )

  it('falls back to the custom design for an unregistered official round', () => {
    expect(resolveMapDesign(1004)?.className).toBe('game-board--custom')
    expect(resolveMapDesign(3001)?.className).toBe('game-board--custom')
  })

  it('draws the custom background from CSS instead of a stage asset', () => {
    expect(resolveMapDesign(10000001)?.backgroundImage).toBeNull()
  })
})
