import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/**
 * vite.config.ts를 그대로 상속한다.
 * (react 플러그인과 '@' path alias를 여기서 다시 선언하지 않기 위함 —
 *  vitest.config.ts가 있으면 vite.config.ts는 자동으로 적용되지 않는다.)
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/mocks/setupTests.ts'],
    },
  }),
)
