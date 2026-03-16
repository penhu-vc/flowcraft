import { mkdirSync, openSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const logDir = join(rootDir, '.logs')

const targets = [
  { name: 'frontend', port: 5173, url: 'http://127.0.0.1:5173' },
  { name: 'backend', port: 3001, url: 'http://127.0.0.1:3001/api/health' },
]

async function killPort(port) {
  const proc = spawn('bash', ['-lc', `lsof -ti tcp:${port} | xargs -r kill -9`], {
    cwd: rootDir,
    stdio: 'ignore',
  })

  await new Promise((resolve, reject) => {
    proc.on('error', reject)
    proc.on('exit', () => resolve())
  })
}

async function waitForUrl(url, label, timeoutMs = 90000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        console.log(`READY ${label}: ${url}`)
        return
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  throw new Error(`Timed out waiting for ${label}: ${url}`)
}

function spawnDetached(name, command, args) {
  mkdirSync(logDir, { recursive: true })

  const out = openSync(join(logDir, `${name}.log`), 'a')
  const err = openSync(join(logDir, `${name}.log`), 'a')
  const child = spawn(command, args, {
    cwd: rootDir,
    detached: true,
    stdio: ['ignore', out, err],
    env: process.env,
  })

  child.unref()
}

console.log('Stopping old development processes...')
for (const target of targets) {
  await killPort(target.port)
}

console.log('Clearing frontend build cache...')
await rm(join(rootDir, 'node_modules', '.vite'), { recursive: true, force: true })

console.log('Starting backend and frontend...')
spawnDetached('flowcraft-backend', 'npm', ['run', 'server'])
spawnDetached('flowcraft-frontend', 'npm', ['run', 'dev:client'])

for (const target of targets) {
  await waitForUrl(target.url, target.name)
}

console.log('Development services are up.')
