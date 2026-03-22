import { Router } from 'express'
import express from 'express'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { getDataDir, ensureDir, LOCAL_DATA_DIR } from '../dataDir'

import { createVeoJob, deleteVeoJob, getVeoStatus, listVeoJobs, refreshVeoJob, analyzePromptFailure } from '../services/veo'
import { analyzeSceneSubjects, createNanoJob, deleteNanoJob, describeImage, getNanoStatus, listNanoJobs } from '../services/nano'
import { optimizeVeoPrompt } from '../veo-prompt-optimizer'
import { optimizeNanoPrompt } from '../nano-prompt-optimizer'
import { getVideosFromUrl } from '../utils/youtube-utils'

const router = Router()

// ── Setup directories (動態，支援 NAS 切換) ────────────────────────
const getGeneratedFilesDir = () => ensureDir('generated')
const getAssetsDir = () => ensureDir('generated', 'assets')
const getAssetsIndexFile = () => join(getDataDir(), 'assets-index.json')

// ── Serve static generated files（動態解析，支援 NAS 切換不需重啟）──
router.use('/generated', (req, res, next) => {
    const filePath = join(getDataDir(), 'generated', req.path)
    if (existsSync(filePath)) {
        return res.sendFile(filePath)
    }
    // fallback: 如果 NAS 模式找不到，嘗試本地
    const localPath = join(LOCAL_DATA_DIR, 'generated', req.path)
    if (localPath !== filePath && existsSync(localPath)) {
        return res.sendFile(localPath)
    }
    res.status(404).json({ error: 'File not found' })
})

// ── Assets index helpers ──────────────────────────────────────────
interface AssetIndexEntry {
    url: string
    filename: string
    label?: string
    tags?: string[]
    createdAt?: number
}

function loadAssetsIndex(): AssetIndexEntry[] {
    try {
        if (existsSync(getAssetsIndexFile())) {
            return JSON.parse(readFileSync(getAssetsIndexFile(), 'utf-8'))
        }
    } catch {
        // ignore parse errors
    }
    return []
}

function saveAssetsIndex(index: AssetIndexEntry[]): void {
    writeFileSync(getAssetsIndexFile(), JSON.stringify(index, null, 2), 'utf-8')
}

// ── Veo routes ────────────────────────────────────────────────────
router.post('/api/veo/optimize-prompt', async (req, res) => {
    try {
        const { prompt, mode } = req.body
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ ok: false, error: 'prompt is required' })
        }
        const result = await optimizeVeoPrompt(prompt, mode || 'text')
        res.json({ ok: true, ...result })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.get('/api/veo/status', (_req, res) => {
    res.json(getVeoStatus())
})

router.get('/api/veo/jobs', (_req, res) => {
    res.json({ ok: true, jobs: listVeoJobs() })
})

router.get('/api/veo/jobs/:id', async (req, res) => {
    try {
        const job = await refreshVeoJob(req.params.id)
        res.json({ ok: true, job })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.post('/api/veo/generate', async (req, res) => {
    try {
        const job = await createVeoJob(req.body)
        res.json({ ok: true, job })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.delete('/api/veo/jobs/:id', (req, res) => {
    const deleted = deleteVeoJob(req.params.id)
    if (!deleted) {
        return res.status(404).json({ ok: false, error: 'Job not found' })
    }
    res.json({ ok: true })
})

// ── Analyze failure（手動觸發 AI 分析）─────────────────────────
router.post('/api/veo/analyze-failure', async (req, res) => {
    try {
        const { prompt, error: errorStr } = req.body
        if (!prompt || !errorStr) return res.status(400).json({ ok: false, error: 'prompt and error are required' })
        const analysis = await analyzePromptFailure(prompt, errorStr)
        res.json({ ok: true, analysis })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Gemini API 通用生成（消費者版 REST，支援所有模式）──────────
router.post('/api/veo/gemini-generate-general', async (req, res) => {
    try {
        const payload = req.body
        const { sourceMode, prompt, aspectRatio, personGeneration, model, numberOfVideos, durationSeconds, negativePrompt, generateAudio, image, referenceImages } = payload

        // 讀取 API Key
        const settingsFile = join(getDataDir(), 'gemini-settings.json')
        if (!existsSync(settingsFile)) return res.status(500).json({ ok: false, error: 'Gemini API Key 未設定' })
        const settings = JSON.parse(readFileSync(settingsFile, 'utf-8'))
        const apiKey = settings.apiKey || process.env.GEMINI_API_KEY
        if (!apiKey) return res.status(500).json({ ok: false, error: 'Gemini API Key 未設定' })

        const modelId = model || 'veo-3.1-generate-preview'

        // 組裝 REST body
        const instance: Record<string, unknown> = {}
        if (prompt) instance.prompt = prompt

        // image-to-video / frames
        if ((sourceMode === 'image' || sourceMode === 'frames') && image?.base64Data) {
            instance.image = {
                bytesBase64Encoded: image.base64Data.replace(/^data:[^;]+;base64,/, ''),
                mimeType: image.mimeType || 'image/jpeg',
            }
        }

        // reference images
        if (sourceMode === 'references' && referenceImages?.length) {
            instance.referenceImages = referenceImages.map((img: { base64Data: string; mimeType: string; referenceType?: string }) => ({
                image: {
                    bytesBase64Encoded: img.base64Data.replace(/^data:[^;]+;base64,/, ''),
                    mimeType: img.mimeType,
                },
                referenceType: img.referenceType === 'STYLE' ? 'STYLE_REFERENCE' : 'SUBJECT_REFERENCE',
            }))
        }

        const parameters: Record<string, unknown> = {
            aspectRatio: aspectRatio || '16:9',
            personGeneration: personGeneration || 'allow_adult',
            sampleCount: numberOfVideos || 1,
        }
        if (durationSeconds) parameters.durationSeconds = durationSeconds
        if (negativePrompt) parameters.negativePrompt = negativePrompt
        if (generateAudio !== undefined) parameters.generateAudio = generateAudio

        const body = { instances: [instance], parameters }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predictLongRunning?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        )
        const result = await response.json() as { name?: string; error?: { message?: string } }

        if (result.error) {
            return res.status(500).json({ ok: false, error: result.error.message || JSON.stringify(result.error) })
        }

        // 建立 job 記錄
        const { randomUUID } = await import('crypto')
        const jobId = randomUUID()
        const now = new Date().toISOString()

        const jobsFile = join(getDataDir(), 'veo-jobs.json')
        let allJobs: any[] = []
        try { allJobs = JSON.parse(readFileSync(jobsFile, 'utf-8')) } catch { }

        const job = {
            id: jobId,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            operationName: result.name || '',
            sourceMode: sourceMode || 'text',
            prompt: prompt || '',
            model: modelId,
            authMode: 'gemini-api',
            outputs: [],
            requestSnapshot: payload,
        }
        allJobs.unshift(job)
        writeFileSync(jobsFile, JSON.stringify(allJobs, null, 2), 'utf-8')

        res.json({ ok: true, job })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Gemini API Subject Video（消費者版 REST）─────────────────────
router.post('/api/veo/gemini-generate', async (req, res) => {
    try {
        const { referenceImages, prompt, aspectRatio, personGeneration } = req.body
        if (!prompt) return res.status(400).json({ ok: false, error: 'prompt is required' })
        if (!referenceImages?.length) return res.status(400).json({ ok: false, error: 'referenceImages is required' })

        // 讀取 API Key
        const settingsFile = join(getDataDir(), 'gemini-settings.json')
        if (!existsSync(settingsFile)) return res.status(500).json({ ok: false, error: 'Gemini API Key 未設定' })
        const settings = JSON.parse(readFileSync(settingsFile, 'utf-8'))
        const apiKey = settings.apiKey || process.env.GEMINI_API_KEY
        if (!apiKey) return res.status(500).json({ ok: false, error: 'Gemini API Key 未設定' })

        // 組裝 REST body（每張圖可指定 referenceType）
        const refs = referenceImages.map((img: { base64Data: string; mimeType: string; referenceType?: string }) => ({
            image: {
                bytesBase64Encoded: img.base64Data.replace(/^data:[^;]+;base64,/, ''),
                mimeType: img.mimeType,
            },
            referenceType: img.referenceType || 'subject',
        }))

        const body = {
            instances: [{
                prompt,
                referenceImages: refs,
            }],
            parameters: {
                aspectRatio: aspectRatio || '9:16',
                personGeneration: personGeneration || 'allow_adult',
                sampleCount: 1,
            },
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        )
        const result = await response.json() as { name?: string; error?: { message?: string } }

        if (result.error) {
            return res.status(500).json({ ok: false, error: result.error.message || JSON.stringify(result.error) })
        }

        // 建立 job 記錄
        const { randomUUID } = await import('crypto')
        const jobId = randomUUID()
        const now = new Date().toISOString()
        const operationName = result.name || ''

        // 讀寫 veo-jobs.json
        const jobsFile = join(getDataDir(), 'veo-jobs.json')
        let allJobs: any[] = []
        try { allJobs = JSON.parse(readFileSync(jobsFile, 'utf-8')) } catch { }

        const job = {
            id: jobId,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            operationName,
            sourceMode: 'references',
            prompt,
            model: 'veo-3.1-generate-preview',
            authMode: 'gemini-api',
            outputs: [],
            requestSnapshot: { sourceMode: 'references', prompt, aspectRatio, referenceImages: [] },
        }
        allJobs.unshift(job)
        writeFileSync(jobsFile, JSON.stringify(allJobs, null, 2), 'utf-8')

        res.json({ ok: true, job: { ...job, operationName } })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.get('/api/veo/gemini-poll/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params

        // 從 veo-jobs.json 找 job
        const jobsFile = join(getDataDir(), 'veo-jobs.json')
        let allJobs: any[] = []
        try { allJobs = JSON.parse(readFileSync(jobsFile, 'utf-8')) } catch { }
        const job = allJobs.find((j: any) => j.id === jobId)
        if (!job) return res.status(404).json({ ok: false, error: 'Job not found' })
        if (job.status === 'completed' || job.status === 'failed') return res.json({ ok: true, job })

        const settingsFile = join(getDataDir(), 'gemini-settings.json')
        const settings = JSON.parse(readFileSync(settingsFile, 'utf-8'))
        const apiKey = settings.apiKey || process.env.GEMINI_API_KEY

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${job.operationName}?key=${apiKey}`
        )
        const result = await response.json() as {
            done?: boolean
            response?: {
                generateVideoResponse?: {
                    generatedSamples?: Array<{ video?: { uri?: string } }>
                    raiMediaFilteredCount?: number
                    raiMediaFilteredReasons?: string[]
                }
            }
            error?: { message?: string }
        }

        job.updatedAt = new Date().toISOString()

        if (result.done) {
            const vr = result.response?.generateVideoResponse
            if (vr?.raiMediaFilteredCount) {
                job.status = 'failed'
                job.error = (vr.raiMediaFilteredReasons || ['Content filtered']).join('; ')
                // AI 分析失敗原因
                try {
                    job.failureAnalysis = await analyzePromptFailure(job.prompt || '', job.error)
                } catch { /* ignore */ }
            } else if (vr?.generatedSamples?.length) {
                // 下載影片
                const jobDir = join(getDataDir(), 'generated', 'veo', jobId)
                mkdirSync(jobDir, { recursive: true })
                const outputs: any[] = []

                for (const [idx, sample] of vr.generatedSamples.entries()) {
                    if (sample.video?.uri) {
                        const videoUrl = `${sample.video.uri}&key=${apiKey}`
                        const videoRes = await fetch(videoUrl)
                        const buffer = Buffer.from(await videoRes.arrayBuffer())
                        const fileName = `video-${idx + 1}.mp4`
                        const outputPath = join(jobDir, fileName)
                        writeFileSync(outputPath, buffer)
                        outputs.push({
                            index: idx,
                            localPath: outputPath,
                            localUrl: `/generated/veo/${jobId}/${fileName}`,
                            mimeType: 'video/mp4',
                        })
                    }
                }
                job.status = 'completed'
                job.outputs = outputs
            } else if (result.error) {
                job.status = 'failed'
                job.error = result.error.message || JSON.stringify(result.error)
                try {
                    job.failureAnalysis = await analyzePromptFailure(job.prompt || '', job.error)
                } catch { /* ignore */ }
            } else {
                job.status = 'failed'
                job.error = '未知錯誤：沒有影片輸出'
                try {
                    job.failureAnalysis = await analyzePromptFailure(job.prompt || '', job.error)
                } catch { /* ignore */ }
            }
        } else {
            job.status = 'running'
        }

        writeFileSync(jobsFile, JSON.stringify(allJobs, null, 2), 'utf-8')
        res.json({ ok: true, job })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.post('/api/veo/describe-for-video', async (req, res) => {
    try {
        const { image } = req.body
        if (!image?.base64Data) return res.status(400).json({ ok: false, error: 'image is required' })

        // 用 nano 的 describeImage 功能（已有 Gemini 整合）
        const result = await describeImage(image, [
            'appearance', 'clothing', 'hair', 'expression', 'pose',
            'background', 'lighting', 'composition', 'color',
        ])
        res.json({ ok: true, description: result })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Nano routes ───────────────────────────────────────────────────
router.post('/api/nano/optimize-prompt', async (req, res) => {
    try {
        const { prompt, mode } = req.body
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ ok: false, error: 'prompt is required' })
        }
        const result = await optimizeNanoPrompt(prompt, mode || 'text')
        res.json({ ok: true, ...result })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.post('/api/nano/analyze-subjects', async (req, res) => {
    try {
        const { image } = req.body
        if (!image?.base64Data) {
            return res.status(400).json({ ok: false, error: 'image is required' })
        }
        const subjects = await analyzeSceneSubjects(image)
        res.json({ ok: true, subjects })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.post('/api/nano/describe-image', async (req, res) => {
    try {
        const { image, aspects } = req.body
        if (!image?.base64Data) {
            return res.status(400).json({ ok: false, error: 'image is required' })
        }
        const result = await describeImage(image, aspects)
        res.json({ ok: true, description: result })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.get('/api/nano/status', (_req, res) => {
    res.json(getNanoStatus())
})

router.get('/api/nano/jobs', (_req, res) => {
    res.json({ ok: true, jobs: listNanoJobs() })
})

router.post('/api/nano/generate', async (req, res) => {
    try {
        const job = await createNanoJob(req.body)
        res.json({ ok: true, job })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.delete('/api/nano/jobs/:id', (req, res) => {
    const deleted = deleteNanoJob(req.params.id)
    if (!deleted) {
        return res.status(404).json({ ok: false, error: 'Job not found' })
    }
    res.json({ ok: true })
})

// Replace a nano job output with composited image (for outpaint post-composite)
router.post('/api/nano/jobs/:id/replace-output', (req, res) => {
    const { outputIndex, base64Data } = req.body
    if (typeof outputIndex !== 'number' || typeof base64Data !== 'string') {
        return res.status(400).json({ ok: false, error: 'Missing outputIndex or base64Data' })
    }
    const job = listNanoJobs().find((j: any) => j.id === req.params.id)
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' })
    const output = job.outputs?.[outputIndex]
    if (!output?.localPath) return res.status(404).json({ ok: false, error: 'Output not found' })
    try {
        const filePath = join(getDataDir(), output.localPath.replace(/^\/?(generated\/)/, '$1'))
        const raw = base64Data.replace(/^data:[^;]+;base64,/, '')
        writeFileSync(filePath, Buffer.from(raw, 'base64'))
        res.json({ ok: true })
    } catch (err: unknown) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
})

// Open job folder in Finder
router.post('/api/nano/jobs/:id/open-folder', (req, res) => {
    const job = listNanoJobs().find((j: any) => j.id === req.params.id)
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' })
    const folderPath = join(getDataDir(), 'generated', 'nano', req.params.id)
    try {
        require('child_process').execSync(`open "${folderPath}"`)
        res.json({ ok: true })
    } catch (err: unknown) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
})

// ── Assets routes ─────────────────────────────────────────────────
router.post('/api/assets/upload', (req, res) => {
    try {
        const { base64, mimeType, filename } = req.body
        if (!base64 || !mimeType) {
            return res.status(400).json({ ok: false, error: 'base64 and mimeType required' })
        }
        const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const fname = `${id}.${ext}`
        const data = base64.replace(/^data:[^;]+;base64,/, '')
        writeFileSync(join(getAssetsDir(), fname), Buffer.from(data, 'base64'))
        res.json({ ok: true, url: `/generated/assets/${fname}`, filename: filename || fname })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.get('/api/assets', (_req, res) => {
    try {
        const files = existsSync(getAssetsDir())
            ? readdirSync(getAssetsDir()).filter((f: string) => !f.startsWith('.'))
            : []
        res.json({ ok: true, files: files.map((f: string) => `/generated/assets/${f}`) })
    } catch {
        res.json({ ok: true, files: [] })
    }
})

router.get('/api/assets/index', (_req, res) => {
    try {
        const items = loadAssetsIndex()
        res.json({ ok: true, items })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.put('/api/assets/index', (req, res) => {
    try {
        const items = req.body.items || req.body.index
        if (!Array.isArray(items)) {
            return res.status(400).json({ ok: false, error: 'items array required' })
        }
        saveAssetsIndex(items)
        res.json({ ok: true })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── YouTube download (yt-dlp) ────────────────────────────────────
const getYtCacheDir = () => ensureDir('generated', 'yt-cache')

router.post('/api/youtube/download', async (req, res) => {
    try {
        const { url } = req.body
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ ok: false, error: 'url is required' })
        }
        // Validate YouTube URL
        const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/)
        if (!ytMatch) {
            return res.status(400).json({ ok: false, error: '不是有效的 YouTube 連結' })
        }
        const videoId = ytMatch[1]
        const cacheDir = getYtCacheDir()
        const outPath = join(cacheDir, `${videoId}.mp4`)

        // Return cached if exists
        if (existsSync(outPath) && statSync(outPath).size > 0) {
            return res.json({ ok: true, url: `/generated/yt-cache/${videoId}.mp4`, videoId, cached: true })
        }

        // Download with yt-dlp (best quality ≤720p with audio, mp4)
        await new Promise<void>((resolve, reject) => {
            execFile('yt-dlp', [
                '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
                '--merge-output-format', 'mp4',
                '-o', outPath,
                '--no-playlist',
                '--no-check-certificates',
                url,
            ], { timeout: 120_000 }, (err, _stdout, stderr) => {
                if (err) reject(new Error(stderr || err.message))
                else resolve()
            })
        })

        if (!existsSync(outPath) || statSync(outPath).size === 0) {
            return res.status(500).json({ ok: false, error: '下載失敗，檔案為空' })
        }

        res.json({ ok: true, url: `/generated/yt-cache/${videoId}.mp4`, videoId, cached: false })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── YouTube route ─────────────────────────────────────────────────
router.get('/api/youtube/recent-videos', async (req, res) => {
    try {
        const { url } = req.query
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ ok: false, error: 'URL parameter is required' })
        }

        const videos = await getVideosFromUrl(url)
        res.json({ ok: true, videos })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

export default router
