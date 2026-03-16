/**
 * Gemini Executor
 * Supports both API Key mode and GCP Vertex AI mode
 */

import { VertexAI } from '@google-cloud/vertexai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

type EmitFn = (event: string, data: unknown) => void

export interface GeminiConfig {
    prompt: string          // User prompt
    systemPrompt?: string   // Optional system instruction
    model?: string          // Default: gemini-2.5-flash
    temperature?: number    // Default: 1.0
    maxTokens?: number      // Default: 8192
}

const GEMINI_SETTINGS_FILE = join(__dirname, '../../data/gemini-settings.json')
const GCP_CREDENTIALS_FILE = join(__dirname, '../../data/gcp-credentials.json')

// 判斷使用哪種模式
function getGeminiMode(): 'apiKey' | 'gcp' {
    // 優先檢查環境變數
    if (process.env.GEMINI_API_KEY) {
        return 'apiKey'
    }

    // 檢查設定檔
    if (existsSync(GEMINI_SETTINGS_FILE)) {
        try {
            const settings = JSON.parse(readFileSync(GEMINI_SETTINGS_FILE, 'utf8'))
            if (settings.mode === 'gcp' && existsSync(GCP_CREDENTIALS_FILE)) {
                return 'gcp'
            }
            if (settings.apiKey) {
                return 'apiKey'
            }
        } catch (e) {
            // 忽略錯誤
        }
    }

    // 預設檢查 GCP 憑證
    if (existsSync(GCP_CREDENTIALS_FILE)) {
        return 'gcp'
    }

    throw new Error('Gemini 未設定！請到「設定」頁面設定 API Key 或匯入 GCP 憑證。')
}

// 使用 API Key 模式呼叫 Gemini
async function callWithApiKey(
    config: GeminiConfig,
    emit: EmitFn
): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || (() => {
        if (existsSync(GEMINI_SETTINGS_FILE)) {
            const settings = JSON.parse(readFileSync(GEMINI_SETTINGS_FILE, 'utf8'))
            return settings.apiKey
        }
        throw new Error('API Key 未設定')
    })()

    emit('node:log', { message: '使用模式: API Key' })
    emit('node:log', { message: `使用模型: ${config.model}` })

    const genAI = new GoogleGenerativeAI(apiKey)

    const generativeModel = genAI.getGenerativeModel({
        model: config.model || 'gemini-2.5-flash',
        systemInstruction: config.systemPrompt || undefined,
        generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens
        }
    })

    const result = await generativeModel.generateContent(config.prompt)
    const response = result.response
    const text = response.text()

    if (!text) {
        throw new Error('Gemini 未返回有效回應')
    }

    return text
}

// 使用 GCP Vertex AI 模式呼叫 Gemini
async function callWithGCP(
    config: GeminiConfig,
    emit: EmitFn
): Promise<string> {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || GCP_CREDENTIALS_FILE

    if (!existsSync(credentialsPath)) {
        throw new Error('GCP 憑證未設定！請到「設定」頁面匯入 GCP 憑證 JSON 檔案。')
    }

    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'))
    const projectId = credentials.project_id
    const location = 'us-central1'

    emit('node:log', { message: '使用模式: GCP Vertex AI' })
    emit('node:log', { message: `使用模型: ${config.model}` })
    emit('node:log', { message: `區域: ${location}` })

    const vertexAI = new VertexAI({
        project: projectId,
        location: location
    })

    const generativeModel = vertexAI.getGenerativeModel({
        model: config.model || 'gemini-2.5-flash',
        systemInstruction: config.systemPrompt || undefined,
        generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens
        }
    })

    const result = await generativeModel.generateContent(config.prompt)
    const response = result.response
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!text) {
        throw new Error('Gemini 未返回有效回應')
    }

    return text
}

export async function executeGemini(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ result: string }> {
    const {
        prompt,
        systemPrompt = '',
        model = 'gemini-2.5-flash',
        temperature = 1.0,
        maxTokens = 8192
    } = config as unknown as GeminiConfig

    if (!prompt) throw new Error('Gemini executor: prompt is required')

    emit('node:log', { message: '初始化 Gemini API...' })

    const geminiConfig: GeminiConfig = {
        prompt,
        systemPrompt,
        model,
        temperature,
        maxTokens
    }

    emit('node:log', { message: '發送請求...' })
    emit('node:log', { message: `Prompt 長度: ${prompt.length} 字元` })
    if (systemPrompt) {
        emit('node:log', { message: `System Prompt 長度: ${systemPrompt.length} 字元` })
    }

    // 判斷使用哪種模式
    const mode = getGeminiMode()

    // 自動重試機制
    const MAX_RETRIES = 3
    let lastError: any = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                emit('node:log', { message: `🔄 重試第 ${attempt - 1} 次...` })
            }

            const text = mode === 'apiKey'
                ? await callWithApiKey(geminiConfig, emit)
                : await callWithGCP(geminiConfig, emit)

            emit('node:log', { message: `✅ 完成 (${text.length} 字元)` })

            return { result: text }

        } catch (error: any) {
            lastError = error
            const errorMsg = error.message || String(error)

            // 檢查是否為 429 錯誤
            const is429 = errorMsg.includes('429') || errorMsg.includes('Too Many Requests') || errorMsg.includes('RESOURCE_EXHAUSTED')

            if (is429 && attempt < MAX_RETRIES) {
                const waitTime = Math.pow(2, attempt) * 1000
                emit('node:log', { message: `⚠️ API 配額限制 (429)，等待 ${waitTime / 1000} 秒後重試...` })
                await new Promise(resolve => setTimeout(resolve, waitTime))
                continue
            }

            emit('node:log', { message: `❌ Gemini API 錯誤: ${errorMsg}` })
            break
        }
    }

    // 所有重試都失敗
    if (lastError) {
        const errorMsg = lastError.message || String(lastError)

        if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
            emit('node:log', { message: '⚠️ API 配額耗盡，建議解決方案：' })
            emit('node:log', { message: '• 等待 1-2 分鐘後再執行' })
            emit('node:log', { message: '• 或到「設定」頁面切換模式或帳號' })
        }

        if (errorMsg.includes('500') || errorMsg.includes('INTERNAL')) {
            emit('node:log', { message: '⚠️ 這是 Google 伺服器內部錯誤，可能原因：' })
            emit('node:log', { message: '1. Gemini 2.0 experimental 模型不穩定' })
            emit('node:log', { message: '2. Prompt 內容觸發安全過濾' })
            emit('node:log', { message: '建議：稍後重試或改用穩定版本模型' })
        }

        throw lastError
    }

    throw new Error('Unexpected error in Gemini executor')
}
