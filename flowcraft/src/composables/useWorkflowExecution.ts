/**
 * Workflow Execution Composable
 * 處理工作流執行和 WebSocket 事件監聽
 */

import { onMounted, onUnmounted } from 'vue'
import { socketManager } from '../api/socket'
import { runWorkflow, type Workflow } from '../api/workflow'
import { useExecutionStore } from '../stores/execution'
import type { Socket } from 'socket.io-client'

export function useWorkflowExecution() {
  const executionStore = useExecutionStore()
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
  async function executeWorkflow(workflow: Workflow) {
    try {
      const result = await runWorkflow(workflow)
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
