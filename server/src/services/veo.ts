import { GenerateVideosOperation, GoogleGenAI, VideoCompressionQuality, VideoGenerationReferenceType, type Video } from '@google/genai'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

type VeoMode = 'apiKey' | 'gcp'
type JobStatus = 'pending' | 'running' | 'completed' | 'failed'
type SourceMode = 'text' | 'image' | 'frames' | 'references' | 'extend'
type PersonGenerationMode = 'dont_allow' | 'allow_adult'

export interface InlineAsset {
  base64Data: string
  mimeType: string
  fileName?: string
}

export interface InlineReferenceImage extends InlineAsset {
  referenceType: 'ASSET' | 'STYLE'
}

export interface VeoGenerationRequest {
  sourceMode: SourceMode
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
  personGeneration?: PersonGenerationMode
  fps?: number
  compressionQuality?: 'OPTIMIZED' | 'LOSSLESS'
  outputGcsUri?: string
  image?: InlineAsset | null
  lastFrame?: InlineAsset | null
  referenceImages?: InlineReferenceImage[]
  video?: InlineAsset | null
  sourceVideoRef?: { jobId: string; index: number } | null
}

interface StoredVideo {
  index: number
  localPath?: string
  localUrl?: string
  remoteUri?: string
  mimeType?: string
}

export interface VeoJobRecord {
  id: string
  status: JobStatus
  createdAt: string
  updatedAt: string
  operationName: string
  sourceMode: SourceMode
  prompt: string
  model: string
  authMode: VeoMode
  metadata?: Record<string, unknown>
  progress?: number
  error?: string
  outputs: StoredVideo[]
}

const DATA_DIR = join(__dirname, '../../data')
const GENERATED_DIR = join(DATA_DIR, 'generated', 'veo')
const JOBS_FILE = join(DATA_DIR, 'veo-jobs.json')
const GEMINI_SETTINGS_FILE = join(DATA_DIR, 'gemini-settings.json')
const GCP_CREDENTIALS_FILE = join(DATA_DIR, 'gcp-credentials.json')

mkdirSync(GENERATED_DIR, { recursive: true })

const jobs = new Map<string, VeoJobRecord>()
loadJobs()

function loadJobs() {
  if (!existsSync(JOBS_FILE)) {
    return
  }

  try {
    const parsed = JSON.parse(readFileSync(JOBS_FILE, 'utf8')) as VeoJobRecord[]
    for (const job of parsed) {
      jobs.set(job.id, job)
    }
  } catch (error) {
    console.warn('Failed to load Veo jobs:', error)
  }
}

function persistJobs() {
  writeFileSync(
    JOBS_FILE,
    JSON.stringify(
      [...jobs.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      null,
      2
    ),
    'utf8'
  )
}

function getGeminiSettings(): { mode: VeoMode; apiKey?: string } {
  if (existsSync(GEMINI_SETTINGS_FILE)) {
    const settings = JSON.parse(readFileSync(GEMINI_SETTINGS_FILE, 'utf8'))
    return {
      mode: settings.mode === 'gcp' ? 'gcp' : 'apiKey',
      apiKey: settings.apiKey || process.env.GEMINI_API_KEY,
    }
  }

  if (process.env.GEMINI_API_KEY) {
    return { mode: 'apiKey', apiKey: process.env.GEMINI_API_KEY }
  }

  if (existsSync(GCP_CREDENTIALS_FILE)) {
    return { mode: 'gcp' }
  }

  throw new Error('Veo 未設定。請先到設定頁儲存 Gemini API Key 或 GCP 憑證。')
}

function createClient() {
  const settings = getGeminiSettings()

  if (settings.mode === 'apiKey') {
    if (!settings.apiKey) {
      throw new Error('Gemini API Key 未設定。')
    }

    return {
      authMode: settings.mode,
      client: new GoogleGenAI({ apiKey: settings.apiKey }),
    }
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || GCP_CREDENTIALS_FILE
  if (!existsSync(credentialsPath)) {
    throw new Error('GCP 憑證不存在，無法使用 Vertex AI。')
  }

  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'))
  return {
    authMode: settings.mode,
    client: new GoogleGenAI({
      vertexai: true,
      project: credentials.project_id,
      location: process.env.VERTEX_AI_LOCATION || 'us-central1',
    }),
  }
}

function stripBase64Prefix(value: string) {
  return value.replace(/^data:[^;]+;base64,/, '')
}

function toImage(asset?: InlineAsset | null) {
  if (!asset) return undefined

  return {
    imageBytes: stripBase64Prefix(asset.base64Data),
    mimeType: asset.mimeType,
  }
}

function toVideo(asset?: InlineAsset | null): Video | undefined {
  if (!asset) return undefined

  return {
    videoBytes: stripBase64Prefix(asset.base64Data),
    mimeType: asset.mimeType,
  }
}

function readStoredVideo(ref?: { jobId: string; index: number } | null): Video | undefined {
  if (!ref) return undefined

  const job = jobs.get(ref.jobId)
  const output = job?.outputs.find((video) => video.index === ref.index)

  if (!output?.localPath || !existsSync(output.localPath)) {
    throw new Error('找不到要延長的既有影片檔案。')
  }

  const bytes = readFileSync(output.localPath).toString('base64')
  return {
    videoBytes: bytes,
    mimeType: output.mimeType || 'video/mp4',
  }
}

function buildGenerationParams(payload: VeoGenerationRequest) {
  const prompt = payload.prompt?.trim()
  const image = toImage(payload.image)
  const lastFrame = toImage(payload.lastFrame)
  const uploadedVideo = toVideo(payload.video)
  const storedVideo = readStoredVideo(payload.sourceVideoRef)
  const video = uploadedVideo || storedVideo
  const referenceImages = (payload.referenceImages || []).map((asset) => ({
    image: toImage(asset),
    referenceType: asset.referenceType === 'STYLE'
      ? VideoGenerationReferenceType.STYLE
      : VideoGenerationReferenceType.ASSET,
  }))

  if (payload.sourceMode === 'text' && !prompt) {
    throw new Error('Text-to-video 需要 prompt。')
  }

  if (payload.sourceMode === 'image' && !image) {
    throw new Error('Image-to-video 需要上傳起始圖片。')
  }

  if (payload.sourceMode === 'frames' && (!image || !lastFrame)) {
    throw new Error('First/last frame 模式需要起始圖與結尾圖。')
  }

  if (payload.sourceMode === 'references') {
    if (!prompt) {
      throw new Error('Reference images 模式需要 prompt。')
    }
    if (referenceImages.length === 0) {
      throw new Error('Reference images 模式至少需要一張參考圖。')
    }
    const styleCount = referenceImages.filter((item) => item.referenceType === VideoGenerationReferenceType.STYLE).length
    const assetCount = referenceImages.filter((item) => item.referenceType === VideoGenerationReferenceType.ASSET).length

    if (styleCount > 1) {
      throw new Error('Style reference 最多只能一張。')
    }

    if (assetCount > 3) {
      throw new Error('Asset reference 最多三張。')
    }
  }

  if (payload.sourceMode === 'extend' && !video) {
    throw new Error('Extend 模式需要一段既有影片。')
  }

  if (referenceImages.length > 0 && (image || video || lastFrame)) {
    throw new Error('使用 reference images 時，不能同時傳入 image、lastFrame 或 video。')
  }

  return {
    model: payload.model || 'veo-3.1-generate-preview',
    source: {
      prompt,
      image,
      video,
    },
    config: {
      numberOfVideos: payload.numberOfVideos || 1,
      durationSeconds: payload.durationSeconds || 8,
      aspectRatio: payload.aspectRatio || '16:9',
      resolution: payload.resolution || '720p',
      negativePrompt: payload.negativePrompt?.trim() || undefined,
      enhancePrompt: payload.enhancePrompt ?? true,
      generateAudio: payload.generateAudio ?? false,
      seed: payload.seed || undefined,
      fps: payload.fps || undefined,
      outputGcsUri: payload.outputGcsUri?.trim() || undefined,
      personGeneration: payload.personGeneration || 'allow_adult',
      compressionQuality: payload.compressionQuality === 'LOSSLESS'
        ? VideoCompressionQuality.LOSSLESS
        : VideoCompressionQuality.OPTIMIZED,
      lastFrame,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    },
  }
}

function extractProgress(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return undefined
  }

  const queue = [metadata as Record<string, unknown>]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'number' && /progress/i.test(key)) {
        return Math.max(0, Math.min(100, value))
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        queue.push(value as Record<string, unknown>)
      }
    }
  }

  return undefined
}

async function hydrateOutputs(client: GoogleGenAI, job: VeoJobRecord, operation: GenerateVideosOperation) {
  const generatedVideos = operation.response?.generatedVideos || []
  const jobDir = join(GENERATED_DIR, job.id)
  mkdirSync(jobDir, { recursive: true })

  const outputs: StoredVideo[] = []

  for (const [index, generatedVideo] of generatedVideos.entries()) {
    const fileName = `video-${index + 1}.mp4`
    const outputPath = join(jobDir, fileName)

    if (!existsSync(outputPath)) {
      await client.files.download({
        file: generatedVideo,
        downloadPath: outputPath,
      })
    }

    outputs.push({
      index,
      localPath: outputPath,
      localUrl: `/generated/veo/${job.id}/${fileName}`,
      remoteUri: generatedVideo.video?.uri,
      mimeType: generatedVideo.video?.mimeType || 'video/mp4',
    })
  }

  job.outputs = outputs
}

export function getVeoStatus() {
  try {
    const settings = getGeminiSettings()
    return {
      ok: true,
      configured: true,
      authMode: settings.mode,
      message: settings.mode === 'gcp' ? '已設定 Vertex AI 憑證' : '已設定 Gemini API Key',
    }
  } catch (error) {
    return {
      ok: true,
      configured: false,
      authMode: null,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function createVeoJob(payload: VeoGenerationRequest) {
  const { authMode, client } = createClient()
  const params = buildGenerationParams(payload)
  const operation = await client.models.generateVideos(params)

  const now = new Date().toISOString()
  const job: VeoJobRecord = {
    id: randomUUID(),
    status: operation.done ? 'completed' : 'pending',
    createdAt: now,
    updatedAt: now,
    operationName: operation.name || '',
    sourceMode: payload.sourceMode,
    prompt: payload.prompt?.trim() || '',
    model: params.model,
    authMode,
    metadata: operation.metadata,
    progress: extractProgress(operation.metadata),
    outputs: [],
  }

  if (!job.operationName) {
    throw new Error('Veo 未返回可追蹤的 operation name。')
  }

  jobs.set(job.id, job)
  persistJobs()

  if (operation.done) {
    await refreshVeoJob(job.id)
  }

  return jobs.get(job.id) as VeoJobRecord
}

export async function refreshVeoJob(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) {
    throw new Error('找不到 Veo 工作。')
  }

  const { client } = createClient()

  try {
    const operationRef = new GenerateVideosOperation()
    operationRef.name = job.operationName

    const operation = await client.operations.getVideosOperation({
      operation: operationRef,
    })

    job.updatedAt = new Date().toISOString()
    job.metadata = operation.metadata
    job.progress = extractProgress(operation.metadata)

    if (operation.done) {
      if (operation.error) {
        job.status = 'failed'
        job.error = JSON.stringify(operation.error)
      } else {
        job.status = 'completed'
        await hydrateOutputs(client, job, operation)
      }
    } else {
      job.status = 'running'
    }

    persistJobs()
    return job
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : String(error)
    job.updatedAt = new Date().toISOString()
    persistJobs()
    throw error
  }
}

export function listVeoJobs() {
  return [...jobs.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getVeoJob(jobId: string) {
  return jobs.get(jobId)
}

export function deleteVeoJob(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) {
    return false
  }

  rmSync(join(GENERATED_DIR, jobId), { recursive: true, force: true })
  jobs.delete(jobId)
  persistJobs()
  return true
}
