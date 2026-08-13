import { describe, expect, it } from 'vitest'
import { formatClearTime } from './formatClearTime'

describe('formatClearTime', () => {
  it('밀리초를 m:ss.cc 형식으로 변환한다', () => {
    expect(formatClearTime(63120)).toBe('1:03.12')
  })

  it('1분 미만도 분 자리를 0으로 표기한다', () => {
    expect(formatClearTime(9450)).toBe('0:09.45')
  })

  it('0ms는 0:00.00을 반환한다', () => {
    expect(formatClearTime(0)).toBe('0:00.00')
  })

  it('센티초 미만(10ms 미만)은 0으로 내림한다', () => {
    expect(formatClearTime(9)).toBe('0:00.00')
    expect(formatClearTime(10)).toBe('0:00.01')
  })

  it('정확히 1분 경계를 올바르게 처리한다', () => {
    expect(formatClearTime(59999)).toBe('0:59.99')
    expect(formatClearTime(60000)).toBe('1:00.00')
  })

  it('10분 이상도 분 자리를 잘라내지 않는다', () => {
    expect(formatClearTime(600000)).toBe('10:00.00')
    expect(formatClearTime(3600000)).toBe('60:00.00')
  })

  it('초·센티초를 두 자리로 채운다', () => {
    expect(formatClearTime(61050)).toBe('1:01.05')
  })
})
