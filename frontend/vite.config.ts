import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 이 저장소는 package.json이 "type": "module"이라 config가 ESM으로 로드된다.
      // ESM에는 __dirname이 없으므로 import.meta.url 기준으로 경로를 만든다.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // sockjs-client가 Node의 `global`을 참조하므로 브라우저에서 매핑해 준다.
  define: {
    global: 'globalThis',
  },
})
