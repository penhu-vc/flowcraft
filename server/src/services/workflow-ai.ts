/**
 * Workflow AI Service
 * Translates natural language into workflow operations using Gemini.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { VertexAI } from '@google-cloud/vertexai'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ── Paths (mirror gemini executor) ─────────────────────────────────────────
const GEMINI_SETTINGS_FILE = join(__dirname, '../../data/gemini-settings.json')
const GCP_CREDENTIALS_FILE = join(__dirname, '../../data/gcp-credentials.json')

// ── Node registry snapshot (kept server-side to avoid front-end import) ─────
// Condensed form: only what the AI needs to reason about connections/types.
const NODE_REGISTRY_SUMMARY = `
## Available Node Types

### TRIGGERS (start a workflow)
- youtube-monitor: 監控 YouTube 頻道，偵測新影片
  outputs: video(object), channel_name(string), title(string), url(string), thumbnail(string)
- telegram-trigger: 收到 Telegram 訊息時觸發
  outputs: message(string), from(object), chat_id(string)
- discord-trigger: 收到 Discord 訊息時觸發
  outputs: message(string), author(object), channel(string)
- schedule-trigger: 定時觸發 (Cron)
  outputs: timestamp(string)
- rss-trigger: 監控 RSS/Atom Feed
  outputs: item(object), title(string), link(string)
- manual-trigger: 手動觸發
  outputs: timestamp(string), data(object)
- article-trigger: 手動貼上文章內容觸發
  outputs: text(string), length(number), timestamp(string)
- youtube-recent-videos: YouTube 頻道最近影片選擇器
  outputs: url(string), videoId(string), title(string), publishedAt(string)

### ACTIONS (send/notify/call)
- send-telegram: 傳送訊息到 Telegram
  inputs: bot_token, chat_id, message(required), photo(optional), youtubeUrl(optional)
  outputs: success(boolean), message_id(string)
- send-discord: 發送訊息到 Discord
  inputs: webhook_url, content
  outputs: success(boolean)
- http-request: 呼叫外部 API (GET/POST/PUT/DELETE)
  inputs: url, method, headers, body
  outputs: body(object), status(number)

### AI (AI processing)
- llm-generate: LLM 文字生成 (支援 Gemini/OpenAI/Claude)
  inputs: aiProvider, model, prompt(required)
  outputs: text(string), tokens_used(number)
- translate: 多語言翻譯
  inputs: text(required), target_lang
  outputs: translated(string)
- notebooklm: NotebookLM AI 分析
  inputs: url(required), prompt(required)
  outputs: result(string), notebook_url(string)
- skill5: Script Pipeline Producer (素材 → 腳本)
  inputs: source(required), aiProvider, model, prompt
  outputs: result(string), mining(string), review(string)
- fact-check-95: 事實查核 95 改寫
  inputs: source(required), aiProvider, model
  outputs: result(string), factLedger(string)
- segment-mining: 分段採礦器 (結構化素材提取)
  inputs: source(required), aiProvider, model
  outputs: result(string)
- script-generator: 劇本指令生成器
  inputs: source(required), reference(optional), aiProvider, model
  outputs: result(string), keywords(array)

### DATA (store/retrieve)
- google-sheets: 讀寫 Google 試算表
  inputs: action, spreadsheet_id, sheet_name, range, data, credentials_json
  outputs: rows(array), status(string)
- bullet-point-reference: 列點型參考資料
  outputs: result(string), items(array)
- write-collection: 寫入資料集
  inputs: collectionId(required), data(required)
  outputs: success(boolean), recordId(string)
- execution-logger: 執行記錄器
  inputs: collectionId(required), data
  outputs: success(boolean), record(object)

### MEDIA (video/image processing)
- youtube-subtitle: YouTube 字幕提取
  inputs: url(required), language
  outputs: transcript(string), success(boolean)
- youtube-thumbnail: YouTube 封面下載
  inputs: input(required), savePath
  outputs: thumbnail(string), downloadPath(string), photo(string)
- video-download: 影片下載 (yt-dlp)
  inputs: url(required), quality, output_dir
  outputs: file_path(string), duration(number)
- reels-cover: Reels 封面合成
  inputs: title(required), subtitle, background_url, logo_url, theme
  outputs: image_url(string), image_base64(string)

### LOGIC (flow control)
- filter: 條件過濾
  inputs: field(required), operator, value(required)
  outputs: passed(any), rejected(any)
- delay: 延遲等待
  inputs: seconds(required)
  outputs: output(any)
- code: 自訂 JavaScript 程式碼
  inputs: code(required)
  outputs: result(any)
- line-breaker: 分行處理器
  inputs: text(required), punctuations, minCharsBeforeBreak
  outputs: result(string)
- text-constant: 純文字常數
  inputs: text(required)
  outputs: text(string)
- comment: 備註（不影響執行）
  inputs: none
  outputs: none
`.trim()

// ── Type definitions ────────────────────────────────────────────────────────

export interface WorkflowSpec {
    action: 'build' | 'add-node' | 'connect' | 'remove' | 'modify-config'
    // For build
    nodes?: { type: string; config?: Record<string, unknown> }[]
    connections?: { from: string; fromPort: string; to: string; toPort: string }[]
    // For add-node
    nodeType?: string
    config?: Record<string, unknown>
    // For connect
    sourceId?: string
    targetId?: string
    sourcePort?: string
    targetPort?: string
    // For remove
    nodeId?: string
    // For modify-config
    configUpdates?: Record<string, unknown>
    // Human-readable explanation
    reasoning?: string
}

export interface NodeSummary {
    id: string         // instance id
    type: string       // node type from registry
    label?: string
}

export interface Suggestion {
    nodeType: string
    name: string
    reason: string
    connectFromPort?: string
    connectToPort?: string
    priority: number   // 1 = highest
}

export interface WorkflowBuildSpec {
    name: string
    description: string
    nodes: {
        id: string
        type: string
        label: string
        config?: Record<string, unknown>
        position?: { x: number; y: number }
    }[]
    connections: {
        sourceNodeId: string
        sourcePort: string
        targetNodeId: string
        targetPort: string
    }[]
}

// ── Gemini helpers (mirrors gemini executor pattern) ────────────────────────

function getGeminiMode(): 'apiKey' | 'gcp' {
    if (process.env.GEMINI_API_KEY) return 'apiKey'
    if (existsSync(GEMINI_SETTINGS_FILE)) {
        try {
            const s = JSON.parse(readFileSync(GEMINI_SETTINGS_FILE, 'utf8'))
            if (s.mode === 'gcp' && existsSync(GCP_CREDENTIALS_FILE)) return 'gcp'
            if (s.apiKey) return 'apiKey'
        } catch { /* ignore */ }
    }
    if (existsSync(GCP_CREDENTIALS_FILE)) return 'gcp'
    throw new Error('Gemini 未設定！請到「設定」頁面設定 API Key 或匯入 GCP 憑證。')
}

function getApiKey(): string {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
    if (existsSync(GEMINI_SETTINGS_FILE)) {
        const s = JSON.parse(readFileSync(GEMINI_SETTINGS_FILE, 'utf8'))
        if (s.apiKey) return s.apiKey
    }
    throw new Error('API Key 未設定')
}

async function callGeminiJson(systemPrompt: string, userPrompt: string): Promise<string> {
    const model = 'gemini-2.0-flash'
    const mode = getGeminiMode()

    if (mode === 'apiKey') {
        const genAI = new GoogleGenerativeAI(getApiKey())
        const generativeModel = genAI.getGenerativeModel({
            model,
            systemInstruction: systemPrompt,
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
                maxOutputTokens: 4096,
            },
        })
        const result = await generativeModel.generateContent(userPrompt)
        const text = result.response.text()
        if (!text) throw new Error('Gemini 未返回有效回應')
        return text
    } else {
        const credentials = JSON.parse(readFileSync(GCP_CREDENTIALS_FILE, 'utf8'))
        const vertexAI = new VertexAI({ project: credentials.project_id, location: 'us-central1' })
        const generativeModel = vertexAI.getGenerativeModel({
            model,
            systemInstruction: systemPrompt,
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
                maxOutputTokens: 4096,
            } as any,
        })
        const result = await generativeModel.generateContent(userPrompt)
        const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || ''
        if (!text) throw new Error('Gemini 未返回有效回應 (GCP)')
        return text
    }
}

function parseJson<T>(raw: string): T {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(cleaned) as T
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse natural language into a WorkflowSpec (single operation intent).
 * Handles both Chinese and English input.
 */
export async function parseWorkflowIntent(userMessage: string): Promise<WorkflowSpec> {
    const systemPrompt = `
You are an expert workflow assistant for FlowCraft, a visual workflow builder.
Your job is to parse the user's natural language command into a structured WorkflowSpec JSON object.

${NODE_REGISTRY_SUMMARY}

## WorkflowSpec Schema
{
  "action": "build" | "add-node" | "connect" | "remove" | "modify-config",
  // For build: nodes[] + connections[]
  "nodes": [{ "type": "<nodeType>", "config": {} }],
  "connections": [{ "from": "<nodeType or index>", "fromPort": "<portKey>", "to": "<nodeType or index>", "toPort": "<portKey>" }],
  // For add-node:
  "nodeType": "<nodeType>",
  "config": {},
  // For connect:
  "sourceId": "<node id or type hint>",
  "targetId": "<node id or type hint>",
  "sourcePort": "<port key>",
  "targetPort": "<port key>",
  // For remove:
  "nodeId": "<node id>",
  // For modify-config:
  "nodeId": "<node id>",
  "configUpdates": {},
  // Always include:
  "reasoning": "<brief explanation in the same language as user>"
}

## Examples
User: "監控 YouTube 頻道，有新影片就發 Telegram"
→ { "action": "build", "nodes": [{"type":"youtube-monitor"},{"type":"send-telegram"}], "connections": [{"from":"youtube-monitor","fromPort":"url","to":"send-telegram","toPort":"message"}], "reasoning": "建立 YouTube 監控 → Telegram 通知的工作流" }

User: "YouTube 影片下載字幕翻譯後發到 Discord"
→ { "action": "build", "nodes": [{"type":"youtube-monitor"},{"type":"youtube-subtitle"},{"type":"translate"},{"type":"send-discord"}], "connections": [{"from":"youtube-monitor","fromPort":"url","to":"youtube-subtitle","toPort":"url"},{"from":"youtube-subtitle","fromPort":"transcript","to":"translate","toPort":"text"},{"from":"translate","fromPort":"translated","to":"send-discord","toPort":"content"}], "reasoning": "四節點工作流：監控 → 字幕 → 翻譯 → Discord" }

User: "加一個翻譯節點"
→ { "action": "add-node", "nodeType": "translate", "reasoning": "新增翻譯節點" }

User: "把 YouTube 連到 Telegram"
→ { "action": "connect", "sourceId": "youtube-monitor", "targetId": "send-telegram", "sourcePort": "url", "targetPort": "message", "reasoning": "連接 YouTube 監控 → Telegram 通知" }

User: "remove the filter node"
→ { "action": "remove", "nodeId": "filter", "reasoning": "Remove the filter node" }

## Rules
- Always return valid JSON matching the schema above.
- Use exact node type IDs from the registry.
- For connections, pick the most semantically appropriate ports.
- If the intent is ambiguous, default to "build".
- If multiple nodes are mentioned without explicit connections, infer the most logical linear connection chain.
`.trim()

    const raw = await callGeminiJson(systemPrompt, userMessage)
    return parseJson<WorkflowSpec>(raw)
}

/**
 * Suggest the next nodes to add, based on the current workflow's last node type.
 * Returns up to 5 suggestions ranked by common usage patterns.
 */
export async function suggestNextNodes(currentNodes: NodeSummary[]): Promise<Suggestion[]> {
    if (currentNodes.length === 0) {
        // No nodes yet — suggest common triggers
        return [
            { nodeType: 'youtube-monitor', name: 'YouTube Monitor', reason: '最常用的觸發器：監控 YouTube 頻道新影片', priority: 1 },
            { nodeType: 'schedule-trigger', name: 'Schedule', reason: '定時觸發，適合定期任務', priority: 2 },
            { nodeType: 'telegram-trigger', name: 'Telegram Trigger', reason: '收到 Telegram 訊息時觸發', priority: 3 },
            { nodeType: 'rss-trigger', name: 'RSS Feed', reason: '監控任意 RSS/Atom 訂閱源', priority: 4 },
            { nodeType: 'manual-trigger', name: 'Manual Trigger', reason: '手動一鍵觸發，適合測試', priority: 5 },
        ]
    }

    const lastNode = currentNodes[currentNodes.length - 1]
    const nodeListStr = currentNodes.map((n, i) => `${i + 1}. type=${n.type} id=${n.id}`).join('\n')

    const systemPrompt = `
You are a workflow design assistant for FlowCraft.
Given the current workflow nodes, suggest the best 5 next nodes to add.

${NODE_REGISTRY_SUMMARY}

## Response Schema (JSON array, exactly 5 items)
[
  {
    "nodeType": "<nodeType>",
    "name": "<display name>",
    "reason": "<why this node fits here, in the same language as the node labels>",
    "connectFromPort": "<recommended output port of the last node>",
    "connectToPort": "<recommended input port key of the suggested node>",
    "priority": 1
  },
  ...
]

## Common patterns
- youtube-monitor → youtube-subtitle, send-telegram, send-discord, llm-generate, youtube-thumbnail
- youtube-subtitle → translate, llm-generate, send-telegram, skill5, segment-mining
- translate → send-telegram, send-discord, llm-generate
- llm-generate → send-telegram, send-discord, write-collection
- rss-trigger → translate, llm-generate, send-telegram
- telegram-trigger → llm-generate, translate, http-request
- schedule-trigger → http-request, youtube-monitor, google-sheets
- segment-mining → script-generator
- script-generator → send-telegram, send-discord, line-breaker

## Rules
- Return exactly 5 suggestions sorted by priority (1 = best fit).
- Prefer nodes that can directly receive outputs from the last node's output ports.
- Avoid suggesting nodes already present in the workflow unless they are genuinely useful again (e.g. two send-telegram).
`.trim()

    const userPrompt = `
Current workflow nodes:
${nodeListStr}

Last node type: ${lastNode.type}

Suggest the 5 best next nodes to add.
`.trim()

    const raw = await callGeminiJson(systemPrompt, userPrompt)
    const suggestions = parseJson<Suggestion[]>(raw)

    // Ensure priorities are sequential
    return suggestions
        .slice(0, 5)
        .map((s, i) => ({ ...s, priority: i + 1 }))
}

/**
 * Generate a full workflow (nodes + connections + positions) from a description.
 */
export async function generateWorkflow(description: string): Promise<WorkflowBuildSpec> {
    const systemPrompt = `
You are a workflow generation expert for FlowCraft, a visual workflow builder.
Given a workflow description, produce a complete WorkflowBuildSpec JSON.

${NODE_REGISTRY_SUMMARY}

## WorkflowBuildSpec Schema
{
  "name": "<short workflow name>",
  "description": "<one-sentence description>",
  "nodes": [
    {
      "id": "<short unique id, e.g. node-1>",
      "type": "<nodeType from registry>",
      "label": "<human-readable label>",
      "config": {},
      "position": { "x": 100, "y": 200 }
    }
  ],
  "connections": [
    {
      "sourceNodeId": "<node id>",
      "sourcePort": "<output port key>",
      "targetNodeId": "<node id>",
      "targetPort": "<input port key>"
    }
  ]
}

## Position layout
- Lay nodes out left to right: x starts at 100, increments by 280 per node.
- y is 200 for linear chains; branch nodes offset by ±150 on y.

## Examples

Description: "監控 YouTube 頻道，有新影片就發 Telegram 通知"
→ {
  "name": "YouTube → Telegram",
  "description": "監控 YouTube 頻道新影片，自動發送 Telegram 通知",
  "nodes": [
    { "id": "node-1", "type": "youtube-monitor", "label": "YouTube 監控", "config": { "interval": 30 }, "position": { "x": 100, "y": 200 } },
    { "id": "node-2", "type": "send-telegram", "label": "發送 Telegram", "config": {}, "position": { "x": 380, "y": 200 } }
  ],
  "connections": [
    { "sourceNodeId": "node-1", "sourcePort": "url", "targetNodeId": "node-2", "targetPort": "message" }
  ]
}

Description: "YouTube 影片下載字幕翻譯後發到 Discord"
→ {
  "name": "YouTube 字幕 → Discord",
  "description": "抓取 YouTube 字幕，翻譯成繁中，發到 Discord",
  "nodes": [
    { "id": "node-1", "type": "youtube-monitor", "label": "YouTube 監控", "config": { "interval": 30 }, "position": { "x": 100, "y": 200 } },
    { "id": "node-2", "type": "youtube-subtitle", "label": "字幕提取", "config": { "language": "auto" }, "position": { "x": 380, "y": 200 } },
    { "id": "node-3", "type": "translate", "label": "翻譯", "config": { "target_lang": "zh-TW" }, "position": { "x": 660, "y": 200 } },
    { "id": "node-4", "type": "send-discord", "label": "發送 Discord", "config": {}, "position": { "x": 940, "y": 200 } }
  ],
  "connections": [
    { "sourceNodeId": "node-1", "sourcePort": "url", "targetNodeId": "node-2", "targetPort": "url" },
    { "sourceNodeId": "node-2", "sourcePort": "transcript", "targetNodeId": "node-3", "targetPort": "text" },
    { "sourceNodeId": "node-3", "sourcePort": "translated", "targetNodeId": "node-4", "targetPort": "content" }
  ]
}

## Rules
- Only use node types from the registry above.
- Assign sensible default configs where obvious (e.g. language, interval).
- Do NOT fill in credentials (bot_token, api_key, webhook_url) — leave blank.
- Connections must use real port keys from the registry.
- Return only valid JSON, no extra prose.
`.trim()

    const raw = await callGeminiJson(systemPrompt, description)
    return parseJson<WorkflowBuildSpec>(raw)
}
