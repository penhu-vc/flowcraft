/**
 * Gemini Executor
 * Uses Google Vertex AI Gemini API
 */

import { VertexAI } from '@google-cloud/vertexai'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

type EmitFn = (event: string, data: unknown) => void

export interface GeminiConfig {
    prompt: string          // User prompt
    systemPrompt?: string   // Optional system instruction
    model?: string          // Default: gemini-2.0-flash-exp
    temperature?: number    // Default: 1.0
    maxTokens?: number      // Default: 8192
}

// 讀取 GCP 憑證
function loadGCPCredentials(): { projectId: string; location: string } {
    // 優先使用環境變數指定的憑證檔案
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        || join(__dirname, '../../data/gcp-credentials.json')

    if (!existsSync(credentialsPath)) {
        throw new Error('GCP 憑證未設定！請到「設定」頁面匯入 GCP 憑證 JSON 檔案。')
    }

    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'))
    return {
        projectId: credentials.project_id,
        location: 'us-central1'  // 預設區域
    }
}

export async function executeGemini(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ result: string }> {
    const {
        prompt,
        systemPrompt = '',
        model = 'gemini-2.0-flash-exp',
        temperature = 1.0,
        maxTokens = 8192
    } = config as unknown as GeminiConfig

    if (!prompt) throw new Error('Gemini executor: prompt is required')

    emit('node:log', { message: '初始化 Gemini API...' })

    // 讀取 GCP 憑證
    const { projectId, location } = loadGCPCredentials()

    emit('node:log', { message: `使用模型: ${model}` })
    emit('node:log', { message: `區域: ${location}` })

    // 初始化 Vertex AI
    const vertexAI = new VertexAI({
        project: projectId,
        location: location
    })

    const generativeModel = vertexAI.getGenerativeModel({
        model: model,
        systemInstruction: systemPrompt || undefined,
        generationConfig: {
            temperature: temperature,
            maxOutputTokens: maxTokens
        }
    })

    emit('node:log', { message: '發送請求...' })
    emit('node:log', { message: `Prompt 長度: ${prompt.length} 字元` })
    if (systemPrompt) {
        emit('node:log', { message: `System Prompt 長度: ${systemPrompt.length} 字元` })
    }

    // 自動重試機制（針對 429 錯誤）
    const MAX_RETRIES = 3
    let lastError: any = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                emit('node:log', { message: `🔄 重試第 ${attempt - 1} 次...` })
            }

            const result = await generativeModel.generateContent(prompt)
            const response = result.response
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''

            if (!text) {
                throw new Error('Gemini 未返回有效回應')
            }

            emit('node:log', { message: `✅ 完成 (${text.length} 字元)` })

            return { result: text }

        } catch (error: any) {
            lastError = error
            const errorMsg = error.message || String(error)

            // 檢查是否為 429 錯誤
            const is429 = errorMsg.includes('429') || errorMsg.includes('Too Many Requests') || errorMsg.includes('RESOURCE_EXHAUSTED')

            if (is429 && attempt < MAX_RETRIES) {
                // Exponential backoff: 2s, 4s, 8s
                const waitTime = Math.pow(2, attempt) * 1000
                emit('node:log', { message: `⚠️ API 配額限制 (429)，等待 ${waitTime / 1000} 秒後重試...` })
                await new Promise(resolve => setTimeout(resolve, waitTime))
                continue
            }

            // 不是 429 錯誤，或已達重試上限，直接拋出
            emit('node:log', { message: `❌ Gemini API 錯誤: ${errorMsg}` })
            break
        }
    }

    // 所有重試都失敗，拋出最後的錯誤
    if (lastError) {

        const errorMsg = lastError.message || String(lastError)

        // 如果是 429 錯誤
        if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
            emit('node:log', { message: '⚠️ API 配額耗盡，建議解決方案：' })
            emit('node:log', { message: '• 等待 1-2 分鐘後再執行' })
            emit('node:log', { message: '• 或到「設定」頁面切換到另一個 GCP 帳號' })
            emit('node:log', { message: '• 或到 GCP Console 申請提高配額' })
        }

        // 如果是 500 錯誤，提供診斷資訊
        if (errorMsg.includes('500') || errorMsg.includes('INTERNAL')) {
            emit('node:log', { message: '⚠️ 這是 Google 伺服器內部錯誤，可能原因：' })
            emit('node:log', { message: '1. Gemini 2.0 experimental 模型不穩定' })
            emit('node:log', { message: '2. Prompt 內容觸發安全過濾' })
            emit('node:log', { message: '3. API 配額或權限問題' })
            emit('node:log', { message: '' })
            emit('node:log', { message: '建議解決方案：' })
            emit('node:log', { message: '• 稍後重試（5-10 分鐘）' })
            emit('node:log', { message: '• 改用穩定版本：gemini-2.0-flash 或 gemini-2.5-flash' })
            emit('node:log', { message: '• 檢查 Prompt 內容是否有敏感資訊' })
        }

        throw lastError
    }

    // 不應該執行到這裡
    throw new Error('Unexpected error in Gemini executor')
}
