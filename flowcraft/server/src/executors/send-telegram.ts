/**
 * Send Telegram Executor
 * 傳送訊息到 Telegram 頻道或群組
 */

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
): Promise<{ success: boolean; message_id?: string }> {
    const typedConfig = config as unknown as SendTelegramConfig

    emit('node:log', { message: '✈️ 準備發送 Telegram 訊息' })

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

    // 發送訊息
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const body: Record<string, unknown> = {
        chat_id: chatId,
        text: messageText
    }

    if (typedConfig.parse_mode) {
        body.parse_mode = typedConfig.parse_mode
    }

    if (threadId) {
        body.message_thread_id = threadId
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })

        const result = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string }

        if (!result.ok) {
            throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`)
        }

        emit('node:log', { message: `✅ 訊息已發送 (Message ID: ${result.result?.message_id})` })

        return {
            success: true,
            message_id: result.result?.message_id?.toString()
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        emit('node:log', { message: `❌ 發送失敗: ${errorMessage}` })
        throw error
    }
}
