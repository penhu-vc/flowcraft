# 節點設計規則指南

> **目標受眾**：AI、開發者
> **用途**：設計新節點時必須遵守的規範，確保一致性和可維護性

---

## 📋 目錄

1. [節點基本結構](#1-節點基本結構)
2. [輸入參數定義](#2-輸入參數定義)
3. [輸出埠定義](#3-輸出埠定義)
4. [Executor 實作規範](#4-executor-實作規範)
5. [進度回報機制](#5-進度回報機制)
6. [錯誤處理規範](#6-錯誤處理規範)
7. [Timeout 設定指南](#7-timeout-設定指南)
8. [用戶體驗設計](#8-用戶體驗設計)
9. [長時間任務處理](#9-長時間任務處理)
10. [完整範例](#10-完整範例)

---

## 1. 節點基本結構

### 檔案位置
- **節點定義**：`src/nodes/registry.ts`
- **Executor 實作**：`server/src/executors/{節點名稱}.ts`
- **自訂配置元件**（選填）：`src/components/{節點名稱}Config.vue`

### Registry 定義格式

```typescript
{
  // 必填欄位
  id: string,              // 唯一識別碼（小寫、短橫線分隔）
  name: string,            // 顯示名稱
  category: string,        // 分類（見下表）
  icon: string,            // emoji 圖示
  description: string,     // 簡短描述（一句話）
  version: string,         // 語意化版本（e.g., '1.0.0'）
  inputs: FieldDef[],      // 輸入參數定義
  outputs: PortDef[],      // 輸出埠定義

  // 觸發器專用（category = 'trigger'）
  triggerType?: 'cron' | 'webhook' | 'manual',
  defaultCron?: string,    // Cron 表達式（triggerType = 'cron' 時）

  // 自訂配置元件（選填）
  customConfig?: string    // Vue 元件名稱
}
```

### 節點分類

| 類別 | 說明 | 顏色 | 範例 |
|------|------|------|------|
| `trigger` | 觸發器（工作流起點） | 🔴 紅色 | YouTube Monitor, Manual Trigger |
| `action` | 動作節點（執行操作） | 🔵 藍色 | Send Telegram, HTTP Request |
| `ai` | AI 工具 | 🟣 紫色 | NotebookLM, GPT, Gemini |
| `data` | 資料存取 | 🟢 綠色 | Google Sheets, Database |
| `media` | 媒體處理 | 🟠 橘色 | Video Render, Image Resize |
| `logic` | 邏輯/流程控制 | ⚪ 灰色 | Filter, Delay, Code |

---

## 2. 輸入參數定義

### FieldDef 介面

```typescript
interface FieldDef {
  key: string              // 參數鍵名（小寫、底線分隔）
  label: string            // 顯示標籤
  type: FieldType          // 參數類型（見下表）
  required?: boolean       // 是否必填（預設 false）
  default?: any            // 預設值
  options?: {              // 下拉選單選項（type = 'select' 時必填）
    label: string
    value: string
  }[]
  placeholder?: string     // 輸入提示文字
  description?: string     // 參數說明（顯示在輸入框下方）
}
```

### 參數類型

| Type | 說明 | 前端渲染 | 範例 |
|------|------|---------|------|
| `string` | 短文字 | `<input type="text">` | URL, 名稱 |
| `number` | 數字 | `<input type="number">` | Timeout, 間隔 |
| `boolean` | 布林值 | `<input type="checkbox">` | 啟用/停用 |
| `select` | 下拉選單 | `<select>` | HTTP Method, 語言 |
| `textarea` | 長文字 | `<textarea>` | Prompt, JSON |
| `password` | 密碼 | `<input type="password">` | API Key, Token |

### 命名規範

| 用途 | 鍵名 | 標籤 | 類型 |
|------|------|------|------|
| 網址 | `url` | 內容網址 | `string` |
| API Key | `api_key` | API Key | `password` |
| 提示詞 | `prompt` | 提示詞 | `textarea` |
| 超時 | `timeout` | 逾時（秒） | `number` |
| 間隔 | `interval` | 檢查間隔（分鐘） | `number` |
| 訊息 | `message` | 訊息內容 | `textarea` |

### 範例：NotebookLM 輸入定義

```typescript
inputs: [
  {
    key: 'url',
    label: '內容網址 (YouTube / 網頁)',
    type: 'string',
    required: true,
    placeholder: 'https://youtube.com/...'
  },
  {
    key: 'prompt',
    label: '提示詞',
    type: 'textarea',
    required: true,
    placeholder: '請摘要這部影片的重點...'
  },
  {
    key: 'timeout',
    label: '逾時（秒）',
    type: 'number',
    default: 120,
    description: '建議：簡單任務 60 秒，複雜任務 300-600 秒'
  }
]
```

---

## 3. 輸出埠定義

### PortDef 介面

```typescript
interface PortDef {
  key: string      // 輸出埠鍵名
  label: string    // 顯示標籤
  type: string     // 資料類型（string, number, boolean, object, array, any）
}
```

### 設計原則

1. **完整物件 + 常用欄位分解**
   ```typescript
   outputs: [
     { key: 'video', label: '影片物件', type: 'object' },      // 完整物件
     { key: 'title', label: '影片標題', type: 'string' },      // 常用欄位
     { key: 'url', label: '影片網址', type: 'string' },        // 常用欄位
     { key: 'thumbnail', label: '縮圖網址', type: 'string' }   // 常用欄位
   ]
   ```

2. **避免過度分解**
   ❌ 不好：20 個輸出埠（視覺混亂）
   ✅ 好：1 個物件 + 3-5 個常用欄位

3. **命名一致性**
   - 時間類：`timestamp`, `created_at`, `updated_at`
   - 布林類：`success`, `is_active`, `has_error`
   - 物件類：`data`, `result`, `response`, `item`

---

## 4. Executor 實作規範

### 檔案結構

```typescript
// server/src/executors/{節點名稱}.ts

import { /* 依賴 */ } from '...'

// ① 定義 Config 介面
export interface {節點名稱}Config {
  url: string
  prompt: string
  timeout?: number
}

// ② 定義 Emit 函數類型
type EmitFn = (event: string, data: unknown) => void

// ③ 主要執行函數
export async function execute{節點名稱}(
  config: Record<string, unknown>,
  emit: EmitFn
): Promise<{返回類型}> {

  // 1. 參數驗證
  const { url, prompt, timeout = 120000 } = config as {節點名稱}Config
  if (!url) throw new Error('{節點名稱}: url is required')
  if (!prompt) throw new Error('{節點名稱}: prompt is required')

  // 2. 初始化
  emit('node:log', { message: '初始化...' })

  try {
    // 3. 執行主要邏輯
    emit('node:log', { message: '執行步驟 1...' })
    const step1 = await doStep1()

    emit('node:log', { message: '執行步驟 2...' })
    const step2 = await doStep2()

    // 4. 回報進度（選填，長時間任務必須）
    emit('node:progress', { progress: 50, message: '處理中...' })

    // 5. 返回結果
    emit('node:log', { message: '✅ 完成' })
    return { result: '...', metadata: '...' }

  } catch (err) {
    // 6. 錯誤處理
    const message = err instanceof Error ? err.message : String(err)
    emit('node:error', { error: message })
    throw err
  } finally {
    // 7. 清理資源
    cleanup()
  }
}
```

### 必須遵守的規則

1. **參數驗證**：必填參數要檢查，提供清楚的錯誤訊息
2. **進度回報**：長時間任務（>30秒）必須回報進度
3. **錯誤處理**：使用 try-catch，emit `node:error` 後再 throw
4. **資源清理**：使用 finally 確保資源釋放（瀏覽器、檔案、連線等）
5. **Timeout 支援**：使用 `Promise.race` 實作超時

---

## 5. 進度回報機制

### 何時需要回報進度？

| 預估執行時間 | 是否需要 | 回報頻率 |
|------------|---------|---------|
| < 10 秒 | ❌ 不需要 | - |
| 10-30 秒 | ⚠️ 建議 | 開始/結束 |
| 30 秒 - 5 分鐘 | ✅ 必須 | 每 10 秒或每個步驟 |
| > 5 分鐘 | ✅ 必須 | 每 10 秒 + 詳細步驟 |

### 進度事件格式

```typescript
// node:log - 日誌訊息
emit('node:log', {
  message: string,
  level?: 'info' | 'warn' | 'error'  // 預設 'info'
})

// node:progress - 進度更新
emit('node:progress', {
  progress: number,      // 0-100
  message?: string,      // 當前步驟描述
  elapsed?: number,      // 已執行時間（毫秒）
  estimated?: number     // 預估剩餘時間（毫秒）
})

// node:heartbeat - 心跳（告訴前端還活著）
emit('node:heartbeat', {
  message: '執行中...',
  elapsed: number
})
```

### 範例：分步驟回報進度

```typescript
export async function executeVideoRender(config, emit) {
  const steps = [
    { name: '載入素材', weight: 10 },
    { name: '渲染影片', weight: 70 },  // 最久
    { name: '輸出檔案', weight: 20 }
  ]

  let progress = 0

  for (const step of steps) {
    emit('node:progress', {
      progress,
      message: step.name
    })

    await doStep(step.name)

    progress += step.weight
  }

  emit('node:progress', { progress: 100, message: '完成' })
}
```

---

## 6. 錯誤處理規範

### 錯誤類型與處理

```typescript
try {
  // 執行邏輯

} catch (err) {
  // 1. 區分錯誤類型
  if (err instanceof ValidationError) {
    // 參數錯誤：不重試，立即失敗
    throw new Error(`參數錯誤: ${err.message}`)

  } else if (err instanceof NetworkError) {
    // 網路錯誤：可重試
    emit('node:log', { message: '網路錯誤，將自動重試...', level: 'warn' })
    throw err  // 讓 Queue 自動重試

  } else if (err instanceof TimeoutError) {
    // 超時錯誤
    throw new Error(`執行超時（已執行 ${elapsed} 秒）`)

  } else {
    // 未知錯誤
    throw new Error(`執行失敗: ${err.message}`)
  }
}
```

### 錯誤訊息設計

❌ **不好的錯誤訊息**：
```
Error: Failed
Error: Something went wrong
Error: undefined
```

✅ **好的錯誤訊息**：
```
NotebookLM: url is required
NotebookLM: Google session 已過期，請重新執行 npm run auth:notebooklm
Video Render: 不支援的影片格式 .avi，請使用 .mp4 或 .mov
```

### 錯誤訊息格式

```
{節點名稱}: {具體問題} [, {解決方案}]
```

---

## 7. Timeout 設定指南

### 預設 Timeout 建議

| 節點類型 | 預設 Timeout | 範圍 |
|---------|-------------|------|
| 觸發器 | 30 秒 | 10-60 秒 |
| HTTP Request | 30 秒 | 10-60 秒 |
| AI 文字生成 | 60 秒 | 30-180 秒 |
| NotebookLM | 120 秒 | 60-600 秒 |
| 圖片生成 | 180 秒 | 60-600 秒 |
| 影片渲染 | 600 秒 | 300-3600 秒 |

### Timeout 實作

```typescript
async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  taskName: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${taskName} 執行超時（${timeout/1000} 秒）`))
    }, timeout)
  })

  return Promise.race([promise, timeoutPromise])
}

// 使用
const result = await executeWithTimeout(
  fetchData(),
  config.timeout || 30000,
  'HTTP Request'
)
```

---

## 8. 用戶體驗設計

### 節點執行中的 UI 狀態

```
┌─────────────────────────────────────┐
│ NotebookLM                    ●     │ ← 動畫圓點表示執行中
│ [████████████░░░░░░] 65%            │ ← 進度條
│                                     │
│ 📓 等待 AI 處理...                  │ ← 當前步驟
│                                     │
│ 已執行：1 分 23 秒                   │ ← 經過時間
│ 預估剩餘：約 40 秒                   │ ← 剩餘時間（選填）
│                                     │
│ [取消執行] [查看詳細日誌]            │ ← 操作按鈕
└─────────────────────────────────────┘
```

### 節點完成的 UI 狀態

```
┌─────────────────────────────────────┐
│ NotebookLM                    ✓     │ ← 綠色勾勾
│                                     │
│ ✅ 完成                             │
│ 總時間：1 分 56 秒                   │
│                                     │
│ [查看結果] [查看日誌]                │
└─────────────────────────────────────┘
```

### 節點錯誤的 UI 狀態

```
┌─────────────────────────────────────┐
│ NotebookLM                    ✕     │ ← 紅色叉叉
│                                     │
│ ❌ 執行失敗                          │
│ Google session 已過期               │
│                                     │
│ [重試] [查看錯誤日誌]                 │
└─────────────────────────────────────┘
```

---

## 9. 長時間任務處理

### 判斷標準

| 預估時間 | 處理方式 |
|---------|---------|
| < 5 分鐘 | 直接執行 + WebSocket 推送進度 |
| > 5 分鐘 | 使用 Job Queue |

### Job Queue 整合

```typescript
// executor.ts
import { queueManager } from './queue/QueueManager'

export async function executeNode(
  nodeType: string,
  config: Record<string, unknown>,
  emit: EmitFn
): Promise<unknown> {

  // 長時間節點列表
  const longRunningNodes = [
    'video-render',      // 影片渲染
    'batch-process',     // 批次處理
    'ai-training',       // AI 訓練
    'large-export'       // 大量資料匯出
  ]

  // 使用 Job Queue
  if (longRunningNodes.includes(nodeType)) {
    const jobId = await queueManager.addJob('default', {
      executionId: config.executionId as string,
      workflowId: config.workflowId as string,
      nodeId: config.nodeId as string,
      nodeType,
      config,
      triggeredAt: new Date().toISOString()
    }, {
      timeout: config.timeout as number || 1800000,  // 30 分鐘
      attempts: 3
    })

    return {
      jobId,
      message: '任務已加入 Queue，將在背景執行',
      estimatedTime: '10-30 分鐘'
    }
  }

  // 一般節點直接執行
  // ...
}
```

---

## 10. 完整範例

### 範例節點：AI Image Generator

#### Registry 定義

```typescript
// src/nodes/registry.ts
{
  id: 'ai-image-generator',
  name: 'AI Image Generator',
  category: 'ai',
  icon: '🎨',
  description: '使用 Stable Diffusion 生成圖片',
  version: '1.0.0',
  inputs: [
    {
      key: 'prompt',
      label: '提示詞',
      type: 'textarea',
      required: true,
      placeholder: 'A beautiful sunset over mountains...'
    },
    {
      key: 'negative_prompt',
      label: '負面提示詞',
      type: 'textarea',
      placeholder: 'blurry, low quality...'
    },
    {
      key: 'model',
      label: '模型',
      type: 'select',
      default: 'sd-xl',
      options: [
        { label: 'Stable Diffusion XL', value: 'sd-xl' },
        { label: 'Midjourney v6', value: 'mj-v6' },
        { label: 'DALL-E 3', value: 'dalle-3' }
      ]
    },
    {
      key: 'width',
      label: '寬度',
      type: 'number',
      default: 1024
    },
    {
      key: 'height',
      label: '高度',
      type: 'number',
      default: 1024
    },
    {
      key: 'steps',
      label: '生成步數',
      type: 'number',
      default: 30,
      description: '越多越精細，但生成時間越長（20-50）'
    },
    {
      key: 'timeout',
      label: '逾時（秒）',
      type: 'number',
      default: 180,
      description: '建議：簡單圖片 60 秒，高解析度 300 秒'
    }
  ],
  outputs: [
    { key: 'image_url', label: '圖片網址', type: 'string' },
    { key: 'image_base64', label: 'Base64 圖片', type: 'string' },
    { key: 'metadata', label: '生成資訊', type: 'object' }
  ]
}
```

#### Executor 實作

```typescript
// server/src/executors/aiImageGenerator.ts

import fetch from 'node-fetch'

export interface AIImageGeneratorConfig {
  prompt: string
  negative_prompt?: string
  model: string
  width: number
  height: number
  steps: number
  timeout?: number
}

type EmitFn = (event: string, data: unknown) => void

export async function executeAIImageGenerator(
  config: Record<string, unknown>,
  emit: EmitFn
): Promise<{ image_url: string; image_base64: string; metadata: any }> {

  // 1. 參數驗證
  const {
    prompt,
    negative_prompt = '',
    model = 'sd-xl',
    width = 1024,
    height = 1024,
    steps = 30,
    timeout = 180000
  } = config as AIImageGeneratorConfig

  if (!prompt) {
    throw new Error('AI Image Generator: prompt is required')
  }

  if (steps < 10 || steps > 100) {
    throw new Error('AI Image Generator: steps 必須在 10-100 之間')
  }

  // 2. 初始化
  emit('node:log', { message: '準備生成圖片...' })
  const startTime = Date.now()

  try {
    // 3. 呼叫 AI API
    emit('node:log', { message: `使用模型: ${model}` })
    emit('node:progress', { progress: 10, message: '送出請求...' })

    const response = await fetch('https://api.stability.ai/v1/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`
      },
      body: JSON.stringify({
        prompt,
        negative_prompt,
        width,
        height,
        steps
      })
    })

    if (!response.ok) {
      throw new Error(`API 錯誤: ${response.statusText}`)
    }

    // 4. 等待生成（模擬進度）
    emit('node:progress', { progress: 30, message: '生成中...' })

    // 心跳檢測（每 5 秒）
    const heartbeat = setInterval(() => {
      const elapsed = Date.now() - startTime
      emit('node:heartbeat', {
        message: '生成中...',
        elapsed
      })
    }, 5000)

    const data = await response.json()
    clearInterval(heartbeat)

    emit('node:progress', { progress: 80, message: '處理結果...' })

    // 5. 處理結果
    const imageBase64 = data.artifacts[0].base64
    const imageUrl = await uploadToStorage(imageBase64)

    emit('node:progress', { progress: 100, message: '完成' })
    emit('node:log', { message: '✅ 圖片生成完成' })

    // 6. 返回結果
    return {
      image_url: imageUrl,
      image_base64: imageBase64,
      metadata: {
        model,
        prompt,
        width,
        height,
        steps,
        duration: Date.now() - startTime
      }
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit('node:error', { error: message })
    throw new Error(`AI Image Generator: ${message}`)

  } finally {
    // 7. 清理（如果有）
    // cleanup()
  }
}

async function uploadToStorage(base64: string): Promise<string> {
  // 上傳到 CDN/Storage，返回 URL
  // 實作細節省略
  return 'https://cdn.example.com/image.png'
}
```

#### 在 executor.ts 註冊

```typescript
// server/src/executor.ts
import { executeAIImageGenerator } from './executors/aiImageGenerator'

export async function executeNode(
  nodeType: string,
  config: Record<string, unknown>,
  emit: EmitFn
): Promise<unknown> {
  switch (nodeType) {
    case 'notebooklm':
      return executeNotebookLM(config, emit)

    case 'ai-image-generator':
      return executeAIImageGenerator(config, emit)

    default:
      throw new Error(`No executor found for node type: ${nodeType}`)
  }
}
```

---

## 檢查清單

設計新節點前，請確認：

- [ ] 節點 ID 使用小寫、短橫線分隔（e.g., `ai-image-generator`）
- [ ] 選擇正確的分類（trigger/action/ai/data/media/logic）
- [ ] 必填參數標記 `required: true`
- [ ] 提供合理的預設值
- [ ] Timeout 參數有說明和建議值
- [ ] 輸出埠命名清晰（避免模糊詞如 `output`, `result`）
- [ ] Executor 有完整的參數驗證
- [ ] Executor 有錯誤處理和清楚的錯誤訊息
- [ ] 長時間任務（>30秒）有進度回報
- [ ] 超長任務（>5分鐘）使用 Job Queue
- [ ] 使用 `emit` 回報 log、progress、error
- [ ] 在 `executor.ts` 註冊新節點

---

## 參考資源

- [Job Queue 使用指南](../server/src/queue/README.md)
- [設計文件](./design.md)
- [現有節點範例](../src/nodes/registry.ts)

---

**最後更新**：2026-03-02
**維護者**：flowcraft team
