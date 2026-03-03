# 工作流執行引擎使用指南

## 快速開始

### 1. 啟動後端

```bash
cd /Users/yaja/projects/flowcraft/server
npm run dev
```

### 2. 測試工作流執行

使用 curl 或 Postman 測試：

```bash
curl -X POST http://localhost:3001/api/workflow/run \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "id": "test-workflow-1",
      "name": "測試工作流",
      "nodes": [
        {
          "id": "node-1",
          "type": "manual-trigger",
          "position": { "x": 100, "y": 200 },
          "data": {
            "payload": "{\"url\": \"https://youtube.com/watch?v=test\"}"
          }
        },
        {
          "id": "node-2",
          "type": "notebooklm",
          "position": { "x": 300, "y": 200 },
          "data": {
            "prompt": "請摘要這部影片",
            "timeout": 120
          }
        }
      ],
      "edges": [
        {
          "id": "edge-1",
          "source": "node-1",
          "sourceHandle": "data",
          "target": "node-2",
          "targetHandle": "url"
        }
      ]
    },
    "socketId": "your-socket-id"
  }'
```

**回應**：
```json
{
  "ok": true,
  "executionId": "exec-1709876543210",
  "message": "工作流已開始執行"
}
```

### 3. 監聽執行進度（WebSocket）

前端範例：

```typescript
import { io } from 'socket.io-client'

const socket = io('http://localhost:3001')

// 執行工作流
async function runWorkflow(workflow) {
  const response = await fetch('http://localhost:3001/api/workflow/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow,
      socketId: socket.id
    })
  })

  const { executionId } = await response.json()
  console.log('執行 ID:', executionId)
}

// 監聽事件
socket.on('execution:start', (data) => {
  console.log('工作流開始:', data)
})

socket.on('node:start', (data) => {
  console.log(`節點 ${data.nodeId} 開始執行`)
})

socket.on('node:log', (data) => {
  console.log(`[${data.nodeId}] ${data.message}`)
})

socket.on('node:progress', (data) => {
  console.log(`[${data.nodeId}] 進度: ${data.progress}%`)
})

socket.on('node:done', (data) => {
  console.log(`節點 ${data.nodeId} 完成:`, data.result)
})

socket.on('node:error', (data) => {
  console.error(`節點 ${data.nodeId} 錯誤:`, data.error)
})

socket.on('execution:complete', (data) => {
  console.log('工作流完成！總時間:', data.duration, 'ms')
})

socket.on('execution:failed', (data) => {
  console.error('工作流失敗:', data.error)
})
```

---

## 工作流定義格式

### Workflow 結構

```typescript
{
  id: string,           // 工作流 ID
  name: string,         // 工作流名稱
  nodes: Node[],        // 節點陣列
  edges: Edge[]         // 連線陣列
}
```

### Node 結構

```typescript
{
  id: string,           // 節點 ID（唯一）
  type: string,         // 節點類型（對應 registry.ts 的 id）
  position: {           // 畫布位置（視覺化用）
    x: number,
    y: number
  },
  data: {               // 節點配置（對應 inputs 定義）
    key: value,
    ...
  }
}
```

### Edge 結構

```typescript
{
  id: string,           // 邊 ID（唯一）
  source: string,       // 來源節點 ID
  sourceHandle: string, // 來源輸出埠（對應 outputs 的 key）
  target: string,       // 目標節點 ID
  targetHandle: string  // 目標輸入埠（對應 inputs 的 key）
}
```

---

## 範例：完整的工作流定義

### 線性工作流（A → B → C）

```json
{
  "id": "linear-workflow",
  "name": "YouTube → NotebookLM → Telegram",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "manual-trigger",
      "position": { "x": 100, "y": 200 },
      "data": {
        "payload": "{\"url\": \"https://youtube.com/watch?v=abc123\"}"
      }
    },
    {
      "id": "nlm-1",
      "type": "notebooklm",
      "position": { "x": 400, "y": 200 },
      "data": {
        "prompt": "請用 3 點摘要這部影片",
        "timeout": 120
      }
    },
    {
      "id": "telegram-1",
      "type": "send-telegram",
      "position": { "x": 700, "y": 200 },
      "data": {
        "bot_token": "YOUR_BOT_TOKEN",
        "chat_id": "-1002264990839"
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "trigger-1",
      "sourceHandle": "data",
      "target": "nlm-1",
      "targetHandle": "url"
    },
    {
      "id": "e2",
      "source": "nlm-1",
      "sourceHandle": "result",
      "target": "telegram-1",
      "targetHandle": "message"
    }
  ]
}
```

### 並行工作流（分支）

```json
{
  "id": "parallel-workflow",
  "name": "並行分析",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "manual-trigger",
      "position": { "x": 100, "y": 300 },
      "data": {
        "payload": "{\"url\": \"https://youtube.com/watch?v=abc123\"}"
      }
    },
    {
      "id": "nlm-1",
      "type": "notebooklm",
      "position": { "x": 400, "y": 200 },
      "data": {
        "prompt": "用 NotebookLM 分析",
        "timeout": 120
      }
    },
    {
      "id": "gpt-1",
      "type": "llm-generate",
      "position": { "x": 400, "y": 400 },
      "data": {
        "provider": "openai",
        "api_key": "YOUR_API_KEY",
        "model": "gpt-4o",
        "prompt": "用 GPT 分析"
      }
    },
    {
      "id": "telegram-1",
      "type": "send-telegram",
      "position": { "x": 700, "y": 300 },
      "data": {
        "bot_token": "YOUR_BOT_TOKEN",
        "chat_id": "-1002264990839"
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "trigger-1",
      "sourceHandle": "data",
      "target": "nlm-1",
      "targetHandle": "url"
    },
    {
      "id": "e2",
      "source": "trigger-1",
      "sourceHandle": "data",
      "target": "gpt-1",
      "targetHandle": "prompt"
    },
    {
      "id": "e3",
      "source": "nlm-1",
      "sourceHandle": "result",
      "target": "telegram-1",
      "targetHandle": "message"
    },
    {
      "id": "e4",
      "source": "gpt-1",
      "sourceHandle": "text",
      "target": "telegram-1",
      "targetHandle": "message"
    }
  ]
}
```

**執行流程**：
1. trigger-1 執行
2. nlm-1 和 gpt-1 **並行執行**（因為都只依賴 trigger-1）
3. 兩者都完成後，telegram-1 執行（因為依賴 nlm-1 和 gpt-1）

---

## WebSocket 事件參考

### 執行層級

| 事件 | 資料 | 說明 |
|------|------|------|
| `execution:start` | `{ executionId, workflowId }` | 工作流開始執行 |
| `execution:complete` | `{ executionId, duration }` | 工作流完成 |
| `execution:failed` | `{ executionId, error }` | 工作流失敗 |

### 節點層級

| 事件 | 資料 | 說明 |
|------|------|------|
| `node:start` | `{ executionId, nodeId, nodeType }` | 節點開始執行 |
| `node:done` | `{ executionId, nodeId, result, duration }` | 節點執行完成 |
| `node:error` | `{ executionId, nodeId, error }` | 節點執行失敗 |
| `node:log` | `{ executionId, nodeId, message, level }` | 節點日誌 |
| `node:progress` | `{ executionId, nodeId, progress, message }` | 節點進度更新 |
| `node:heartbeat` | `{ executionId, nodeId, message, elapsed }` | 節點心跳 |

---

## 故障排除

### 1. 工作流不執行

**檢查**：
- 是否有起始節點（沒有邊指向它的節點）？
- 節點類型是否在 `executor.ts` 有註冊？
- WebSocket 是否正確連線？

### 2. 節點卡住不動

**檢查**：
- 依賴的上游節點是否完成？
- 邊的定義是否正確（source、target、handle）？
- 查看後端 console 的錯誤訊息

### 3. 資料沒有傳遞

**檢查**：
- Edge 的 sourceHandle 是否對應上游節點的輸出埠？
- Edge 的 targetHandle 是否對應下游節點的輸入埠？
- 上游節點是否有返回對應的資料？

---

## 下一步擴充

- [ ] 執行記錄儲存（SQLite）
- [ ] 執行取消功能
- [ ] 條件分支支援（Filter 節點）
- [ ] 錯誤重試機制
- [ ] 定時觸發器
- [ ] Webhook 觸發器

---

**最後更新**：2026-03-02
