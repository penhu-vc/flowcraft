import { API_ENDPOINTS } from './config'

export type NanoSourceMode = 'text' | 'edit' | 'reference'

export interface NanoInlineAsset {
  base64Data: string
  mimeType: string
  fileName?: string
  previewUrl?: string
}

export interface NanoUiStateSnapshot {
  optimizerMode?: NanoSourceMode
  optimizerInput?: string
  optimizeResult?: {
    components: Record<string, string>
    fullPrompt: string
    negativeHints: string
    sections: string[]
    sectionLabels: string[]
  } | null
  refDescriptions?: string[]
}

export interface NanoGenerationPayload {
  sourceMode: NanoSourceMode
  prompt: string
  negativePrompt?: string
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'
  imageSize?: '1K' | '2K' | '4K'
  numberOfImages?: number
  personGeneration?: 'dont_allow' | 'allow_adult'
  image?: NanoInlineAsset | null
  maskImage?: NanoInlineAsset | null
  referenceImages?: NanoInlineAsset[]
  uiState?: NanoUiStateSnapshot
}

export interface NanoOutput {
  index: number
  localPath?: string
  localUrl?: string
  mimeType?: string
}

export interface NanoJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
  sourceMode: NanoSourceMode
  prompt: string
  error?: string
  outputs: NanoOutput[]
  requestSnapshot?: NanoGenerationPayload
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json()
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

export async function fetchNanoStatus() {
  const res = await fetch(API_ENDPOINTS.nanoStatus)
  return parse<{ ok: true; configured: boolean; authMode: 'apiKey' | 'gcp' | null; message: string }>(res)
}

export async function fetchNanoJobs() {
  const res = await fetch(API_ENDPOINTS.nanoJobs)
  return parse<{ ok: true; jobs: NanoJob[] }>(res)
}

export async function createNanoJob(payload: NanoGenerationPayload) {
  const res = await fetch(API_ENDPOINTS.nanoGenerate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parse<{ ok: true; job: NanoJob }>(res)
}

export async function deleteNanoJob(jobId: string) {
  const res = await fetch(`${API_ENDPOINTS.nanoJobs}/${jobId}`, { method: 'DELETE' })
  return parse<{ ok: true }>(res)
}

export async function optimizeNanoPrompt(prompt: string, mode: string = 'text') {
  const res = await fetch(API_ENDPOINTS.nanoOptimizePrompt, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode }),
  })
  return parse<{
    ok: true
    components: Record<string, string>
    fullPrompt: string
    negativeHints: string
    sections: string[]
    sectionLabels: string[]
  }>(res)
}
