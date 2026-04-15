import { spawn } from 'node:child_process'

import { resolvePythonCommand } from './python-runtime.mjs'

const pythonArgs = process.argv.slice(2)

if (!pythonArgs.length) {
  console.error('Usage: node scripts/run_python.mjs <python-args...>')
  process.exit(1)
}

const resolved = resolvePythonCommand()
const [command, ...prefix] = resolved.command
const child = spawn(command, [...prefix, ...pythonArgs], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

