import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/setupTests'
import { authStore } from '../../../mocks/stores/auth.store'
import { defaultUsers } from '../../../mocks/data/users'
import {
  getMyRecordRounds,
  getMyRanking,
  getMyRecords,
  getMyStageRecords,
  getStageRanking,
} from './recordsApi'

// 실서비스에서 기록·랭킹은 로그인 사용자 기준 조회다.
// 목 핸들러가 인증을 강제하진 않지만, 실연동과 같은 조건을 만들기 위해 세션을 세워 둔다.
beforeEach(() => {
  authStore.setSessionUser(defaultUsers[0])
})

describe('스테이지 랭킹 조회 (GET /api/v1/stages/{stageId}/rankings)', () => {
  it('순위 배열을 클리어 시간 오름차순으로 돌려준다', async () => {
    const entries = await getStageRanking(1)

    expect(entries).toHaveLength(6)
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6])

    const times = entries.map((entry) => entry.stageClearTimeMs)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('snake_case 응답을 camelCase로 변환한다', async () => {
    const [top] = await getStageRanking(1)

    expect(top).toMatchObject({
      rank: 1,
      nickname: '다리 건설가',
      stageClearTimeMs: 63120,
    })
    // uuid·createdAt이 함께 내려온다.
    expect(typeof top.uuid).toBe('string')
    expect(Number.isNaN(Date.parse(top.createdAt))).toBe(false)
    // snake_case 키가 그대로 새어 나오지 않아야 한다.
    expect(top).not.toHaveProperty('stage_clear_time_ms')
    expect(top).not.toHaveProperty('created_at')
  })

  it('limit 파라미터로 조회 개수를 제한한다', async () => {
    const entries = await getStageRanking(1, 1)

    expect(entries).toHaveLength(1)
    expect(entries[0].rank).toBe(1)
  })

  it('기록이 없는 스테이지는 빈 배열을 돌려준다', async () => {
    server.use(
      http.get('*/api/v1/stages/1/rankings', () => HttpResponse.json([])),
    )
    await expect(getStageRanking(1)).resolves.toEqual([])
  })

  it('존재하지 않는 스테이지는 404로 실패한다', async () => {
    await expect(getStageRanking(999)).rejects.toThrow()
  })
})

describe('내 현재 랭킹 조회 (GET /api/v1/users/me/rankings)', () => {
  it('최고 순위와 스테이지별 순위를 camelCase로 변환한다', async () => {
    const summary = await getMyRanking()

    expect(summary.bestRank).toBe(3)
    expect(summary.bestStageCount).toBe(1)
    expect(summary.bestStages[0]).toMatchObject({
      stageId: 2,
      stageName: '강가',
      rank: 3,
      totalParticipants: 4,
      stageClearTimeMs: 101540,
    })
    expect(summary.stages).toHaveLength(2)
    expect(summary).not.toHaveProperty('best_rank')
  })
})

describe('내 최고 기록 조회 (GET /api/v1/users/me/records)', () => {
  it('클리어한 스테이지만 배열로 돌려준다', async () => {
    const records = await getMyRecords()

    expect(records).toHaveLength(2)
    expect(records.map((record) => record.stageId)).toEqual([1, 2])
  })

  it('snake_case 응답을 camelCase로 변환한다', async () => {
    const [first] = await getMyRecords()

    expect(first).toMatchObject({
      stageId: 1,
      name: '하수도',
      stageClearTimeMs: 84210,
    })
    expect(Number.isNaN(Date.parse(first.createdAt))).toBe(false)
    expect(first).not.toHaveProperty('stage_clear_time_ms')
    // 순위는 이 API가 제공하지 않는다.
    expect(first).not.toHaveProperty('rank')
  })

  it('스테이지명은 name 필드를 사용한다 (stage_name 아님)', async () => {
    const records = await getMyRecords()

    expect(records[1].name).toBe('강가')
    expect(records[1]).not.toHaveProperty('stage_name')
  })
})

/**
 * 아래 두 API는 백엔드 명세 미제공 상태이며 MSW 목업으로만 동작한다. (FE-API-01)
 * 명세가 확정되면 이 테스트도 실제 응답 규격에 맞춰 수정해야 한다.
 */
describe('[명세 미확정] 내 클리어 이력 · 라운드 상세', () => {
  it('스테이지 이력은 최근 클리어 순으로 정렬된다', async () => {
    const history = await getMyStageRecords(1)

    expect(history.entries).toHaveLength(3)
    const timestamps = history.entries.map((entry) => Date.parse(entry.clearedAt))
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a))
    expect(history.bestTimeMs).toBe(84210)
  })

  it('기록이 없는 스테이지의 이력은 빈 배열이다', async () => {
    server.use(
      http.get('*/api/v1/users/me/records/stages/1', () =>
        HttpResponse.json({ stageId: 1, entries: [], bestTimeMs: null }),
      ),
    )
    const history = await getMyStageRecords(1)

    expect(history.entries).toEqual([])
    expect(history.bestTimeMs).toBeNull()
  })

  it('라운드 상세의 합은 총 클리어 시간과 일치한다', async () => {
    const detail = await getMyRecordRounds(101)

    expect(detail.rounds.map((round) => round.roundNo)).toEqual([1, 2, 3])
    const sum = detail.rounds.reduce((total, round) => total + round.clearTimeMs, 0)
    expect(sum).toBe(detail.totalClearTimeMs)
  })

  it('존재하지 않는 기록 ID는 404로 실패한다', async () => {
    await expect(getMyRecordRounds(999999)).rejects.toThrow()
  })
})
