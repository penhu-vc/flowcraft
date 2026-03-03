import express from 'express'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import cors from 'cors'
import { readFileSync } from 'fs'
import { join } from 'path'
import { executeNode } from './executor'
import { startAuthFlow } from './auth/saveSession'
import { WorkflowEngine } from './execution/WorkflowEngine'
import { Workflow } from './execution/types'

const app = express()
const httpServer = createServer(app)
const io = new SocketIO(httpServer, {
    cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] }
})

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0' })
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
    const { workflow, socketId } = req.body

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
    executeWorkflowAsync(workflow, executionId, emit)

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
    emit: (event: string, data: unknown) => void
) {
    try {
        const engine = new WorkflowEngine(workflow, executionId, emit)
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
