import { API_ENDPOINTS } from './config'

export type VeoSourceMode = 'text' | 'image' | 'frames' | 'references' | 'extend'

export interface VeoInlineAsset {
  base64Data: string
  mimeType: string
  fileName?: string
  previewUrl?: string
}

export interface VeoReferenceAsset extends VeoInlineAsset {
  referenceType: 'ASSET' | 'STYLE'
}

export interface VeoUiStateSnapshot {
  optimizerMode?: VeoSourceMode
  optimizerInput?: string
  optimizeResult?: {
    components: Record<string, string>
    fullPrompt: string
    negativePrompt: string
    sections: string[]
    sectionLabels: string[]
  } | null
  refDescriptions?: string[]
}

export interface VeoGenerationPayload {
  sourceMode: VeoSourceMode
  prompt?: string
  negativePrompt?: string
  model?: string
  aspectRatio?: '16:9' | '9:16'
  resolution?: '720p' | '1080p'
  durationSeconds?: number
  numberOfVideos?: number
  seed?: number
  enhancePrompt?: boolean
  generateAudio?: boolean
  personGeneration?: 'dont_allow' | 'allow_adult'
  fps?: number
  compressionQuality?: 'OPTIMIZED' | 'LOSSLESS'
  outputGcsUri?: string
  image?: VeoInlineAsset | null
  lastFrame?: VeoInlineAsset | null
  referenceImages?: VeoReferenceAsset[]
  video?: VeoInlineAsset | null
  sourceVideoRef?: { jobId: string; index: number } | null
  uiState?: VeoUiStateSnapshot
}

export interface VeoOutput {
  index: number
  localPath?: string
  localUrl?: string
  remoteUri?: string
  mimeType?: string
}

export interface VeoJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
  operationName: string
  sourceMode: VeoSourceMode
  prompt: string
  model: string
  authMode: 'apiKey' | 'gcp'
  metadata?: Record<string, unknown>
  progress?: number
  error?: string
  outputs: VeoOutput[]
  requestSnapshot?: VeoGenerationPayload
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json()
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

export async function fetchVeoStatus() {
  const res = await fetch(API_ENDPOINTS.veoStatus)
  return parse<{ ok: true; configured: boolean; authMode: 'apiKey' | 'gcp' | null; message: string }>(res)
}

export async function fetchVeoJobs() {
  const res = await fetch(API_ENDPOINTS.veoJobs)
  return parse<{ ok: true; jobs: VeoJob[] }>(res)
}

export async function fetchVeoJob(jobId: string) {
  const res = await fetch(`${API_ENDPOINTS.veoJobs}/${jobId}`)
  return parse<{ ok: true; job: VeoJob }>(res)
}

export async function createVeoJob(payload: VeoGenerationPayload) {
  const res = await fetch(API_ENDPOINTS.veoGenerate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parse<{ ok: true; job: VeoJob }>(res)
}

export async function deleteVeoJob(jobId: string) {
  const res = await fetch(`${API_ENDPOINTS.veoJobs}/${jobId}`, { method: 'DELETE' })
  return parse<{ ok: true }>(res)
}

// ── Gemini Subject Video API ──────────────────────────────────────

export interface GeminiSubjectPayload {
  referenceImages: Array<{ base64Data: string; mimeType: string; referenceType?: 'subject' | 'style' }>
  prompt: string
  aspectRatio?: '9:16' | '16:9'
  personGeneration?: 'dont_allow' | 'allow_adult'
}

export async function geminiGenerate(payload: GeminiSubjectPayload) {
  const res = await fetch(API_ENDPOINTS.veoGeminiGenerate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parse<{ ok: true; job: VeoJob }>(res)
}

export async function geminiPoll(jobId: string) {
  const res = await fetch(`${API_ENDPOINTS.veoGeminiPoll}/${jobId}`)
  return parse<{ ok: true; job: VeoJob }>(res)
}

export async function describeForVideo(image: { base64Data: string; mimeType: string }) {
  const res = await fetch(API_ENDPOINTS.veoDescribeForVideo, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  })
  return parse<{ ok: true; description: string }>(res)
}
