import express from 'express'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import cors from 'cors'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { executeNode } from './executor'
import { startAuthFlow } from './auth/saveSession'
import { WorkflowEngine } from './execution/WorkflowEngine'
import { Workflow } from './execution/types'
import { createVeoJob, deleteVeoJob, getVeoStatus, listVeoJobs, refreshVeoJob } from './services/veo'
import { createNanoJob, deleteNanoJob, describeImage, getNanoStatus, listNanoJobs } from './services/nano'

const app = express()
const httpServer = createServer(app)

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5300',
    'http://localhost:8080',
    'http://flowcraft.localhost'  // Docker Gateway domain
]

const io = new SocketIO(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
})

app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '50mb' }))

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0' })
})

// ── Local Gradio Proxy (bypass CORS for WanGP/InfiniteTalk) ──────
app.all('/api/local-proxy/*', async (req, res) => {
    const targetUrl = req.query.url as string
    if (!targetUrl || !targetUrl.startsWith('http://localhost') && !targetUrl.startsWith('http://127.0.0.1')) {
        return res.status(400).json({ error: 'Only localhost URLs allowed' })
    }
    try {
        const fetchOptions: RequestInit = { method: req.method, headers: {} }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = JSON.stringify(req.body)
            ;(fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json'
        }
        const upstream = await fetch(targetUrl, fetchOptions)
        const contentType = upstream.headers.get('content-type') || ''
        res.status(upstream.status).set('content-type', contentType)
        if (contentType.includes('json')) {
            res.json(await upstream.json())
        } else {
            const buf = Buffer.from(await upstream.arrayBuffer())
            res.send(buf)
        }
    } catch (err: unknown) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'proxy error' })
    }
})

app.post('/api/local-proxy-upload', express.raw({ type: '*/*', limit: '200mb' }), async (req, res) => {
    const targetUrl = req.query.url as string
    if (!targetUrl || !targetUrl.startsWith('http://localhost') && !targetUrl.startsWith('http://127.0.0.1')) {
        return res.status(400).json({ error: 'Only localhost URLs allowed' })
    }
    try {
        const upstream = await fetch(targetUrl, {
            method: 'POST',
            body: req.body,
            headers: { 'Content-Type': req.headers['content-type'] || 'application/octet-stream' },
        })
        res.status(upstream.status).json(await upstream.json())
    } catch (err: unknown) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'proxy error' })
    }
})

// ── InfiniteTalk: inspect WanGP API (diagnostics) ──
app.get('/api/infinitetalk/info', async (req, res) => {
    const base = ((req.query.url as string) || 'http://localhost:7860').replace(/\/$/, '')
    try {
        const r = await fetch(`${base}/gradio_api/info`)
        const data = await r.json()
        res.json(data)
    } catch (err: unknown) {
        res.status(502).json({ error: err instanceof Error ? err.message : String(err) })
    }
})

// ── InfiniteTalk: generate video via WanGP InfiniteTalk (Python subprocess) ──
const WANGP_ROOT = 'C:\\projects\\Wan2GP'
const WANGP_PYTHON = 'C:\\Users\\user\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'
const WANGP_OUTPUT_DIR = `${WANGP_ROOT}\\outputs`

import { tmpdir } from 'os'
import multer from 'multer'
import { readFileSync as readFileSyncFs, mkdirSync as mkdirSyncFs } from 'fs'
import { spawn } from 'child_process'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } })

// Ensure WanGP output dir exists
try { mkdirSyncFs(WANGP_OUTPUT_DIR, { recursive: true }) } catch {}

function runWanGPGenerate(imagePath: string, audioPath: string, prompt: string, videoLength = 81, numSteps = 20): Promise<string> {
    return new Promise((resolve, reject) => {
        const script = `${WANGP_ROOT}\\infinitetalk_generate.py`
        const args = [script, imagePath, audioPath, WANGP_OUTPUT_DIR, prompt, String(videoLength), String(numSteps)]
        console.log('[InfiniteTalk] spawning:', WANGP_PYTHON, args.join(' '))

        const child = spawn(WANGP_PYTHON, args, {
            cwd: WANGP_ROOT,
            env: { ...process.env, PYTHONPATH: WANGP_ROOT },
            timeout: 7200000, // 2 hours (model load + generation)
        })

        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d: Buffer) => {
            const s = d.toString()
            stdout += s
            process.stdout.write('[WanGP] ' + s)
        })
        child.stderr.on('data', (d: Buffer) => {
            const s = d.toString()
            stderr += s
            process.stderr.write('[WanGP-err] ' + s)
        })
        child.on('close', (code) => {
            // Find last JSON line in stdout
            const lines = stdout.trim().split('\n').filter(l => l.trim().startsWith('{'))
            const lastJson = lines[lines.length - 1]
            if (!lastJson) {
                return reject(new Error(`WanGP exited (code ${code}) but no JSON output.\nstderr: ${stderr.slice(-500)}`))
            }
            try {
                const result = JSON.parse(lastJson)
                if (result.ok && result.videoPath) {
                    resolve(result.videoPath)
                } else {
                    reject(new Error(result.error || 'WanGP generation failed'))
                }
            } catch {
                reject(new Error(`Could not parse WanGP output: ${lastJson}`))
            }
        })
        child.on('error', (err) => reject(err))
    })
}

app.post('/api/infinitetalk/generate', express.json({ limit: '10mb' }), async (req, res) => {
    const { srcFilePath, audFilePath, prompt = 'a person talking', videoLength = 81, numSteps = 20 } = req.body
    console.log('[InfiniteTalk] generate:', srcFilePath, audFilePath, `${videoLength}frames/${numSteps}steps`)
    try {
        const videoPath = await runWanGPGenerate(srcFilePath, audFilePath, prompt, videoLength, numSteps)
        const videoUrl = `http://localhost:3001/api/infinitetalk/video?path=${encodeURIComponent(videoPath)}`
        console.log('[InfiniteTalk] done! videoPath:', videoPath)
        res.json({ ok: true, videoUrl, videoPath })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[InfiniteTalk] error:', message)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── InfiniteTalk: serve generated video file ──
app.get('/api/infinitetalk/video', (req, res) => {
    const filePath = req.query.path as string
    if (!filePath || !filePath.startsWith(WANGP_ROOT)) {
        return res.status(403).json({ error: 'Invalid path' })
    }
    res.sendFile(filePath)
})

// ── InfiniteTalk: list recent generated videos ──
app.get('/api/infinitetalk/recent', (req, res) => {
    try {
        const files = readdirSync(WANGP_OUTPUT_DIR)
            .filter(f => f.endsWith('.mp4'))
            .map(f => {
                const fullPath = `${WANGP_OUTPUT_DIR}\\${f}`
                const stat = statSync(fullPath)
                const videoUrl = `http://localhost:3001/api/infinitetalk/video?path=${encodeURIComponent(fullPath)}`
                return { filename: f, videoUrl, videoPath: fullPath, createdAt: stat.mtimeMs }
            })
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 10)
        res.json({ ok: true, files })
    } catch {
        res.json({ ok: true, files: [] })
    }
})

// ── InfiniteTalk: multipart upload + generate (frontend sends files directly) ──
app.post('/api/infinitetalk/generate-upload',
    upload.fields([{ name: 'sourceFile', maxCount: 1 }, { name: 'audioFile', maxCount: 1 }]),
    async (req, res) => {
        const files = req.files as Record<string, Express.Multer.File[]>
        const srcFile = files?.sourceFile?.[0]
        const audFile = files?.audioFile?.[0]
        if (!srcFile || !audFile) return res.status(400).json({ ok: false, error: '需要 sourceFile 和 audioFile' })

        const tmpDir = tmpdir()
        const srcPath = `${tmpDir}\\${Date.now()}-${srcFile.originalname}`
        const audPath = `${tmpDir}\\${Date.now()}-${audFile.originalname}`
        writeFileSync(srcPath, srcFile.buffer)
        writeFileSync(audPath, audFile.buffer)

        const prompt = req.body?.prompt || 'a person talking'
        const videoLength = parseInt(req.body?.videoLength) || 81
        const numSteps = parseInt(req.body?.numSteps) || 20

        try {
            const videoPath = await runWanGPGenerate(srcPath, audPath, prompt, videoLength, numSteps)
            const videoUrl = `http://localhost:3001/api/infinitetalk/video?path=${encodeURIComponent(videoPath)}`
            console.log('[InfiniteTalk-upload] done! videoPath:', videoPath)
            res.json({ ok: true, videoUrl, videoPath })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            console.error('[InfiniteTalk-upload] error:', message)
            res.status(500).json({ ok: false, error: message })
        }
    }
)

// ── Wav2Lip: ComfyUI-based lip sync ──────────────────────────────
const COMFYUI_URL = 'http://localhost:8188'
const COMFYUI_INPUT_DIR = 'C:\\ComfyUI\\input'

app.post('/api/wav2lip/generate-upload',
    upload.fields([{ name: 'sourceFile', maxCount: 1 }, { name: 'audioFile', maxCount: 1 }]),
    async (req, res) => {
        const files = req.files as Record<string, Express.Multer.File[]>
        const srcFile = files?.sourceFile?.[0]
        const audFile = files?.audioFile?.[0]
        if (!srcFile || !audFile) return res.status(400).json({ ok: false, error: '需要 sourceFile 和 audioFile' })

        try {
            const srcMode = req.body?.srcMode || 'image'  // 'image' | 'video'

            // Save audio to ComfyUI input dir (VHS_LoadAudio needs a path)
            const audioFilename = `${Date.now()}-${audFile.originalname}`
            const audioPath = join(COMFYUI_INPUT_DIR, audioFilename).replace(/\//g, '\\')
            writeFileSync(audioPath, audFile.buffer)
            console.log('[Wav2Lip] saved audio:', audioPath)

            let workflow: Record<string, unknown>

            if (srcMode === 'video') {
                // Save video to ComfyUI input dir
                const videoFilename = `${Date.now()}-${srcFile.originalname}`
                const videoPath = join(COMFYUI_INPUT_DIR, videoFilename).replace(/\//g, '\\')
                writeFileSync(videoPath, srcFile.buffer)
                console.log('[Wav2Lip] saved video:', videoPath)

                workflow = {
                    "1": { "class_type": "VHS_LoadVideoPath", "inputs": {
                        "video": videoPath, "force_rate": 0,
                        "custom_width": 0, "custom_height": 0, "frame_load_cap": 0,
                        "skip_first_frames": 0, "select_every_nth": 1
                    }},
                    "2": { "class_type": "VHS_LoadAudio", "inputs": { "audio_file": audioPath, "seek_seconds": 0 } },
                    "3": { "class_type": "Wav2Lip", "inputs": { "images": ["1", 0], "mode": "sequential", "face_detect_batch": 8, "audio": ["2", 0] } },
                    "4": { "class_type": "VHS_VideoCombine", "inputs": {
                        "images": ["3", 0], "audio": ["3", 1],
                        "frame_rate": 25, "loop_count": 0, "filename_prefix": "wav2lip",
                        "format": "video/h264-mp4", "pingpong": false, "save_output": true
                    }}
                }
            } else {
                // Upload image to ComfyUI
                const imageForm = new FormData()
                imageForm.append('image', new Blob([srcFile.buffer], { type: srcFile.mimetype }), srcFile.originalname)
                const imgResp = await fetch(`${COMFYUI_URL}/upload/image`, { method: 'POST', body: imageForm })
                const imgData = await imgResp.json() as { name: string }
                const imageName = imgData.name
                console.log('[Wav2Lip] uploaded image:', imageName)

                workflow = {
                    "1": { "class_type": "LoadImage", "inputs": { "image": imageName, "upload": "image" } },
                    "2": { "class_type": "VHS_LoadAudio", "inputs": { "audio_file": audioPath, "seek_seconds": 0 } },
                    "3": { "class_type": "Wav2Lip", "inputs": { "images": ["1", 0], "mode": "sequential", "face_detect_batch": 8, "audio": ["2", 0] } },
                    "4": { "class_type": "VHS_VideoCombine", "inputs": {
                        "images": ["3", 0], "audio": ["3", 1],
                        "frame_rate": 25, "loop_count": 0, "filename_prefix": "wav2lip",
                        "format": "video/h264-mp4", "pingpong": false, "save_output": true
                    }}
                }
            }

            // Submit to ComfyUI
            const promptResp = await fetch(`${COMFYUI_URL}/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: workflow })
            })
            const promptData = await promptResp.json() as { prompt_id: string }
            const promptId = promptData.prompt_id
            console.log('[Wav2Lip] promptId:', promptId)
            res.json({ ok: true, promptId })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            console.error('[Wav2Lip] error:', message)
            res.status(500).json({ ok: false, error: message })
        }
    }
)

// ── Wav2Lip: poll ComfyUI generation status ──
app.get('/api/wav2lip/status/:promptId', async (req, res) => {
    const { promptId } = req.params
    try {
        const histResp = await fetch(`${COMFYUI_URL}/history/${promptId}`)
        const histData = await histResp.json() as Record<string, any>
        const entry = histData[promptId]
        if (!entry) return res.json({ ok: true, status: 'pending' })

        const statusStr = entry.status?.status_str || 'unknown'
        if (statusStr === 'success') {
            const outputs = entry.outputs as Record<string, any>
            for (const nodeId in outputs) {
                const gifs = outputs[nodeId]?.gifs
                if (gifs && gifs.length > 0) {
                    const g = gifs[0]
                    const videoProxyUrl = `http://localhost:3001/api/wav2lip/video?filename=${encodeURIComponent(g.filename)}&subfolder=${encodeURIComponent(g.subfolder || '')}&type=${g.type || 'output'}`
                    return res.json({ ok: true, status: 'done', videoUrl: videoProxyUrl, filename: g.filename })
                }
            }
        }
        if (statusStr === 'error') {
            const msgs = entry.status?.messages || []
            const errMsg = msgs.find((m: any) => m[0] === 'execution_error')?.[1]?.exception_message || '生成失敗'
            return res.json({ ok: true, status: 'error', error: errMsg })
        }
        res.json({ ok: true, status: 'pending' })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Wav2Lip: proxy video from ComfyUI (avoid CORS) ──
app.get('/api/wav2lip/video', async (req, res) => {
    const { filename, subfolder = '', type = 'output' } = req.query as Record<string, string>
    if (!filename) return res.status(400).json({ error: 'filename required' })
    try {
        const comfyUrl = `${COMFYUI_URL}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`
        const upstream = await fetch(comfyUrl)
        res.status(upstream.status).set('Content-Type', 'video/mp4')
        const buf = await upstream.arrayBuffer()
        res.send(Buffer.from(buf))
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ error: message })
    }
})

// ── Wav2Lip: check ComfyUI connectivity ──
app.get('/api/wav2lip/health', async (_req, res) => {
    try {
        const r = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(3000) })
        if (r.ok) res.json({ ok: true, comfyOk: true })
        else res.json({ ok: false, comfyOk: false })
    } catch {
        res.json({ ok: false, comfyOk: false })
    }
})

// ── Execute a single node ─────────────────────────────────────────
app.post('/api/execute', async (req, res) => {
    const { nodeType, config, socketId } = req.body
    if (!nodeType) return res.status(400).json({ error: 'nodeType required' })

    const emit = (event: string, data: unknown) => {
        if (socketId) io.to(socketId).emit(event, data)
    }

    try {
        emit('node:start', { nodeType })
        const result = await executeNode(nodeType, config, emit)
        emit('node:done', { nodeType, result })
        res.json({ ok: true, result })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        emit('node:error', { nodeType, error: message })
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Execute workflow (NEW!) ───────────────────────────────────────
app.post('/api/workflow/run', async (req, res) => {
    const { workflow, socketId, nodeCache } = req.body

    if (!workflow) {
        return res.status(400).json({ error: 'workflow is required' })
    }

    // 生成執行 ID
    const executionId = `exec-${Date.now()}`

    // 建立 emit 函數（透過 WebSocket 推送事件）
    const emit = (event: string, data: unknown) => {
        if (socketId) {
            io.to(socketId).emit(event, data)
        }
        console.log(`[${executionId}] ${event}:`, data)
    }

    // 🔥 異步執行，不阻塞 HTTP 回應
    executeWorkflowAsync(workflow, executionId, emit, nodeCache || {})

    // 立即返回執行 ID
    res.json({
        ok: true,
        executionId,
        message: '工作流已開始執行'
    })
})

/**
 * 異步執行工作流（背景執行）
 */
async function executeWorkflowAsync(
    workflow: Workflow,
    executionId: string,
    emit: (event: string, data: unknown) => void,
    nodeCache: Record<string, any> = {}
) {
    try {
        const engine = new WorkflowEngine(workflow, executionId, emit, nodeCache)
        await engine.run()
    } catch (error) {
        console.error(`[${executionId}] Workflow execution failed:`, error)
    }
}

// ── Get segment mining prompts ────────────────────────────────────
app.get('/api/prompts/segment-mining', (_req, res) => {
    try {
        const promptsDir = join(__dirname, 'executors', 'prompts')
        const systemPrompt = readFileSync(join(promptsDir, 'segment-mining-system.md'), 'utf-8')
        const template = readFileSync(join(promptsDir, 'segment-mining-template.md'), 'utf-8')

        res.json({
            ok: true,
            systemPrompt,
            template,
            combined: `${systemPrompt}\n\n${'='.repeat(80)}\n\n${template}`
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

app.get('/api/prompts/script-generator', (_req, res) => {
    try {
        const promptsDir = join(__dirname, 'executors', 'prompts')
        const systemPrompt = readFileSync(join(promptsDir, 'script-generator-system.md'), 'utf-8')
        const template = readFileSync(join(promptsDir, 'script-generator-template.md'), 'utf-8')

        res.json({
            ok: true,
            systemPrompt,
            template,
            combined: `${systemPrompt}\n\n${'='.repeat(80)}\n\n${template}`
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Workflow Sync: 同步工作流到本地檔案 ────────────────────────────
const WORKFLOWS_FILE = join(__dirname, '../data/workflows.json')

app.post('/api/workflows/sync', (req, res) => {
    try {
        const { workflows } = req.body
        if (!workflows || !Array.isArray(workflows)) {
            return res.status(400).json({ ok: false, error: 'workflows array required' })
        }

        writeFileSync(WORKFLOWS_FILE, JSON.stringify(workflows, null, 2), 'utf-8')
        res.json({ ok: true, message: 'Workflows synced to file', count: workflows.length })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

app.get('/api/workflows', (_req, res) => {
    try {
        if (!existsSync(WORKFLOWS_FILE)) {
            return res.json({ ok: true, workflows: [] })
        }

        const data = readFileSync(WORKFLOWS_FILE, 'utf-8')
        const workflows = JSON.parse(data)
        res.json({ ok: true, workflows })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

app.get('/api/workflows/:id', (req, res) => {
    try {
        if (!existsSync(WORKFLOWS_FILE)) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        const data = readFileSync(WORKFLOWS_FILE, 'utf-8')
        const workflows = JSON.parse(data)
        const workflow = workflows.find((w: any) => w.id === req.params.id)

        if (!workflow) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        res.json({ ok: true, workflow })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Get YouTube channel recent videos ────────────────────────────
import { getVideosFromUrl } from './utils/youtube-utils'

app.get('/api/youtube/recent-videos', async (req, res) => {
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

// ── Start NotebookLM auth (open headed browser for manual login) ──
app.post('/api/auth/notebooklm', async (_req, res) => {
    try {
        await startAuthFlow()
        res.json({ ok: true, message: 'Session saved successfully' })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Telegram Webhook (handle button clicks) ───────────────────────
import { handleTelegramWebhook } from './telegram-webhook'

app.post('/api/telegram/webhook', async (req, res) => {
    try {
        const update = req.body
        const botToken = process.env.TELEGRAM_BOT_TOKEN
        const clickResponseMessage = process.env.TELEGRAM_CLICK_RESPONSE || '你點擊了標籤：'

        if (!botToken) {
            throw new Error('TELEGRAM_BOT_TOKEN environment variable is required')
        }

        await handleTelegramWebhook(update, botToken, clickResponseMessage)

        res.json({ ok: true })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Telegram webhook error:', message)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Settings: GCP Credentials ────────────────────────────────────
import { unlinkSync } from 'fs'

const SETTINGS_DIR = join(__dirname, '../data')
const GCP_CREDENTIALS_FILE = join(SETTINGS_DIR, 'gcp-credentials.json')
const GEMINI_SETTINGS_FILE = join(SETTINGS_DIR, 'gemini-settings.json')
const API_KEYS_FILE = join(SETTINGS_DIR, 'api-keys.json')
const GENERATED_FILES_DIR = join(SETTINGS_DIR, 'generated')

// 確保 data 目錄存在
if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true })
}

if (!existsSync(GENERATED_FILES_DIR)) {
    mkdirSync(GENERATED_FILES_DIR, { recursive: true })
}

app.use('/generated', express.static(GENERATED_FILES_DIR))

// ── Asset Upload (素材囊持久化) ──────────────────────────────────
const ASSETS_DIR = join(GENERATED_FILES_DIR, 'assets')
if (!existsSync(ASSETS_DIR)) {
    mkdirSync(ASSETS_DIR, { recursive: true })
}

app.post('/api/assets/upload', (req, res) => {
    try {
        const { base64, mimeType, filename } = req.body
        if (!base64 || !mimeType) {
            return res.status(400).json({ ok: false, error: 'base64 and mimeType required' })
        }
        const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const fname = `${id}.${ext}`
        const data = base64.replace(/^data:[^;]+;base64,/, '')
        writeFileSync(join(ASSETS_DIR, fname), Buffer.from(data, 'base64'))
        res.json({ ok: true, url: `/generated/assets/${fname}`, filename: filename || fname })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

app.get('/api/assets', (_req, res) => {
    try {
        const files = existsSync(ASSETS_DIR)
            ? require('fs').readdirSync(ASSETS_DIR).filter((f: string) => !f.startsWith('.'))
            : []
        res.json({ ok: true, files: files.map((f: string) => `/generated/assets/${f}`) })
    } catch {
        res.json({ ok: true, files: [] })
    }
})

// ── Veo Prompt Optimizer ──
import { optimizeVeoPrompt } from './veo-prompt-optimizer'

app.post('/api/veo/optimize-prompt', async (req, res) => {
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

app.get('/api/veo/status', (_req, res) => {
    res.json(getVeoStatus())
})

app.get('/api/veo/jobs', (_req, res) => {
    res.json({ ok: true, jobs: listVeoJobs() })
})

app.get('/api/veo/jobs/:id', async (req, res) => {
    try {
        const job = await refreshVeoJob(req.params.id)
        res.json({ ok: true, job })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

app.post('/api/veo/generate', async (req, res) => {
    try {
        const job = await createVeoJob(req.body)
        res.json({ ok: true, job })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

app.delete('/api/veo/jobs/:id', (req, res) => {
    const deleted = deleteVeoJob(req.params.id)
    if (!deleted) {
        return res.status(404).json({ ok: false, error: 'Job not found' })
    }

    res.json({ ok: true })
})

// ── Nano Banana Pro (Image Generation) ──
import { optimizeNanoPrompt } from './nano-prompt-optimizer'

app.post('/api/nano/optimize-prompt', async (req, res) => {
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

app.post('/api/nano/describe-image', async (req, res) => {
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

app.get('/api/nano/status', (_req, res) => {
    res.json(getNanoStatus())
})

app.get('/api/nano/jobs', (_req, res) => {
    res.json({ ok: true, jobs: listNanoJobs() })
})

app.post('/api/nano/generate', async (req, res) => {
    try {
        const job = await createNanoJob(req.body)
        res.json({ ok: true, job })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

app.delete('/api/nano/jobs/:id', (req, res) => {
    const deleted = deleteNanoJob(req.params.id)
    if (!deleted) {
        return res.status(404).json({ ok: false, error: 'Job not found' })
    }
    res.json({ ok: true })
})

// Replace a nano job output with composited image (for outpaint post-composite)
app.post('/api/nano/jobs/:id/replace-output', (req, res) => {
    const { outputIndex, base64Data } = req.body
    if (typeof outputIndex !== 'number' || typeof base64Data !== 'string') {
        return res.status(400).json({ ok: false, error: 'Missing outputIndex or base64Data' })
    }
    const job = listNanoJobs().find((j: any) => j.id === req.params.id)
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' })
    const output = job.outputs?.[outputIndex]
    if (!output?.localPath) return res.status(404).json({ ok: false, error: 'Output not found' })
    try {
        const { join } = require('path')
        const dataDir = join(__dirname, '../data')
        const filePath = join(dataDir, output.localPath.replace(/^\/?(generated\/)/, '$1'))
        const raw = base64Data.replace(/^data:[^;]+;base64,/, '')
        require('fs').writeFileSync(filePath, Buffer.from(raw, 'base64'))
        res.json({ ok: true })
    } catch (err: unknown) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
})

// 檢查 Gemini 設定狀態（統一入口）
app.get('/api/settings/gemini/status', (_req, res) => {
    try {
        // 讀取 Gemini 設定
        let settings = { mode: 'apiKey', apiKey: '' }
        if (existsSync(GEMINI_SETTINGS_FILE)) {
            settings = JSON.parse(readFileSync(GEMINI_SETTINGS_FILE, 'utf-8'))
        }

        const hasApiKey = !!settings.apiKey
        const hasGcp = existsSync(GCP_CREDENTIALS_FILE)

        let gcpInfo = null
        if (hasGcp) {
            const creds = JSON.parse(readFileSync(GCP_CREDENTIALS_FILE, 'utf-8'))
            gcpInfo = {
                projectId: creds.project_id,
                clientEmail: creds.client_email
            }
        }

        res.json({
            ok: true,
            mode: settings.mode,
            hasApiKey,
            hasGcp,
            maskedKey: hasApiKey ? '****' + settings.apiKey.slice(-4) : '',
            gcpInfo
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// 儲存 Gemini API Key
app.post('/api/settings/gemini/api-key', (req, res) => {
    try {
        const { apiKey } = req.body
        if (!apiKey || typeof apiKey !== 'string') {
            return res.status(400).json({ ok: false, error: '請提供有效的 API Key' })
        }

        // 儲存設定
        const settings = { mode: 'apiKey', apiKey }
        writeFileSync(GEMINI_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')

        // 設定環境變數
        process.env.GEMINI_API_KEY = apiKey

        res.json({ ok: true, message: 'Gemini API Key 已儲存' })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// 檢查 GCP 憑證狀態
app.get('/api/settings/gcp/status', (_req, res) => {
    try {
        if (!existsSync(GCP_CREDENTIALS_FILE)) {
            return res.json({ ok: true, connected: false, message: '尚未設定 GCP 憑證' })
        }

        const data = readFileSync(GCP_CREDENTIALS_FILE, 'utf-8')
        const creds = JSON.parse(data)

        res.json({
            ok: true,
            connected: true,
            info: {
                projectId: creds.project_id,
                clientEmail: creds.client_email
            }
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// 儲存 GCP 憑證
app.post('/api/settings/gcp/credentials', (req, res) => {
    try {
        const { credentials } = req.body
        if (!credentials || !credentials.project_id || !credentials.private_key) {
            return res.status(400).json({ ok: false, error: '無效的 GCP 憑證' })
        }

        writeFileSync(GCP_CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), 'utf-8')

        // 更新 Gemini 設定為 GCP 模式
        const settings = { mode: 'gcp', apiKey: '' }
        if (existsSync(GEMINI_SETTINGS_FILE)) {
            const existing = JSON.parse(readFileSync(GEMINI_SETTINGS_FILE, 'utf-8'))
            settings.apiKey = existing.apiKey || ''
        }
        settings.mode = 'gcp'
        writeFileSync(GEMINI_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')

        // 設定環境變數讓 Gemini executor 使用
        process.env.GOOGLE_APPLICATION_CREDENTIALS = GCP_CREDENTIALS_FILE

        res.json({ ok: true, message: 'GCP 憑證已儲存' })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// 移除 GCP 憑證
app.delete('/api/settings/gcp/credentials', (_req, res) => {
    try {
        if (existsSync(GCP_CREDENTIALS_FILE)) {
            unlinkSync(GCP_CREDENTIALS_FILE)
        }
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS
        res.json({ ok: true, message: 'GCP 憑證已移除' })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// 取得 API Keys
app.get('/api/settings/api-keys', (_req, res) => {
    try {
        if (!existsSync(API_KEYS_FILE)) {
            return res.json({ ok: true })
        }

        const data = readFileSync(API_KEYS_FILE, 'utf-8')
        const keys = JSON.parse(data)

        // 回傳時遮蔽部分內容
        res.json({
            ok: true,
            telegramBotToken: keys.telegramBotToken ? '********' + keys.telegramBotToken.slice(-8) : '',
            telegramChatId: keys.telegramChatId || ''
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// 儲存 API Keys
app.post('/api/settings/api-keys', (req, res) => {
    try {
        const { telegramBotToken, telegramChatId } = req.body

        // 讀取現有的設定（如果有的話）
        let existing: any = {}
        if (existsSync(API_KEYS_FILE)) {
            existing = JSON.parse(readFileSync(API_KEYS_FILE, 'utf-8'))
        }

        // 如果傳入的是遮蔽值，保留原值
        const newKeys = {
            telegramBotToken: telegramBotToken?.startsWith('********')
                ? existing.telegramBotToken
                : telegramBotToken,
            telegramChatId: telegramChatId || ''
        }

        writeFileSync(API_KEYS_FILE, JSON.stringify(newKeys, null, 2), 'utf-8')

        // 更新環境變數
        if (newKeys.telegramBotToken) {
            process.env.TELEGRAM_BOT_TOKEN = newKeys.telegramBotToken
        }
        if (newKeys.telegramChatId) {
            process.env.TELEGRAM_CHAT_ID = newKeys.telegramChatId
        }

        res.json({ ok: true, message: 'API Keys 已儲存' })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// 啟動時載入設定
function loadSettings() {
    // 載入 Gemini 設定
    if (existsSync(GEMINI_SETTINGS_FILE)) {
        try {
            const settings = JSON.parse(readFileSync(GEMINI_SETTINGS_FILE, 'utf-8'))
            if (settings.apiKey) {
                process.env.GEMINI_API_KEY = settings.apiKey
                console.log('✅ Gemini API Key loaded')
            }
        } catch (e) {
            // 忽略錯誤
        }
    }

    // 載入 GCP 憑證
    if (existsSync(GCP_CREDENTIALS_FILE)) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = GCP_CREDENTIALS_FILE
        console.log('✅ GCP credentials loaded')
    }

    // 載入 API Keys
    if (existsSync(API_KEYS_FILE)) {
        try {
            const keys = JSON.parse(readFileSync(API_KEYS_FILE, 'utf-8'))
            if (keys.telegramBotToken) process.env.TELEGRAM_BOT_TOKEN = keys.telegramBotToken
            if (keys.telegramChatId) process.env.TELEGRAM_CHAT_ID = keys.telegramChatId
            console.log('✅ API keys loaded')
        } catch (e) {
            // 忽略錯誤
        }
    }
}

loadSettings()

// ── Socket.io ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[ws] client connected: ${socket.id}`)
    socket.on('disconnect', () => console.log(`[ws] client disconnected: ${socket.id}`))
})

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
    console.log(`\n🚀 FlowCraft backend running on http://localhost:${PORT}`)
    console.log(`   Auth: POST /api/auth/notebooklm`)
    console.log(`   Run:  POST /api/execute`)
})
