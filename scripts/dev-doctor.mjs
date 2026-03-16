import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const targets = [
  { name: 'frontend', url: 'http://127.0.0.1:5173' },
  { name: 'backend', url: 'http://127.0.0.1:3001/api/health' },
]

async function isHealthy(url) {
  try {
    const res = await fetch(url)
    return res.ok
  } catch {
    return false
  }
}

const failures = []

for (const target of targets) {
  if (!(await isHealthy(target.url))) {
    failures.push(target.name)
  }
}

if (failures.length === 0) {
  console.log('Doctor check passed: frontend and backend are healthy.')
  process.exit(0)
}

console.log(`Doctor detected problems: ${failures.join(', ')}`)

await new Promise((resolve, reject) => {
  const child = spawn('npm', ['run', 'dev:up'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  })

  child.on('error', reject)
  child.on('exit', (code) => {
    if (code === 0) {
      resolve()
      return
    }
    reject(new Error(`dev:up exited with code ${code}`))
  })
})

await new Promise((resolve, reject) => {
  const child = spawn('npm', ['run', 'dev:warm'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  })

  child.on('error', reject)
  child.on('exit', (code) => {
    if (code === 0) {
      resolve()
      return
    }
    reject(new Error(`dev:warm exited with code ${code}`))
  })
})

console.log('Doctor recovered the environment.')
