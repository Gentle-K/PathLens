import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { resolvePythonCommand } from './python-runtime.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const backendRoot = path.join(repoRoot, 'backend')
const defaultDbPath = path.join(repoRoot, 'tmp', 'genius-actuary-e2e.db')

const resolved = resolvePythonCommand()
const [command, ...prefix] = resolved.command
const host = process.env.BACKEND_HOST ?? '127.0.0.1'
const port = process.env.BACKEND_PORT ?? '8010'
const sessionDbPath = process.env.SESSION_DB_PATH ?? defaultDbPath

fs.mkdirSync(path.dirname(sessionDbPath), { recursive: true })

const env = {
  ...process.env,
  APP_ENV: process.env.APP_ENV ?? 'test',
  ANALYSIS_ADAPTER: process.env.ANALYSIS_ADAPTER ?? 'mock',
  SEARCH_ADAPTER: process.env.SEARCH_ADAPTER ?? 'mock',
  CHART_ADAPTER: process.env.CHART_ADAPTER ?? 'structured',
  CALCULATION_MCP_ENABLED: process.env.CALCULATION_MCP_ENABLED ?? 'true',
  DEBUG_USERNAME: process.env.DEBUG_USERNAME ?? 'debug-admin',
  DEBUG_PASSWORD: process.env.DEBUG_PASSWORD ?? 'codex-e2e-secret',
  SESSION_DB_PATH: sessionDbPath,
}

const child = spawn(
  command,
  [
    ...prefix,
    '-m',
    'uvicorn',
    'app.main:app',
    '--app-dir',
    backendRoot,
    '--host',
    host,
    '--port',
    port,
  ],
  {
    cwd: backendRoot,
    env,
    stdio: 'inherit',
  },
)

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal)
  }
}

process.on('SIGINT', forwardSignal)
process.on('SIGTERM', forwardSignal)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
