const pages = [
  'http://127.0.0.1:5173/',
  'http://127.0.0.1:5173/dashboard',
  'http://127.0.0.1:5173/collections',
  'http://127.0.0.1:5173/monitor',
  'http://127.0.0.1:5173/nodes',
  'http://127.0.0.1:5173/settings',
  'http://127.0.0.1:5173/veo',
]

const apis = [
  'http://127.0.0.1:3001/api/health',
  'http://127.0.0.1:3001/api/settings/gemini/status',
  'http://127.0.0.1:3001/api/veo/status',
]

async function hit(url) {
  const res = await fetch(url)
  console.log(`${res.status} ${url}`)
  if (!res.ok) {
    throw new Error(`Warmup failed for ${url}`)
  }
}

for (const url of apis) {
  await hit(url)
}

for (const url of pages) {
  await hit(url)
}

console.log('Warmup complete.')
