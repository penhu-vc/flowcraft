import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getDataDir, ensureDir } from '../dataDir'

type JobStatus = 'pending' | 'running' | 'completed' | 'failed'
type TaskType = 'seedance-2-preview' | 'seedance-2-fast-preview'
type SourceMode = 'text' | 'image' | 'video-edit' | 'extend'

export interface SeedanceJob {
  id: string
  status: JobStatus
  prompt: string
  duration: 5 | 10 | 15
  aspectRatio: '16:9' | '9:16' | '4:3' | '3:4'
  taskType: TaskType
  sourceMode: SourceMode
  piApiTaskId?: string
  imageUrls?: string[]
  videoUrl?: string      // legacy single video field (kept for backward compat)
  videoUrls?: string[]   // multi-video references (motion/choreography, or single edit)
  audioUrls?: string[]   // audio references (lip-sync / music-driven motion)
  parentTaskId?: string  // legacy field (kept for backward compat)
  parentJobId?: string   // internal job ID of the job this was extended from
  parentPiApiTaskId?: string  // piapi task_id used as parent_task_id for extend
  outputs: SeedanceOutput[]
  error?: string
  cost?: number
  createdAt: string
  updatedAt: string
}

interface SeedanceOutput {
  index: number
  localPath?: string
  localUrl?: string
  remoteUrl?: string
  mimeType?: string
}

interface PiApiResponse {
  code: number
  data: {
    task_id: string
    status: 'Completed' | 'Processing' | 'Pending' | 'Failed'
    output?: {
      video?: string
    }
    meta?: {
      usage?: {
        consume?: number
      }
    }
    error?: {
      message?: string
    }
  }
}

// Pricing per second (USD)
const PRICING: Record<TaskType, number> = {
  'seedance-2-preview': 0.15,
  'seedance-2-fast-preview': 0.08,
}

const getGeneratedDir = () => ensureDir('generated', 'seedance')
const getJobsFile = () => join(getDataDir(), 'seedance-jobs.json')
const getSettingsFile = () => join(getDataDir(), 'seedance-settings.json')

const jobs = new Map<string, SeedanceJob>()
let loadedFromDir = ''

function loadJobs() {
  const currentDir = getDataDir()
  const jobsFile = join(currentDir, 'seedance-jobs.json')
  loadedFromDir = currentDir
  if (!existsSync(jobsFile)) {
    return
  }
  try {
    const parsed = JSON.parse(readFileSync(jobsFile, 'utf8')) as SeedanceJob[]
    for (const job of parsed) {
      // Backward compat: assign sourceMode if missing
      if (!job.sourceMode) {
        if (job.parentTaskId || job.parentJobId) {
          job.sourceMode = 'extend'
        } else if (job.videoUrl) {
          job.sourceMode = 'video-edit'
        } else if (job.imageUrls && job.imageUrls.length > 0) {
          job.sourceMode = 'image'
        } else {
          job.sourceMode = 'text'
        }
      }
      jobs.set(job.id, job)
    }
  } catch (error) {
    console.warn('Failed to load Seedance jobs:', error)
  }
}

function ensureLoaded() {
  const currentDir = getDataDir()
  if (loadedFromDir !== currentDir) {
    jobs.clear()
    loadJobs()
  }
}

// Load jobs on startup
loadJobs()

// Reload if data directory changes (NAS switch)
setInterval(() => {
  const currentDir = getDataDir()
  if (loadedFromDir !== currentDir) {
    console.log(`[seedance] dataDir changed: ${loadedFromDir} → ${currentDir}, reloading jobs`)
    jobs.clear()
    loadJobs()
  }
}, 30_000).unref()

function persistJobs() {
  writeFileSync(
    getJobsFile(),
    JSON.stringify(
      [...jobs.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      null,
      2
    ),
    'utf8'
  )
}

function getSeedanceSettings(): { apiKey?: string } {
  const settingsFile = getSettingsFile()
  if (existsSync(settingsFile)) {
    try {
      const settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
      return { apiKey: settings.apiKey || process.env.PIAPI_API_KEY }
    } catch {
      // ignore
    }
  }
  if (process.env.PIAPI_API_KEY) {
    return { apiKey: process.env.PIAPI_API_KEY }
  }
  return {}
}

export function saveSeedanceSettings(settings: { apiKey?: string }) {
  const settingsFile = getSettingsFile()
  const existing = existsSync(settingsFile)
    ? JSON.parse(readFileSync(settingsFile, 'utf8'))
    : {}
  writeFileSync(settingsFile, JSON.stringify({ ...existing, ...settings }, null, 2), 'utf8')
}

export function getSeedanceStatus() {
  const settings = getSeedanceSettings()
  const hasApiKey = !!(settings.apiKey)
  return {
    configured: hasApiKey,
    hasApiKey,
  }
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download video: ${res.status} ${res.statusText}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(outputPath, buffer)
}

export async function createSeedanceJob(params: {
  prompt: string
  duration?: 5 | 10 | 15
  aspectRatio?: '16:9' | '9:16' | '4:3' | '3:4'
  taskType?: TaskType
  // Image references (up to 9, referenced as @image1..@image9 in prompt)
  imageUrls?: string[]
  // Legacy single video field (kept for backward compat — treated as video-edit)
  videoUrl?: string
  // Multi-video references (up to 3, referenced as @video1..@video3)
  // If length === 1 AND no imageUrls, treated as video-edit (output matches input length)
  videoUrls?: string[]
  // Audio references (up to 3, referenced as @audio1..@audio3 — enables lip-sync / music-driven motion)
  audioUrls?: string[]
  // Legacy parent task field
  parentTaskId?: string
}): Promise<SeedanceJob> {
  const settings = getSeedanceSettings()
  if (!settings.apiKey) {
    throw new Error('Seedance 未設定。請先到設定頁儲存 PiAPI API Key。')
  }

  const taskType = params.taskType || 'seedance-2-preview'
  const aspectRatio = params.aspectRatio || '16:9'

  // Determine effective video URLs (normalise legacy videoUrl into videoUrls)
  const effectiveVideoUrls: string[] = []
  if (params.videoUrls && params.videoUrls.length > 0) {
    effectiveVideoUrls.push(...params.videoUrls.slice(0, 3))
  } else if (params.videoUrl) {
    effectiveVideoUrls.push(params.videoUrl)
  }

  // video-edit mode: exactly one video_url provided and no image_urls → duration is ignored (output = input length)
  const isVideoEdit = effectiveVideoUrls.length === 1 && (!params.imageUrls || params.imageUrls.length === 0)
  const duration = isVideoEdit ? 5 : (params.duration || 5)  // duration ignored for video-edit but store default

  // Determine source mode
  let sourceMode: SourceMode = 'text'
  if (isVideoEdit) {
    sourceMode = 'video-edit'
  } else if (params.imageUrls && params.imageUrls.length > 0) {
    sourceMode = 'image'
  }

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    aspect_ratio: aspectRatio,
  }

  // Duration is NOT sent for video-edit mode (output length matches input video)
  if (!isVideoEdit) {
    input.duration = duration
  }

  if (params.imageUrls && params.imageUrls.length > 0) {
    input.image_urls = params.imageUrls.slice(0, 9)
  }

  if (effectiveVideoUrls.length > 0) {
    input.video_urls = effectiveVideoUrls
  }

  if (params.audioUrls && params.audioUrls.length > 0) {
    input.audio_urls = params.audioUrls.slice(0, 3)
  }

  // Legacy parent_task_id support
  if (params.parentTaskId) {
    input.parent_task_id = params.parentTaskId
  }

  const response = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': settings.apiKey,
    },
    body: JSON.stringify({
      model: 'seedance',
      task_type: taskType,
      input,
    }),
  })

  const result = await response.json() as PiApiResponse

  if (result.code !== 200) {
    throw new Error(`PiAPI error: ${JSON.stringify(result)}`)
  }

  const now = new Date().toISOString()
  const job: SeedanceJob = {
    id: randomUUID(),
    status: 'pending',
    prompt: params.prompt,
    duration,
    aspectRatio,
    taskType,
    sourceMode,
    piApiTaskId: result.data.task_id,
    imageUrls: params.imageUrls,
    videoUrl: params.videoUrl,
    videoUrls: effectiveVideoUrls.length > 0 ? effectiveVideoUrls : undefined,
    audioUrls: params.audioUrls && params.audioUrls.length > 0 ? params.audioUrls.slice(0, 3) : undefined,
    parentTaskId: params.parentTaskId,
    outputs: [],
    createdAt: now,
    updatedAt: now,
  }

  jobs.set(job.id, job)
  persistJobs()

  return job
}

/**
 * Extend a completed Seedance job by 5 seconds.
 * Creates a new task with parent_task_id pointing to the original job's piApiTaskId.
 */
export async function extendSeedanceJob(jobId: string): Promise<SeedanceJob> {
  ensureLoaded()
  const settings = getSeedanceSettings()
  if (!settings.apiKey) {
    throw new Error('Seedance 未設定。請先到設定頁儲存 PiAPI API Key。')
  }

  const originalJob = jobs.get(jobId)
  if (!originalJob) {
    throw new Error('找不到原始 Seedance 工作。')
  }
  if (originalJob.status !== 'completed') {
    throw new Error('只能延伸已完成的工作。')
  }
  if (!originalJob.piApiTaskId) {
    throw new Error('原始工作缺少 PiAPI task ID。')
  }

  const response = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': settings.apiKey,
    },
    body: JSON.stringify({
      model: 'seedance',
      task_type: originalJob.taskType,
      input: {
        prompt: originalJob.prompt,
        aspect_ratio: originalJob.aspectRatio,
        parent_task_id: originalJob.piApiTaskId,
      },
    }),
  })

  const result = await response.json() as PiApiResponse

  if (result.code !== 200) {
    throw new Error(`PiAPI error: ${JSON.stringify(result)}`)
  }

  const now = new Date().toISOString()
  const extendedJob: SeedanceJob = {
    id: randomUUID(),
    status: 'pending',
    prompt: originalJob.prompt,
    duration: originalJob.duration,
    aspectRatio: originalJob.aspectRatio,
    taskType: originalJob.taskType,
    sourceMode: 'extend',
    piApiTaskId: result.data.task_id,
    parentJobId: originalJob.id,
    parentPiApiTaskId: originalJob.piApiTaskId,
    outputs: [],
    createdAt: now,
    updatedAt: now,
  }

  jobs.set(extendedJob.id, extendedJob)
  persistJobs()

  return extendedJob
}

export async function pollSeedanceJob(jobId: string): Promise<SeedanceJob> {
  ensureLoaded()
  const job = jobs.get(jobId)
  if (!job) {
    throw new Error('找不到 Seedance 工作。')
  }

  if (!job.piApiTaskId) {
    throw new Error('Job 沒有 PiAPI task ID。')
  }

  if (job.status === 'completed' || job.status === 'failed') {
    return job
  }

  const settings = getSeedanceSettings()
  if (!settings.apiKey) {
    throw new Error('Seedance API Key 未設定。')
  }

  const response = await fetch(`https://api.piapi.ai/api/v1/task/${job.piApiTaskId}`, {
    headers: {
      'X-API-Key': settings.apiKey,
    },
  })

  const result = await response.json() as PiApiResponse

  if (result.code !== 200) {
    job.status = 'failed'
    job.error = `PiAPI error: ${JSON.stringify(result)}`
    job.updatedAt = new Date().toISOString()
    persistJobs()
    return job
  }

  const taskStatus = result.data.status
  job.updatedAt = new Date().toISOString()

  if (taskStatus === 'Completed') {
    const videoUrl = result.data.output?.video

    if (!videoUrl) {
      job.status = 'failed'
      job.error = '影片生成完成但無輸出 URL。'
      persistJobs()
      return job
    }

    // Download the video locally
    const jobDir = join(getGeneratedDir(), job.id)
    mkdirSync(jobDir, { recursive: true })
    const fileName = 'video-1.mp4'
    const outputPath = join(jobDir, fileName)

    try {
      if (!existsSync(outputPath)) {
        await downloadVideo(videoUrl, outputPath)
      }

      job.outputs = [{
        index: 0,
        localPath: outputPath,
        localUrl: `/generated/seedance/${job.id}/${fileName}`,
        remoteUrl: videoUrl,
        mimeType: 'video/mp4',
      }]

      // Calculate cost
      if (result.data.meta?.usage?.consume !== undefined) {
        job.cost = result.data.meta.usage.consume
      } else {
        job.cost = PRICING[job.taskType] * job.duration
      }

      job.status = 'completed'
    } catch (err) {
      job.status = 'failed'
      job.error = err instanceof Error ? err.message : String(err)
    }
  } else if (taskStatus === 'Failed') {
    job.status = 'failed'
    job.error = result.data.error?.message || '影片生成失敗。'
  } else {
    // Processing or Pending
    job.status = 'running'
  }

  persistJobs()
  return job
}

export function listSeedanceJobs(): SeedanceJob[] {
  ensureLoaded()
  return [...jobs.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getSeedanceJob(jobId: string): SeedanceJob | undefined {
  ensureLoaded()
  return jobs.get(jobId)
}

export function deleteSeedanceJob(jobId: string): boolean {
  ensureLoaded()
  const job = jobs.get(jobId)
  if (!job) {
    return false
  }

  rmSync(join(getGeneratedDir(), jobId), { recursive: true, force: true })
  jobs.delete(jobId)
  persistJobs()
  return true
}
