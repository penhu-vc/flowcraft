// Node Registry — all available nodes defined here
// To add a new node: add an entry to NODE_REGISTRY following the NodeDef interface

export const CATEGORY_COLORS: Record<string, string> = {
    trigger: '#ef4444',   // red
    action: '#3b82f6',   // blue
    ai: '#8b5cf6',   // purple
    data: '#10b981',   // green
    media: '#f97316',   // orange
    logic: '#6b7280',   // gray
}

export const CATEGORY_LABELS: Record<string, string> = {
    trigger: '🔴 觸發器',
    action: '🔵 動作',
    ai: '🟣 AI 工具',
    data: '🟢 資料',
    media: '🟠 媒體',
    logic: '⚪ 邏輯',
}

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
    id: string           // unique slug, e.g. 'youtube-monitor'
    name: string
    category: string
    icon: string         // emoji
    description: string
    version: string
    inputs: FieldDef[]
    outputs: PortDef[]
    // if trigger, scheduling info
    triggerType?: 'cron' | 'webhook' | 'manual'
    defaultCron?: string
    // optional: use a custom Vue component name for the properties panel
    customConfig?: string
}

export const NODE_REGISTRY: NodeDef[] = [
    // ─── TRIGGERS ─────────────────────────────────────────────
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
            // channels 是陣列，由 YouTubeMonitorConfig 元件管理，格式：
            // [{ id, name, handle, addedAt }]
            { key: 'channels', label: '監控頻道列表', type: 'string', description: '貼上任一影片連結自動偵測頻道' },
            { key: 'interval', label: '檢查間隔（分鐘）', type: 'number', default: 30 },
        ],
        outputs: [
            // 通用
            { key: 'video', label: '影片物件', type: 'object' },
            { key: 'channel_name', label: '頻道名稱', type: 'string' },
            { key: 'title', label: '影片標題', type: 'string' },
            { key: 'url', label: '影片網址', type: 'string' },
            { key: 'thumbnail', label: '縮圖網址', type: 'string' },
            // 直播
            { key: 'live_viewers', label: '直播觀看人數', type: 'number' },
            { key: 'duration', label: '影片時長(秒)', type: 'number' },
            // 首播
            { key: 'premiere_at', label: '首播時間', type: 'string' },
            // 播放清單
            { key: 'playlist_name', label: '播放清單名稱', type: 'string' },
            // 頻道統計
            { key: 'subscribers', label: '訂閱人數', type: 'number' },
            { key: 'views', label: '總觀看數', type: 'number' },
            { key: 'video_count', label: '影片總數', type: 'number' },
            { key: 'delta', label: '變化量', type: 'object' },
            // 關鍵字
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
            { key: 'cron', label: 'Cron 表達式', type: 'string', required: true, default: '0 9 * * *', placeholder: '0 9 * * *' },
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
            { key: 'payload', label: '自訂資料（JSON，選填）', type: 'textarea', placeholder: '{"key": "value"}' },
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
            { key: 'article', label: '文章內容', type: 'textarea', required: true, placeholder: '在此貼上文章全文內容...' },
        ],
        outputs: [
            { key: 'text', label: '文字內容', type: 'string' },
            { key: 'length', label: '字數', type: 'number' },
            { key: 'timestamp', label: '觸發時間', type: 'string' },
        ],
    },

    // ─── ACTIONS ──────────────────────────────────────────────
    {
        id: 'send-telegram',
        name: 'Send Telegram',
        category: 'action',
        icon: '✈️',
        description: '傳送訊息或圖片到 Telegram 頻道或群組（支援互動標籤按鈕 + YouTube 連結）',
        version: '2.4.0',
        customConfig: 'SendTelegramConfig',
        inputs: [
            { key: 'bot_token', label: 'Bot Token', type: 'password', required: true },
            { key: 'chatUrl', label: '聊天連結或 Chat ID', type: 'string', placeholder: 'https://t.me/c/1234567890/123 或 -1002264990839' },
            { key: 'chat_id', label: 'Chat ID (備用)', type: 'string', placeholder: '如果沒填上面的連結，就用這個' },
            { key: 'photo', label: '圖片 (選填)', type: 'string', placeholder: '圖片網址或本地路徑，填了就發圖片' },
            { key: 'youtubeUrl', label: 'YouTube 連結 (選填)', type: 'string', placeholder: 'YouTube 影片網址，會加「打開影片」按鈕' },
            { key: 'message', label: '訊息內容', type: 'textarea', required: true, placeholder: '支援 {{變數}} 插值，有圖片時為圖片說明' },
            { key: 'thread_id', label: 'Thread ID (選填)', type: 'string', placeholder: '回覆特定討論串' },
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
            { key: 'content', label: '訊息內容', type: 'textarea', placeholder: '支援 {{變數}} 插值' },
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
            { key: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
            { key: 'body', label: 'Body (JSON)', type: 'textarea' },
        ],
        outputs: [
            { key: 'body', label: '回應內容', type: 'object' },
            { key: 'status', label: 'HTTP 狀態碼', type: 'number' },
        ],
    },

    // ─── AI ────────────────────────────────────────────────────
    {
        id: 'notebooklm',
        name: 'NotebookLM',
        category: 'ai',
        icon: '📓',
        description: '🤖 Patchright 自動操作 NotebookLM，分析影片或文件並返回 AI 摘要',
        version: '2.0.0',
        customConfig: 'NotebookLMConfig',
        inputs: [
            { key: 'url', label: '內容網址 (YouTube / 網頁)', type: 'string', required: true, placeholder: 'https://youtube.com/...' },
            { key: 'prompt', label: '提示詞', type: 'textarea', required: true, placeholder: '請摘要這部影片的重點...' },
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
                    { label: 'Gemini（已接好）', value: 'gemini' },
                    { label: 'Anthropic Claude', value: 'anthropic' },
                    { label: 'Custom（接口）', value: 'custom' },
                ]
            },
            { key: 'aiApiKey', label: 'AI API Key', type: 'password', placeholder: 'Provider API key（Gemini 可留空）' },
            { key: 'aiBaseUrl', label: 'AI Base URL（選填）', type: 'string', placeholder: '例如：https://api.openai.com/v1' },
            { key: 'model', label: '模型名稱', type: 'string', default: 'gpt-4o', placeholder: 'gpt-4o / gemini-2.0-flash / claude-3-opus' },
            { key: 'prompt', label: '提示詞', type: 'textarea', required: true },
            { key: 'max_tokens', label: '最大 Token 數', type: 'number', default: 1000 },
            // 舊版相容欄位
            { key: 'provider', label: '服務商（舊版相容）', type: 'string', placeholder: '已棄用，請用 aiProvider' },
            { key: 'api_key', label: 'API Key（舊版相容）', type: 'password', placeholder: '已棄用，請用 aiApiKey' },
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
        description: '🤖 將 script-pipeline-producer 前 5 步整合成單一節點：素材採礦 → Prompt 生成 → Base Draft AI 生成 → Review',
        version: '3.0.0',
        inputs: [
            { key: 'source', label: '素材來源', type: 'textarea', required: true, placeholder: '貼上研究素材或連接 NotebookLM 輸出' },
            { key: 'youtubeUrl', label: 'YouTube URL (選填)', type: 'string', placeholder: '手動連線或自動從上游繼承' },
            {
                key: 'aiProvider', label: 'AI 供應商', type: 'select', default: 'gemini', options: [
                    { label: 'Gemini（已接好）', value: 'gemini' },
                    { label: 'OpenAI（接口）', value: 'openai' },
                    { label: 'Anthropic（接口）', value: 'anthropic' },
                    { label: 'Custom（接口）', value: 'custom' },
                ]
            },
            { key: 'aiApiKey', label: 'AI API Key（接口預留）', type: 'password', placeholder: 'Provider API key（非 Gemini 可先留空）' },
            { key: 'aiBaseUrl', label: 'AI Base URL（接口預留）', type: 'string', placeholder: '例如：https://api.openai.com/v1' },
            { key: 'model', label: '模型名稱', type: 'string', default: 'gemini-2.0-flash', placeholder: '例如：gemini-2.0-flash / gpt-4o-mini' },
            {
                key: 'customModel', label: '自訂模型名稱（舊版相容）', type: 'string', placeholder: '若 model=custom 時使用，否則可留空'
            },
            { key: 'prompt', label: '額外指示（選填）', type: 'textarea', placeholder: '例如：強調某個重點、調整語氣等' },
            { key: 'feedback', label: 'Feedback（迭代用）', type: 'textarea', placeholder: '使用者反饋，用於修正腳本' },
            { key: 'previousMining', label: '前一輪 Mining', type: 'textarea', placeholder: '連接前一輪的 mining 輸出（迭代時使用）' },
            { key: 'previousScript', label: '前一輪腳本', type: 'textarea', placeholder: '連接前一輪的 result 輸出（迭代時使用）' },
            {
                key: 'missingKeyPolicy', label: '缺關鍵值策略', type: 'select', default: 'fail', options: [
                    { label: '停止生成（推薦）', value: 'fail' },
                    { label: '仍繼續生成', value: 'continue' },
                ]
            },
            { key: 'forbiddenTerms', label: '禁忌詞清單（選填）', type: 'string', placeholder: '逗號分隔，例如：賺錢,投資,理財' },
            { key: 'ctaExempt', label: 'CTA 豁免詞（選填）', type: 'string', placeholder: '預設：留言,按讚,收藏,轉發,訂閱,關注,加入1%,成為1%' },
            { key: 'temperature', label: '創意度', type: 'number', default: 1.0 },
        ],
        outputs: [
            { key: 'result', label: '腳本', type: 'string' },
            { key: 'baseDraft', label: 'Base Draft（第5步）', type: 'string' },
            { key: 'mining', label: 'Mining 結果 (KEY:VALUE)', type: 'string' },
            { key: 'miningPrompt', label: 'Step2 Mining Prompt', type: 'string' },
            { key: 'draftPrompt', label: 'Step4 Draft Prompt', type: 'string' },
            { key: 'review', label: '審核報告', type: 'string' },
        ],
    },
    {
        id: 'fact-check-95',
        name: '事實查核 95 改寫',
        category: 'ai',
        icon: '🔍',
        description: '🤖 Fact Check 95 Rewrite - 事實查核後改寫成高轉換率內容（支援多 AI Provider）',
        version: '2.0.0',
        inputs: [
            { key: 'source', label: '原始素材', type: 'textarea', required: true, placeholder: 'URL 或貼上原始文字' },
            { key: 'youtubeUrl', label: 'YouTube URL (選填)', type: 'string', placeholder: '手動連線或自動從上游繼承' },
            {
                key: 'aiProvider', label: 'AI 供應商', type: 'select', default: 'gemini', options: [
                    { label: 'Gemini（已接好）', value: 'gemini' },
                    { label: 'OpenAI（接口）', value: 'openai' },
                    { label: 'Anthropic（接口）', value: 'anthropic' },
                    { label: 'Custom（接口）', value: 'custom' },
                ]
            },
            { key: 'aiApiKey', label: 'AI API Key（接口預留）', type: 'password', placeholder: 'Provider API key（非 Gemini 可先留空）' },
            { key: 'aiBaseUrl', label: 'AI Base URL（接口預留）', type: 'string', placeholder: '例如：https://api.openai.com/v1' },
            { key: 'model', label: '模型名稱', type: 'string', default: 'gemini-2.0-flash', placeholder: '例如：gemini-2.0-flash / gpt-4o' },
            { key: 'customModel', label: '自訂模型名稱（舊版相容）', type: 'string', placeholder: '若 model=custom 時使用，否則可留空' },
            { key: 'targetReader', label: '目標讀者', type: 'string', default: '一般讀者', placeholder: '例如：投資新手、創業者' },
            { key: 'desiredAction', label: '期望行動 (CTA)', type: 'string', default: '採取行動', placeholder: '例如：訂閱電子報、加入社群' },
            { key: 'tone', label: '語氣風格', type: 'string', default: '台灣口語', placeholder: '例如：專業、輕鬆、緊迫' },
            { key: 'citations', label: '在正文中顯示引用', type: 'boolean', default: false },
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
        description: '🤖 把來源素材拆成可重組的段落素材 schema，支援多種內容類型（新聞、研究、產品、社群貼文等）',
        version: '1.0.0',
        customConfig: 'SegmentMiningConfig',
        inputs: [
            { key: 'source', label: '來源素材', type: 'textarea', required: true, placeholder: '貼上文章、筆記、逐字稿、新聞、研究摘要、品牌資料、產品說明、訪談內容、社群貼文、報告摘要' },
            {
                key: 'aiProvider', label: 'AI 供應商', type: 'select', default: 'gemini', options: [
                    { label: 'Gemini（已接好）', value: 'gemini' },
                    { label: 'OpenAI（接口）', value: 'openai' },
                    { label: 'Anthropic（接口）', value: 'anthropic' },
                    { label: 'Custom（接口）', value: 'custom' },
                ]
            },
            { key: 'aiApiKey', label: 'AI API Key（接口預留）', type: 'password', placeholder: 'Provider API key（非 Gemini 可先留空）' },
            { key: 'aiBaseUrl', label: 'AI Base URL（接口預留）', type: 'string', placeholder: '例如：https://api.openai.com/v1' },
            {
                key: 'model', label: '模型名稱', type: 'select', default: 'gemini-2.0-flash', options: [
                    { label: 'Gemini 2.0 Flash（推薦）', value: 'gemini-2.0-flash' },
                    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
                    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
                ]
            },
            { key: 'temperature', label: '創意度', type: 'number', default: 0.3, placeholder: '推薦 0.3（精準提取）' },
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
        description: '🤖 接在礦機節點後，將結構化素材轉換成爆裂短句口播稿（支援參考資料）',
        version: '1.0.0',
        inputs: [
            { key: 'source', label: '來源素材', type: 'textarea', required: true, placeholder: '貼上礦機輸出的 YAML 或其他來源素材' },
            { key: 'reference', label: '參考資料（選填）', type: 'textarea', placeholder: '可選的參考資料，用於豐富劇本內容' },
            {
                key: 'aiProvider', label: 'AI 供應商', type: 'select', default: 'gemini', options: [
                    { label: 'Gemini（已接好）', value: 'gemini' },
                    { label: 'OpenAI（接口）', value: 'openai' },
                    { label: 'Anthropic（接口）', value: 'anthropic' },
                    { label: 'Custom（接口）', value: 'custom' },
                ]
            },
            { key: 'aiApiKey', label: 'AI API Key（接口預留）', type: 'password', placeholder: 'Provider API key（非 Gemini 可先留空）' },
            { key: 'aiBaseUrl', label: 'AI Base URL（接口預留）', type: 'string', placeholder: '例如：https://api.openai.com/v1' },
            {
                key: 'model', label: '模型名稱', type: 'select', default: 'gemini-2.0-flash', options: [
                    { label: 'Gemini 2.0 Flash（推薦）', value: 'gemini-2.0-flash' },
                    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
                    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
                ]
            },
            { key: 'temperature', label: '創意度', type: 'number', default: 1.0, placeholder: '推薦 1.0（爆裂風格）' },
        ],
        outputs: [
            { key: 'result', label: '劇本', type: 'string' },
            { key: 'script', label: '劇本（同 result）', type: 'string' },
            { key: 'keywords', label: '關鍵字候選', type: 'array' },
        ],
    },

    // ─── DATA ──────────────────────────────────────────────────
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
            { key: 'range', label: '範圍（例如 A1:D10）', type: 'string', placeholder: 'A1:Z100' },
            { key: 'data', label: '寫入資料（JSON，append/update 用）', type: 'textarea' },
            { key: 'credentials_json', label: 'Service Account JSON', type: 'textarea', required: true },
        ],
        outputs: [
            { key: 'rows', label: '資料列', type: 'array' },
            { key: 'status', label: '狀態', type: 'string' },
        ],
    },

    // ─── MEDIA ─────────────────────────────────────────────────
    {
        id: 'reels-cover',
        name: 'Reels 封面',
        category: 'media',
        icon: '🎬',
        description: '自動合成 Instagram Reels 封面圖（標題 + 背景 + Logo）',
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
        description: 'YouTube 字幕提取器（純文字，含自動生成字幕）支援條件分支',
        version: '1.2.0',
        inputs: [
            { key: 'url', label: 'YouTube 網址', type: 'string', required: true, placeholder: 'https://youtube.com/watch?v=...' },
            { key: 'language', label: '語言代碼', type: 'string', default: 'auto', placeholder: 'auto (自動), en, zh-TW, zh-CN, ja...' },
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
        description: 'YouTube 封面圖下載器（自動選擇最佳畫質）',
        version: '1.1.0',
        inputs: [
            { key: 'input', label: 'YouTube URL 或縮圖地址', type: 'string', required: true, placeholder: 'https://youtube.com/watch?v=... 或縮圖 URL' },
            { key: 'savePath', label: '儲存路徑', type: 'string', default: '/tmp/yt-thumbnails', placeholder: '預設 /tmp/yt-thumbnails' },
        ],
        outputs: [
            { key: 'thumbnail', label: '封面圖 URL', type: 'string' },
            { key: 'downloadPath', label: '下載路徑', type: 'string' },
            { key: 'photo', label: '圖片（接 Telegram）', type: 'string' },
            { key: 'videoId', label: '影片 ID', type: 'string' },
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

    // ─── LOGIC ─────────────────────────────────────────────────
    {
        id: 'filter',
        name: 'Filter',
        category: 'logic',
        icon: '🔍',
        description: '根據條件過濾資料，只讓符合條件的資料通過',
        version: '1.0.0',
        inputs: [
            { key: 'field', label: '欄位名稱', type: 'string', required: true, placeholder: 'title' },
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
            { key: 'code', label: 'JS 程式碼', type: 'textarea', required: true, placeholder: '// 使用 input 取得上游資料\nreturn { result: input.title.toUpperCase() }' },
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
        description: '按標點符號分段，並在中英文交界處自動分行，適合字幕或短影音腳本',
        version: '1.0.0',
        inputs: [
            { key: 'text', label: '輸入文字', type: 'textarea', required: true, placeholder: '貼上要分行的文字內容' },
            { key: 'punctuations', label: '分行標點符號', type: 'string', default: '。！？，', placeholder: '例如：。！？，' },
            { key: 'minCharsBeforeBreak', label: '中英交界前最少字數', type: 'number', default: 5, placeholder: '避免過短分行' },
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
            { key: 'text', label: '文字內容', type: 'textarea', required: true, placeholder: '輸入或貼上文字內容...' },
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
    {
        id: 'bullet-point-reference',
        name: '列點型參考',
        category: 'data',
        icon: '📋',
        description: '整理和管理列點資料，支援自動解析、編輯、刪除和一鍵複製',
        version: '1.0.0',
        customConfig: 'BulletPointReferenceConfig',
        inputs: [
            { key: 'items', label: '列點資料（JSON）', type: 'textarea', placeholder: '由配置面板自動管理' },
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
        description: '將節點輸出的資料寫入指定的資料集，支援跨工作流資料共享',
        version: '1.0.0',
        customConfig: 'WriteCollectionConfig',
        inputs: [
            { key: 'collectionId', label: '資料集 ID', type: 'string', required: true, placeholder: '選擇要寫入的資料集' },
            { key: 'data', label: '要寫入的資料', type: 'textarea', required: true, placeholder: '連接上游節點或手動輸入 JSON' },
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
        description: '自動收集上游節點的所有輸出欄位並寫入資料集，用於追蹤工作流執行歷程',
        version: '2.0.0',
        customConfig: 'ExecutionLoggerConfig',
        inputs: [
            { key: 'collectionId', label: '資料集 ID', type: 'string', required: true },
            { key: 'data', label: '資料（自動收集所有欄位）', type: 'object', placeholder: '連接任意節點輸出，自動解析所有欄位' },
        ],
        outputs: [
            { key: 'success', label: '寫入成功', type: 'boolean' },
            { key: 'record', label: '記錄資料', type: 'object' },
        ],
    },
]

export function getNodeDef(id: string): NodeDef | undefined {
    return NODE_REGISTRY.find(n => n.id === id)
}

export function getNodesByCategory(category: string): NodeDef[] {
    return NODE_REGISTRY.filter(n => n.category === category)
}
