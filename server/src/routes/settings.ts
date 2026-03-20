import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { startAuthFlow } from '../auth/saveSession'
import { handleTelegramWebhook } from '../telegram-webhook'
import { LOCAL_DATA_DIR, getDataDir, getStorageConfig, setStorageConfig, syncCredentials } from '../dataDir'

// 憑證與設定檔路徑跟著 getDataDir()，支援 NAS 同步
const getGcpCredentialsFile = () => join(getDataDir(), 'gcp-credentials.json')
const getGeminiSettingsFile = () => join(getDataDir(), 'gemini-settings.json')
const getApiKeysFile = () => join(getDataDir(), 'api-keys.json')

// Ensure local data dir exists (always)
if (!existsSync(LOCAL_DATA_DIR)) {
    mkdirSync(LOCAL_DATA_DIR, { recursive: true })
}

const router = Router()

// ── Gemini status ─────────────────────────────────────────────────
router.get('/settings/gemini/status', (_req, res) => {
    try {
        // 讀取 Gemini 設定
        let settings = { mode: 'apiKey', apiKey: '' }
        if (existsSync(getGeminiSettingsFile())) {
            settings = JSON.parse(readFileSync(getGeminiSettingsFile(), 'utf-8'))
        }

        const hasApiKey = !!settings.apiKey
        const hasGcp = existsSync(getGcpCredentialsFile())

        let gcpInfo = null
        if (hasGcp) {
            const creds = JSON.parse(readFileSync(getGcpCredentialsFile(), 'utf-8'))
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
        writeFileSync(getGeminiSettingsFile(), JSON.stringify(settings, null, 2), 'utf-8')

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
        if (!existsSync(getGcpCredentialsFile())) {
            return res.json({ ok: true, connected: false, message: '尚未設定 GCP 憑證' })
        }

        const data = readFileSync(getGcpCredentialsFile(), 'utf-8')
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

        writeFileSync(getGcpCredentialsFile(), JSON.stringify(credentials, null, 2), 'utf-8')

        // 更新 Gemini 設定為 GCP 模式
        const settings = { mode: 'gcp', apiKey: '' }
        if (existsSync(getGeminiSettingsFile())) {
            const existing = JSON.parse(readFileSync(getGeminiSettingsFile(), 'utf-8'))
            settings.apiKey = existing.apiKey || ''
        }
        settings.mode = 'gcp'
        writeFileSync(getGeminiSettingsFile(), JSON.stringify(settings, null, 2), 'utf-8')

        // 設定環境變數讓 Gemini executor 使用
        process.env.GOOGLE_APPLICATION_CREDENTIALS = getGcpCredentialsFile()

        res.json({ ok: true, message: 'GCP 憑證已儲存' })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

router.delete('/settings/gcp/credentials', (_req, res) => {
    try {
        if (existsSync(getGcpCredentialsFile())) {
            unlinkSync(getGcpCredentialsFile())
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
        if (!existsSync(getApiKeysFile())) {
            return res.json({ ok: true })
        }

        const data = readFileSync(getApiKeysFile(), 'utf-8')
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
        if (existsSync(getApiKeysFile())) {
            existing = JSON.parse(readFileSync(getApiKeysFile(), 'utf-8'))
        }

        // 如果傳入的是遮蔽值，保留原值
        const newKeys = {
            telegramBotToken: telegramBotToken?.startsWith('********')
                ? existing.telegramBotToken
                : telegramBotToken,
            telegramChatId: telegramChatId || ''
        }

        writeFileSync(getApiKeysFile(), JSON.stringify(newKeys, null, 2), 'utf-8')

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
const getSavedPromptsFile = () => join(getDataDir(), 'saved-prompts.json')

router.get('/settings/saved-prompts', (_req, res) => {
    try {
        if (!existsSync(getSavedPromptsFile())) {
            return res.json({ ok: true, prompts: [] })
        }
        const raw = JSON.parse(readFileSync(getSavedPromptsFile(), 'utf-8'))
        const data = Array.isArray(raw) ? raw : (Array.isArray(raw?.prompts) ? raw.prompts : [])
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
        writeFileSync(getSavedPromptsFile(), JSON.stringify(prompts, null, 2), 'utf-8')
        res.json({ ok: true })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: message })
    }
})

// ── Saved Characters ────────────────────────────────────────────
const getSavedCharactersFile = () => join(getDataDir(), 'saved-characters.json')

router.get('/settings/saved-characters', (_req, res) => {
    try {
        if (!existsSync(getSavedCharactersFile())) {
            return res.json({ ok: true, characters: [] })
        }
        const raw = JSON.parse(readFileSync(getSavedCharactersFile(), 'utf-8'))
        const data = Array.isArray(raw) ? raw : (Array.isArray(raw?.characters) ? raw.characters : [])
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
        writeFileSync(getSavedCharactersFile(), JSON.stringify(characters, null, 2), 'utf-8')
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
    if (existsSync(getGeminiSettingsFile())) {
        try {
            const settings = JSON.parse(readFileSync(getGeminiSettingsFile(), 'utf-8'))
            if (settings.apiKey) {
                process.env.GEMINI_API_KEY = settings.apiKey
                console.log('✅ Gemini API Key loaded')
            }
        } catch (e) {
            // 忽略錯誤
        }
    }

    // 載入 GCP 憑證
    if (existsSync(getGcpCredentialsFile())) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = getGcpCredentialsFile()
        console.log('✅ GCP credentials loaded')
    }

    // 載入 API Keys
    if (existsSync(getApiKeysFile())) {
        try {
            const keys = JSON.parse(readFileSync(getApiKeysFile(), 'utf-8'))
            if (keys.telegramBotToken) process.env.TELEGRAM_BOT_TOKEN = keys.telegramBotToken
            if (keys.telegramChatId) process.env.TELEGRAM_CHAT_ID = keys.telegramChatId
            console.log('✅ API keys loaded')
        } catch (e) {
            // 忽略錯誤
        }
    }
}

// ── Storage Mode (Local / NAS) ────────────────────────────────────
router.get('/settings/storage', (_req, res) => {
    try {
        const config = getStorageConfig()
        res.json({ ok: true, ...config })
    } catch (e: unknown) {
        res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
})

router.put('/settings/storage', (req, res) => {
    try {
        const { mode, nasPath } = req.body
        if (mode !== 'local' && mode !== 'nas') {
            return res.status(400).json({ ok: false, error: 'mode must be "local" or "nas"' })
        }
        // 先更新 nasPath（syncCredentials 需要）
        setStorageConfig({ ...(nasPath ? { nasPath } : {}), mode })

        // 自動同步憑證與設定檔到目標位置
        const syncResult = syncCredentials(mode)
        console.log(`[storage] sync result:`, syncResult)

        // 重新載入設定（從新位置）
        loadSettings()

        const config = getStorageConfig()
        res.json({ ok: true, ...config, sync: syncResult })
    } catch (e: unknown) {
        res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
})

export default router
