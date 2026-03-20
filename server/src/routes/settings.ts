import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { startAuthFlow } from '../auth/saveSession'
import { handleTelegramWebhook } from '../telegram-webhook'

const SETTINGS_DIR = join(__dirname, '../../data')
const GCP_CREDENTIALS_FILE = join(SETTINGS_DIR, 'gcp-credentials.json')
const GEMINI_SETTINGS_FILE = join(SETTINGS_DIR, 'gemini-settings.json')
const API_KEYS_FILE = join(SETTINGS_DIR, 'api-keys.json')

// Ensure data dir exists
if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true })
}

const router = Router()

// ── Gemini status ─────────────────────────────────────────────────
router.get('/settings/gemini/status', (_req, res) => {
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
            fullKey: settings.apiKey || '',
            gcpInfo
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Gemini API Key ────────────────────────────────────────────────
router.post('/settings/gemini/api-key', (req, res) => {
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

// ── GCP status ────────────────────────────────────────────────────
router.get('/settings/gcp/status', (_req, res) => {
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

// ── GCP credentials ──────────────────────────────────────────────
router.post('/settings/gcp/credentials', (req, res) => {
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

router.delete('/settings/gcp/credentials', (_req, res) => {
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

// ── API Keys ─────────────────────────────────────────────────────
router.get('/settings/api-keys', (_req, res) => {
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

router.post('/settings/api-keys', (req, res) => {
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

// ── Saved Prompts ───────────────────────────────────────────────
const SAVED_PROMPTS_FILE = join(SETTINGS_DIR, 'saved-prompts.json')

router.get('/settings/saved-prompts', (_req, res) => {
    try {
        if (!existsSync(SAVED_PROMPTS_FILE)) {
            return res.json({ ok: true, prompts: [] })
        }
        const data = JSON.parse(readFileSync(SAVED_PROMPTS_FILE, 'utf-8'))
        res.json({ ok: true, prompts: data })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.put('/settings/saved-prompts', (req, res) => {
    try {
        const { prompts } = req.body
        if (!Array.isArray(prompts)) {
            return res.status(400).json({ ok: false, error: 'prompts array required' })
        }
        writeFileSync(SAVED_PROMPTS_FILE, JSON.stringify(prompts, null, 2), 'utf-8')
        res.json({ ok: true })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Saved Characters ────────────────────────────────────────────
const SAVED_CHARACTERS_FILE = join(SETTINGS_DIR, 'saved-characters.json')

router.get('/settings/saved-characters', (_req, res) => {
    try {
        if (!existsSync(SAVED_CHARACTERS_FILE)) {
            return res.json({ ok: true, characters: [] })
        }
        const data = JSON.parse(readFileSync(SAVED_CHARACTERS_FILE, 'utf-8'))
        res.json({ ok: true, characters: data })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.put('/settings/saved-characters', (req, res) => {
    try {
        const { characters } = req.body
        if (!Array.isArray(characters)) {
            return res.status(400).json({ ok: false, error: 'characters array required' })
        }
        writeFileSync(SAVED_CHARACTERS_FILE, JSON.stringify(characters, null, 2), 'utf-8')
        res.json({ ok: true })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Auth: NotebookLM ─────────────────────────────────────────────
router.post('/auth/notebooklm', async (_req, res) => {
    try {
        await startAuthFlow()
        res.json({ ok: true, message: 'Session saved successfully' })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Telegram Webhook ─────────────────────────────────────────────
router.post('/telegram/webhook', async (req, res) => {
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

// ── Load settings at startup ─────────────────────────────────────
export function loadSettings() {
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

export default router
