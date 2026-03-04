/**
 * Workflow Execution Composable
 * 處理工作流執行和 WebSocket 事件監聽
 */

import { onMounted, onUnmounted } from 'vue'
import { socketManager } from '../api/socket'
import { runWorkflow, type Workflow } from '../api/workflow'
import { useExecutionStore } from '../stores/execution'
import { useCollectionStore } from '../stores/collection'
import { useNodeCacheStore } from '../stores/nodeCache'
import type { Socket } from 'socket.io-client'

export function useWorkflowExecution() {
  const executionStore = useExecutionStore()
  const collectionStore = useCollectionStore()
  const nodeCacheStore = useNodeCacheStore()
  let socket: Socket | null = null

  /**
   * 連接 WebSocket 並註冊事件監聽器
   */
  function setupWebSocket() {
    socket = socketManager.connect()

    // 執行層級事件
    socket.on('execution:start', (data: any) => {
      console.log('[Execution] Start:', data)
      executionStore.startExecution(data.executionId, data.workflowId)
    })

    socket.on('execution:complete', (data: any) => {
      console.log('[Execution] Complete:', data)
      executionStore.completeExecution(data.duration)
    })

    socket.on('execution:failed', (data: any) => {
      console.error('[Execution] Failed:', data)
      executionStore.failExecution(data.error)
    })

    // 節點層級事件
    socket.on('node:start', (data: any) => {
      console.log('[Node] Start:', data.nodeId)
      executionStore.updateNodeStatus(data.nodeId, 'running', {
        nodeType: data.nodeType
      })
    })

    socket.on('node:done', (data: any) => {
      console.log('[Node] Done:', data.nodeId)

      // 檢查是否需要寫入資料集
      if (data.result && data.result._writeToCollection) {
        const { collectionId, data: recordData } = data.result
        const workflowId = executionStore.currentExecution?.workflowId

        console.log('[Collection] Writing to collection:', collectionId)
        const success = collectionStore.appendRecord(
          collectionId,
          recordData,
          workflowId,
          data.nodeId
        )

        if (success) {
          executionStore.addNodeLog(data.nodeId, '✅ 資料已寫入資料集')
        } else {
          executionStore.addNodeLog(data.nodeId, '⚠️ 資料集不存在或寫入失敗')
        }
      }

      // 🆕 保存節點執行結果到快取（如果不是使用快取結果）
      if (data.result && !data.cached) {
        const workflowId = executionStore.currentExecution?.workflowId
        if (workflowId) {
          nodeCacheStore.setCacheResult(
            data.nodeId,
            workflowId,
            data.result,
            data.nodeType || 'unknown'
          )
          console.log('[Cache] Saved result for node:', data.nodeId)
        }
      }

      executionStore.updateNodeStatus(data.nodeId, 'completed', {
        output: data.result,
        duration: data.duration
      })
    })

    socket.on('node:error', (data: any) => {
      console.error('[Node] Error:', data.nodeId, data.error)
      executionStore.updateNodeStatus(data.nodeId, 'failed', {
        error: data.error
      })
    })

    socket.on('node:log', (data: any) => {
      console.log('[Node] Log:', data.nodeId, data.message)
      executionStore.addNodeLog(data.nodeId, data.message)
    })

    socket.on('node:progress', (data: any) => {
      console.log('[Node] Progress:', data.nodeId, `${data.progress}%`)
      executionStore.updateNodeProgress(data.nodeId, data.progress, data.message)
    })

    socket.on('node:heartbeat', (data: any) => {
      console.log('[Node] Heartbeat:', data.nodeId)
      executionStore.addNodeLog(data.nodeId, data.message || '執行中...')
    })
  }

  /**
   * 清理 WebSocket 連接
   */
  function cleanupWebSocket() {
    if (socket) {
      socket.off('execution:start')
      socket.off('execution:complete')
      socket.off('execution:failed')
      socket.off('node:start')
      socket.off('node:done')
      socket.off('node:error')
      socket.off('node:log')
      socket.off('node:progress')
      socket.off('node:heartbeat')
    }
  }

  /**
   * 執行工作流
   */
  async function executeWorkflow(workflow: Workflow, nodeCache?: Record<string, any>) {
    try {
      const result = await runWorkflow(workflow, nodeCache)
      console.log('Workflow started:', result.executionId)
      return result
    } catch (error) {
      console.error('Failed to start workflow:', error)
      throw error
    }
  }

  // 自動連接和清理
  onMounted(() => {
    setupWebSocket()
  })

  onUnmounted(() => {
    cleanupWebSocket()
  })

  return {
    executeWorkflow,
    executionStore
  }
}
