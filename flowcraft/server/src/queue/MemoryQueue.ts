/**
 * Memory Queue Implementation
 *
 * 簡單的記憶體實作，適合開發和測試
 * 生產環境建議使用 Bull/BullMQ（需要 Redis）
 */

import {
  IJobQueue,
  Job,
  JobData,
  JobOptions,
  JobFilter,
  JobStatus,
  JobProcessor,
  ProgressListener,
  CompletedListener,
  FailedListener,
  JobProgress,
  JobResult
} from './types'

export class MemoryQueue implements IJobQueue {
  private jobs = new Map<string, Job>()
  private processor?: JobProcessor
  private progressListeners: ProgressListener[] = []
  private completedListeners: CompletedListener[] = []
  private failedListeners: FailedListener[] = []
  private processing = false
  private queue: string[] = []  // Job IDs in queue

  async add(data: JobData, options: JobOptions = {}): Promise<string> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    const job: Job = {
      id: jobId,
      data,
      status: options.delay ? 'delayed' : 'waiting',
      progress: { percent: 0 },
      createdAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: options.attempts ?? 3
    }

    this.jobs.set(jobId, job)

    if (options.delay) {
      setTimeout(() => {
        const j = this.jobs.get(jobId)
        if (j && j.status === 'delayed') {
          j.status = 'waiting'
          this.queue.push(jobId)
          this.processNext()
        }
      }, options.delay)
    } else {
      this.queue.push(jobId)
      this.processNext()
    }

    return jobId
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) ?? null
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job) return false

    if (job.status === 'waiting' || job.status === 'delayed') {
      this.jobs.delete(jobId)
      this.queue = this.queue.filter(id => id !== jobId)
      return true
    }

    // 無法取消正在執行的任務（需要更複雜的實作）
    return false
  }

  async pause(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job || job.status !== 'waiting') return false
    job.status = 'paused'
    return true
  }

  async resume(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job || job.status !== 'paused') return false
    job.status = 'waiting'
    this.processNext()
    return true
  }

  async getJobs(filter: JobFilter = {}): Promise<Job[]> {
    let jobs = Array.from(this.jobs.values())

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
      jobs = jobs.filter(j => statuses.includes(j.status))
    }

    if (filter.workflowId) {
      jobs = jobs.filter(j => j.data.workflowId === filter.workflowId)
    }

    if (filter.executionId) {
      jobs = jobs.filter(j => j.data.executionId === filter.executionId)
    }

    if (filter.nodeType) {
      jobs = jobs.filter(j => j.data.nodeType === filter.nodeType)
    }

    if (filter.createdAfter) {
      jobs = jobs.filter(j => j.createdAt >= filter.createdAfter!)
    }

    if (filter.createdBefore) {
      jobs = jobs.filter(j => j.createdAt <= filter.createdBefore!)
    }

    // Sort by created time (newest first)
    jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    if (filter.offset) {
      jobs = jobs.slice(filter.offset)
    }

    if (filter.limit) {
      jobs = jobs.slice(0, filter.limit)
    }

    return jobs
  }

  async clean(olderThan: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThan).toISOString()
    let cleaned = 0

    for (const [id, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.createdAt < cutoff
      ) {
        this.jobs.delete(id)
        cleaned++
      }
    }

    return cleaned
  }

  process(processor: JobProcessor): void {
    this.processor = processor
    this.processNext()
  }

  onProgress(listener: ProgressListener): void {
    this.progressListeners.push(listener)
  }

  onCompleted(listener: CompletedListener): void {
    this.completedListeners.push(listener)
  }

  onFailed(listener: FailedListener): void {
    this.failedListeners.push(listener)
  }

  async close(): Promise<void> {
    this.jobs.clear()
    this.queue = []
    this.processing = false
  }

  // ── Internal Methods ──────────────────────────────────────────────

  private async processNext(): Promise<void> {
    if (this.processing || !this.processor || this.queue.length === 0) {
      return
    }

    this.processing = true

    const jobId = this.queue.shift()
    if (!jobId) {
      this.processing = false
      return
    }

    const job = this.jobs.get(jobId)
    if (!job) {
      this.processing = false
      this.processNext()
      return
    }

    if (job.status !== 'waiting') {
      this.processing = false
      this.processNext()
      return
    }

    job.status = 'active'
    job.startedAt = new Date().toISOString()
    job.attempts++

    try {
      const result = await this.processor(job)

      job.status = 'completed'
      job.completedAt = new Date().toISOString()
      job.result = result
      job.progress = { percent: 100, message: '完成' }

      this.completedListeners.forEach(listener => listener(jobId, result))

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (job.attempts < job.maxAttempts) {
        // 重試
        job.status = 'waiting'
        this.queue.push(jobId)
      } else {
        // 失敗
        job.status = 'failed'
        job.failedAt = new Date().toISOString()
        job.result = {
          success: false,
          error: errorMessage,
          duration: Date.now() - new Date(job.startedAt!).getTime()
        }

        this.failedListeners.forEach(listener => listener(jobId, errorMessage))
      }
    }

    this.processing = false
    this.processNext()
  }

  /**
   * 更新 Job 進度（由 processor 呼叫）
   */
  updateProgress(jobId: string, progress: JobProgress): void {
    const job = this.jobs.get(jobId)
    if (!job) return

    job.progress = progress
    this.progressListeners.forEach(listener => listener(jobId, progress))
  }
}
