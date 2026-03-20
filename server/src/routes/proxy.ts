import { Router } from 'express'
import express from 'express'
import multer from 'multer'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const router = Router()

// ── Local Gradio Proxy (bypass CORS for WanGP/InfiniteTalk) ──────
router.all('/api/local-proxy/*', async (req, res) => {
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

router.post('/api/local-proxy-upload', express.raw({ type: '*/*', limit: '200mb' }), async (req, res) => {
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

// ── InfiniteTalk ─────────────────────────────────────────────────
const WANGP_ROOT = 'C:\\projects\\Wan2GP'
const WANGP_PYTHON = 'C:\\Users\\user\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'
const WANGP_OUTPUT_DIR = `${WANGP_ROOT}\\outputs`

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } })

// Ensure WanGP output dir exists
try { mkdirSync(WANGP_OUTPUT_DIR, { recursive: true }) } catch {}

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

// ── InfiniteTalk: inspect WanGP API (diagnostics) ──
router.get('/api/infinitetalk/info', async (req, res) => {
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
router.post('/api/infinitetalk/generate', express.json({ limit: '10mb' }), async (req, res) => {
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
router.get('/api/infinitetalk/video', (req, res) => {
    const filePath = req.query.path as string
    if (!filePath || !filePath.startsWith(WANGP_ROOT)) {
        return res.status(403).json({ error: 'Invalid path' })
    }
    res.sendFile(filePath)
})

// ── InfiniteTalk: list recent generated videos ──
router.get('/api/infinitetalk/recent', (req, res) => {
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
router.post('/api/infinitetalk/generate-upload',
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

router.post('/api/wav2lip/generate-upload',
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
router.get('/api/wav2lip/status/:promptId', async (req, res) => {
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
router.get('/api/wav2lip/video', async (req, res) => {
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
router.get('/api/wav2lip/health', async (_req, res) => {
    try {
        const r = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(3000) })
        if (r.ok) res.json({ ok: true, comfyOk: true })
        else res.json({ ok: false, comfyOk: false })
    } catch {
        res.json({ ok: false, comfyOk: false })
    }
})

export default router
