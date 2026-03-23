import express from 'express'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import cors from 'cors'
import { join } from 'path'
import { existsSync } from 'fs'

// ── Route modules ────────────────────────────────────────────────
import proxyRouter from './routes/proxy'
import mediaRouter from './routes/media'
import settingsRouter, { loadSettings } from './routes/settings'
import { loadStorageConfig } from './dataDir'
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
app.use('/api', settingsRouter)               // /api/settings/*, /api/auth/*, /api/telegram/*
app.use('/api', createWorkflowRouter(io))     // /api/execute, /api/workflow/*, /api/workflows/*, /api/prompts/*
app.use('/api/workflow-api', createWorkflowApiRouter(io))  // /api/workflow-api/* (programmatic + AI builder)

// ── Serve frontend dist (production) ────────────────────────────
const distPath = join(__dirname, '../../dist')
if (existsSync(distPath)) {
    app.use(express.static(distPath))
    app.get('*', (_req, res) => {
        if (!_req.path.startsWith('/api/') && !_req.path.startsWith('/generated/')) {
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
