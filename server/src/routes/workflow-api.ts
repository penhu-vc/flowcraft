/**
 * workflow-api.ts — Programmatic API for building and mutating workflows
 *
 * Endpoints:
 *   GET    /api/workflow-api/registry              List all node types with port definitions
 *   GET    /api/workflow-api/:wfId/nodes           List nodes in a workflow
 *   POST   /api/workflow-api/:wfId/add-node        Add a node { nodeType, position?, config? }
 *   DELETE /api/workflow-api/:wfId/node/:nodeId    Remove a node and its connected edges
 *   POST   /api/workflow-api/:wfId/connect         Connect two nodes { sourceId, sourcePort, targetId, targetPort }
 *   DELETE /api/workflow-api/:wfId/edge/:edgeId    Remove an edge
 *   POST   /api/workflow-api/:wfId/auto-connect    Auto-connect matching ports { sourceId, targetId }
 *   POST   /api/workflow-api/:wfId/build           Build entire workflow from a high-level spec
 *   GET    /api/workflow-api/:wfId/export          Export workflow as JSON
 *   POST   /api/workflow-api/import                Import workflow from JSON
 */

import { Router } from 'express'
import { Server as SocketIO } from 'socket.io'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getDataDir } from '../dataDir'

// ── Inline registry (server-side mirror of src/nodes/registry.ts) ─────────────

export type FieldType = 'string' | 'number' | 'boolean' | 'select' | 'textarea' | 'password'

export interface FieldDef {
    key: string
    label: string
    type: FieldType
    required?: boolean
    default?: string | number | boolean
    options?: { label: string; value: string }[]
    placeholder?: string
    description?: string
}

export interface PortDef {
    key: string
    label: string
    type: string
}

export interface NodeDef {
    id: string
    name: string
    category: string
    icon: string
    description: string
    version: string
    inputs: FieldDef[]
    outputs: PortDef[]
    triggerType?: 'cron' | 'webhook' | 'manual'
    defaultCron?: string
    customConfig?: string
}

const NODE_REGISTRY: NodeDef[] = [
    // ─── TRIGGERS ─────────────────────────────────────────────────────────────
    {
        id: 'youtube-monitor',
        name: 'YouTube Monitor',
        category: 'trigger',
        icon: '▶️',
        description: '監控多個 YouTube 頻道，偵測新影片時觸發',
        version: '2.0.0',
        triggerType: 'cron',
        defaultCron: '*/30 * * * *',
        customConfig: 'YouTubeMonitorConfig',
        inputs: [
            { key: 'channels', label: '監控頻道列表', type: 'string' },
            { key: 'interval', label: '檢查間隔（分鐘）', type: 'number', default: 30 },
        ],
        outputs: [
            { key: 'video', label: '影片物件', type: 'object' },
            { key: 'channel_name', label: '頻道名稱', type: 'string' },
            { key: 'title', label: '影片標題', type: 'string' },
            { key: 'url', label: '影片網址', type: 'string' },
            { key: 'thumbnail', label: '縮圖網址', type: 'string' },
            { key: 'live_viewers', label: '直播觀看人數', type: 'number' },
            { key: 'duration', label: '影片時長(秒)', type: 'number' },
            { key: 'premiere_at', label: '首播時間', type: 'string' },
            { key: 'playlist_name', label: '播放清單名稱', type: 'string' },
            { key: 'subscribers', label: '訂閱人數', type: 'number' },
            { key: 'views', label: '總觀看數', type: 'number' },
            { key: 'video_count', label: '影片總數', type: 'number' },
            { key: 'delta', label: '變化量', type: 'object' },
            { key: 'matched_keyword', label: '匹配關鍵字', type: 'string' },
        ],
    },
    {
        id: 'telegram-trigger',
        name: 'Telegram Trigger',
        category: 'trigger',
        icon: '✈️',
        description: '收到 Telegram 訊息時觸發',
        version: '1.0.0',
        triggerType: 'webhook',
        inputs: [
            { key: 'bot_token', label: 'Bot Token', type: 'password', required: true },
            { key: 'filter_text', label: '關鍵字過濾（選填）', type: 'string' },
        ],
        outputs: [
            { key: 'message', label: '訊息內容', type: 'string' },
            { key: 'from', label: '發送者', type: 'object' },
            { key: 'chat_id', label: 'Chat ID', type: 'string' },
        ],
    },
    {
        id: 'discord-trigger',
        name: 'Discord Trigger',
        category: 'trigger',
        icon: '🎮',
        description: '收到 Discord 訊息或事件時觸發',
        version: '1.0.0',
        triggerType: 'webhook',
        inputs: [
            { key: 'webhook_url', label: 'Webhook URL', type: 'password', required: true },
            { key: 'channel_id', label: '頻道 ID（選填）', type: 'string' },
            { key: 'filter_text', label: '關鍵字過濾（選填）', type: 'string' },
        ],
        outputs: [
            { key: 'message', label: '訊息內容', type: 'string' },
            { key: 'author', label: '作者', type: 'object' },
            { key: 'channel', label: '頻道', type: 'string' },
        ],
    },
    {
        id: 'schedule-trigger',
        name: 'Schedule',
        category: 'trigger',
        icon: '⏰',
        description: '定時觸發，支援 Cron 表達式',
        version: '1.0.0',
        triggerType: 'cron',
        defaultCron: '0 9 * * *',
        inputs: [
            { key: 'cron', label: 'Cron 表達式', type: 'string', required: true, default: '0 9 * * *' },
            {
                key: 'timezone', label: '時區', type: 'select', default: 'Asia/Taipei', options: [
                    { label: 'Asia/Taipei', value: 'Asia/Taipei' },
                    { label: 'UTC', value: 'UTC' },
                    { label: 'America/New_York', value: 'America/New_York' },
                ]
            },
        ],
        outputs: [
            { key: 'timestamp', label: '觸發時間', type: 'string' },
        ],
    },
    {
        id: 'rss-trigger',
        name: 'RSS Feed',
        category: 'trigger',
        icon: '📡',
        description: '監控任意 RSS/Atom 訂閱源有無更新',
        version: '1.0.0',
        triggerType: 'cron',
        defaultCron: '*/60 * * * *',
        inputs: [
            { key: 'feed_url', label: 'Feed URL', type: 'string', required: true },
            { key: 'interval', label: '檢查間隔（分鐘）', type: 'number', default: 60 },
        ],
        outputs: [
            { key: 'item', label: '新文章', type: 'object' },
            { key: 'title', label: '標題', type: 'string' },
            { key: 'link', label: '連結', type: 'string' },
        ],
    },
    {
        id: 'manual-trigger',
        name: 'Manual Trigger',
        category: 'trigger',
        icon: '▶️',
        description: '手動觸發，點擊按鈕立即執行工作流',
        version: '1.0.0',
        triggerType: 'manual',
        inputs: [
            { key: 'payload', label: '自訂資料（JSON，選填）', type: 'textarea' },
        ],
        outputs: [
            { key: 'timestamp', label: '觸發時間', type: 'string' },
            { key: 'data', label: '自訂資料', type: 'object' },
        ],
    },
    {
        id: 'article-trigger',
        name: '文章觸發器',
        category: 'trigger',
        icon: '📄',
        description: '手動貼上文章內容，輸出純文字給下游節點處理',
        version: '1.0.0',
        triggerType: 'manual',
        inputs: [
            { key: 'article', label: '文章內容', type: 'textarea', required: true },
        ],
        outputs: [
            { key: 'text', label: '文字內容', type: 'string' },
            { key: 'length', label: '字數', type: 'number' },
            { key: 'timestamp', label: '觸發時間', type: 'string' },
        ],
    },
    {
        id: 'youtube-recent-videos',
        name: 'YouTube 最近影片',
        category: 'trigger',
        icon: '📹',
        description: 'YouTube 頻道最近 5 支影片選擇器（RSS Feed）',
        version: '1.1.0',
        customConfig: 'YouTubeRecentVideosConfig',
        inputs: [],
        outputs: [
            { key: 'url', label: '影片 URL', type: 'string' },
            { key: 'videoId', label: '影片 ID', type: 'string' },
            { key: 'title', label: '標題', type: 'string' },
            { key: 'publishedAt', label: '發布日期', type: 'string' },
        ],
    },

    // ─── ACTIONS ──────────────────────────────────────────────────────────────
    {
        id: 'send-telegram',
        name: 'Send Telegram',
        category: 'action',
        icon: '✈️',
        description: '傳送訊息或圖片到 Telegram 頻道或群組',
        version: '2.4.0',
        customConfig: 'SendTelegramConfig',
        inputs: [
            { key: 'bot_token', label: 'Bot Token', type: 'password', required: true },
            { key: 'chatUrl', label: '聊天連結或 Chat ID', type: 'string' },
            { key: 'chat_id', label: 'Chat ID (備用)', type: 'string' },
            { key: 'photo', label: '圖片 (選填)', type: 'string' },
            { key: 'youtubeUrl', label: 'YouTube 連結 (選填)', type: 'string' },
            { key: 'message', label: '訊息內容', type: 'textarea', required: true },
            { key: 'thread_id', label: 'Thread ID (選填)', type: 'string' },
            {
                key: 'parse_mode', label: '格式', type: 'select', default: 'Markdown', options: [
                    { label: 'Markdown', value: 'Markdown' },
                    { label: 'HTML', value: 'HTML' },
                    { label: '純文字', value: '' },
                ]
            },
        ],
        outputs: [
            { key: 'success', label: '成功', type: 'boolean' },
            { key: 'message_id', label: '訊息 ID', type: 'string' },
            { key: 'tags', label: '標籤資料', type: 'array' },
            { key: 'recordCollectionId', label: '記錄資料集 ID', type: 'string' },
        ],
    },
    {
        id: 'send-discord',
        name: 'Send Discord',
        category: 'action',
        icon: '🎮',
        description: '發送訊息或 Embed 到 Discord 頻道',
        version: '1.0.0',
        inputs: [
            { key: 'webhook_url', label: 'Webhook URL', type: 'password', required: true },
            { key: 'content', label: '訊息內容', type: 'textarea' },
            { key: 'embed_title', label: 'Embed 標題（選填）', type: 'string' },
            { key: 'embed_color', label: 'Embed 顏色（十六進位）', type: 'string', default: '7289da' },
        ],
        outputs: [
            { key: 'success', label: '成功', type: 'boolean' },
        ],
    },
    {
        id: 'http-request',
        name: 'HTTP Request',
        category: 'action',
        icon: '🌐',
        description: '呼叫任意外部 API (GET/POST/PUT/DELETE)',
        version: '1.0.0',
        inputs: [
            { key: 'url', label: 'URL', type: 'string', required: true },
            {
                key: 'method', label: 'Method', type: 'select', default: 'GET', options: [
                    { label: 'GET', value: 'GET' },
                    { label: 'POST', value: 'POST' },
                    { label: 'PUT', value: 'PUT' },
                    { label: 'DELETE', value: 'DELETE' },
                ]
            },
            { key: 'headers', label: 'Headers (JSON)', type: 'textarea' },
            { key: 'body', label: 'Body (JSON)', type: 'textarea' },
        ],
        outputs: [
            { key: 'body', label: '回應內容', type: 'object' },
            { key: 'status', label: 'HTTP 狀態碼', type: 'number' },
        ],
    },

    // ─── AI ───────────────────────────────────────────────────────────────────
    {
        id: 'notebooklm',
        name: 'NotebookLM',
        category: 'ai',
        icon: '📓',
        description: 'Patchright 自動操作 NotebookLM，分析影片或文件並返回 AI 摘要',
        version: '2.0.0',
        customConfig: 'NotebookLMConfig',
        inputs: [
            { key: 'url', label: '內容網址 (YouTube / 網頁)', type: 'string', required: true },
            { key: 'prompt', label: '提示詞', type: 'textarea', required: true },
            { key: 'timeout', label: '逾時（秒）', type: 'number', default: 120 },
        ],
        outputs: [
            { key: 'result', label: 'AI 回應', type: 'string' },
            { key: 'notebook_url', label: 'Notebook 網址', type: 'string' },
        ],
    },
    {
        id: 'llm-generate',
        name: 'LLM 文字生成',
        category: 'ai',
        icon: '🤖',
        description: '呼叫 LLM API 進行文字生成（支援多 AI Provider）',
        version: '2.0.0',
        inputs: [
            {
                key: 'aiProvider', label: 'AI 供應商', type: 'select', default: 'openai', options: [
                    { label: 'OpenAI GPT', value: 'openai' },
                    { label: 'Gemini', value: 'gemini' },
                    { label: 'Anthropic Claude', value: 'anthropic' },
                    { label: 'Custom', value: 'custom' },
                ]
            },
            { key: 'aiApiKey', label: 'AI API Key', type: 'password' },
            { key: 'aiBaseUrl', label: 'AI Base URL（選填）', type: 'string' },
            { key: 'model', label: '模型名稱', type: 'string', default: 'gpt-4o' },
            { key: 'prompt', label: '提示詞', type: 'textarea', required: true },
            { key: 'max_tokens', label: '最大 Token 數', type: 'number', default: 1000 },
        ],
        outputs: [
            { key: 'text', label: '生成文字', type: 'string' },
            { key: 'tokens_used', label: '使用 Token', type: 'number' },
        ],
    },
    {
        id: 'translate',
        name: 'Translate',
        category: 'ai',
        icon: '🌍',
        description: '多語言翻譯',
        version: '1.0.0',
        inputs: [
            { key: 'text', label: '輸入文字', type: 'textarea', required: true },
            {
                key: 'target_lang', label: '目標語言', type: 'select', default: 'zh-TW', options: [
                    { label: '繁體中文', value: 'zh-TW' },
                    { label: '英文', value: 'en' },
                    { label: '日文', value: 'ja' },
                    { label: '韓文', value: 'ko' },
                ]
            },
        ],
        outputs: [
            { key: 'translated', label: '翻譯結果', type: 'string' },
        ],
    },
    {
        id: 'skill5',
        name: 'Script Pipeline Producer',
        category: 'ai',
        icon: '📝',
        description: '將 script-pipeline-producer 前 5 步整合成單一節點',
        version: '3.0.0',
        inputs: [
            { key: 'source', label: '素材來源', type: 'textarea', required: true },
            { key: 'youtubeUrl', label: 'YouTube URL (選填)', type: 'string' },
            { key: 'aiProvider', label: 'AI 供應商', type: 'select', default: 'gemini' },
            { key: 'aiApiKey', label: 'AI API Key', type: 'password' },
            { key: 'model', label: '模型名稱', type: 'string', default: 'gemini-2.0-flash' },
            { key: 'prompt', label: '額外指示（選填）', type: 'textarea' },
            { key: 'feedback', label: 'Feedback（迭代用）', type: 'textarea' },
        ],
        outputs: [
            { key: 'result', label: '腳本', type: 'string' },
            { key: 'baseDraft', label: 'Base Draft', type: 'string' },
            { key: 'mining', label: 'Mining 結果', type: 'string' },
            { key: 'review', label: '審核報告', type: 'string' },
        ],
    },
    {
        id: 'fact-check-95',
        name: '事實查核 95 改寫',
        category: 'ai',
        icon: '🔍',
        description: '事實查核後改寫成高轉換率內容',
        version: '2.0.0',
        inputs: [
            { key: 'source', label: '原始素材', type: 'textarea', required: true },
            { key: 'youtubeUrl', label: 'YouTube URL (選填)', type: 'string' },
            { key: 'aiProvider', label: 'AI 供應商', type: 'select', default: 'gemini' },
            { key: 'aiApiKey', label: 'AI API Key', type: 'password' },
            { key: 'model', label: '模型名稱', type: 'string', default: 'gemini-2.0-flash' },
            { key: 'targetReader', label: '目標讀者', type: 'string', default: '一般讀者' },
            { key: 'tone', label: '語氣風格', type: 'string', default: '台灣口語' },
        ],
        outputs: [
            { key: 'result', label: '改寫結果', type: 'string' },
            { key: 'factLedger', label: '事實清單', type: 'string' },
        ],
    },
    {
        id: 'segment-mining',
        name: '分段採礦器',
        category: 'ai',
        icon: '⛏️',
        description: '把來源素材拆成可重組的段落素材 schema',
        version: '1.0.0',
        customConfig: 'SegmentMiningConfig',
        inputs: [
            { key: 'source', label: '來源素材', type: 'textarea', required: true },
            { key: 'aiProvider', label: 'AI 供應商', type: 'select', default: 'gemini' },
            { key: 'aiApiKey', label: 'AI API Key', type: 'password' },
            { key: 'model', label: '模型名稱', type: 'string', default: 'gemini-2.0-flash' },
            { key: 'temperature', label: '創意度', type: 'number', default: 0.3 },
        ],
        outputs: [
            { key: 'result', label: '結構化素材 (YAML)', type: 'string' },
        ],
    },
    {
        id: 'script-generator',
        name: '劇本指令｜爆裂口播 v2',
        category: 'ai',
        icon: '🎬',
        description: '接在礦機節點後，將結構化素材轉換成爆裂短句口播稿',
        version: '1.0.0',
        inputs: [
            { key: 'source', label: '來源素材', type: 'textarea', required: true },
            { key: 'reference', label: '參考資料（選填）', type: 'textarea' },
            { key: 'aiProvider', label: 'AI 供應商', type: 'select', default: 'gemini' },
            { key: 'aiApiKey', label: 'AI API Key', type: 'password' },
            { key: 'model', label: '模型名稱', type: 'string', default: 'gemini-2.0-flash' },
            { key: 'temperature', label: '創意度', type: 'number', default: 1.0 },
        ],
        outputs: [
            { key: 'result', label: '劇本', type: 'string' },
            { key: 'script', label: '劇本（同 result）', type: 'string' },
            { key: 'keywords', label: '關鍵字候選', type: 'array' },
        ],
    },

    // ─── DATA ─────────────────────────────────────────────────────────────────
    {
        id: 'google-sheets',
        name: 'Data (Google Sheets)',
        category: 'data',
        icon: '📊',
        description: '讀取或寫入 Google 試算表',
        version: '1.0.0',
        inputs: [
            {
                key: 'action', label: '操作', type: 'select', default: 'read', options: [
                    { label: '讀取 (read)', value: 'read' },
                    { label: '新增列 (append)', value: 'append' },
                    { label: '更新 (update)', value: 'update' },
                ]
            },
            { key: 'spreadsheet_id', label: '試算表 ID', type: 'string', required: true },
            { key: 'sheet_name', label: '工作表名稱', type: 'string', default: 'Sheet1' },
            { key: 'range', label: '範圍', type: 'string' },
            { key: 'data', label: '寫入資料（JSON）', type: 'textarea' },
            { key: 'credentials_json', label: 'Service Account JSON', type: 'textarea', required: true },
        ],
        outputs: [
            { key: 'rows', label: '資料列', type: 'array' },
            { key: 'status', label: '狀態', type: 'string' },
        ],
    },
    {
        id: 'bullet-point-reference',
        name: '列點型參考',
        category: 'data',
        icon: '📋',
        description: '整理和管理列點資料',
        version: '1.0.0',
        customConfig: 'BulletPointReferenceConfig',
        inputs: [
            { key: 'items', label: '列點資料（JSON）', type: 'textarea' },
        ],
        outputs: [
            { key: 'result', label: '格式化列點', type: 'string' },
            { key: 'items', label: '列點陣列', type: 'array' },
        ],
    },
    {
        id: 'write-collection',
        name: '寫入資料集',
        category: 'data',
        icon: '💾',
        description: '將節點輸出的資料寫入指定的資料集',
        version: '1.0.0',
        customConfig: 'WriteCollectionConfig',
        inputs: [
            { key: 'collectionId', label: '資料集 ID', type: 'string', required: true },
            { key: 'data', label: '要寫入的資料', type: 'textarea', required: true },
        ],
        outputs: [
            { key: 'success', label: '寫入成功', type: 'boolean' },
            { key: 'recordId', label: '記錄 ID', type: 'string' },
        ],
    },
    {
        id: 'execution-logger',
        name: '執行記錄器',
        category: 'data',
        icon: '📝',
        description: '自動收集上游節點的所有輸出欄位並寫入資料集',
        version: '2.0.0',
        customConfig: 'ExecutionLoggerConfig',
        inputs: [
            { key: 'collectionId', label: '資料集 ID', type: 'string', required: true },
            { key: 'data', label: '資料（自動收集所有欄位）', type: 'object' as unknown as FieldType },
        ],
        outputs: [
            { key: 'success', label: '寫入成功', type: 'boolean' },
            { key: 'record', label: '記錄資料', type: 'object' },
        ],
    },

    // ─── MEDIA ────────────────────────────────────────────────────────────────
    {
        id: 'reels-cover',
        name: 'Reels 封面',
        category: 'media',
        icon: '🎬',
        description: '自動合成 Instagram Reels 封面圖',
        version: '1.0.0',
        inputs: [
            { key: 'title', label: '標題文字', type: 'string', required: true },
            { key: 'subtitle', label: '副標題', type: 'string' },
            { key: 'background_url', label: '背景圖片 URL', type: 'string' },
            { key: 'logo_url', label: 'Logo URL（選填）', type: 'string' },
            {
                key: 'theme', label: '主題色', type: 'select', default: 'dark', options: [
                    { label: '深色', value: 'dark' },
                    { label: '淺色', value: 'light' },
                    { label: '漸層', value: 'gradient' },
                ]
            },
        ],
        outputs: [
            { key: 'image_url', label: '封面圖網址', type: 'string' },
            { key: 'image_base64', label: 'Base64 圖片', type: 'string' },
        ],
    },
    {
        id: 'video-download',
        name: 'Video Download',
        category: 'media',
        icon: '⬇️',
        description: '下載 YouTube / Instagram 影片 (yt-dlp)',
        version: '1.0.0',
        inputs: [
            { key: 'url', label: '影片網址', type: 'string', required: true },
            {
                key: 'quality', label: '畫質', type: 'select', default: 'best', options: [
                    { label: '最佳', value: 'best' },
                    { label: '1080p', value: '1080' },
                    { label: '720p', value: '720' },
                    { label: '僅音訊 (mp3)', value: 'audio' },
                ]
            },
            { key: 'output_dir', label: '儲存路徑', type: 'string', default: '/tmp/downloads' },
        ],
        outputs: [
            { key: 'file_path', label: '本地檔案路徑', type: 'string' },
            { key: 'duration', label: '影片秒數', type: 'number' },
        ],
    },
    {
        id: 'youtube-subtitle',
        name: 'YouTube 字幕提取',
        category: 'media',
        icon: '💬',
        description: 'YouTube 字幕提取器（含自動生成字幕）',
        version: '1.2.0',
        inputs: [
            { key: 'url', label: 'YouTube 網址', type: 'string', required: true },
            { key: 'language', label: '語言代碼', type: 'string', default: 'auto' },
        ],
        outputs: [
            { key: 'success', label: '成功狀態', type: 'boolean' },
            { key: 'transcript', label: '字幕文本', type: 'string' },
            { key: 'method', label: '提取方法', type: 'string' },
            { key: 'language', label: '語言', type: 'string' },
            { key: 'url', label: '原始 URL', type: 'string' },
            { key: 'onSuccess', label: '✅ 成功 → 字幕文本', type: 'string' },
            { key: 'onFailure', label: '❌ 失敗 → 網址', type: 'string' },
        ],
    },
    {
        id: 'youtube-thumbnail',
        name: 'YouTube 封面下載',
        category: 'media',
        icon: '📸',
        description: 'YouTube 封面圖下載器',
        version: '1.1.0',
        inputs: [
            { key: 'input', label: 'YouTube URL 或縮圖地址', type: 'string', required: true },
            { key: 'savePath', label: '儲存路徑', type: 'string', default: '/tmp/yt-thumbnails' },
        ],
        outputs: [
            { key: 'thumbnail', label: '封面圖 URL', type: 'string' },
            { key: 'downloadPath', label: '下載路徑', type: 'string' },
            { key: 'photo', label: '圖片（接 Telegram）', type: 'string' },
            { key: 'videoId', label: '影片 ID', type: 'string' },
        ],
    },

    // ─── LOGIC ────────────────────────────────────────────────────────────────
    {
        id: 'filter',
        name: 'Filter',
        category: 'logic',
        icon: '🔍',
        description: '根據條件過濾資料',
        version: '1.0.0',
        inputs: [
            { key: 'field', label: '欄位名稱', type: 'string', required: true },
            {
                key: 'operator', label: '比較方式', type: 'select', default: 'contains', options: [
                    { label: '包含', value: 'contains' },
                    { label: '等於', value: 'equals' },
                    { label: '不等於', value: 'not_equals' },
                    { label: '大於', value: 'gt' },
                    { label: '小於', value: 'lt' },
                ]
            },
            { key: 'value', label: '比較值', type: 'string', required: true },
        ],
        outputs: [
            { key: 'passed', label: '通過', type: 'any' },
            { key: 'rejected', label: '不通過', type: 'any' },
        ],
    },
    {
        id: 'delay',
        name: 'Delay',
        category: 'logic',
        icon: '⏳',
        description: '工作流暫停指定時間後繼續',
        version: '1.0.0',
        inputs: [
            { key: 'seconds', label: '等待秒數', type: 'number', default: 5, required: true },
        ],
        outputs: [
            { key: 'output', label: '繼續', type: 'any' },
        ],
    },
    {
        id: 'code',
        name: 'Code',
        category: 'logic',
        icon: '💻',
        description: '執行自訂 JavaScript 程式碼片段',
        version: '1.0.0',
        inputs: [
            { key: 'code', label: 'JS 程式碼', type: 'textarea', required: true },
        ],
        outputs: [
            { key: 'result', label: '執行結果', type: 'any' },
        ],
    },
    {
        id: 'line-breaker',
        name: '分行處理器',
        category: 'logic',
        icon: '✂️',
        description: '按標點符號分段並在中英文交界處自動分行',
        version: '1.0.0',
        inputs: [
            { key: 'text', label: '輸入文字', type: 'textarea', required: true },
            { key: 'punctuations', label: '分行標點符號', type: 'string', default: '。！？，' },
            { key: 'minCharsBeforeBreak', label: '中英交界前最少字數', type: 'number', default: 5 },
        ],
        outputs: [
            { key: 'result', label: '分行結果', type: 'string' },
        ],
    },
    {
        id: 'text-constant',
        name: '純文字',
        category: 'logic',
        icon: '📝',
        description: '儲存固定文字內容，可作為模板、提示詞或常用文案',
        version: '1.0.0',
        inputs: [
            { key: 'text', label: '文字內容', type: 'textarea', required: true },
        ],
        outputs: [
            { key: 'text', label: '文字輸出', type: 'string' },
        ],
    },
    {
        id: 'comment',
        name: '備註',
        category: 'logic',
        icon: '📝',
        description: '在工作流中添加備註說明，純標注用途，不影響執行',
        version: '1.0.0',
        inputs: [],
        outputs: [],
    },
]

// ── Registry lookup helpers ────────────────────────────────────────────────────

function getNodeDef(id: string): NodeDef | undefined {
    return NODE_REGISTRY.find(n => n.id === id)
}

// ── Workflow I/O helpers ───────────────────────────────────────────────────────

interface FlowNode {
    id: string
    type: string
    position: { x: number; y: number }
    data: Record<string, unknown>
}

interface FlowEdge {
    id: string
    source: string
    sourceHandle: string
    target: string
    targetHandle: string
    type?: string
}

interface Workflow {
    id: string
    name: string
    nodes: FlowNode[]
    edges: FlowEdge[]
    [key: string]: unknown
}

const getWorkflowsFile = () => join(getDataDir(), 'workflows.json')

function loadWorkflows(): Workflow[] {
    if (!existsSync(getWorkflowsFile())) return []
    try {
        return JSON.parse(readFileSync(getWorkflowsFile(), 'utf-8'))
    } catch {
        return []
    }
}

function saveWorkflows(workflows: Workflow[]): void {
    writeFileSync(getWorkflowsFile(), JSON.stringify(workflows, null, 2), 'utf-8')
}

function findWorkflow(id: string): { workflow: Workflow; all: Workflow[] } | null {
    const all = loadWorkflows()
    const workflow = all.find(w => w.id === id)
    if (!workflow) return null
    return { workflow, all }
}

function persistWorkflow(updated: Workflow, all: Workflow[]): void {
    const idx = all.findIndex(w => w.id === updated.id)
    if (idx >= 0) all[idx] = updated
    else all.push(updated)
    saveWorkflows(all)
}

// ── Auto-layout ───────────────────────────────────────────────────────────────

const GRID_COL_WIDTH = 280
const GRID_ROW_HEIGHT = 160
const GRID_COLS = 4

function autoPosition(existingNodes: FlowNode[]): { x: number; y: number } {
    const count = existingNodes.length
    const col = count % GRID_COLS
    const row = Math.floor(count / GRID_COLS)
    return { x: col * GRID_COL_WIDTH + 80, y: row * GRID_ROW_HEIGHT + 80 }
}

// ── Port matching for auto-connect ────────────────────────────────────────────

/**
 * Normalise a port key for fuzzy comparison.
 * Strips common prefixes (out-, in-, on-), lowercases, removes hyphens/underscores.
 */
function normalisePort(key: string): string {
    return key
        .replace(/^(out[-_]|in[-_]|on[-_])/i, '')
        .replace(/[-_]/g, '')
        .toLowerCase()
}

interface PortMatch {
    sourceHandle: string
    targetHandle: string
}

/**
 * Find pairs of output→input ports that share a normalised name.
 * source outputs use handle id  "out-<key>"
 * target inputs  use handle id  "in-<key>"
 */
function matchPorts(sourceDef: NodeDef, targetDef: NodeDef): PortMatch[] {
    const matches: PortMatch[] = []
    const inputMap = new Map<string, string>() // normalisedKey → original key

    for (const inp of targetDef.inputs) {
        inputMap.set(normalisePort(inp.key), inp.key)
    }

    for (const out of sourceDef.outputs) {
        const norm = normalisePort(out.key)
        const matchedKey = inputMap.get(norm)
        if (matchedKey) {
            matches.push({
                sourceHandle: `out-${out.key}`,
                targetHandle: `in-${matchedKey}`,
            })
        }
    }

    return matches
}

// ── Build a node's data from its registry definition ─────────────────────────

function buildNodeData(def: NodeDef, config: Record<string, unknown> = {}): Record<string, unknown> {
    const defaults: Record<string, unknown> = {}

    for (const field of def.inputs) {
        if (field.default !== undefined) {
            defaults[field.key] = field.default
        }
    }

    return {
        nodeType: def.id,
        label: def.name,
        icon: def.icon,
        category: def.category,
        ...defaults,
        ...config,
    }
}

// ── Router factory ────────────────────────────────────────────────────────────

export function createWorkflowApiRouter(io: SocketIO): Router {
    const router = Router()

    // Emit helper: broadcast workflow update to all connected clients
    function emitUpdate(workflowId: string, workflow: Workflow) {
        io.emit('workflow:updated', { workflowId, workflow })
    }

    // ── GET /api/workflow-api/registry ──────────────────────────────────────
    router.get('/registry', (_req, res) => {
        const nodes = NODE_REGISTRY.map(def => ({
            type: def.id,
            label: def.name,
            category: def.category,
            icon: def.icon,
            description: def.description,
            version: def.version,
            triggerType: def.triggerType,
            inputs: def.inputs.map(f => ({
                key: f.key,
                type: f.type,
                label: f.label,
                required: f.required ?? false,
                default: f.default,
            })),
            outputs: def.outputs.map(p => ({
                key: p.key,
                type: p.type,
                label: p.label,
                handleId: `out-${p.key}`,
            })),
            configFields: def.inputs.map(f => ({
                key: f.key,
                type: f.type,
                label: f.label,
                required: f.required ?? false,
                default: f.default,
                options: f.options,
                placeholder: f.placeholder,
                description: f.description,
            })),
        }))

        res.json({ ok: true, nodes })
    })

    // ── GET /api/workflow-api/:wfId/nodes ───────────────────────────────────
    router.get('/:wfId/nodes', (req, res) => {
        const found = findWorkflow(req.params.wfId)
        if (!found) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        const { workflow } = found
        const enriched = (workflow.nodes ?? []).map((node: FlowNode) => {
            const def = getNodeDef(node.data?.nodeType as string ?? node.type)
            return {
                id: node.id,
                type: node.type,
                position: node.position,
                data: node.data,
                // attach port definitions for convenience
                ports: def
                    ? {
                        inputs: def.inputs.map(f => ({ key: f.key, handleId: `in-${f.key}`, label: f.label, type: f.type })),
                        outputs: def.outputs.map(p => ({ key: p.key, handleId: `out-${p.key}`, label: p.label, type: p.type })),
                    }
                    : null,
            }
        })

        res.json({ ok: true, workflowId: workflow.id, nodes: enriched, edges: workflow.edges ?? [] })
    })

    // ── POST /api/workflow-api/:wfId/add-node ───────────────────────────────
    router.post('/:wfId/add-node', (req, res) => {
        const found = findWorkflow(req.params.wfId)
        if (!found) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        const { nodeType, position, config = {} } = req.body as {
            nodeType: string
            position?: { x: number; y: number }
            config?: Record<string, unknown>
        }

        if (!nodeType) {
            return res.status(400).json({ ok: false, error: 'nodeType is required' })
        }

        const def = getNodeDef(nodeType)
        if (!def) {
            return res.status(400).json({
                ok: false,
                error: `Unknown nodeType "${nodeType}". Call GET /registry for valid types.`,
            })
        }

        const { workflow, all } = found
        const nodes: FlowNode[] = workflow.nodes ?? []

        const newNode: FlowNode = {
            id: `${nodeType}-${randomUUID().split('-')[0]}`,
            type: nodeType,
            position: position ?? autoPosition(nodes),
            data: buildNodeData(def, config),
        }

        workflow.nodes = [...nodes, newNode]
        persistWorkflow(workflow, all)
        emitUpdate(workflow.id, workflow)

        res.json({ ok: true, node: newNode })
    })

    // ── DELETE /api/workflow-api/:wfId/node/:nodeId ──────────────────────────
    router.delete('/:wfId/node/:nodeId', (req, res) => {
        const found = findWorkflow(req.params.wfId)
        if (!found) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        const { nodeId } = req.params
        const { workflow, all } = found

        const originalNodeCount = (workflow.nodes ?? []).length
        workflow.nodes = (workflow.nodes ?? []).filter((n: FlowNode) => n.id !== nodeId)

        if (workflow.nodes.length === originalNodeCount) {
            return res.status(404).json({ ok: false, error: `Node "${nodeId}" not found in workflow` })
        }

        // Remove all edges connected to this node
        const removedEdges = (workflow.edges ?? []).filter(
            (e: FlowEdge) => e.source === nodeId || e.target === nodeId
        ).map((e: FlowEdge) => e.id)

        workflow.edges = (workflow.edges ?? []).filter(
            (e: FlowEdge) => e.source !== nodeId && e.target !== nodeId
        )

        persistWorkflow(workflow, all)
        emitUpdate(workflow.id, workflow)

        res.json({ ok: true, removedNodeId: nodeId, removedEdgeIds: removedEdges })
    })

    // ── POST /api/workflow-api/:wfId/connect ────────────────────────────────
    router.post('/:wfId/connect', (req, res) => {
        const found = findWorkflow(req.params.wfId)
        if (!found) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        const { sourceId, sourcePort, targetId, targetPort } = req.body as {
            sourceId: string
            sourcePort: string
            targetId: string
            targetPort: string
        }

        if (!sourceId || !sourcePort || !targetId || !targetPort) {
            return res.status(400).json({
                ok: false,
                error: 'sourceId, sourcePort, targetId, targetPort are all required',
            })
        }

        const { workflow, all } = found
        const nodes: FlowNode[] = workflow.nodes ?? []

        const sourceNode = nodes.find((n: FlowNode) => n.id === sourceId)
        const targetNode = nodes.find((n: FlowNode) => n.id === targetId)

        if (!sourceNode) return res.status(404).json({ ok: false, error: `Source node "${sourceId}" not found` })
        if (!targetNode) return res.status(404).json({ ok: false, error: `Target node "${targetId}" not found` })

        // Normalise handle ids: caller may pass bare key or full handle id
        const sourceHandle = sourcePort.startsWith('out-') ? sourcePort : `out-${sourcePort}`
        const targetHandle = targetPort.startsWith('in-') ? targetPort : `in-${targetPort}`

        // Prevent duplicate edges on same handle pair
        const edges: FlowEdge[] = workflow.edges ?? []
        const duplicate = edges.find(
            (e: FlowEdge) =>
                e.source === sourceId &&
                e.sourceHandle === sourceHandle &&
                e.target === targetId &&
                e.targetHandle === targetHandle
        )
        if (duplicate) {
            return res.json({ ok: true, edge: duplicate, duplicate: true })
        }

        const newEdge: FlowEdge = {
            id: `edge-${randomUUID().split('-')[0]}`,
            source: sourceId,
            sourceHandle,
            target: targetId,
            targetHandle,
            type: 'default',
        }

        workflow.edges = [...edges, newEdge]
        persistWorkflow(workflow, all)
        emitUpdate(workflow.id, workflow)

        res.json({ ok: true, edge: newEdge })
    })

    // ── DELETE /api/workflow-api/:wfId/edge/:edgeId ──────────────────────────
    router.delete('/:wfId/edge/:edgeId', (req, res) => {
        const found = findWorkflow(req.params.wfId)
        if (!found) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        const { edgeId } = req.params
        const { workflow, all } = found

        const originalCount = (workflow.edges ?? []).length
        workflow.edges = (workflow.edges ?? []).filter((e: FlowEdge) => e.id !== edgeId)

        if (workflow.edges.length === originalCount) {
            return res.status(404).json({ ok: false, error: `Edge "${edgeId}" not found` })
        }

        persistWorkflow(workflow, all)
        emitUpdate(workflow.id, workflow)

        res.json({ ok: true, removedEdgeId: edgeId })
    })

    // ── POST /api/workflow-api/:wfId/auto-connect ───────────────────────────
    router.post('/:wfId/auto-connect', (req, res) => {
        const found = findWorkflow(req.params.wfId)
        if (!found) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        const { sourceId, targetId } = req.body as { sourceId: string; targetId: string }
        if (!sourceId || !targetId) {
            return res.status(400).json({ ok: false, error: 'sourceId and targetId are required' })
        }

        const { workflow, all } = found
        const nodes: FlowNode[] = workflow.nodes ?? []

        const sourceNode = nodes.find((n: FlowNode) => n.id === sourceId)
        const targetNode = nodes.find((n: FlowNode) => n.id === targetId)

        if (!sourceNode) return res.status(404).json({ ok: false, error: `Source node "${sourceId}" not found` })
        if (!targetNode) return res.status(404).json({ ok: false, error: `Target node "${targetId}" not found` })

        const sourceType = (sourceNode.data?.nodeType as string) ?? sourceNode.type
        const targetType = (targetNode.data?.nodeType as string) ?? targetNode.type

        const sourceDef = getNodeDef(sourceType)
        const targetDef = getNodeDef(targetType)

        if (!sourceDef) return res.status(400).json({ ok: false, error: `No registry entry for source type "${sourceType}"` })
        if (!targetDef) return res.status(400).json({ ok: false, error: `No registry entry for target type "${targetType}"` })

        const portMatches = matchPorts(sourceDef, targetDef)
        if (portMatches.length === 0) {
            return res.json({ ok: true, connected: [], message: 'No matching ports found between the two nodes' })
        }

        const existingEdges: FlowEdge[] = workflow.edges ?? []
        const newEdges: FlowEdge[] = []

        for (const match of portMatches) {
            const alreadyExists = existingEdges.some(
                e =>
                    e.source === sourceId &&
                    e.sourceHandle === match.sourceHandle &&
                    e.target === targetId &&
                    e.targetHandle === match.targetHandle
            )
            if (!alreadyExists) {
                newEdges.push({
                    id: `edge-${randomUUID().split('-')[0]}`,
                    source: sourceId,
                    sourceHandle: match.sourceHandle,
                    target: targetId,
                    targetHandle: match.targetHandle,
                    type: 'default',
                })
            }
        }

        workflow.edges = [...existingEdges, ...newEdges]
        persistWorkflow(workflow, all)
        emitUpdate(workflow.id, workflow)

        res.json({ ok: true, connected: newEdges, skipped: portMatches.length - newEdges.length })
    })

    // ── POST /api/workflow-api/:wfId/build ──────────────────────────────────
    /**
     * Build an entire workflow from a high-level spec.
     * Body: {
     *   nodes: [{ type: string, config?: object, position?: {x,y} }],
     *   connections: [{ from: string|number, fromPort: string, to: string|number, toPort: string }],
     *   replace?: boolean  // if true, wipe existing nodes/edges first
     * }
     *
     * `from` / `to` can be:
     *   - an index into the `nodes` array (0-based)
     *   - a node type string (first node of that type in the batch)
     */
    router.post('/:wfId/build', (req, res) => {
        const found = findWorkflow(req.params.wfId)
        if (!found) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        const { nodes: specNodes = [], connections = [], replace = false } = req.body as {
            nodes: { type: string; config?: Record<string, unknown>; position?: { x: number; y: number } }[]
            connections: { from: string | number; fromPort: string; to: string | number; toPort: string }[]
            replace?: boolean
        }

        const { workflow, all } = found
        const existingNodes: FlowNode[] = replace ? [] : (workflow.nodes ?? [])
        const existingEdges: FlowEdge[] = replace ? [] : (workflow.edges ?? [])

        // Build new nodes
        const createdNodes: FlowNode[] = []
        const errors: string[] = []

        for (let i = 0; i < specNodes.length; i++) {
            const spec = specNodes[i]
            const def = getNodeDef(spec.type)
            if (!def) {
                errors.push(`Node[${i}]: unknown type "${spec.type}"`)
                continue
            }

            const newNode: FlowNode = {
                id: `${spec.type}-${randomUUID().split('-')[0]}`,
                type: spec.type,
                position: spec.position ?? autoPosition([...existingNodes, ...createdNodes]),
                data: buildNodeData(def, spec.config ?? {}),
            }
            createdNodes.push(newNode)
        }

        // Index to resolve from/to references
        const nodeByIndex = (ref: string | number): FlowNode | undefined => {
            if (typeof ref === 'number') return createdNodes[ref]
            // type string: find first created node with that type
            return createdNodes.find(n => n.type === ref || n.data?.nodeType === ref)
        }

        // Build edges from connections spec
        const createdEdges: FlowEdge[] = []

        for (const conn of connections) {
            const sourceNode = nodeByIndex(conn.from)
            const targetNode = nodeByIndex(conn.to)

            if (!sourceNode) {
                errors.push(`Connection: could not resolve source "${conn.from}"`)
                continue
            }
            if (!targetNode) {
                errors.push(`Connection: could not resolve target "${conn.to}"`)
                continue
            }

            const sourceHandle = conn.fromPort.startsWith('out-') ? conn.fromPort : `out-${conn.fromPort}`
            const targetHandle = conn.toPort.startsWith('in-') ? conn.toPort : `in-${conn.toPort}`

            createdEdges.push({
                id: `edge-${randomUUID().split('-')[0]}`,
                source: sourceNode.id,
                sourceHandle,
                target: targetNode.id,
                targetHandle,
                type: 'default',
            })
        }

        workflow.nodes = [...existingNodes, ...createdNodes]
        workflow.edges = [...existingEdges, ...createdEdges]
        persistWorkflow(workflow, all)
        emitUpdate(workflow.id, workflow)

        res.json({
            ok: true,
            created: { nodes: createdNodes, edges: createdEdges },
            errors: errors.length ? errors : undefined,
        })
    })

    // ── GET /api/workflow-api/:wfId/export ──────────────────────────────────
    router.get('/:wfId/export', (req, res) => {
        const found = findWorkflow(req.params.wfId)
        if (!found) {
            return res.status(404).json({ ok: false, error: 'Workflow not found' })
        }

        const { workflow } = found
        const exported = {
            exportedAt: new Date().toISOString(),
            version: '1.0',
            workflow,
        }

        res.setHeader('Content-Type', 'application/json')
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="workflow-${workflow.id}.json"`
        )
        res.json(exported)
    })

    // ── POST /api/workflow-api/import ───────────────────────────────────────
    // NOTE: This route must be registered BEFORE /:wfId/* to avoid collision.
    router.post('/import', (req, res) => {
        const { workflow: importedWorkflow, overwrite = false } = req.body as {
            workflow: Workflow
            overwrite?: boolean
        }

        if (!importedWorkflow || typeof importedWorkflow !== 'object') {
            return res.status(400).json({ ok: false, error: 'workflow object is required in request body' })
        }

        if (!importedWorkflow.id || !importedWorkflow.name) {
            return res.status(400).json({ ok: false, error: 'workflow must have id and name fields' })
        }

        const all = loadWorkflows()
        const existingIdx = all.findIndex(w => w.id === importedWorkflow.id)

        if (existingIdx >= 0 && !overwrite) {
            // Assign a new id to avoid collision
            const newId = `${importedWorkflow.id}-import-${Date.now()}`
            const cloned: Workflow = { ...importedWorkflow, id: newId, name: `${importedWorkflow.name} (imported)` }
            all.push(cloned)
            saveWorkflows(all)
            emitUpdate(cloned.id, cloned)
            return res.json({ ok: true, workflow: cloned, note: 'ID collision — assigned new id' })
        }

        if (existingIdx >= 0) {
            all[existingIdx] = importedWorkflow
        } else {
            all.push(importedWorkflow)
        }

        saveWorkflows(all)
        emitUpdate(importedWorkflow.id, importedWorkflow)

        res.json({ ok: true, workflow: importedWorkflow })
    })

    // ── AI endpoints ────────────────────────────────────────────────────────
    router.post('/ai/parse', async (req, res) => {
        try {
            const { parseWorkflowIntent } = await import('../services/workflow-ai')
            const { message } = req.body as { message: string }
            if (!message) return res.status(400).json({ ok: false, error: 'message is required' })
            const spec = await parseWorkflowIntent(message)
            res.json({ ok: true, spec })
        } catch (err: unknown) {
            res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
        }
    })

    router.post('/ai/suggest', async (req, res) => {
        try {
            const { suggestNextNodes } = await import('../services/workflow-ai')
            const { nodes } = req.body as { nodes: any[] }
            const suggestions = await suggestNextNodes(nodes || [])
            res.json({ ok: true, suggestions })
        } catch (err: unknown) {
            res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
        }
    })

    router.post('/ai/build', async (req, res) => {
        try {
            const { generateWorkflow } = await import('../services/workflow-ai')
            const { description } = req.body as { description: string }
            if (!description) return res.status(400).json({ ok: false, error: 'description is required' })
            const buildSpec = await generateWorkflow(description)
            res.json({ ok: true, buildSpec })
        } catch (err: unknown) {
            res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
        }
    })

    return router
}
