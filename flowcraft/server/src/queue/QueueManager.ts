/**
 * Queue Manager
 *
 * 統一管理所有 Job Queue
 * 單例模式，全局只有一個實例
 */

import { IJobQueue, JobData, JobOptions } from './types'
import { MemoryQueue } from './MemoryQueue'

class QueueManager {
  private static instance: QueueManager
  private queues = new Map<string, IJobQueue>()

  private constructor() {
    // 建立預設 queue
    this.queues.set('default', new MemoryQueue())
  }

  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager()
    }
    return QueueManager.instance
  }

  /**
   * 取得指定的 Queue
   * @param name Queue 名稱（預設 'default'）
   */
  getQueue(name: string = 'default'): IJobQueue {
    let queue = this.queues.get(name)
    if (!queue) {
      queue = new MemoryQueue()
      this.queues.set(name, queue)
    }
    return queue
  }

  /**
   * 註冊自訂 Queue 實作
   * @param name Queue 名稱
   * @param queue Queue 實例
   */
  registerQueue(name: string, queue: IJobQueue): void {
    this.queues.set(name, queue)
  }

  /**
   * 新增任務到指定 Queue
   * @param queueName Queue 名稱
   * @param data 任務資料
   * @param options 選項
   */
  async addJob(
    queueName: string,
    data: JobData,
    options?: JobOptions
  ): Promise<string> {
    const queue = this.getQueue(queueName)
    return queue.add(data, options)
  }

  /**
   * 關閉所有 Queue
   */
  async closeAll(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close()
    }
    this.queues.clear()
  }
}

export const queueManager = QueueManager.getInstance()
