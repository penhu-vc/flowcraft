# 多工作流並行執行支援分析

> **分析日期**：2026-03-02
> **目標**：確認 flowcraft 是否準備好支援多條工作流同時執行

---

## 執行摘要

**結論**：❌ **目前不支援多工作流並行執行**

**原因**：
1. 沒有工作流執行引擎（只有單節點執行）
2. 缺少 executionId 和 workflowId 識別機制
3. 沒有執行記錄儲存

**好消息**：
- ✅ WebSocket 訊息隔離機制已完成（使用 socketId）
- ✅ 架構設計上沒有阻礙並行執行的因素
- ✅ Job Queue 系統已設計完成（支援並行任務）

---

## 詳細分析

### 1️⃣ 目前的架構

#### 單節點執行 API
```typescript
// server/src/index.ts:23-41
POST /api/execute
{
  nodeType: string,
  config: {...},
  socketId: string  // ← WebSocket 連線 ID
}
```

**問題**：
- 只能執行單個節點
- 沒有「工作流」的概念
- 無法追蹤多個節點的執行流程

#### WebSocket 訊息路由
```typescript
const emit = (event: string, data: unknown) => {
  if (socketId) io.to(socketId).emit(event, data)
}
```

**狀態**：✅ **已完成**
- 使用 `socketId` 隔離不同用戶的訊息
- 用戶 A 不會收到用戶 B 的執行進度

---

### 2️⃣ 多工作流執行需求

#### 場景 1：單用戶，多工作流
```
用戶開啟兩個瀏覽器分頁：
- 分頁 A：執行「YouTube Monitor → Telegram」
- 分頁 B：執行「NotebookLM → Google Sheets」
```

**需要**：
- 兩個工作流獨立執行
- 各自的進度不互相干擾
- 可同時查看兩個執行狀態

#### 場景 2：多用戶，多工作流
```
用戶 A：執行工作流 1
用戶 B：執行工作流 2
用戶 C：執行工作流 3
```

**需要**：
- 用戶之間完全隔離
- 資源不互相競爭（或有排隊機制）

#### 場景 3：定時觸發器，自動執行
```
每 30 分鐘：YouTube Monitor 檢查 10 個頻道
每 1 小時：RSS Feed 檢查 5 個來源
每天 9:00：生成每日報表
```

**需要**：
- 背景自動執行
- 不需要用戶開啟瀏覽器
- 執行記錄可查詢

---

### 3️⃣ 需要補充的功能

#### A. ExecutionId 機制

**目的**：唯一識別每次工作流執行

```typescript
interface Execution {
  id: string              // exec-1234567890
  workflowId: string      // workflow-abc
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: string
  completedAt?: string
  triggeredBy: 'manual' | 'cron' | 'webhook'
  nodes: {
    [nodeId: string]: {
      status: 'pending' | 'running' | 'completed' | 'failed'
      startedAt?: string
      completedAt?: string
      input: any
      output: any
      error?: string
    }
  }
}
```

**實作位置**：`server/src/execution/ExecutionManager.ts`（需新建）

#### B. 工作流執行引擎

**功能**：
- 解析工作流定義（nodes + edges）
- 按照連線順序執行節點
- 資料在節點間傳遞
- 處理並行分支
- 錯誤處理和重試

**API 端點**：
```typescript
POST /api/workflow/run
{
  workflowId: string,
  triggerId?: string,  // 從哪個節點開始（預設第一個觸發器）
  inputs?: {...}       // 手動觸發時的輸入資料
}

Response:
{
  executionId: string,
  status: 'running'
}
```

**實作位置**：`server/src/execution/WorkflowEngine.ts`（需新建）

#### C. 執行記錄儲存

**目的**：
- 查詢歷史執行記錄
- 除錯和監控
- 統計和分析

**儲存方式**：
- 開發：SQLite (`executions.db`)
- 生產：PostgreSQL

**Schema**：
```sql
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  triggered_by TEXT,
  error TEXT,
  data JSON
);

CREATE TABLE execution_nodes (
  execution_id TEXT,
  node_id TEXT,
  status TEXT,
  started_at TEXT,
  completed_at TEXT,
  input JSON,
  output JSON,
  error TEXT,
  PRIMARY KEY (execution_id, node_id)
);
```

**實作位置**：`server/src/storage/ExecutionStore.ts`（需新建）

#### D. WebSocket 訊息增強

**目前**：
```typescript
emit('node:start', { nodeType })
```

**需要改成**：
```typescript
emit('execution:start', {
  executionId: 'exec-123',
  workflowId: 'workflow-1'
})

emit('node:start', {
  executionId: 'exec-123',
  nodeId: 'node-5',
  nodeType: 'notebooklm'
})

emit('node:progress', {
  executionId: 'exec-123',
  nodeId: 'node-5',
  progress: 50,
  message: '等待 AI 處理...'
})

emit('node:done', {
  executionId: 'exec-123',
  nodeId: 'node-5',
  result: {...}
})

emit('execution:complete', {
  executionId: 'exec-123',
  duration: 125000
})
```

**好處**：
- 前端可以同時追蹤多個執行
- 清楚區分不同工作流的訊息

---

### 4️⃣ 並行執行的隔離策略

#### WebSocket 訊息隔離（已完成 ✅）

```typescript
// 方式 1：使用 socketId（目前）
io.to(socketId).emit('node:start', {...})

// 方式 2：使用 room（更靈活）
socket.join(`execution-${executionId}`)
io.to(`execution-${executionId}`).emit('node:start', {...})
```

**狀態**：已實作 socketId 隔離，可改用 room 增加靈活性

#### 資料隔離（需補充）

```typescript
// 每個 execution 有獨立的 context
const executionContext = new Map<string, any>()

executionContext.set(executionId, {
  workflow: {...},
  currentNode: 'node-5',
  nodeOutputs: {
    'node-1': { timestamp: '...' },
    'node-2': { video: {...} }
  }
})
```

#### 資源隔離（需考量）

**問題**：如果 10 個工作流同時執行 NotebookLM，會開啟 10 個 Chrome？

**解決方案**：
1. **Queue 排隊**：使用 Job Queue 限制並行數量
2. **資源池**：共用瀏覽器實例（複雜）
3. **優先級**：重要任務優先執行

**建議**：使用 Queue，設定最大並行數：
```typescript
const queue = new MemoryQueue({
  concurrency: 3  // 最多同時執行 3 個任務
})
```

---

### 5️⃣ 實作優先級

#### Phase 1：基礎執行引擎（必須）
- [ ] ExecutionId 機制
- [ ] 工作流執行引擎（反應式，支援單一工作流）
- [ ] WebSocket 訊息增強（加上 executionId）
- [ ] 前端執行監控 UI

#### Phase 2：並行支援（重要）
- [ ] 執行記錄儲存（SQLite）
- [ ] 多工作流同時執行
- [ ] 執行歷史查詢 API

#### Phase 3：觸發器管理（重要）
- [ ] Cron 觸發器背景服務
- [ ] Webhook 觸發器路由
- [ ] 觸發器啟用/停用管理

#### Phase 4：進階功能（選填）
- [ ] 並行數量限制
- [ ] 執行優先級
- [ ] 執行取消功能
- [ ] 執行暫停/恢復

---

## 結論

### 目前狀態總結

| 功能 | 狀態 | 說明 |
|------|------|------|
| WebSocket 訊息隔離 | ✅ 完成 | 使用 socketId |
| Job Queue 系統 | ✅ 完成 | 已設計接口 |
| 執行引擎 | ❌ 缺少 | 只有單節點執行 |
| ExecutionId 機制 | ❌ 缺少 | 無法追蹤工作流 |
| 執行記錄儲存 | ❌ 缺少 | 無歷史記錄 |
| 並行執行支援 | ❌ 缺少 | 架構上可行，但未實作 |

### 推薦實作順序

1. **先完成決策 2-7**（執行順序、資料傳遞等）
2. **實作 Phase 1**：基礎執行引擎
3. **實作 Phase 2**：並行支援
4. **實作 Phase 3**：觸發器管理

### 好消息

雖然目前不支援多工作流並行執行，但**沒有設計上的障礙**：
- WebSocket 隔離機制已完成
- Job Queue 系統已設計
- 後端架構支援擴展

只需要補充執行引擎和記錄儲存即可支援並行執行！

---

**下一步**：繼續理解「決策 2：反應式執行順序」

---

最後更新：2026-03-02
