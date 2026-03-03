# Job Queue 使用指南

## 概述

Job Queue 用於處理**長時間執行**的任務（超過 5 分鐘），例如：
- 影片渲染（10-60 分鐘）
- 大量資料處理
- 複雜的 AI 模型推理
- Batch 任務

## 何時使用 Job Queue？

| 執行時間 | 處理方式 |
|---------|---------|
| < 30 秒 | 直接同步執行 |
| 30 秒 - 5 分鐘 | 異步執行 + WebSocket |
| **> 5 分鐘** | **Job Queue** ✅ |

## 基本用法

### 1. 新增任務到 Queue

```typescript
import { queueManager } from './queue/QueueManager'

// 新增一個影片渲染任務
const jobId = await queueManager.addJob('default', {
  executionId: 'exec-123',
  workflowId: 'workflow-1',
  nodeId: 'node-5',
  nodeType: 'video-render',
  config: {
    videoUrl: 'https://...',
    resolution: '1080p',
    effects: ['fade', 'transition']
  },
  triggeredAt: new Date().toISOString()
}, {
  priority: 1,           // 優先級（數字越小越優先）
  attempts: 3,           // 最多重試 3 次
  timeout: 1800000,      // 30 分鐘超時
  backoff: {
    type: 'exponential',
    delay: 5000          // 重試間隔從 5 秒開始，指數增長
  }
})

console.log(`任務已加入 Queue: ${jobId}`)
```

### 2. 註冊任務處理器

```typescript
import { executeNode } from '../executor'

const queue = queueManager.getQueue('default')

// 註冊處理函數
queue.process(async (job) => {
  const { nodeType, config, executionId, nodeId } = job.data

  console.log(`開始執行任務: ${job.id}`)

  try {
    // 執行節點
    const result = await executeNode(nodeType, config, (event, data) => {
      // 更新進度
      if (event === 'node:progress') {
        queue.updateProgress(job.id, {
          percent: data.progress,
          message: data.message
        })
      }
    })

    return {
      success: true,
      data: result,
      duration: Date.now() - new Date(job.startedAt!).getTime()
    }

  } catch (error) {
    throw error  // Queue 會自動處理重試
  }
})
```

### 3. 監聽任務事件

```typescript
// 進度更新
queue.onProgress((jobId, progress) => {
  console.log(`Job ${jobId}: ${progress.percent}% - ${progress.message}`)

  // 透過 WebSocket 推送給前端
  io.emit('job:progress', {
    jobId,
    progress: progress.percent,
    message: progress.message
  })
})

// 任務完成
queue.onCompleted((jobId, result) => {
  console.log(`Job ${jobId} 完成:`, result)

  io.emit('job:completed', {
    jobId,
    result: result.data,
    duration: result.duration
  })
})

// 任務失敗
queue.onFailed((jobId, error) => {
  console.error(`Job ${jobId} 失敗:`, error)

  io.emit('job:failed', {
    jobId,
    error
  })
})
```

### 4. 查詢任務狀態

```typescript
// 取得單個任務
const job = await queue.getJob(jobId)
console.log(job.status)  // 'waiting' | 'active' | 'completed' | 'failed'

// 取得所有進行中的任務
const activeJobs = await queue.getJobs({ status: 'active' })

// 取得特定工作流的所有任務
const workflowJobs = await queue.getJobs({
  workflowId: 'workflow-1',
  limit: 10
})
```

### 5. 任務管理

```typescript
// 取消任務
await queue.cancel(jobId)

// 暫停任務
await queue.pause(jobId)

// 恢復任務
await queue.resume(jobId)

// 清理舊任務（清理 7 天前的已完成任務）
const cleaned = await queue.clean(7 * 24 * 60 * 60 * 1000)
console.log(`清理了 ${cleaned} 個舊任務`)
```

## 完整範例：影片渲染節點

```typescript
// 在 executor.ts 中判斷是否使用 Queue
export async function executeNode(
  nodeType: string,
  config: Record<string, unknown>,
  emit: EmitFn
): Promise<unknown> {

  // 長時間任務使用 Queue
  const longRunningNodes = ['video-render', 'batch-process', 'ai-training']

  if (longRunningNodes.includes(nodeType)) {
    const jobId = await queueManager.addJob('default', {
      executionId: config.executionId as string,
      workflowId: config.workflowId as string,
      nodeId: config.nodeId as string,
      nodeType,
      config,
      triggeredAt: new Date().toISOString()
    }, {
      timeout: config.timeout as number || 1800000,  // 預設 30 分鐘
      attempts: 3
    })

    return { jobId, message: '任務已加入 Queue，將在背景執行' }
  }

  // 短時間任務直接執行
  switch (nodeType) {
    case 'notebooklm':
      return executeNotebookLM(config, emit)
    // ... 其他節點
  }
}
```

## 升級到 Bull/BullMQ（生產環境）

Memory Queue 適合開發，生產環境建議使用 Redis-based Queue：

### 安裝

```bash
npm install bull
npm install @types/bull --save-dev
```

### 實作 BullQueue 適配器

```typescript
// queue/BullQueue.ts
import Bull from 'bull'
import { IJobQueue, Job, JobData, JobOptions } from './types'

export class BullQueue implements IJobQueue {
  private queue: Bull.Queue

  constructor(name: string, redisUrl: string) {
    this.queue = new Bull(name, redisUrl)
  }

  async add(data: JobData, options?: JobOptions): Promise<string> {
    const job = await this.queue.add(data, {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts ?? 3,
      backoff: options?.backoff,
      timeout: options?.timeout
    })
    return job.id.toString()
  }

  // ... 實作其他方法
}
```

### 註冊使用

```typescript
import { BullQueue } from './queue/BullQueue'
import { queueManager } from './queue/QueueManager'

const bullQueue = new BullQueue('flowcraft', process.env.REDIS_URL!)
queueManager.registerQueue('default', bullQueue)
```

## API 端點

### POST /api/job/status
查詢任務狀態

```typescript
app.get('/api/job/:jobId', async (req, res) => {
  const { jobId } = req.params
  const queue = queueManager.getQueue('default')
  const job = await queue.getJob(jobId)

  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }

  res.json(job)
})
```

### POST /api/job/cancel
取消任務

```typescript
app.post('/api/job/:jobId/cancel', async (req, res) => {
  const { jobId } = req.params
  const queue = queueManager.getQueue('default')
  const success = await queue.cancel(jobId)

  res.json({ success })
})
```

## 最佳實踐

1. **設定合理的 timeout**：根據節點類型設定不同的超時時間
2. **啟用重試機制**：網路錯誤等臨時性問題可自動重試
3. **使用 exponential backoff**：避免重試風暴
4. **定期清理舊任務**：避免記憶體/資料庫膨脹
5. **監控 Queue 深度**：Queue 太長表示處理能力不足
6. **生產環境使用 Redis**：Memory Queue 重啟後資料會丟失

## 未來擴充

- [ ] 多 Worker 支援（水平擴展）
- [ ] 任務優先級調整
- [ ] 定時任務（Cron Job）
- [ ] 任務依賴（Job A 完成後才執行 Job B）
- [ ] 監控 Dashboard
