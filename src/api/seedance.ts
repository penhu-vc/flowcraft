import { API_ENDPOINTS } from './config'

export interface SeedanceJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  prompt: string
  duration: number
  aspectRatio: string
  taskType: string
  outputs: { localUrl: string; mimeType: string }[]
  error?: string
  cost?: number
  createdAt: string
  updatedAt: string
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json()
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

export async function getSeedanceStatus() {
  const res = await fetch(API_ENDPOINTS.seedanceStatus)
  return parse<{ ok: true; configured: boolean; message: string }>(res)
}

export async function listSeedanceJobs(): Promise<SeedanceJob[]> {
  const res = await fetch(API_ENDPOINTS.seedanceJobs)
  const data = await parse<{ ok: true; jobs: SeedanceJob[] }>(res)
  return data.jobs
}

export async function createSeedanceJob(payload: {
  prompt: string
  duration: number
  aspectRatio: string
  taskType: string
  imageUrls?: string[]
}) {
  const res = await fetch(API_ENDPOINTS.seedanceGenerate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parse<{ ok: true; job: SeedanceJob }>(res)
}

export async function pollSeedanceJob(id: string) {
  const res = await fetch(`${API_ENDPOINTS.seedancePoll}/${id}`, { method: 'POST' })
  return parse<{ ok: true; job: SeedanceJob }>(res)
}

export async function deleteSeedanceJob(id: string) {
  const res = await fetch(`${API_ENDPOINTS.seedanceJobs}/${id}`, { method: 'DELETE' })
  return parse<{ ok: true }>(res)
}

export async function getSeedanceSettings() {
  const res = await fetch(API_ENDPOINTS.seedanceSettings)
  return parse<{ ok: true; settings: { apiKey: string } }>(res)
}

export async function saveSeedanceSettings(settings: { apiKey: string }) {
  const res = await fetch(API_ENDPOINTS.seedanceSettings, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return parse<{ ok: true }>(res)
}

export async function extendSeedanceJob(id: string, prompt?: string) {
  const res = await fetch(API_ENDPOINTS.seedanceExtend, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceJobId: id, prompt }),
  })
  return parse<{ ok: true; job: SeedanceJob }>(res)
}

export async function uploadSeedanceMedia(file: File): Promise<{ url: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(API_ENDPOINTS.seedanceUploadMedia, {
    method: 'POST',
    body: formData,
  })
  return parse<{ ok: true; url: string }>(res)
}
