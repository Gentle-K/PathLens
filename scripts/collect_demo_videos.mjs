import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const artifactsRoot = path.join(repoRoot, 'test-results', 'demo-video', 'artifacts')
const deliverablesRoot = path.join(repoRoot, 'deliverables', 'demo-video')

const targets = [
  {
    match: 'competition-demo-video',
    output: 'genius-actuary-competition-demo.webm',
  },
  {
    match: 'competition-rest-proof',
    output: 'genius-actuary-rest-proof-demo.webm',
  },
]

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        return walk(resolved)
      }
      return [resolved]
    }),
  )

  return files.flat()
}

async function main() {
  await fs.mkdir(deliverablesRoot, { recursive: true })

  let files = []
  try {
    files = await walk(artifactsRoot)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.warn('[collect_demo_videos] No demo-video artifacts directory found yet.')
      return
    }
    throw error
  }

  const webmFiles = files.filter((file) => file.endsWith('.webm'))

  for (const target of targets) {
    const match = webmFiles.find((file) => file.includes(target.match))
    if (!match) {
      continue
    }

    const destination = path.join(deliverablesRoot, target.output)
    await fs.copyFile(match, destination)
    console.log(`[collect_demo_videos] ${path.relative(repoRoot, destination)}`)
  }
}

main().catch((error) => {
  console.error('[collect_demo_videos] Failed to collect demo videos.')
  console.error(error)
  process.exitCode = 1
})
