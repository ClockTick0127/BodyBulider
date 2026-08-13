import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/**
 * 테스트용 MSW 서버.
 * 브라우저용 setupWorker(browser.ts)와 동일한 핸들러를 공유하므로,
 * 목 응답을 한 곳(src/mocks/handlers)에서만 관리하면 된다.
 */
export const server = setupServer(...handlers)

// jsdom에는 ResizeObserver가 없다. 맵 에디터가 캔버스 크기 추적에 사용한다.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom은 오디오 재생을 구현하지 않으므로 BgmProvider가 사용하는 메서드를 대체한다.
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
})
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: vi.fn(),
})

// 핸들러가 없는 요청은 경고만 남긴다. (CSS·모델 파일 등 비 API 요청까지 실패시키지 않기 위함)
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

afterEach(() => {
  cleanup()
  // 테스트마다 server.use()로 덮어쓴 핸들러를 초기화한다.
  server.resetHandlers()
  // 목 세션/방 상태가 sessionStorage에 남아 다음 테스트에 새지 않도록 정리한다.
  sessionStorage.clear()
})

afterAll(() => server.close())
