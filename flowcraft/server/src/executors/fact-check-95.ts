/**
 * Fact Check 95 Rewrite Executor
 * 事實查核 + 高轉換率改寫
 */

import { executeGemini, GeminiConfig } from './gemini'
import { readFileSync } from 'fs'
import { join } from 'path'
import { recordSkillResult, normalizeYouTubeUrl } from '../utils/youtube-skills-cache'

type EmitFn = (event: string, data: unknown) => void

export interface FactCheck95Config {
    source: string          // 原始素材（URL 或文字）
    targetReader?: string   // 目標讀者
    desiredAction?: string  // 期望行動（CTA）
    tone?: string          // 語氣風格
    citations?: boolean    // 是否在正文中包含引用
    aiProvider?: string     // AI 供應商（gemini/openai/anthropic/custom）
    aiApiKey?: string       // AI API Key（接口預留）
    aiBaseUrl?: string      // AI Base URL（接口預留）
    model?: string          // 模型名稱
    customModel?: string    // 自訂模型名稱（舊版相容）
    youtubeUrl?: string     // YouTube URL（可手動連線或自動傳遞）
    videoTitle?: string     // 影片標題（自動傳遞）
}

// 讀取 template
function loadTemplate(templateName: string): string {
    const templatePath = join(
        '/Users/yaja/.codex_profiles/葉介/skills/fact-check-95-rewrite/references',
        `${templateName}.md`
    )
    try {
        return readFileSync(templatePath, 'utf-8')
    } catch {
        throw new Error(`找不到模板: ${templateName}.md`)
    }
}

// 系統指示
const SYSTEM_INSTRUCTION = `你是專業的事實查核與高轉換率內容改寫助手。

核心原則：
1. 嚴格不虛構事實
2. 只保留有心理槓桿的事實（能改變決策、製造情緒、形成對比）
3. 融入翻轉句：「你以為A，其實是B」
4. 時態轉換：過去事實 → 現在意義（「這意味著現在：___」）
5. 去除新聞腔：不用「據某某報導」開頭，壓縮成一句衝擊力
6. 情緒曲線編排：
   - 開場震撼（1-2 行）
   - 選擇壓力（讓讀者處於岔路口）
   - 痛苦場景（具體畫面）
   - 翻轉（事實支撐）
   - 成本放大（損失框架）
   - 可行出口（低風險行動）
   - CTA

輸出格式：
- 主要輸出：高轉換率改寫稿
- 可選：精簡的事實清單（僅在要求時）
- 不確定時使用「可能/估計」並註明來源`

export async function executeFactCheck95(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ result: string; factLedger: string }> {
    const {
        source,
        targetReader = '一般讀者',
        desiredAction = '採取行動',
        tone = '台灣口語',
        citations = false,
        aiProvider = 'gemini',
        aiApiKey = '',
        aiBaseUrl = '',
        model = 'gemini-2.0-flash',
        customModel,
        youtubeUrl: configYoutubeUrl,
        videoTitle
    } = config as unknown as FactCheck95Config

    if (!source) throw new Error('Fact Check 95 executor: source is required')

    const startTime = Date.now()

    // 處理模型選擇
    const selectedModel = model === 'custom' ? (customModel || 'gemini-2.0-flash') : model

    emit('node:log', { message: '🔍 事實查核 95 改寫啟動' })
    emit('node:log', { message: `AI Provider: ${aiProvider}` })
    emit('node:log', { message: `使用模型: ${selectedModel}` })

    // 目前只支援 Gemini，其他 provider 預留接口
    if (aiProvider !== 'gemini') {
        emit('node:log', { message: `⚠️ 目前只支援 Gemini，${aiProvider} 接口預留中` })
        emit('node:log', { message: '將使用 Gemini 執行...' })
    }

    // 優先使用手動連線的 youtubeUrl，沒有的話嘗試從 source 提取
    const youtubeUrl = configYoutubeUrl || normalizeYouTubeUrl(source)
    if (youtubeUrl) {
        emit('node:log', { message: `🎬 YouTube 影片: ${youtubeUrl}` })
    }

    // Step 1-2: 提取主張並查核
    emit('node:log', { message: 'Step 1-2: 提取主張並事實查核...' })

    const factCheckPrompt = `## 任務：事實查核

請從以下素材中：
1. 提取可驗證的主張（數字、時間、排名、因果斷言等）
2. 驗證這些主張（不依賴記憶，需要查證）
3. 記錄：修正後的主張、日期、來源

素材：
${source}

請輸出事實清單，格式：
- [主張]: [修正後內容] (日期: YYYY-MM-DD, 來源: URL)
- ...`

    const factCheckConfig: GeminiConfig = {
        prompt: factCheckPrompt,
        systemPrompt: SYSTEM_INSTRUCTION,
        model: selectedModel,
        temperature: 0.3,  // 較低溫度以確保準確性
        maxTokens: 4096
    }

    const factCheckResult = await executeGemini(factCheckConfig, emit)
    const factLedger = factCheckResult.result

    emit('node:log', { message: '✅ 事實查核完成' })

    // Step 3-7: 槓桿過濾 + 改寫
    emit('node:log', { message: 'Step 3-7: 槓桿過濾與高轉換改寫...' })

    const rewriteTemplate = loadTemplate('rewrite-template')

    const rewritePrompt = `## 任務：高轉換率改寫

已驗證的事實：
${factLedger}

目標讀者：${targetReader}
期望行動：${desiredAction}
語氣風格：${tone}
${citations ? '需要在正文中包含引用來源' : '不需要在正文中顯示引用來源'}

請根據事實清單和以下模板，產生高轉換率內容：

${rewriteTemplate}

記住：
- 只保留有心理槓桿的事實（能改變決策、製造情緒、形成對比）
- 融入翻轉句
- 時態轉現在意義
- 去除新聞腔
- 情緒曲線：開場震撼 → 選擇壓力 → 痛苦場景 → 翻轉 → 成本 → 出口 → CTA`

    const rewriteConfig: GeminiConfig = {
        prompt: rewritePrompt,
        systemPrompt: SYSTEM_INSTRUCTION,
        model: selectedModel,
        temperature: 1.0,
        maxTokens: 8192
    }

    const rewriteResult = await executeGemini(rewriteConfig, emit)

    emit('node:log', { message: '✅ 改寫完成' })

    // 審核檢查
    const review = performReview(rewriteResult.result)
    if (review.includes('❌')) {
        emit('node:log', { message: `⚠️ 審核發現問題:\n${review}` })
    } else {
        emit('node:log', { message: '✅ 審核通過' })
    }

    const executionTime = Date.now() - startTime

    // 記錄到 YouTube skills cache（如果有 YouTube URL）
    if (youtubeUrl) {
        recordSkillResult(
            youtubeUrl,
            'fact-check-95',
            {
                targetReader,
                desiredAction,
                tone,
                citations,
                factLedger,
                rewriteResult: rewriteResult.result,
                review
            },
            executionTime,
            videoTitle  // 如果有的話
        )
        emit('node:log', { message: '✅ 結果已記錄到 cache' })
    }

    // 返回結果，並傳遞 metadata 給下游
    return {
        result: rewriteResult.result,
        factLedger: factLedger,
        _metadata: {
            youtubeUrl: youtubeUrl || undefined,
            videoTitle
        }
    }
}

// 審核邏輯
function performReview(content: string): string {
    const checks: string[] = []

    // 檢查開場是否有衝擊力（前 50 字有沒有！或？）
    const opening = content.substring(0, 50)
    if (opening.includes('！') || opening.includes('？')) {
        checks.push('✅ 開場有衝擊力')
    } else {
        checks.push('⚠️ 開場可能缺乏衝擊力')
    }

    // 檢查是否有翻轉句
    if (content.includes('你以為') || content.includes('其實') || content.includes('實際上')) {
        checks.push('✅ 包含翻轉句')
    } else {
        checks.push('⚠️ 缺少翻轉句')
    }

    // 檢查是否避免新聞腔
    if (content.includes('據') || content.includes('報導') || content.includes('指出')) {
        checks.push('⚠️ 可能有新聞腔')
    } else {
        checks.push('✅ 避免新聞腔')
    }

    // 檢查是否有具體數字或場景
    if (/\d+/.test(content)) {
        checks.push('✅ 包含具體數字')
    } else {
        checks.push('⚠️ 缺少具體數字')
    }

    return checks.join('\n')
}
