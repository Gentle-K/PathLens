import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const frontendRoot = __dirname

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, frontendRoot, ''),
    ...loadEnv(mode, repoRoot, ''),
    ...process.env,
  }

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/health': {
          target: env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
          changeOrigin: true,
        },
        '/api': {
          target: env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
          changeOrigin: true,
        },
        '/ws': {
          target: env.VITE_WS_PROXY_TARGET ?? 'ws://localhost:8000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/tests/setup.ts',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      exclude: ['e2e/**', 'playwright.config.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: './coverage',
      },
    },
  }
})
