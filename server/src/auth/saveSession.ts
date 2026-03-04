/**
 * Google Session Saver
 * Run once to manually log in to Google, then saves the session cookie.
 * Usage: npm run auth:notebooklm
 */

import path from 'path'
import fs from 'fs'
import { chromium } from 'patchright'

const SESSION_DIR = path.join(__dirname, '../../sessions')
const SESSION_PATH = path.join(SESSION_DIR, 'notebooklm.json')

async function main() {

    console.log('\n🔐 NotebookLM 首次登入設定')
    console.log('──────────────────────────────────────────')
    console.log('1. 瀏覽器視窗將會打開')
    console.log('2. 請用你的 Google 帳號登入 NotebookLM')
    console.log('3. 登入完成後，回到這個終端機按下 Enter 儲存 session\n')
    await startAuthFlow()
    process.exit(0)
}

/** Open a headed browser for manual Google login and save the session. */
export async function startAuthFlow(): Promise<void> {
    const browser = await chromium.launch({
        headless: false,
        channel: 'chrome',  // 使用系統安裝的 Chrome
        args: ['--start-maximized'],
    })

    const context = await browser.newContext({ viewport: null })
    const page = await context.newPage()

    await page.goto('https://notebooklm.google.com', { waitUntil: 'networkidle' })

    // Wait for user to manually log in
    console.log('請在瀏覽器中完成登入，完成後按 Enter...')
    await new Promise<void>((resolve) => {
        process.stdin.once('data', () => resolve())
    })

    // Save session
    const storageState = await context.storageState()
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })
    fs.writeFileSync(SESSION_PATH, JSON.stringify(storageState, null, 2))

    console.log(`\n✅ Session 已儲存到: ${SESSION_PATH}`)
    console.log('之後執行節點時將自動使用此 session，無需再次登入。\n')

    await browser.close()
}

// Only run when executed directly (not when imported)
if (require.main === module) {
    main().catch((err) => {
        console.error('Auth failed:', err)
        process.exit(1)
    })
}
