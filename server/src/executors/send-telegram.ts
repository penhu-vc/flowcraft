/**
 * Send Telegram Executor
 * 傳送訊息到 Telegram 頻道或群組
 */

import fs from 'fs/promises'

type EmitFn = (event: string, data: unknown) => void

export interface SendTelegramConfig {
    // 新版：從 SendTelegramConfig.vue 來的格式
    bots?: string           // JSON string of Bot[]
    chats?: string          // JSON string of Chat[]
    selectedBotIdx?: number
    selectedChatIdx?: number
    message: string
    parse_mode?: string
    hiddenPorts?: string
    tags?: string           // JSON string of Tag[]
    selectedTags?: string   // JSON string of string[]
    clickResponseMessage?: string
    recordCollectionId?: string
    photo?: string          // 圖片 URL（選填）
    youtubeUrl?: string     // YouTube 影片連結（選填，用於「打開影片」按鈕）

    // 舊版相容：直接傳入的格式
    bot_token?: string
    chat_id?: string
    chatUrl?: string
    thread_id?: string
}

interface Bot {
    name: string
    token: string
}

interface Chat {
    name: string
    chat_id: string
    type: 'normal' | 'supergroup'
    thread_id?: string
}

interface Tag {
    name: string
    code: string
    responseMessage: string
}

/**
 * 從 Telegram URL 提取 chat ID
 *
 * 支援的格式：
 * - https://t.me/c/1234567890/123 → -1001234567890
 * - 直接輸入 chat ID: -1002264990839
 */
function extractChatId(input: string): string {
    // 如果已經是數字格式，直接返回
    if (/^-?\d+$/.test(input.trim())) {
        return input.trim()
    }

    // 解析 t.me/c/ 格式的連結
    const match = input.match(/t\.me\/c\/(\d+)/)
    if (match) {
        // 私人群組：加上 -100 前綴
        return `-100${match[1]}`
    }

    // 如果都不匹配，返回原始輸入（可能是公開頻道名稱如 @channel）
    return input.trim()
}

export async function executeSendTelegram(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ success: boolean; message_id?: string; tags?: Array<{ name: string; code: string }>; recordCollectionId?: string }> {
    const typedConfig = config as unknown as SendTelegramConfig

    const hasPhoto = typedConfig.photo && typedConfig.photo.trim() !== ''
    emit('node:log', { message: hasPhoto ? '📸 準備發送 Telegram 圖片訊息' : '✈️ 準備發送 Telegram 訊息' })

    // Debug: 輸出 config 內容
    emit('node:log', { message: `Config keys: ${Object.keys(config).join(', ')}` })

    const messageText = typedConfig.message || (config.message as string)
    if (!messageText || messageText.trim() === '') {
        throw new Error('Send Telegram executor: message is required (訊息內容不能為空)')
    }

    emit('node:log', { message: `訊息長度: ${messageText.length} 字元` })

    // ── 解析 Bot Token ────────────────────────────────────────────
    let botToken: string

    if (typedConfig.bot_token) {
        // 舊版格式：直接傳入 bot_token
        botToken = typedConfig.bot_token
    } else if (typedConfig.bots) {
        // 新版格式：從 bots 陣列取出
        try {
            const bots: Bot[] = JSON.parse(typedConfig.bots)
            const selectedIdx = typedConfig.selectedBotIdx ?? 0
            const selectedBot = bots[selectedIdx]

            if (!selectedBot) {
                throw new Error(`未找到選中的 Bot (index: ${selectedIdx})`)
            }

            botToken = selectedBot.token
            emit('node:log', { message: `使用 Bot: ${selectedBot.name}` })
        } catch (err) {
            throw new Error(`解析 Bot 設定失敗: ${err instanceof Error ? err.message : String(err)}`)
        }
    } else {
        throw new Error('Send Telegram executor: 未設定 Bot（請在節點中設定 Bot 帳號）')
    }

    // ── 解析 Chat ID ──────────────────────────────────────────────
    let chatId: string
    let threadId: string | undefined

    if (typedConfig.chatUrl) {
        // 舊版：從 URL 提取
        chatId = extractChatId(typedConfig.chatUrl)
        threadId = typedConfig.thread_id
        emit('node:log', { message: `從連結提取 Chat ID: ${chatId}` })
    } else if (typedConfig.chat_id) {
        // 舊版：直接傳入
        chatId = typedConfig.chat_id
        threadId = typedConfig.thread_id
    } else if (typedConfig.chats) {
        // 新版格式：從 chats 陣列取出
        try {
            const chats: Chat[] = JSON.parse(typedConfig.chats)
            const selectedIdx = typedConfig.selectedChatIdx ?? 0
            const selectedChat = chats[selectedIdx]

            if (!selectedChat) {
                throw new Error(`未找到選中的 Chat (index: ${selectedIdx})`)
            }

            chatId = selectedChat.chat_id
            threadId = selectedChat.thread_id
            emit('node:log', { message: `發送到: ${selectedChat.name} (${chatId})` })
        } catch (err) {
            throw new Error(`解析 Chat 設定失敗: ${err instanceof Error ? err.message : String(err)}`)
        }
    } else {
        throw new Error('Send Telegram executor: 未設定 Chat 目標（請在節點中設定 Chat）')
    }

    emit('node:log', { message: `Chat ID: ${chatId}` })

    // ── 解析標籤並構建 Inline Keyboard ────────────────────────────
    let selectedTagsData: Array<{ name: string; code: string }> = []
    const recordCollectionId = typedConfig.recordCollectionId || ''

    if (typedConfig.tags && typedConfig.selectedTags) {
        try {
            const allTags: Tag[] = JSON.parse(typedConfig.tags)
            const selectedTagNames: string[] = JSON.parse(typedConfig.selectedTags)

            selectedTagsData = allTags.filter(tag => selectedTagNames.includes(tag.name))

            if (selectedTagsData.length > 0) {
                emit('node:log', { message: `已選標籤: ${selectedTagsData.map(t => t.name).join(', ')}` })
            }
        } catch (err) {
            emit('node:log', { message: `⚠️ 解析標籤失敗: ${err instanceof Error ? err.message : String(err)}` })
        }
    }

    // 決定使用 sendPhoto 或 sendMessage
    const apiMethod = hasPhoto ? 'sendPhoto' : 'sendMessage'
    const url = `https://api.telegram.org/bot${botToken}/${apiMethod}`

    const body: Record<string, unknown> = {
        chat_id: chatId
    }

    if (hasPhoto) {
        // sendPhoto
        body.photo = typedConfig.photo
        if (messageText && messageText.trim() !== '') {
            body.caption = messageText
            if (typedConfig.parse_mode) {
                body.parse_mode = typedConfig.parse_mode
            }
        }
        emit('node:log', { message: `圖片 URL: ${typedConfig.photo}` })
        if (messageText) {
            emit('node:log', { message: `圖片說明: ${messageText.substring(0, 50)}...` })
        }
    } else {
        // sendMessage
        body.text = messageText
        if (typedConfig.parse_mode) {
            body.parse_mode = typedConfig.parse_mode
        }
    }

    if (threadId) {
        body.message_thread_id = threadId
    }

    // 構建 Inline Keyboard
    const buttons: Array<{ text: string; callback_data?: string; url?: string }> = []

    // 加入標籤按鈕（即使沒有 recordCollectionId 也顯示，但點擊不會記錄）
    if (selectedTagsData.length > 0) {
        selectedTagsData.forEach(tag => {
            buttons.push({
                text: tag.name,
                callback_data: `${tag.code}|${recordCollectionId || '_no_record'}|${tag.name}`
            })
        })
    }

    // 加入 YouTube 打開影片按鈕
    if (typedConfig.youtubeUrl) {
        buttons.push({
            text: '🎬 打開影片',
            url: typedConfig.youtubeUrl
        })
    }

    // 如果有任何按鈕，就設定 reply_markup
    if (buttons.length > 0) {
        body.reply_markup = {
            inline_keyboard: [buttons]
        }

        const tagCount = selectedTagsData.length
        const hasYouTube = typedConfig.youtubeUrl ? 1 : 0
        emit('node:log', { message: `✓ 已加入 ${buttons.length} 個按鈕 (標籤: ${tagCount}, YouTube: ${hasYouTube})` })
    }

    try {
        let response: Response

        // 檢查是否為本地檔案路徑（有圖片且以 / 或 ./ 開頭）
        const isLocalFile = hasPhoto && typeof typedConfig.photo === 'string' &&
            (typedConfig.photo.startsWith('/') || typedConfig.photo.startsWith('./'))

        if (isLocalFile) {
            // 使用 FormData 上傳本地檔案
            emit('node:log', { message: `📤 上傳本地檔案: ${typedConfig.photo}` })

            const fileBuffer = await fs.readFile(typedConfig.photo as string)
            const blob = new Blob([fileBuffer], { type: 'image/jpeg' })
            const formData = new FormData()

            formData.append('chat_id', chatId)
            formData.append('photo', blob, 'photo.jpg')

            if (messageText && messageText.trim() !== '') {
                formData.append('caption', messageText)
                if (typedConfig.parse_mode) {
                    formData.append('parse_mode', typedConfig.parse_mode)
                }
            }

            if (threadId) {
                formData.append('message_thread_id', threadId)
            }

            // 如果有按鈕，加入 reply_markup
            if (buttons.length > 0) {
                formData.append('reply_markup', JSON.stringify({ inline_keyboard: [buttons] }))
            }

            response = await fetch(url, {
                method: 'POST',
                body: formData as any
            })
        } else {
            // 使用 JSON 發送（URL 或純文字）
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
        }

        const result = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string }

        if (!result.ok) {
            // 如果是 Markdown 解析錯誤，嘗試不帶 parse_mode 重試
            if (result.description?.includes("parse entities") && typedConfig.parse_mode) {
                emit('node:log', { message: `⚠️ Markdown 解析失敗，改用純文字重試` })

                // 根據發送方式重新構建請求
                if (isLocalFile) {
                    // 重新建立 FormData（不帶 parse_mode）
                    const fileBuffer = await fs.readFile(typedConfig.photo as string)
                    const blob = new Blob([fileBuffer], { type: 'image/jpeg' })
                    const retryFormData = new FormData()

                    retryFormData.append('chat_id', chatId)
                    retryFormData.append('photo', blob, 'photo.jpg')

                    if (messageText && messageText.trim() !== '') {
                        retryFormData.append('caption', messageText)
                        // 不加 parse_mode
                    }

                    if (threadId) {
                        retryFormData.append('message_thread_id', threadId)
                    }

                    if (buttons.length > 0) {
                        retryFormData.append('reply_markup', JSON.stringify({ inline_keyboard: [buttons] }))
                    }

                    response = await fetch(url, {
                        method: 'POST',
                        body: retryFormData as any
                    })
                } else {
                    // JSON 發送（不帶 parse_mode）
                    delete body.parse_mode

                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    })
                }

                const retryResult = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string }

                if (!retryResult.ok) {
                    throw new Error(`Telegram API error: ${retryResult.description || 'Unknown error'}`)
                }

                emit('node:log', { message: `✅ 已改用純文字發送` })
                return {
                    success: true,
                    message_id: retryResult.result?.message_id?.toString(),
                    tags: selectedTagsData.length > 0 ? selectedTagsData : undefined,
                    recordCollectionId: recordCollectionId || undefined
                }
            }

            throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`)
        }

        const successMsg = hasPhoto ? '✅ 圖片訊息已發送' : '✅ 訊息已發送'
        emit('node:log', { message: `${successMsg} (Message ID: ${result.result?.message_id})` })

        return {
            success: true,
            message_id: result.result?.message_id?.toString(),
            tags: selectedTagsData.length > 0 ? selectedTagsData : undefined,
            recordCollectionId: recordCollectionId || undefined
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        emit('node:log', { message: `❌ 發送失敗: ${errorMessage}` })
        throw error
    }
}
