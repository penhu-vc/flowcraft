/**
 * Telegram Webhook Handler
 * 處理 Telegram callback query（按鈕點擊事件）
 */

import fs from 'fs/promises'
import path from 'path'

interface CallbackQuery {
    id: string
    from: {
        id: number
        first_name: string
        username?: string
    }
    message?: {
        message_id: number
        chat: {
            id: number
        }
    }
    data: string
}

interface TelegramUpdate {
    update_id: number
    callback_query?: CallbackQuery
}

/**
 * 發送 Telegram 訊息
 */
async function sendTelegramMessage(botToken: string, chatId: number, text: string, replyToMessageId?: number) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const body: any = {
        chat_id: chatId,
        text: text
    }

    if (replyToMessageId) {
        body.reply_to_message_id = replyToMessageId
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })

    return response.json()
}

/**
 * 回應 callback query
 */
async function answerCallbackQuery(botToken: string, callbackQueryId: string) {
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId })
    })
}

/**
 * 從檔案系統讀取資料集配置
 */
async function getCollections(): Promise<any[]> {
    try {
        const dataPath = path.join(__dirname, '../data/collections.json')
        const content = await fs.readFile(dataPath, 'utf-8')
        return JSON.parse(content)
    } catch {
        return []
    }
}

/**
 * 寫入資料到資料集
 */
async function appendToCollection(collectionId: string, data: any) {
    try {
        const dataPath = path.join(__dirname, '../data/collections.json')
        let collections = await getCollections()

        // 找到或創建資料集
        let collection = collections.find((c: any) => c.id === collectionId)
        if (!collection) {
            collection = {
                id: collectionId,
                name: collectionId,
                description: '自動創建的回覆記錄資料集',
                records: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
            collections.push(collection)
        }

        // 追加記錄
        const recordId = 'record_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
        collection.records.push({
            id: recordId,
            timestamp: new Date().toISOString(),
            data
        })
        collection.updatedAt = new Date().toISOString()

        // 寫回檔案
        await fs.writeFile(dataPath, JSON.stringify(collections, null, 2))
    } catch (error) {
        console.error('寫入資料集失敗:', error)
    }
}

/**
 * 從資料集查找標籤的回應訊息
 */
async function findTagResponseMessage(collectionName: string, tagName: string, messageId: number): Promise<string> {
    try {
        const collections = await getCollections()
        const collection = collections.find((c: any) => c.name === collectionName || c.id === collectionName)

        if (!collection) {
            return '你點擊了標籤：' // 預設值
        }

        // 查找包含此 message_id 的記錄
        const record = collection.records?.find((r: any) =>
            r.data?.message_id === messageId.toString() || r.data?.message_id === messageId
        )

        if (!record || !record.data?.tags) {
            return '你點擊了標籤：'
        }

        // 從 tags 陣列找到對應的標籤
        const tag = record.data.tags.find((t: any) => t.name === tagName)
        return tag?.responseMessage || '你點擊了標籤：'
    } catch (error) {
        console.error('查找標籤回應訊息失敗:', error)
        return '你點擊了標籤：'
    }
}

/**
 * 處理 Telegram Webhook
 */
export async function handleTelegramWebhook(update: TelegramUpdate, botToken: string, _unused: string) {
    if (!update.callback_query) {
        return
    }

    const callbackQuery = update.callback_query
    const callbackData = callbackQuery.data

    // 解析 callback_data: "yaja_xxx|collectionName|tagName"
    const parts = callbackData.split('|')
    if (parts.length !== 3) {
        console.error('Invalid callback_data format:', callbackData)
        return
    }

    const [tagCode, collectionName, tagName] = parts

    // 回應 callback query（移除按鈕上的載入動畫）
    await answerCallbackQuery(botToken, callbackQuery.id)

    // 發送兩則回覆訊息
    const chatId = callbackQuery.message?.chat.id
    const messageId = callbackQuery.message?.message_id

    if (!chatId || !messageId) {
        console.error('No chat ID or message ID in callback query')
        return
    }

    // 從資料集查找標籤的回應訊息
    const responseMessage = await findTagResponseMessage(collectionName, tagName, messageId)

    // 第1則：標籤專屬回應訊息
    await sendTelegramMessage(botToken, chatId, responseMessage, messageId)

    // 第2則：純代碼
    await sendTelegramMessage(botToken, chatId, tagCode, messageId)

    // 記錄點擊事件到 {collectionName}_reply
    const replyCollectionId = collectionName + '_reply'
    await appendToCollection(replyCollectionId, {
        event_type: 'tag_clicked',
        tag_code: tagCode,
        user_id: callbackQuery.from.id,
        user_name: callbackQuery.from.first_name,
        user_username: callbackQuery.from.username,
        original_message_id: messageId,
        chat_id: chatId,
        timestamp: new Date().toISOString()
    })

    console.log('✓ 標籤點擊已記錄:', tagCode, '→', replyCollectionId)
}
