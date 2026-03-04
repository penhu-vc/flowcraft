/**
 * NotebookLM Executor
 * Uses Patchright to automate notebooklm.google.com
 *
 * Flow:
 * 1. Load saved Google session (cookie) from sessions/notebooklm.json
 * 2. Open NotebookLM
 * 3. Create a new notebook
 * 4. Add the YouTube URL as a source
 * 5. Wait for source processing
 * 6. Run the user-supplied prompt
 * 7. Extract and return the AI response
 */

import path from 'path'
import fs from 'fs'
import { chromium } from 'patchright'
import { recordSkillResult } from '../utils/youtube-skills-cache'

const SESSION_PATH = path.join(__dirname, '../../sessions/notebooklm.json')
const MAPPING_PATH = path.join(__dirname, '../../sessions/notebooklm-mappings.json')
const NOTEBOOKLM_URL = 'https://notebooklm.google.com'

interface NotebookMapping {
    [youtubeUrl: string]: {
        notebookUrl: string
        createdAt: string
        lastUsed: string
    }
}

type EmitFn = (event: string, data: unknown) => void

export interface NotebookLMConfig {
    url: string           // YouTube video URL to add as source
    prompt: string        // Question/prompt to ask NotebookLM
    timeout?: number      // Max wait time in seconds (default: 600 = 10 minutes)
}

// 讀取 URL mapping
function loadMappings(): NotebookMapping {
    if (!fs.existsSync(MAPPING_PATH)) {
        return {}
    }
    try {
        return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf-8'))
    } catch {
        return {}
    }
}

// 儲存 URL mapping
function saveMappings(mappings: NotebookMapping): void {
    fs.writeFileSync(MAPPING_PATH, JSON.stringify(mappings, null, 2))
}

export async function executeNotebookLM(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ result: string; notebook_url?: string }> {
    const { url, prompt, timeout: timeoutSeconds = 120 } = config as unknown as NotebookLMConfig
    // 確保 timeout 是數字
    const timeoutNum = typeof timeoutSeconds === 'string' ? parseInt(timeoutSeconds, 10) : timeoutSeconds
    const timeout = (timeoutNum || 120) * 1000  // 轉換秒為毫秒

    if (!url) throw new Error('NotebookLM executor: url is required')
    if (!prompt) throw new Error('NotebookLM executor: prompt is required')

    emit('node:log', { message: `Timeout 設定: ${timeout / 1000} 秒` })

    // Check session exists
    if (!fs.existsSync(SESSION_PATH)) {
        throw new Error(
            '尚未登入 Google。請先執行 npm run auth:notebooklm 完成首次登入。'
        )
    }

    const storageState = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8'))

    emit('node:log', { message: '啟動瀏覽器...' })

    const browser = await chromium.launch({
        headless: false,
        channel: 'chrome'  // 使用系統安裝的 Chrome
    })
    const context = await browser.newContext({
        storageState,
        permissions: ['clipboard-read', 'clipboard-write']  // 自動允許剪貼簿存取
    })
    const page = await context.newPage()

    try {
        // ── Step 1: 檢查是否已有對應的 Notebook ──────────────────────
        const mappings = loadMappings()
        const existingNotebook = mappings[url]

        if (existingNotebook) {
            emit('node:log', { message: `找到已存在的 Notebook，直接開啟...` })
            emit('node:log', { message: `URL: ${existingNotebook.notebookUrl}` })

            try {
                await page.goto(existingNotebook.notebookUrl, { waitUntil: 'load', timeout })
                emit('node:log', { message: 'Notebook 已開啟' })

                // 更新最後使用時間
                mappings[url].lastUsed = new Date().toISOString()
                saveMappings(mappings)

                // 跳到 Step 5（送出提示詞）
                // 這裡需要重構程式碼，先建立新的 notebook 流程
            } catch (err) {
                emit('node:log', { message: '⚠️ 無法開啟舊的 Notebook，將建立新的' })
                // 如果開啟失敗，刪除 mapping 並建立新的
                delete mappings[url]
                saveMappings(mappings)
            }
        }

        const isInExistingNotebook = page.url().includes('notebooklm.google.com/notebook/')

        // 如果沒有既有 notebook 或開啟失敗，建立新的
        if (!isInExistingNotebook) {
            // ── Step 1: Open NotebookLM ────────────────────────────────────
            emit('node:log', { message: '開啟 NotebookLM...' })
            await page.goto(NOTEBOOKLM_URL, { waitUntil: 'load', timeout })
            emit('node:log', { message: 'NotebookLM 頁面已載入' })

            // Check if redirected to login (session expired)
            if (page.url().includes('accounts.google.com')) {
                throw new Error('Google session 已過期，請重新執行 npm run auth:notebooklm')
            }

            // ── Step 2, 3, 4: 只在建立新 Notebook 時執行 ─────────────
            // ── Step 2: Create new notebook ────────────────────────────────
            emit('node:log', { message: '建立新的 Notebook...' })

            // 等待頁面完全載入（先等基本載入）
            await page.waitForTimeout(3000)

            // 等待「新建」按鈕出現（可能需要較長時間）
            emit('node:log', { message: '等待「新建」按鈕出現...' })
            const newNotebookBtn = page.locator('button:has-text("新建"), button[aria-label="建立新的筆記本"], button[aria-label*="Create"]')
            await newNotebookBtn.first().waitFor({ state: 'visible', timeout: 30000 })

            // 按鈕出現後再等一下，確保可點擊
            await page.waitForTimeout(1000)

            // 點擊右上角「+ 新建」按鈕
            emit('node:log', { message: '點擊「新建」按鈕...' })
            await newNotebookBtn.first().click({ timeout: 15000 })
            await page.waitForTimeout(2000)

            // ── Step 3: Add YouTube URL as source ──────────────────────────
            emit('node:log', { message: `新增來源: ${url}` })

            // 對話框自動彈出，等待載入
            await page.waitForTimeout(2000)

            // 點擊「網站」按鈕（底部按鈕，有 YouTube 圖標）
            const websiteBtn = page.locator('button:has-text("網站"), button:has-text("Website")')
            await websiteBtn.first().click({ timeout: 10000 })
            await page.waitForTimeout(1000)

            // 輸入 URL（可能是 textarea 或 input）
            const urlInput = page.locator('textarea, input[type="url"], input[placeholder*="連結"], input[placeholder*="URL"]')
            await urlInput.first().fill(url)
            await page.waitForTimeout(500)

            // 點擊「插入」按鈕
            const insertBtn = page.locator('button:has-text("插入"), button:has-text("Insert")')
            await insertBtn.first().click({ timeout: 10000 })

            // ── Step 4: Wait for source to process ────────────────────────
            emit('node:log', { message: '等待 AI 處理來源...' })
            await page.waitForFunction(
                `!document.querySelector('[aria-label*="Loading"], .processing-indicator')`,
                { timeout }
            )
            await page.waitForTimeout(3000) // extra buffer for processing

            // 儲存 URL mapping
            const notebookUrl = page.url()
            mappings[url] = {
                notebookUrl,
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString()
            }
            saveMappings(mappings)
            emit('node:log', { message: `✅ Notebook 已建立並記錄: ${notebookUrl}` })
        }

        // ── Step 5: Submit prompt in the chat ─────────────────────────
        emit('node:log', { message: '送出提示詞...' })

        // 找到輸入框（可能是 textarea 或 contenteditable）
        const chatInput = page.locator(
            'textarea[placeholder*="輸入"], textarea[placeholder*="Ask"], div[contenteditable="true"]'
        )
        await chatInput.first().click()
        await chatInput.first().fill(prompt)
        await page.waitForTimeout(500)

        // 點擊發送按鈕（右箭頭圖標）
        const sendBtn = page.locator('button[aria-label*="Send"], button[aria-label*="傳送"], button[type="submit"]')
        await sendBtn.first().click({ timeout: 10000 })

        // ── Step 6: Wait for response (智能檢測) ─────────────────────
        emit('node:log', { message: '等待 AI 回應...' })

        // 智能等待：檢測回應內容是否停止變化
        const startTime = Date.now()
        let lastCheckTime = startTime
        let isComplete = false
        let lastContent = ''
        let stableCount = 0  // 內容穩定計數

        while (!isComplete && (Date.now() - startTime) < timeout) {
            // 檢查「儲存至記事」按鈕是否出現（表示 AI 已生成回應）
            const saveBtn = await page.locator('button:has-text("儲存至記事"), button:has-text("Save")').count()

            if (saveBtn > 0) {
                // 按鈕出現了，但還要確認內容是否停止變化
                const currentContent = await page.evaluate(() => {
                    // 獲取最後一個對話回應的內容
                    const responses = Array.from(document.querySelectorAll('[class*="response"], [class*="message"], [role="article"]'))
                    return responses[responses.length - 1]?.textContent || ''
                })

                // 過濾掉 AI 準備中的訊息
                // 檢查是否是明顯的準備階段（單行、包含特定關鍵字）
                const lines = currentContent.split('\n').filter(l => l.trim())
                const isSingleLinePreparingMsg = lines.length === 1 && (
                    currentContent.includes('Defining') ||
                    currentContent.includes('Pinpointing') ||
                    currentContent.includes('準備中')
                )

                // 只要內容夠長且不是單行準備訊息，就認為是真正的回應
                const isRealContent = currentContent.length > 150 && !isSingleLinePreparingMsg

                if (isRealContent) {
                    if (currentContent === lastContent) {
                        stableCount++
                        // 內容連續 5 次（10 秒）沒變化，才算真正完成
                        if (stableCount >= 5) {
                            emit('node:log', { message: '✅ AI 回應已穩定，確認完成' })
                            isComplete = true
                            break
                        }
                    } else {
                        stableCount = 0  // 內容還在變化，重置計數
                        lastContent = currentContent
                        emit('node:log', { message: `AI 正在生成... (內容長度: ${currentContent.length})` })
                    }
                }
            }

            // 每 10 秒輸出一次進度
            const elapsed = Math.floor((Date.now() - startTime) / 1000)
            if (Date.now() - lastCheckTime > 10000) {
                const status = saveBtn > 0
                    ? `AI 回應中... (穩定計數: ${stableCount}/5)`
                    : 'AI 正在處理...'
                emit('node:log', { message: `${status} (${elapsed}s)` })
                lastCheckTime = Date.now()
            }

            await page.waitForTimeout(2000)  // 每 2 秒檢查一次
        }

        if (!isComplete) {
            throw new Error(`AI 回應超時（已等待 ${timeout / 1000} 秒）`)
        }

        emit('node:log', { message: `✅ AI 回應完成（耗時 ${Math.floor((Date.now() - startTime) / 1000)}s）` })

        // 滾動到頁面最下方
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight)
        })
        await page.waitForTimeout(1000)

        emit('node:log', { message: '回應完成，複製結果...' })

        // ── Step 7: 點擊複製按鈕獲取結果 ─────────────────────────────
        // 先截圖看看按鈕位置
        await page.screenshot({ path: '/tmp/notebooklm-before-copy.png', fullPage: true })
        emit('node:log', { message: '已截圖: /tmp/notebooklm-before-copy.png' })

        // 找到「儲存至記事」旁邊的複製按鈕
        const copyBtn = page.locator('button[aria-label*="Copy"], button[aria-label*="複製"]').last()
        await copyBtn.click({ timeout: 10000 })
        await page.waitForTimeout(500)

        // 從剪貼簿讀取複製的內容
        const resultText = await page.evaluate(() => navigator.clipboard.readText())

        emit('node:log', { message: '✅ 獲取結果成功' })

        const notebookUrl = page.url()
        const executionTime = Date.now() - startTime

        // 記錄到 YouTube skills cache
        recordSkillResult(
            url,
            'notebooklm',
            { notebook_url: notebookUrl, prompt, response: resultText.trim() },
            executionTime
        )
        emit('node:log', { message: '✅ 結果已記錄到 cache' })

        await browser.close()

        // 返回結果，包含 metadata 供下游節點使用
        return {
            result: resultText.trim(),
            notebook_url: notebookUrl,
            _metadata: {
                youtubeUrl: url,  // 原始 YouTube URL
                videoTitle: undefined  // 之後可以從 NotebookLM 抓取
            }
        }

    } catch (err) {
        await browser.close()
        throw err
    }
}
