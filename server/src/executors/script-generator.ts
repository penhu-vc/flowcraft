/**
 * Script Generator Executor
 * 劇本指令｜爆裂口播 v2
 * 接在礦機節點後，將結構化素材轉換成口播劇本
 */

import { executeGemini, GeminiConfig } from './gemini'
import { readFileSync } from 'fs'
import { join } from 'path'

type EmitFn = (event: string, data: unknown) => void

export interface ScriptGeneratorConfig {
    source: string              // 來源素材（或礦機 YAML 輸出）
    reference?: string          // 參考資料（可選）
    aiProvider?: string         // AI 供應商
    aiApiKey?: string           // API Key
    aiBaseUrl?: string          // Base URL
    model?: string              // 模型
    temperature?: number        // 創意度
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
const SYSTEM_INSTRUCTION = loadPromptFile('script-generator-system.md')
const SCRIPT_PROMPT_TEMPLATE = loadPromptFile('script-generator-template.md')

export async function executeScriptGenerator(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ result: string; script: string; keywords: string[] }> {
    const rawConfig = config as unknown as ScriptGeneratorConfig
    const {
        reference = '',
        aiProvider = 'gemini',
        aiApiKey = '',
        aiBaseUrl = '',
        model = 'gemini-2.0-flash',
        temperature = 1.0
    } = rawConfig

    // 處理 source：可能是字串或物件
    let source = rawConfig.source
    if (typeof source === 'object' && source !== null) {
        // 如果是物件，嘗試提取 result、script、yaml 或 content
        const obj = source as Record<string, unknown>
        source = (obj.result || obj.script || obj.yaml || obj.content || JSON.stringify(source)) as string
    }
    if (!source || typeof source !== 'string') {
        throw new Error('Script Generator executor: source is required (需要提供來源素材)')
    }

    // 處理 reference：也可能是物件
    let ref = reference
    if (typeof ref === 'object' && ref !== null) {
        const obj = ref as Record<string, unknown>
        ref = (obj.result || obj.content || JSON.stringify(ref)) as string
    }

    emit('node:log', { message: '🎬 劇本指令啟動（爆裂口播 v2）' })
    emit('node:log', { message: `AI Provider: ${aiProvider}` })
    emit('node:log', { message: `使用模型: ${model}` })
    emit('node:log', { message: `來源長度: ${source.length} 字元` })

    if (ref) {
        emit('node:log', { message: `📎 參考資料長度: ${ref.length} 字元` })
    }

    // 組合 prompt
    let prompt = SCRIPT_PROMPT_TEMPLATE.replace('{{SOURCE}}', source)

    // 處理參考資料
    if (ref) {
        const referenceContent = `${ref}\n\n可參考上述資料來豐富劇本內容（但要加上「*」號標記）。`
        prompt = prompt.replace('{{REFERENCE}}', referenceContent)
    } else {
        // 沒有參考資料時，移除整個參考資料區塊
        prompt = prompt.replace(/<<<reference_START>>>\s*{{REFERENCE}}\s*<<<reference_END>>>\s*/g, '（無參考資料）\n\n')
    }

    // 目前只支援 Gemini
    if (aiProvider !== 'gemini') {
        emit('node:log', { message: `⚠️ 目前只支援 Gemini，${aiProvider} 接口預留中` })
    }

    const geminiConfig: GeminiConfig = {
        prompt,
        systemPrompt: SYSTEM_INSTRUCTION,
        model,
        temperature: temperature || 1.0,
        maxTokens: 8192
    }

    emit('node:log', { message: '開始生成爆裂短句口播稿...' })
    emit('node:log', { message: '📍 動態引爆框架（前2字不重複、核心詞≤2次、≥3種修辭）' })
    emit('node:log', { message: '📍 中段報告預告 + 結尾CTA + 固定收尾「加入1% 成為1%~」' })

    const result = await executeGemini(geminiConfig, emit)

    // 嘗試提取關鍵字
    const keywords = extractKeywords(result.result)

    emit('node:log', { message: `✅ 劇本生成完成（${result.result.length} 字元）` })
    if (keywords.length > 0) {
        emit('node:log', { message: `🔑 關鍵字候選: ${keywords.join(', ')}` })
    }

    return {
        result: result.result,
        script: result.result,
        keywords
    }
}

/**
 * 從劇本結尾提取關鍵字候選
 */
function extractKeywords(script: string): string[] {
    const keywords: string[] = []
    const lines = script.split('\n')

    // 尋找括號標註的關鍵字
    for (const line of lines) {
        const match = line.match(/[（(]關鍵字[ABC][：:]\s*(.+?)[）)]/i)
        if (match && match[1]) {
            keywords.push(match[1].trim())
        }
    }

    return keywords
}
