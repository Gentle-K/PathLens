import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function normalizeCommand(command) {
  return command.join('\u0000')
}

function localVirtualenvCandidates() {
  const interpreterPaths =
    os.platform() === 'win32'
      ? [
          path.join(repoRoot, 'backend', '.venv-test', 'Scripts', 'python.exe'),
          path.join(repoRoot, 'backend', '.venv', 'Scripts', 'python.exe'),
          path.join(repoRoot, '.venv-backend', 'Scripts', 'python.exe'),
          path.join(repoRoot, '.venv', 'Scripts', 'python.exe'),
        ]
      : [
          path.join(repoRoot, 'backend', '.venv-test', 'bin', 'python'),
          path.join(repoRoot, 'backend', '.venv', 'bin', 'python'),
          path.join(repoRoot, '.venv-backend', 'bin', 'python'),
          path.join(repoRoot, '.venv', 'bin', 'python'),
        ]

  return interpreterPaths.map((interpreterPath) => [interpreterPath])
}

function pythonCandidates() {
  const candidates = []
  const preferred = process.env.PYTHON_BIN?.trim()

  if (preferred) {
    candidates.push([preferred])
  }

  candidates.push(...localVirtualenvCandidates())

  if (os.platform() === 'win32') {
    candidates.push(
      ['py', '-3.13'],
      ['py', '-3.12'],
      ['py', '-3.11'],
      ['python'],
      ['python3'],
    )
  } else {
    candidates.push(
      ['python3.13'],
      ['python3.12'],
      ['python3.11'],
      ['python3'],
      ['python'],
    )
  }

  const seen = new Set()
  return candidates.filter((candidate) => {
    const key = normalizeCommand(candidate)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function probePython(command) {
  const [executable, ...args] = command
  const result = spawnSync(
    executable,
    [
      ...args,
      '-c',
      "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}'); print(sys.executable)",
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  if (result.status !== 0) {
    return null
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return null
  }

  return {
    command,
    version: lines[0],
    executable: lines[1],
  }
}

export function resolvePythonCommand() {
  for (const candidate of pythonCandidates()) {
    const resolved = probePython(candidate)
    if (resolved) {
      return resolved
    }
  }

  throw new Error(
    'Unable to find a working Python interpreter. Set PYTHON_BIN to a valid python executable if needed.',
  )
}
