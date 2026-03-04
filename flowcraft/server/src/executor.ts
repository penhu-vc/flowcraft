import { executeNotebookLM } from './executors/notebooklm'
import { executeGemini } from './executors/gemini'
import { executeSkill5 } from './executors/skill5'
import { executeFactCheck95 } from './executors/fact-check-95'
import { executeLineBreaker } from './executors/line-breaker'
import { executeSendTelegram } from './executors/send-telegram'
import { executeSegmentMining } from './executors/segment-mining'
import { executeScriptGenerator } from './executors/script-generator'
import { executeWriteCollection } from './executors/write-collection'
import { executeExecutionLogger } from './executors/execution-logger'
import { executeYouTubeSubtitle } from './executors/youtube-subtitle'
import { executeYouTubeThumbnail } from './executors/youtube-thumbnail'
import { executeYouTubeRecentVideos } from './executors/youtube-recent-videos'

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

        case 'bullet-point-reference':
            // Bullet Point Reference: 列點型參考
            emit('node:log', { message: '📋 列點型參考節點' })
            const itemsJson = config.items as string || '[]'
            let items: any[] = []
            try {
                items = JSON.parse(itemsJson)
            } catch (e) {
                emit('node:log', { message: '⚠️ 解析列點資料失敗' })
            }
            const formattedText = items.map((item: any, index: number) => `${index + 1}. ${item.text}`).join('\n')
            emit('node:log', { message: `列點數量: ${items.length}` })
            emit('node:log', { message: `預覽:\n${formattedText.substring(0, 200)}${formattedText.length > 200 ? '...' : ''}` })
            return {
                result: formattedText,
                items: items.map((item: any) => item.text)
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

        case 'script-generator':
            // Script Generator
            // 劇本指令：將結構化素材轉換成爆裂短句口播稿
            return executeScriptGenerator(config, emit)

        case 'write-collection':
            // Write to Collection
            // 寫入資料集
            return executeWriteCollection(config, emit)

        case 'execution-logger':
            // Execution Logger
            // 執行記錄器：收集多個欄位並寫入資料集
            return executeExecutionLogger(config, emit)

        case 'youtube-subtitle':
            // YouTube Subtitle Extractor
            // YouTube 字幕提取器（多重 fallback）
            return executeYouTubeSubtitle(config, emit)

        case 'youtube-thumbnail':
            // YouTube Thumbnail Downloader
            // YouTube 封面下載器
            return executeYouTubeThumbnail(config, emit)

        case 'youtube-recent-videos':
            // YouTube Recent Videos Selector
            // YouTube 最近影片選擇器
            return executeYouTubeRecentVideos(config, emit)

        default:
            throw new Error(`No executor found for node type: ${nodeType}`)
    }
}
