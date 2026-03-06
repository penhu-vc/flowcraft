/**
 * Segment Mining Executor
 * 變體 B v4｜爆裂版（立場型素材挖礦機）
 * 動態引爆框架 + 雙段報告：中段預告 + 結尾CTA + 固定結尾Slogan
 */

import { executeGemini, GeminiConfig } from './gemini'
import { readFileSync } from 'fs'
import { join } from 'path'

type EmitFn = (event: string, data: unknown) => void

export interface SegmentMiningConfig {
    source: string          // 來源素材
    aiProvider?: string     // AI 供應商
    aiApiKey?: string       // API Key
    aiBaseUrl?: string      // Base URL
    model?: string          // 模型
    temperature?: number    // 創意度
}

function loadPromptFile(filename: string): string {
    const promptPath = join(__dirname, 'prompts', filename)
    try {
        return readFileSync(promptPath, 'utf-8')
    } catch (error) {
        throw new Error(`找不到 prompt 文件: ${filename}`)
    }
}

// 從 md 文件載入完整的系統指令和 prompt template
const SYSTEM_INSTRUCTION = loadPromptFile('segment-mining-system.md')
const MINING_PROMPT_TEMPLATE = loadPromptFile('segment-mining-template.md')

export async function executeSegmentMining(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ result: string }> {
    const {
        source,
        aiProvider = 'gemini',
        aiApiKey = '',
        aiBaseUrl = '',
        model = 'gemini-2.0-flash',
        temperature = 0.3
    } = config as unknown as SegmentMiningConfig

    if (!source) throw new Error('Segment Mining executor: source is required')

    emit('node:log', { message: '⛏️ 立場型素材挖礦機啟動（爆裂版 v4）' })
    emit('node:log', { message: `AI Provider: ${aiProvider}` })
    emit('node:log', { message: `使用模型: ${model}` })
    emit('node:log', { message: `素材長度: ${source.length} 字元` })

    // 組合 prompt
    const prompt = MINING_PROMPT_TEMPLATE.replace('{{SOURCE}}', source)

    // 目前只支援 Gemini
    if (aiProvider !== 'gemini') {
        emit('node:log', { message: `⚠️ 目前只支援 Gemini，${aiProvider} 接口預留中` })
    }

    const geminiConfig: GeminiConfig = {
        prompt,
        systemPrompt: SYSTEM_INSTRUCTION,
        model,
        temperature: temperature || 0.3,
        maxTokens: 8192  // Gemini 2.0 Flash 上限為 8192
    }

    emit('node:log', { message: '開始提取立場型口播彈藥...' })
    emit('node:log', { message: '📍 動態引爆框架（前2字不重複、核心名詞≤2次、≥3種修辭）' })
    emit('node:log', { message: '📍 雙段報告話術（中段預告 + 結尾CTA + 固定Slogan）' })

    const result = await executeGemini(geminiConfig, emit)

    emit('node:log', { message: `✅ 挖礦完成（${result.result.length} 字元）` })
    emit('node:log', { message: '✅ 已包含：爆裂短句、引爆框架、中段預告、結尾CTA（加入1% 成為1%~）' })

    return { result: result.result }
}
