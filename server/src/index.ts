import express from 'express'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import cors from 'cors'

// ── Route modules ────────────────────────────────────────────────
import proxyRouter from './routes/proxy'
import mediaRouter from './routes/media'
import settingsRouter, { loadSettings } from './routes/settings'
import { createWorkflowRouter } from './routes/workflow'

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

// ── Mount routers ────────────────────────────────────────────────
app.use(proxyRouter)                          // /api/local-proxy/*, /api/infinitetalk/*, /api/wav2lip/*
app.use(mediaRouter)                          // /api/veo/*, /api/nano/*, /api/assets/*, /api/youtube/*, /generated/*
app.use('/api', settingsRouter)               // /api/settings/*, /api/auth/*, /api/telegram/*
app.use('/api', createWorkflowRouter(io))     // /api/execute, /api/workflow/*, /api/workflows/*, /api/prompts/*

// ── Load persisted settings ─────────────────────────────────────
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
