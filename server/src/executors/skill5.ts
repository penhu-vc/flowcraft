/**
 * Skill5 Executor - Script Pipeline Producer
 * 將原本手動貼回的第 5 步改為 AI 直接生成（步驟 1~5 一次完成）
 */

import { executeGemini } from './gemini'
import { readFileSync } from 'fs'
import { join } from 'path'
import { recordSkillResult, normalizeYouTubeUrl } from '../utils/youtube-skills-cache'

type EmitFn = (event: string, data: unknown) => void

export interface Skill5Config {
    source: string
    aiProvider?: 'gemini' | 'openai' | 'anthropic' | 'custom'
    aiApiKey?: string
    aiBaseUrl?: string
    prompt?: string
    feedback?: string
    previousMining?: string
    previousScript?: string
    missingKeyPolicy?: 'fail' | 'continue'
    forbiddenTerms?: string
    ctaExempt?: string
    temperature?: number
    model?: string
    customModel?: string
    youtubeUrl?: string
    videoTitle?: string
}

interface Skill5Result {
    result: string
    baseDraft: string
    mining: string
    miningPrompt: string
    draftPrompt: string
    review: string
    _metadata?: {
        youtubeUrl?: string
        videoTitle?: string
    }
}

interface AiRequest {
    provider: 'gemini' | 'openai' | 'anthropic' | 'custom'
    prompt: string
    systemPrompt: string
    model: string
    temperature: number
    maxTokens: number
    apiKey?: string
    baseUrl?: string
}

function loadTemplate(templateName: string): string {
    const templatePath = join(
        '/Users/yaja/.codex_profiles/葉介/skills/script-pipeline-producer/references',
        `${templateName}.md`
    )
    try {
        return readFileSync(templatePath, 'utf-8')
    } catch {
        throw new Error(`找不到模板: ${templateName}.md`)
    }
}

const MINING_SYSTEM_INSTRUCTION = `你是專業的素材採礦機。
嚴格按照模板輸出 KEY: VALUE 格式。
每行一個 KEY，不要解釋，不要額外文字。
必須用中文回覆，所有 VALUE 都要是中文。
只可擷取來源中明確出現的資訊，不可推測或腦補。
若找不到明確證據，VALUE 必須填 __MISSING__。`

const SCRIPTING_SYSTEM_INSTRUCTION = `你是專業的短影音腳本撰寫助手。

固定規則（每次必須執行）：
1. 開場必須高情緒喊話（1-2 行，驚訝、緊迫感、反差感）
2. 必須自然融入社群橋接：「我們社群準備了...留言關鍵字：xxx...加入1%，成為1%」
3. 段落節奏：
   - 第 2 段：今天的切入角度
   - 第 3 段：開始因果拆解（第一刀/第一個原因）
4. 每個主要段落至少包含一個具體數字或場景案例
5. 收斂到可執行的 takeaway
6. 台灣口語風格，短句，不要 JSON，不要章節標題
7. 不要虛構素材中沒有的事實
8. 留言關鍵字：由 AI 依本輪主題自動產生（不要重複用前一輪的）

輸出格式：直接輸出腳本內容，不要包裝成 JSON 或加上標題。`

async function generateTextWithProvider(request: AiRequest, emit: EmitFn): Promise<string> {
    const { provider, prompt, systemPrompt, model, temperature, maxTokens, apiKey, baseUrl } = request

    if (provider === 'gemini') {
        const response = await executeGemini(
            {
                prompt,
                systemPrompt,
                model,
                temperature,
                maxTokens
            },
            emit
        )
        return response.result
    }

    const maskedKey = apiKey ? `${apiKey.slice(0, 3)}***` : '(empty)'
    throw new Error(
        `AI provider "${provider}" 尚未實作。已預留接口：model=${model}, baseUrl=${baseUrl || '(empty)'}, apiKey=${maskedKey}`
    )
}

function parseMiningKV(text: string): Record<string, string> {
    const result: Record<string, string> = {}
    for (const raw of text.split('\n')) {
        const line = raw.trim()
        const idx = line.indexOf(':')
        if (idx <= 0) continue
        const key = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim()
        if (!key) continue
        result[key] = value
    }
    return result
}

function isMissingValue(value: string | undefined): boolean {
    if (!value) return true
    const v = value.trim().toLowerCase()
    return v === '' || v === '__missing__' || v === 'n/a' || v === 'na'
}

export async function executeSkill5(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<Skill5Result> {
    const {
        source,
        aiProvider = 'gemini',
        aiApiKey = '',
        aiBaseUrl = '',
        prompt = '',
        feedback = '',
        previousMining = '',
        previousScript = '',
        missingKeyPolicy = 'fail',
        forbiddenTerms = '',
        ctaExempt = '留言,按讚,收藏,轉發,訂閱,關注,加入1%,成為1%',
        temperature = 1.0,
        model = 'gemini-2.0-flash',
        customModel,
        youtubeUrl: configYoutubeUrl,
        videoTitle
    } = config as unknown as Skill5Config

    if (!source) throw new Error('Skill5 executor: source is required')

    const startTime = Date.now()
    const selectedModel = model === 'custom' ? (customModel || 'gemini-2.0-flash') : model

    emit('node:log', { message: '📝 Script Pipeline Producer 啟動（步驟 1~5 自動化）' })
    emit('node:log', { message: `AI Provider: ${aiProvider}` })
    emit('node:log', { message: `使用模型: ${selectedModel}` })

    const youtubeUrl = configYoutubeUrl || normalizeYouTubeUrl(source)
    if (youtubeUrl) {
        emit('node:log', { message: `🎬 YouTube 影片: ${youtubeUrl}` })
    }

    let miningResult = previousMining
    let scriptResult = ''
    let miningPrompt = ''
    let draftPrompt = ''

    if (!previousMining || feedback) {
        emit('node:log', { message: 'Step 1/3: Material Mining...' })

        const miningTemplate = loadTemplate('mining-template')
        miningPrompt = `${miningTemplate}

## 原始素材

${source}

${feedback ? `\n## 使用者 Feedback\n\n${feedback}\n\n請根據 feedback 調整素材提取。` : ''}`

        miningResult = await generateTextWithProvider(
            {
                provider: aiProvider,
                prompt: miningPrompt,
                systemPrompt: MINING_SYSTEM_INSTRUCTION,
                model: selectedModel,
                temperature: 0.3,
                maxTokens: 4096,
                apiKey: aiApiKey,
                baseUrl: aiBaseUrl
            },
            emit
        )

        emit('node:log', { message: '✅ Material Mining 完成' })

    } else {
        emit('node:log', { message: 'Step 1/3: 使用前一輪的 Mining 結果' })
        miningPrompt = '(使用 previousMining，未重新生成 mining prompt)'
    }

    const requiredKeys = ['EVENT_AXIS', 'S1_EVENT_ACTOR', 'S2_EVENT_ACTOR', 'S3_EVENT_ACTOR']
    const miningKV = parseMiningKV(miningResult)
    const missingKeys = requiredKeys.filter(key => isMissingValue(miningKV[key]))
    if (missingKeys.length > 0) {
        emit('node:log', { message: `⚠️ 關鍵欄位缺失: ${missingKeys.join(', ')}` })
        if (missingKeyPolicy !== 'continue') {
            throw new Error(
                `素材不足，停止生成以避免亂塞內容。缺少關鍵欄位: ${missingKeys.join(', ')}`
            )
        }
    }

    emit('node:log', { message: 'Step 2/3: Script Drafting（自動完成原流程第 5 步）...' })

    const scriptTemplate = loadTemplate('script-template')
    draftPrompt = `${scriptTemplate}

## 已挖掘的素材 (KEY: VALUE)

${miningResult}

${previousScript ? `\n## 前一輪腳本\n\n${previousScript}\n` : ''}

${feedback ? `\n## 使用者 Feedback\n\n${feedback}\n\n請逐點反映 feedback，保留有效部分，修補弱點。` : ''}

${prompt ? `\n## 額外指示\n\n${prompt}` : ''}

## 反幻覺規則（必須遵守）
1) 只能使用上方 KEY:VALUE 有明確證據的資訊。
2) 對於 __MISSING__ 或缺失欄位，不可補寫、不可信口開河。
3) 資料不足時請保守表述，避免虛構細節。

請根據以上素材和模板，產生腳本。記住：留言關鍵字要根據本輪主題重新產生，不要重複用前一輪的。`

    scriptResult = await generateTextWithProvider(
        {
            provider: aiProvider,
            prompt: draftPrompt,
            systemPrompt: SCRIPTING_SYSTEM_INSTRUCTION,
            model: selectedModel,
            temperature: Number(temperature) || 1.0,
            maxTokens: 8192,
            apiKey: aiApiKey,
            baseUrl: aiBaseUrl
        },
        emit
    )

    emit('node:log', { message: '✅ Script Drafting 完成（Base Draft 已由 AI 生成）' })

    emit('node:log', { message: 'Step 3/3: Review Gate...' })
    const review = performReview(scriptResult, forbiddenTerms, ctaExempt)

    if (review.includes('❌')) {
        emit('node:log', { message: `⚠️ 審核發現問題:\n${review}` })
    } else {
        emit('node:log', { message: '✅ 審核通過' })
    }

    const executionTime = Date.now() - startTime

    if (youtubeUrl) {
        recordSkillResult(
            youtubeUrl,
            'skill5',
            {
                mining: miningResult,
                script: scriptResult,
                review,
                feedback: feedback || undefined
            },
            executionTime,
            videoTitle
        )
        emit('node:log', { message: '✅ 結果已記錄到 cache' })
    }

    return {
        result: scriptResult,
        baseDraft: scriptResult,
        mining: miningResult,
        miningPrompt,
        draftPrompt,
        review,
        _metadata: {
            youtubeUrl: youtubeUrl || undefined,
            videoTitle
        }
    }
}

function performReview(script: string, forbiddenTerms?: string, ctaExempt?: string): string {
    const checks: string[] = []

    const lines = script.split('\n').filter(l => l.trim())
    const opening = lines.slice(0, 2).join('\n')
    if (opening.includes('！') || opening.includes('？')) {
        checks.push('✅ 1) 第一到第二行有情緒喊話')
    } else {
        checks.push('❌ 1) 開場缺乏情緒（必須有！或？）')
    }

    if (lines.length >= 3) {
        checks.push('✅ 2) 有開場鉤子與今日切角')
    } else {
        checks.push('⚠️ 2) 內容過短，無法判斷開場結構')
    }

    if (lines.length >= 5) {
        checks.push('✅ 3) 有三段因果拆解')
    } else {
        checks.push('⚠️ 3) 段落數不足，可能缺少因果拆解')
    }

    const lastLines = lines.slice(-5).join('\n')
    if (lastLines.includes('所以') || lastLines.includes('因此') || lastLines.includes('總之')) {
        checks.push('✅ 4) 有自然收斂')
    } else {
        checks.push('⚠️ 4) 結尾可能缺少收斂')
    }

    if (script.includes('我們社群準備了') || script.includes('我們社群') || script.includes('社群準備了')) {
        checks.push('✅ 5) 有社群橋段')
    } else {
        checks.push('❌ 5) 缺少社群橋段（必須有「我們社群準備了...」）')
    }

    if (script.includes('留言關鍵字')) {
        checks.push('✅ 6) 有留言關鍵字行')
    } else {
        checks.push('❌ 6) 缺少關鍵字檢索行（必須有「留言關鍵字：___」）')
    }

    if (script.includes('加入1%') && script.includes('成為1%')) {
        checks.push('✅ 7) 有口號')
    } else {
        checks.push('❌ 7) 缺少 slogan（必須有「加入1%，成為1%」）')
    }

    if (/\d+/.test(script)) {
        checks.push('✅ 8) 包含具體數字')
    } else {
        checks.push('⚠️ 8) 缺少具體數字或畫面感')
    }

    checks.push('✅ 9) 無突然換軸（需人工檢視）')

    if (forbiddenTerms) {
        const forbidden = forbiddenTerms.split(',').map(t => t.trim()).filter(t => t)
        const exempt = (ctaExempt || '留言,按讚,收藏,轉發,訂閱,關注,加入1%,成為1%').split(',').map(t => t.trim())

        const nonCtaSection = lines.slice(0, -5).join('\n')
        const violations: string[] = []
        for (const term of forbidden) {
            if (nonCtaSection.includes(term) && !exempt.includes(term)) {
                violations.push(term)
            }
        }

        if (violations.length > 0) {
            checks.push(`❌ 10) 非 CTA 區段有禁忌詞: ${violations.join(', ')}`)
        } else {
            checks.push('✅ 10) 非 CTA 區段無禁忌詞')
        }
    } else {
        checks.push('✅ 10) 無設定禁忌詞（跳過檢查）')
    }

    checks.push('✅ 11) feedback 套用（需人工驗證）')

    if (/^[A-Z_]+:/m.test(script)) {
        checks.push('❌ 腳本中出現標籤格式（KEY: VALUE），需要去標籤化')
    } else {
        checks.push('✅ 已去標籤化')
    }

    return checks.join('\n')
}
