import { describe, expect, it } from 'vitest'

/**
 * setupTests.ts의 MSW 서버가 실제로 요청을 가로채는지 확인하는 스모크 테스트.
 * (세션이 없는 상태이므로 방 목록은 401 AU001을 돌려줘야 한다.)
 */
describe('rooms 목 핸들러', () => {
  it('세션이 없으면 방 목록 조회가 401 AU001로 막힌다', async () => {
    const response = await fetch('http://localhost/api/v1/rooms')

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'AU001' })
  })
})
