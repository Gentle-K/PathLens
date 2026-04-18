import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const e2eDbPath = path.join(repoRoot, 'tmp', 'genius-actuary-demo-video.db')

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: '../test-results/demo-video/artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4273',
    trace: 'off',
    screenshot: 'off',
    video: 'on',
    viewport: {
      width: 1600,
      height: 900,
    },
  },
  webServer: [
    {
      command: 'node scripts/run_backend_test_server.mjs',
      cwd: repoRoot,
      env: {
        ...process.env,
        APP_ENV: 'test',
        DEBUG_USERNAME: 'debug-admin',
        DEBUG_PASSWORD: 'codex-e2e-secret',
        ANALYSIS_ADAPTER: 'mock',
        SEARCH_ADAPTER: 'mock',
        CHART_ADAPTER: 'structured',
        CALCULATION_MCP_ENABLED: 'true',
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: '8010',
        SESSION_DB_PATH: e2eDbPath,
      },
      url: 'http://127.0.0.1:8010/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --mode test --host 127.0.0.1 --port 4273',
      cwd: __dirname,
      env: {
        ...process.env,
        VITE_PROXY_TARGET: 'http://127.0.0.1:8010',
        VITE_WS_PROXY_TARGET: 'ws://127.0.0.1:8010',
      },
      url: 'http://127.0.0.1:4273',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium-demo-video',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
      },
    },
  ],
})
