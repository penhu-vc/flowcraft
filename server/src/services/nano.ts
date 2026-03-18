/**
 * Nano Banana Pro (gemini-3-pro-image-preview) Image Generation Service
 *
 * Modes:
 * - text: Text-to-image
 * - edit: Image editing (upload image + instruction)
 * - reference: Reference images for style/composition guidance
 */

import { GoogleGenAI } from '@google/genai'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

type NanoMode = 'apiKey' | 'gcp'
type JobStatus = 'pending' | 'running' | 'completed' | 'failed'
type SourceMode = 'text' | 'edit' | 'reference' | 'outpaint'

export interface NanoInlineAsset {
  base64Data: string
  mimeType: string
  fileName?: string
  previewUrl?: string
}

interface NanoUiStateSnapshot {
  optimizerMode?: SourceMode
  optimizerInput?: string
  optimizeResult?: Record<string, unknown> | null
  refDescriptions?: string[]
}

export interface NanoGenerationRequest {
  sourceMode: SourceMode
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

interface StoredImage {
  index: number
  localPath?: string
  localUrl?: string
  mimeType?: string
}

export interface NanoJobRecord {
  id: string
  status: JobStatus
  createdAt: string
  updatedAt: string
  sourceMode: SourceMode
  prompt: string
  error?: string
  outputs: StoredImage[]
  requestSnapshot?: NanoGenerationRequest
}

function cloneRequestSnapshot(payload: NanoGenerationRequest): NanoGenerationRequest {
  return JSON.parse(JSON.stringify(payload)) as NanoGenerationRequest
}

// Multi-turn chat session tracking
export interface NanoChatSession {
  id: string
  jobIds: string[]
  createdAt: string
  updatedAt: string
  history: Array<{ role: 'user' | 'model'; text?: string; imageUrl?: string }>
}

const DATA_DIR = join(__dirname, '../../data')
const GENERATED_DIR = join(DATA_DIR, 'generated', 'nano')
const JOBS_FILE = join(DATA_DIR, 'nano-jobs.json')
const GEMINI_SETTINGS_FILE = join(DATA_DIR, 'gemini-settings.json')
const GCP_CREDENTIALS_FILE = join(DATA_DIR, 'gcp-credentials.json')

mkdirSync(GENERATED_DIR, { recursive: true })

const jobs = new Map<string, NanoJobRecord>()
loadJobs()

function loadJobs() {
  if (!existsSync(JOBS_FILE)) return
  try {
    const parsed = JSON.parse(readFileSync(JOBS_FILE, 'utf8')) as NanoJobRecord[]
    for (const job of parsed) {
      jobs.set(job.id, job)
    }
  } catch (error) {
    console.warn('Failed to load Nano jobs:', error)
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

function getGeminiSettings(): { mode: NanoMode; apiKey?: string } {
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
  throw new Error('Nano 未設定。請先到設定頁儲存 Gemini API Key 或 GCP 憑證。')
}

function createClient() {
  const settings = getGeminiSettings()
  if (settings.mode === 'apiKey') {
    if (!settings.apiKey) throw new Error('Gemini API Key 未設定。')
    return { authMode: settings.mode, client: new GoogleGenAI({ apiKey: settings.apiKey }) }
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

function buildContents(payload: NanoGenerationRequest) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

  // Add source image(s) first
  if ((payload.sourceMode === 'edit' || payload.sourceMode === 'outpaint') && payload.image) {
    parts.push({
      inlineData: {
        mimeType: payload.image.mimeType,
        data: stripBase64Prefix(payload.image.base64Data),
      },
    })
    // Add mask image if provided (white = area to edit, black = keep)
    if (payload.maskImage) {
      parts.push({
        inlineData: {
          mimeType: payload.maskImage.mimeType,
          data: stripBase64Prefix(payload.maskImage.base64Data),
        },
      })
    }
  }

  if (payload.sourceMode === 'reference' && payload.referenceImages?.length) {
    for (const ref of payload.referenceImages) {
      parts.push({
        inlineData: {
          mimeType: ref.mimeType,
          data: stripBase64Prefix(ref.base64Data),
        },
      })
    }
  }

  // Add text prompt
  let promptText = payload.prompt.trim()
  if (payload.sourceMode === 'edit' && payload.maskImage) {
    promptText = `The first image is the original photo. The second image is a mask where white areas indicate the region to edit. ${promptText}`
  }
  if (payload.negativePrompt?.trim()) {
    promptText += `\n\nAvoid: ${payload.negativePrompt.trim()}`
  }
  parts.push({ text: promptText })

  return parts
}

export function getNanoStatus() {
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

export async function createNanoJob(payload: NanoGenerationRequest): Promise<NanoJobRecord> {
  if (!payload.prompt?.trim()) {
    throw new Error('需要 prompt。')
  }
  if (payload.sourceMode === 'edit' && !payload.image) {
    throw new Error('圖片編輯模式需要上傳圖片。')
  }
  if (payload.sourceMode === 'reference' && (!payload.referenceImages || payload.referenceImages.length === 0)) {
    throw new Error('參考圖模式至少需要一張參考圖。')
  }

  const { client } = createClient()
  const contents = buildContents(payload)

  const now = new Date().toISOString()
  const job: NanoJobRecord = {
    id: randomUUID(),
    status: 'running',
    createdAt: now,
    updatedAt: now,
    sourceMode: payload.sourceMode,
    prompt: payload.prompt.trim(),
    outputs: [],
    requestSnapshot: cloneRequestSnapshot({
      ...payload,
      prompt: payload.prompt.trim(),
      negativePrompt: payload.negativePrompt?.trim() || undefined,
    }),
  }
  jobs.set(job.id, job)
  persistJobs()

  try {
    const numberOfImages = payload.numberOfImages || 1
    const jobDir = join(GENERATED_DIR, job.id)
    mkdirSync(jobDir, { recursive: true })

    const outputs: StoredImage[] = []

    for (let i = 0; i < numberOfImages; i++) {
      const response = await client.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: [{ role: 'user', parts: contents }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          ...(payload.aspectRatio || payload.imageSize
            ? {
                imageConfig: {
                  ...(payload.aspectRatio ? { aspectRatio: payload.aspectRatio } : {}),
                  ...(payload.imageSize ? { imageSize: payload.imageSize } : {}),
                },
              }
            : {}),
        } as Record<string, unknown>,
      })

      const candidate = response.candidates?.[0]
      if (!candidate?.content?.parts) {
        continue
      }

      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          const ext = part.inlineData.mimeType?.includes('png') ? 'png' : 'jpg'
          const fileName = `image-${outputs.length + 1}.${ext}`
          const outputPath = join(jobDir, fileName)
          const buffer = Buffer.from(part.inlineData.data!, 'base64')
          writeFileSync(outputPath, buffer)

          outputs.push({
            index: outputs.length,
            localPath: outputPath,
            localUrl: `/generated/nano/${job.id}/${fileName}`,
            mimeType: part.inlineData.mimeType || 'image/png',
          })
        }
      }
    }

    job.outputs = outputs
    job.status = outputs.length > 0 ? 'completed' : 'failed'
    if (outputs.length === 0) {
      job.error = '未生成任何圖片，可能觸發了安全過濾。'
    }
    job.updatedAt = new Date().toISOString()
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

export async function describeImage(
  image: NanoInlineAsset,
  aspects: string[] = []
): Promise<Record<string, string>> {
  const { client } = createClient()

  const aspectList = aspects.length > 0 ? aspects : [
    'facial', 'hairstyle', 'skintone', 'bodytype', 'expression', 'pose', 'clothing', 'background', 'lighting', 'composition', 'color'
  ]

  const aspectLabels: Record<string, string> = {
    facial: '五官（眼型、鼻型、嘴型、臉型、眉毛等面部特徵）',
    hairstyle: '髮型（長短、捲直、顏色、造型）',
    skintone: '膚色（膚色深淺、種族特徵）',
    bodytype: '體型（身材比例、高矮胖瘦）',
    expression: '表情（情緒、眼神）',
    pose: '動作/姿勢（身體姿態、手勢）',
    clothing: '服裝（衣物、配件、風格）',
    background: '背景/場景（環境、地點、物件）',
    lighting: '光線（光源方向、數量、明暗、色溫）',
    composition: '構圖（鏡頭角度、景深、裁切）',
    color: '色調（整體色彩傾向、對比度）',
    hands: '手部（手指數量、手勢、手的位置，如果看不到手請回答「不可見」）',
    text_and_logos: '文字與標誌（圖中是否有文字、Logo、品牌標誌，如果沒有請回答「無」）',
    depth_of_field: '景深（前景/背景的模糊程度、焦點位置）',
    ground_surface: '地面材質（地板、草地、道路等材質與紋理，如果看不到地面請回答「不可見」）',
    edge_objects: '邊緣物件（圖片邊緣是否有被截斷的物件，描述其位置與類型，如果沒有請回答「無」）',
  }

  const prompt = `Analyze this image and describe it in detail. Output a JSON object with these keys, each value is a concise Chinese description (1-2 sentences):

${aspectList.map(k => `- "${k}": ${aspectLabels[k] || k}`).join('\n')}

Only output valid JSON, no markdown fences.`

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: image.mimeType, data: stripBase64Prefix(image.base64Data) } },
        { text: prompt },
      ],
    }],
    config: { responseModalities: ['TEXT'] },
  })

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return { error: text }
  }
}

export function listNanoJobs() {
  return [...jobs.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getNanoJob(jobId: string) {
  return jobs.get(jobId)
}

export function deleteNanoJob(jobId: string) {
  const job = jobs.get(jobId)
  if (!job) return false

  rmSync(join(GENERATED_DIR, jobId), { recursive: true, force: true })
  jobs.delete(jobId)
  persistJobs()
  return true
}
