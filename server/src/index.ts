import express from 'express'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import cors from 'cors'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { executeNode } from './executor'
import { startAuthFlow } from './auth/saveSession'
import { WorkflowEngine } from './execution/WorkflowEngine'
import { Workflow } from './execution/types'

const app = express()
const httpServer = createServer(app)

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://flowcraft.localhost'  // Docker Gateway domain
]

const io = new SocketIO(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
})

app.use(cors({ origin: allowedOrigins }))
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
import { mkdirSync, unlinkSync } from 'fs'

const SETTINGS_DIR = join(__dirname, '../data')
const GCP_CREDENTIALS_FILE = join(SETTINGS_DIR, 'gcp-credentials.json')
const GEMINI_SETTINGS_FILE = join(SETTINGS_DIR, 'gemini-settings.json')
const API_KEYS_FILE = join(SETTINGS_DIR, 'api-keys.json')

// 確保 data 目錄存在
if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true })
}

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
