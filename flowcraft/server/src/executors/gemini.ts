/**
 * Gemini Executor
 * Uses Google Vertex AI Gemini API
 */

import { VertexAI } from '@google-cloud/vertexai'
import { readFileSync } from 'fs'

type EmitFn = (event: string, data: unknown) => void

export interface GeminiConfig {
    prompt: string          // User prompt
    systemPrompt?: string   // Optional system instruction
    model?: string          // Default: gemini-2.0-flash-exp
    temperature?: number    // Default: 1.0
    maxTokens?: number      // Default: 8192
}

// 讀取 GCP profile 設定
function loadGCPProfile() {
    const profiles = JSON.parse(readFileSync('/Users/yaja/projects/gcp-profiles.json', 'utf8'))
    const current = profiles.profiles[profiles.currentProfile]
    return current
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

    // 設定環境變數
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/Users/yaja/projects/gcp-current.json'

    // 讀取 project ID
    const profile = loadGCPProfile()
    const projectId = profile.serviceAccount.projectId

    // Gemini 模型區域選擇
    let location: string

    // 模型 → 支援區域對照表
    const modelRegions: Record<string, string[]> = {
        'gemini-2.0': ['us-central1'],
        'gemini-1.5': ['us-central1', 'us-east1', 'us-west1', 'europe-west1'],
        'gemini-pro': ['us-central1'],
        'gemini-flash': ['us-central1']
    }

    // 判斷模型類型並選擇區域
    if (model.includes('gemini-2.0')) {
        location = 'us-central1'  // Gemini 2.0 僅支援 us-central1
    } else if (model.includes('gemini-1.5')) {
        // Gemini 1.5 支援多個區域，但優先使用 us-central1
        const profileLocation = profile.vertexAI?.location || 'us-central1'
        const supportedRegions = modelRegions['gemini-1.5']
        location = supportedRegions.includes(profileLocation) ? profileLocation : 'us-central1'
    } else {
        // 其他模型預設使用 us-central1
        location = 'us-central1'
    }

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

    try {
        const result = await generativeModel.generateContent(prompt)
        const response = result.response
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''

        if (!text) {
            throw new Error('Gemini 未返回有效回應')
        }

        emit('node:log', { message: `✅ 完成 (${text.length} 字元)` })

        return { result: text }

    } catch (error: any) {
        emit('node:log', { message: `❌ Gemini API 錯誤: ${error.message || error}` })

        // 如果是 500 錯誤，提供診斷資訊
        if (error.message?.includes('500') || error.message?.includes('INTERNAL')) {
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

        throw error
    }
}
