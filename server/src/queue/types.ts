/**
 * Job Queue Types
 *
 * 抽象的 Job Queue 接口定義，支援長時間執行的任務
 * 未來可以切換不同的實作（Bull, BullMQ, Agenda）
 */

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'

export interface JobData {
  executionId: string
  workflowId: string
  nodeId: string
  nodeType: string
  config: Record<string, any>
  triggeredAt: string
}

export interface JobProgress {
  percent: number        // 0-100
  message?: string       // 進度描述
  elapsed?: number       // 已執行時間（毫秒）
  estimated?: number     // 預估剩餘時間（毫秒）
}

export interface JobResult {
  success: boolean
  data?: any
  error?: string
  duration: number       // 總執行時間（毫秒）
}

export interface Job {
  id: string
  data: JobData
  status: JobStatus
  progress: JobProgress
  result?: JobResult
  createdAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  attempts: number       // 嘗試次數
  maxAttempts: number    // 最大重試次數
}

/**
 * Job Queue 接口
 * 定義所有 Queue 實作必須遵守的契約
 */
export interface IJobQueue {
  /**
   * 新增任務到 Queue
   * @param data 任務資料
   * @param options 選項（優先級、延遲、重試等）
   * @returns Job ID
   */
  add(data: JobData, options?: JobOptions): Promise<string>

  /**
   * 取得任務狀態
   * @param jobId Job ID
   */
  getJob(jobId: string): Promise<Job | null>

  /**
   * 取消任務
   * @param jobId Job ID
   */
  cancel(jobId: string): Promise<boolean>

  /**
   * 暫停任務
   * @param jobId Job ID
   */
  pause(jobId: string): Promise<boolean>

  /**
   * 恢復任務
   * @param jobId Job ID
   */
  resume(jobId: string): Promise<boolean>

  /**
   * 取得所有任務（可選過濾條件）
   * @param filter 過濾條件
   */
  getJobs(filter?: JobFilter): Promise<Job[]>

  /**
   * 清理已完成/失敗的任務
   * @param olderThan 清理多久以前的任務（毫秒）
   */
  clean(olderThan: number): Promise<number>

  /**
   * 註冊任務處理器
   * @param processor 處理函數
   */
  process(processor: JobProcessor): void

  /**
   * 註冊進度監聽器
   * @param listener 監聽函數
   */
  onProgress(listener: ProgressListener): void

  /**
   * 註冊完成監聽器
   * @param listener 監聽函數
   */
  onCompleted(listener: CompletedListener): void

  /**
   * 註冊失敗監聽器
   * @param listener 監聽函數
   */
  onFailed(listener: FailedListener): void

  /**
   * 關閉 Queue
   */
  close(): Promise<void>
}

export interface JobOptions {
  priority?: number      // 優先級（數字越小越優先，預設 0）
  delay?: number         // 延遲執行（毫秒）
  attempts?: number      // 最大重試次數（預設 3）
  backoff?: {            // 重試間隔策略
    type: 'fixed' | 'exponential'
    delay: number
  }
  timeout?: number       // 任務超時時間（毫秒）
  removeOnComplete?: boolean  // 完成後自動移除（預設 false）
  removeOnFail?: boolean      // 失敗後自動移除（預設 false）
}

export interface JobFilter {
  status?: JobStatus | JobStatus[]
  workflowId?: string
  executionId?: string
  nodeType?: string
  createdAfter?: string
  createdBefore?: string
  limit?: number
  offset?: number
}

export type JobProcessor = (job: Job) => Promise<JobResult>
export type ProgressListener = (jobId: string, progress: JobProgress) => void
export type CompletedListener = (jobId: string, result: JobResult) => void
export type FailedListener = (jobId: string, error: string) => void
