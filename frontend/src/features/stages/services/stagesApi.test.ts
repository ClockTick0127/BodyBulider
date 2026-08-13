import { describe, expect, it } from 'vitest'
import { getStageDetail, getStages, toStageCode } from './stagesApi'

describe('toStageCode', () => {
  it('stageId를 두 자리 문자열로 만든다', () => {
    expect(toStageCode(1)).toBe('01')
    expect(toStageCode(12)).toBe('12')
    expect(toStageCode(123)).toBe('123')
  })
})

describe('스테이지 목록 조회 (GET /api/v1/stages)', () => {
  it('snake_case 응답을 camelCase로 변환한다', async () => {
    const stages = await getStages()

    expect(stages).toHaveLength(2)
    expect(stages[0]).toEqual({
      stageId: 1,
      name: '하수도',
      description: '하수도에서 무슨 소리가 들려! 빨리 확인해야 될 것 같아.',
      difficulty: '하',
      thumbnailUrl: 'https://res.cloudinary.com/dkmtsb9k3/image/upload/v1785719586/stage1_thumbnail_wy1qjy.png',
    })
    // snake_case 키가 그대로 새어 나오지 않아야 한다.
    expect(stages[0]).not.toHaveProperty('stage_id')
    expect(stages[0]).not.toHaveProperty('thumbnail_url')
    // 스테이지명은 name이며 stage_name이 아니다.
    expect(stages[0]).not.toHaveProperty('stage_name')
  })

  it('난이도는 상·중·하만 사용한다', async () => {
    const stages = await getStages()

    for (const stage of stages) {
      expect(['상', '중', '하']).toContain(stage.difficulty)
    }
  })
})

describe('스테이지 상세 조회 (GET /api/v1/stages/{stageId})', () => {
  it('라운드 목록을 camelCase로 변환해 돌려준다', async () => {
    const detail = await getStageDetail(1)

    expect(detail.stageId).toBe(1)
    expect(detail.rounds).toHaveLength(3)
    expect(detail.rounds.map((round) => round.roundNo)).toEqual([1, 2, 3])
    expect(detail.rounds[0].roundId).toBe(101)
  })

  it('존재하지 않는 스테이지는 404로 실패한다', async () => {
    await expect(getStageDetail(999)).rejects.toThrow()
  })
})
