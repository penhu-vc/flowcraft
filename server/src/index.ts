import express from 'express'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import cors from 'cors'
import { join } from 'path'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { createHmac } from 'crypto'

// ── Route modules ────────────────────────────────────────────────
import proxyRouter from './routes/proxy'
import mediaRouter from './routes/media'
import settingsRouter, { loadSettings } from './routes/settings'
import { loadStorageConfig } from './dataDir'
import seedanceRouter from './routes/seedance'
import { createWorkflowRouter } from './routes/workflow'
import { createWorkflowApiRouter } from './routes/workflow-api'

const app = express()
const httpServer = createServer(app)

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5300',
    'http://localhost:8080',
    'http://flowcraft.localhost',  // Docker Gateway domain
    'https://flow.yaja168.com',
    'http://flow.yaja168.com'
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

// ── Mount routers ────────────────────────────────────────────────
app.use(proxyRouter)                          // /api/local-proxy/*, /api/infinitetalk/*, /api/wav2lip/*
app.use(mediaRouter)                          // /api/veo/*, /api/nano/*, /api/assets/*, /api/youtube/*, /generated/*
app.use(seedanceRouter)                       // /api/seedance/*
app.use('/api', settingsRouter)               // /api/settings/*, /api/auth/*, /api/telegram/*
app.use('/api', createWorkflowRouter(io))     // /api/execute, /api/workflow/*, /api/workflows/*, /api/prompts/*
app.use('/api/workflow-api', createWorkflowApiRouter(io))  // /api/workflow-api/* (programmatic + AI builder)

// ── GitHub Webhook Auto-Deploy ───────────────────────────────────
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'flowcraft-deploy-2026'
app.post('/hooks/deploy', express.raw({ type: 'application/json' }), (req, res) => {
    // Verify signature
    const sig = req.headers['x-hub-signature-256'] as string
    if (sig) {
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
        const expected = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
        if (sig !== expected) return res.status(403).json({ error: 'Invalid signature' })
    }
    // Only deploy on push to main
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (payload?.ref && payload.ref !== 'refs/heads/main') {
        return res.json({ ok: true, skipped: true, reason: 'not main branch' })
    }
    console.log(`[deploy] Webhook received, starting deploy...`)
    res.json({ ok: true, message: 'Deploy started' })
    // Run deploy.sh async
    const deployScript = join(__dirname, '../../deploy.sh')
    execFile('bash', [deployScript], { timeout: 300000 }, (err, stdout, stderr) => {
        if (err) console.error(`[deploy] FAILED:`, err.message, stderr)
        else console.log(`[deploy] SUCCESS:\n${stdout.slice(-500)}`)
    })
})

// ── Serve frontend dist (production) ────────────────────────────
const distPath = join(__dirname, '../../dist')
const distBackupPath = join(__dirname, '../../dist-backup')

// Backup version at /bc/
if (existsSync(distBackupPath)) {
    app.use('/bc', express.static(distBackupPath))
    app.get('/bc/*', (_req, res) => res.sendFile(join(distBackupPath, 'index.html')))
    console.log(`[static] Backup version at /bc/`)
}

// Current version
if (existsSync(distPath)) {
    app.use(express.static(distPath))
    app.get('*', (_req, res) => {
        if (!_req.path.startsWith('/api/') && !_req.path.startsWith('/generated/') && !_req.path.startsWith('/hooks/') && !_req.path.startsWith('/bc')) {
            res.sendFile(join(distPath, 'index.html'))
        }
    })
    console.log(`[static] Serving frontend from ${distPath}`)
}

// ── Load persisted settings ─────────────────────────────────────
loadStorageConfig()   // 必須在 loadSettings 之前，先決定資料目錄
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
