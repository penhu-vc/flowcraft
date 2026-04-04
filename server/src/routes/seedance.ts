import { Router } from 'express'
import {
    getSeedanceStatus,
    saveSeedanceSettings,
    createSeedanceJob,
    pollSeedanceJob,
    listSeedanceJobs,
    getSeedanceJob,
    deleteSeedanceJob
} from '../services/seedance'

const router = Router()

// ── Status ─────────────────────────────────────────────────────
router.get('/api/seedance/status', (_req, res) => {
    res.json(getSeedanceStatus())
})

// ── Settings ───────────────────────────────────────────────────
router.get('/api/seedance/settings', (_req, res) => {
    const status = getSeedanceStatus()
    res.json({ ok: true, hasApiKey: status.hasApiKey })
})

router.post('/api/seedance/settings', (req, res) => {
    const { apiKey } = req.body
    saveSeedanceSettings({ apiKey })
    res.json({ ok: true })
})

// ── Jobs CRUD ──────────────────────────────────────────────────
router.get('/api/seedance/jobs', (_req, res) => {
    res.json({ ok: true, jobs: listSeedanceJobs() })
})

router.get('/api/seedance/jobs/:id', (req, res) => {
    const job = getSeedanceJob(req.params.id)
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' })
    res.json({ ok: true, job })
})

router.delete('/api/seedance/jobs/:id', (req, res) => {
    const ok = deleteSeedanceJob(req.params.id)
    res.json({ ok })
})

// ── Generate ───────────────────────────────────────────────────
router.post('/api/seedance/generate', async (req, res) => {
    try {
        const { prompt, duration, aspectRatio, taskType, imageUrls, videoUrl, parentTaskId } = req.body
        if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' })

        const job = await createSeedanceJob({
            prompt,
            duration: duration || 5,
            aspectRatio: aspectRatio || '16:9',
            taskType: taskType || 'seedance-2-preview',
            imageUrls,
            videoUrl,
            parentTaskId
        })
        res.json({ ok: true, job })
    } catch (err: unknown) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
})

// ── Poll ────────────────────────────────────────────────────────
router.post('/api/seedance/poll/:id', async (req, res) => {
    try {
        const job = await pollSeedanceJob(req.params.id)
        res.json({ ok: true, job })
    } catch (err: unknown) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
})

export default router
