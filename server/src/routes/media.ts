import { Router } from 'express'
import express from 'express'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getDataDir, ensureDir } from '../dataDir'

import { createVeoJob, deleteVeoJob, getVeoStatus, listVeoJobs, refreshVeoJob } from '../services/veo'
import { createNanoJob, deleteNanoJob, describeImage, getNanoStatus, listNanoJobs } from '../services/nano'
import { optimizeVeoPrompt } from '../veo-prompt-optimizer'
import { optimizeNanoPrompt } from '../nano-prompt-optimizer'
import { getVideosFromUrl } from '../utils/youtube-utils'

const router = Router()

// ── Setup directories (動態，支援 NAS 切換) ────────────────────────
const getGeneratedFilesDir = () => ensureDir('generated')
const getAssetsDir = () => ensureDir('generated', 'assets')
const getAssetsIndexFile = () => join(getDataDir(), 'assets-index.json')

// ── Serve static generated files ──────────────────────────────────
// 啟動時初始化路徑，切換 NAS 後需要重啟 server 才能從新位置提供靜態檔案
const GENERATED_FILES_DIR = ensureDir('generated')
router.use('/generated', express.static(GENERATED_FILES_DIR))

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
