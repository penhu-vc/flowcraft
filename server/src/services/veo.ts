import { GenerateVideosOperation, GoogleGenAI, VideoCompressionQuality, VideoGenerationReferenceType, type Video } from '@google/genai'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getDataDir, ensureDir } from '../dataDir'

type VeoMode = 'apiKey' | 'gcp'
type JobStatus = 'pending' | 'running' | 'completed' | 'failed'
type SourceMode = 'text' | 'image' | 'frames' | 'references' | 'extend'
type PersonGenerationMode = 'dont_allow' | 'allow_adult'

export interface InlineAsset {
  base64Data: string
  mimeType: string
  fileName?: string
  previewUrl?: string
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
  uiState?: {
    optimizerMode?: SourceMode
    optimizerInput?: string
    optimizeResult?: Record<string, unknown> | null
    refDescriptions?: string[]
  }
}

interface StoredVideo {
  index: number
  localPath?: string
  localUrl?: string
  remoteUri?: string
  mimeType?: string
}

export interface FailureAnalysis {
  reason: string
  explanation: string
  promptIssues: string[]
  suggestion: string
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
  failureAnalysis?: FailureAnalysis
  outputs: StoredVideo[]
  requestSnapshot?: VeoGenerationRequest
}

function cloneRequestSnapshot(payload: VeoGenerationRequest): VeoGenerationRequest {
  return JSON.parse(JSON.stringify(payload)) as VeoGenerationRequest
}

// 路徑動態取得，支援本地/NAS 切換
const getGeneratedDir = () => ensureDir('generated', 'veo')
const getJobsFile = () => join(getDataDir(), 'veo-jobs.json')
// 設定檔跟著 getDataDir()（NAS 模式時從 NAS 讀）
const getGeminiSettingsFile = () => join(getDataDir(), 'gemini-settings.json')
const getGcpCredentialsFile = () => join(getDataDir(), 'gcp-credentials.json')

const jobs = new Map<string, VeoJobRecord>()
let loadedFromDir = ''

function loadJobs() {
  const currentDir = getDataDir()
  const jobsFile = join(currentDir, 'veo-jobs.json')
  // 記錄本次嘗試讀取的目錄（即使檔案不存在，也標記已嘗試過此目錄）
  loadedFromDir = currentDir
  if (!existsSync(jobsFile)) {
    return
  }
  try {
    const parsed = JSON.parse(readFileSync(jobsFile, 'utf8')) as VeoJobRecord[]
    for (const job of parsed) {
      jobs.set(job.id, job)
    }
  } catch (error) {
    console.warn('Failed to load Veo jobs:', error)
  }
}

function ensureLoaded() {
  const currentDir = getDataDir()
  if (loadedFromDir !== currentDir) {
    jobs.clear()
    loadJobs()
  }
}

// 啟動時載入
loadJobs()

// 背景定期檢查：若資料目錄切換（NAS 上線），自動重新載入
setInterval(() => {
  const currentDir = getDataDir()
  if (loadedFromDir !== currentDir) {
    console.log(`[veo] dataDir changed: ${loadedFromDir} → ${currentDir}, reloading jobs`)
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

function getGeminiSettings(): { mode: VeoMode; apiKey?: string } {
  if (existsSync(getGeminiSettingsFile())) {
    const settings = JSON.parse(readFileSync(getGeminiSettingsFile(), 'utf8'))
    return {
      mode: settings.mode === 'gcp' ? 'gcp' : 'apiKey',
      apiKey: settings.apiKey || process.env.GEMINI_API_KEY,
    }
  }

  if (process.env.GEMINI_API_KEY) {
    return { mode: 'apiKey', apiKey: process.env.GEMINI_API_KEY }
  }

  if (existsSync(getGcpCredentialsFile())) {
    return { mode: 'gcp' }
  }

  throw new Error('Veo 未設定。請先到設定頁儲存 Gemini API Key 或 GCP 憑證。')
}

function createClient() {
  // Veo video generation requires Vertex AI (generateVideos, generateAudio not supported in Gemini API)
  // Always use GCP credentials regardless of gemini-settings.json mode
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || getGcpCredentialsFile()
  if (!existsSync(credentialsPath)) {
    // Fallback to API Key mode for non-video operations (e.g. prompt optimization)
    const settings = getGeminiSettings()
    if (settings.mode === 'apiKey' && settings.apiKey) {
      return {
        authMode: settings.mode,
        client: new GoogleGenAI({ apiKey: settings.apiKey }),
      }
    }
    throw new Error('Veo 需要 GCP 憑證（Vertex AI）才能生成影片。請到設定頁上傳 GCP 憑證。')
  }

  const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'))
  return {
    authMode: 'gcp' as const,
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

    if (styleCount > 0 && assetCount > 0) {
      throw new Error('不能同時混用 Style 和 Asset reference，請只選一種類型。')
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
  const jobDir = join(getGeneratedDir(), job.id)
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
    // Veo 優先使用 GCP 憑證（Vertex AI），其次 API Key
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || getGcpCredentialsFile()
    if (existsSync(credentialsPath)) {
      return {
        ok: true,
        configured: true,
        authMode: 'gcp' as const,
        message: '已設定 Vertex AI 憑證',
      }
    }
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
    requestSnapshot: cloneRequestSnapshot({
      ...payload,
      prompt: payload.prompt?.trim() || '',
      negativePrompt: payload.negativePrompt?.trim() || undefined,
      outputGcsUri: payload.outputGcsUri?.trim() || undefined,
    }),
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
        const errorMsg = typeof operation.error === 'string' ? operation.error : JSON.stringify(operation.error)
        job.error = errorMsg
        // AI 分析失敗原因（非同步，不阻塞回應）
        analyzePromptFailure(job.prompt, errorMsg).then(analysis => {
          job.failureAnalysis = analysis
          persistJobs()
        }).catch(() => {})
      } else {
        await hydrateOutputs(client, job, operation)
        // 偵測靜默 RAI 過濾：done 且無 error 但 outputs 為空
        if (job.outputs.length === 0) {
          job.status = 'failed'
          job.error = '影片被安全過濾器攔截（generatedVideos 為空）。內容可能觸發了 Google 的 Responsible AI 審查機制。'
          analyzePromptFailure(job.prompt, job.error).then(analysis => {
            job.failureAnalysis = analysis
            persistJobs()
          }).catch(() => {})
        } else {
          job.status = 'completed'
        }
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
  ensureLoaded()
  return [...jobs.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getVeoJob(jobId: string) {
  ensureLoaded()
  return jobs.get(jobId)
}

// ── RAI Failure Analysis ──────────────────────────────────────────

// ── Support Code 對照表（來源：Google Cloud Responsible AI 文件）──
const SUPPORT_CODE_MAP: Record<string, { category: string; explanation: string }> = {
  '58061214': { category: '兒童保護', explanation: '偵測到可能涉及兒童的內容。若確定不涉及未成年人，可嘗試調整 personGeneration 設定。' },
  '17301594': { category: '兒童保護', explanation: '偵測到可能涉及兒童的內容。若確定不涉及未成年人，可嘗試調整 personGeneration 設定。' },
  '29310472': { category: '名人肖像', explanation: '偵測到嘗試生成知名公眾人物的逼真肖像。Veo 禁止生成可辨識的名人影片，需要 Google 專案級白名單才能解鎖。' },
  '15236754': { category: '名人肖像', explanation: '偵測到嘗試生成知名公眾人物的逼真肖像。Veo 禁止生成可辨識的名人影片，需要 Google 專案級白名單才能解鎖。' },
  '64151117': { category: '影片安全違規', explanation: '影片內容觸發了一般安全違規檢查。' },
  '42237218': { category: '影片安全違規', explanation: '影片內容觸發了一般安全違規檢查。' },
  '90789179': { category: '性/暗示內容', explanation: '偵測到性暗示或不當的成人內容。' },
  '43188360': { category: '性/暗示內容', explanation: '偵測到性暗示或不當的成人內容。' },
  '61493863': { category: '暴力內容', explanation: '偵測到暴力或血腥相關描述。' },
  '56562880': { category: '暴力內容', explanation: '偵測到暴力或血腥相關描述。' },
  '62263041': { category: '危險內容', explanation: '偵測到可能有害的危險內容描述。' },
  '57734940': { category: '仇恨內容', explanation: '偵測到仇恨或歧視性相關內容。' },
  '22137204': { category: '仇恨內容', explanation: '偵測到仇恨或歧視性相關內容。' },
  '78610348': { category: '有毒內容', explanation: '偵測到有害或有毒行為描述。' },
  '32635315': { category: '粗俗內容', explanation: '偵測到粗俗或不雅的語言/畫面描述。' },
  '92201652': { category: '個資洩露', explanation: '偵測到可能包含個人識別資訊（如信用卡、地址等）。' },
  '35561574': { category: '第三方版權', explanation: '偵測到受版權保護的第三方內容（如動漫角色、品牌 Logo 等）。' },
  '35561575': { category: '第三方版權', explanation: '偵測到受版權保護的第三方內容（如動漫角色、品牌 Logo 等）。' },
  '89371032': { category: '禁止內容', explanation: '觸發了嚴格的內容安全政策。' },
  '49114662': { category: '禁止內容', explanation: '觸發了嚴格的內容安全政策。' },
  '63429089': { category: '禁止內容', explanation: '觸發了嚴格的內容安全政策。' },
  '72817394': { category: '禁止內容', explanation: '觸發了嚴格的內容安全政策。' },
  '60599140': { category: '禁止內容', explanation: '觸發了嚴格的內容安全政策。' },
  '74803281': { category: '其他安全問題', explanation: '觸發了未分類的安全過濾機制。' },
  '29578790': { category: '其他安全問題', explanation: '觸發了未分類的安全過濾機制。' },
  '42876398': { category: '其他安全問題', explanation: '觸發了未分類的安全過濾機制。' },
}

function parseSupportCodes(errorStr: string): { category: string; explanation: string } | null {
  const codeMatch = errorStr.match(/Support codes?:\s*([\d,\s]+)/i)
  if (!codeMatch) return null
  const codes = codeMatch[1].split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
  for (const code of codes) {
    if (SUPPORT_CODE_MAP[code]) return SUPPORT_CODE_MAP[code]
  }
  return null
}

const RAI_REASON_MAP: Record<string, { label: string; explanation: string }> = {
  'people/face': {
    label: '人物/臉部安全過濾',
    explanation: '影片因為人物或臉部生成的安全設定而被過濾。可能的原因：參考圖中的人物年齡模糊、人臉生成設定限制、或 prompt 中的人物描述觸發了安全機制。',
  },
  'audio': {
    label: '音訊安全過濾',
    explanation: '影片的音訊部分被安全過濾器攔截。這在 Veo 3.1 中是已知的誤判問題，通常重試即可。建議：相同 prompt 再試 2-3 次。',
  },
  'input image': {
    label: '輸入圖片違規',
    explanation: '你上傳的參考圖片被判定違反使用規範。可能的原因：圖片中有敏感內容、模糊的年齡判定、或過於裸露的服裝。',
  },
  'usage guidelines': {
    label: '使用規範違規',
    explanation: '內容被判定違反 Google 生成式 AI 使用政策。可能涉及：暴力、色情、仇恨言論、真實人物肖像權等。',
  },
}

function parseRaiReason(errorStr: string): { label: string; explanation: string } | null {
  // 優先解析 support code（最精確）
  const supportCodeInfo = parseSupportCodes(errorStr)
  if (supportCodeInfo) {
    return { label: supportCodeInfo.category, explanation: supportCodeInfo.explanation }
  }

  const lower = errorStr.toLowerCase()
  for (const [keyword, info] of Object.entries(RAI_REASON_MAP)) {
    if (lower.includes(keyword)) return info
  }
  if (lower.includes('filter') || lower.includes('rai') || lower.includes('safety') || lower.includes('blocked')) {
    return { label: '內容安全過濾', explanation: '影片被 Google 的安全機制過濾，但未提供具體原因。建議檢查 prompt 是否有敏感詞彙。' }
  }
  return null
}

export async function analyzePromptFailure(prompt: string, errorStr: string): Promise<FailureAnalysis> {
  const raiInfo = parseRaiReason(errorStr)
  const reason = raiInfo?.label || '生成失敗'
  const explanation = raiInfo?.explanation || errorStr

  // 嘗試用 Gemini 分析 prompt 問題
  try {
    const { executeGemini } = await import('../executors/gemini')
    const analysisResult = await executeGemini({
      prompt: `你是 Google Veo 影片生成的審查專家。以下的影片生成 prompt 被安全過濾器攔截了。

錯誤訊息：${errorStr}

使用者的 prompt：
"""
${prompt}
"""

請分析這個 prompt 可能觸發安全過濾的原因，並提供修改建議。回覆格式必須是 JSON：
{
  "issues": ["問題1", "問題2"],
  "suggestion": "修改建議"
}

常見觸發原因：
1. 描述真實名人或公眾人物的肖像
2. 涉及未成年人的描述
3. 暴力、血腥或武器相關描述
4. 性暗示或裸露相關描述
5. 描述受版權保護的角色（迪士尼、漫威等）
6. 過於激烈的動作描述（打鬥、碰撞等）
7. 音訊相關：對話內容涉及敏感話題
8. 人種/民族的刻板描述

回覆純 JSON，不要 markdown。`,
      model: 'gemini-2.5-flash',
      temperature: 0,
      maxTokens: 1024,
    }, () => {})

    try {
      const resultText = typeof analysisResult === 'string' ? analysisResult : analysisResult.result
      const cleaned = resultText.replace(/```json\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      return {
        reason,
        explanation,
        promptIssues: parsed.issues || [],
        suggestion: parsed.suggestion || '嘗試移除敏感描述後重新生成。',
      }
    } catch {
      return { reason, explanation, promptIssues: [], suggestion: '嘗試簡化 prompt，移除可能的敏感描述後重新生成。' }
    }
  } catch {
    return { reason, explanation, promptIssues: [], suggestion: '嘗試簡化 prompt，移除可能的敏感描述後重新生成。' }
  }
}

export function deleteVeoJob(jobId: string) {
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
