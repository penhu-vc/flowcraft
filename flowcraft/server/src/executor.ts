import { executeNotebookLM } from './executors/notebooklm'
import { executeGemini } from './executors/gemini'
import { executeSkill5 } from './executors/skill5'
import { executeFactCheck95 } from './executors/fact-check-95'
import { executeLineBreaker } from './executors/line-breaker'
import { executeSendTelegram } from './executors/send-telegram'
import { executeSegmentMining } from './executors/segment-mining'

type EmitFn = (event: string, data: unknown) => void

export async function executeNode(
    nodeType: string,
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<unknown> {
    switch (nodeType) {
        case 'manual-trigger':
            // Manual Trigger: 返回用戶設定的資料
            emit('node:log', { message: '手動觸發...' })
            const payload = config.payload ? JSON.parse(config.payload as string) : {}
            return {
                timestamp: new Date().toISOString(),
                data: payload
            }

        case 'text-constant':
            // Text Constant: 返回固定文字
            emit('node:log', { message: '📝 純文字節點' })
            const textContent = config.text as string || ''
            emit('node:log', { message: `文字內容長度: ${textContent.length} 字元` })
            emit('node:log', { message: `預覽: ${textContent.substring(0, 50)}${textContent.length > 50 ? '...' : ''}` })
            return {
                text: textContent
            }

        case 'notebooklm':
            return executeNotebookLM(config, emit)

        case 'gemini':
            return executeGemini(config, emit)

        case 'skill5':
        case 'script-pipeline-producer':
            // Skill5: Script Pipeline Producer
            // 步驟 1~5 一次完成（第 5 步改為 AI 自動生成）
            return executeSkill5(config, emit)

        case 'fact-check-95':
            // Fact Check 95 Rewrite
            // 事實查核 + 高轉換率改寫
            return executeFactCheck95(config, emit)

        case 'line-breaker':
            // Line Breaker
            // 分行處理器
            return executeLineBreaker(config, emit)

        case 'send-telegram':
            // Send Telegram
            // 傳送訊息到 Telegram
            return executeSendTelegram(config, emit)

        case 'segment-mining':
            // Segment Mining
            // 分段採礦器：把來源素材拆成可重組的段落素材 schema
            return executeSegmentMining(config, emit)

        default:
            throw new Error(`No executor found for node type: ${nodeType}`)
    }
}
