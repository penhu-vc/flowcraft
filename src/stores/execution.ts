/**
 * Execution State Store
 * 管理工作流執行狀態
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed'
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface NodeExecution {
  nodeId: string
  nodeType: string
  status: NodeStatus
  startedAt?: string
  completedAt?: string
  output?: any
  error?: string
  duration?: number
  progress?: number
  logs: string[]
}

export interface Execution {
  id: string
  workflowId: string
  status: ExecutionStatus
  startedAt?: string
  completedAt?: string
  duration?: number
  error?: string
  nodes: Map<string, NodeExecution>
}

// 腳本結果 Modal 狀態
export interface ScriptResult {
  nodeId: string
  nodeType: string
  script: string
  keywords?: string[]
  timestamp: string
}

export const useExecutionStore = defineStore('execution', () => {
  // State
  const currentExecution = ref<Execution | null>(null)
  const executionHistory = ref<Execution[]>([])

  // 腳本結果 Modal
  const scriptResultModal = ref<ScriptResult | null>(null)

  // Computed
  const isRunning = computed(() => currentExecution.value?.status === 'running')
  const executionId = computed(() => currentExecution.value?.id)

  // 獲取當前正在執行的節點ID
  const runningNodeId = computed(() => {
    if (!currentExecution.value) return null
    for (const [nodeId, nodeExec] of currentExecution.value.nodes.entries()) {
      if (nodeExec.status === 'running') {
        return nodeId
      }
    }
    return null
  })

  // 執行時間統計
  const executionStats = computed(() => {
    if (!currentExecution.value) return null

    const nodes = Array.from(currentExecution.value.nodes.values())
    const completedNodes = nodes.filter(n => n.duration !== undefined)

    if (completedNodes.length === 0) return null

    // 找出最慢的節點（Top 5）
    const sortedByDuration = [...completedNodes].sort((a, b) =>
      (b.duration || 0) - (a.duration || 0)
    )
    const slowestNodes = sortedByDuration.slice(0, 5)

    // 計算平均執行時間
    const totalNodeDuration = completedNodes.reduce((sum, n) => sum + (n.duration || 0), 0)
    const avgDuration = completedNodes.length > 0 ? totalNodeDuration / completedNodes.length : 0

    return {
      totalDuration: currentExecution.value.duration,
      slowestNodes,
      avgDuration,
      completedCount: completedNodes.length,
      totalCount: nodes.length
    }
  })

  // 檢查節點是否為最慢的節點之一
  function isSlowestNode(nodeId: string): boolean {
    if (!executionStats.value) return false
    return executionStats.value.slowestNodes.some(n => n.nodeId === nodeId)
  }

  // Actions
  function startExecution(executionId: string, workflowId: string) {
    console.log('[Store] startExecution called:', executionId, workflowId)
    currentExecution.value = {
      id: executionId,
      workflowId,
      status: 'running',
      startedAt: new Date().toISOString(),
      nodes: new Map()
    }
    console.log('[Store] currentExecution set:', currentExecution.value)
    console.log('[Store] currentExecution is null?', currentExecution.value === null)
  }

  function updateNodeStatus(
    nodeId: string,
    status: NodeStatus,
    data?: Partial<NodeExecution>
  ) {
    console.log('[Store] updateNodeStatus called:', { nodeId, status, data })
    if (!currentExecution.value) {
      console.log('[Store] updateNodeStatus: currentExecution is null!')
      return
    }

    let nodeExec = currentExecution.value.nodes.get(nodeId)
    console.log('[Store] existing nodeExec:', nodeExec)

    if (!nodeExec) {
      nodeExec = {
        nodeId,
        nodeType: data?.nodeType || '',
        status,
        logs: []
      }
      currentExecution.value.nodes.set(nodeId, nodeExec)
    }

    nodeExec.status = status

    if (data) {
      Object.assign(nodeExec, data)
    }

    if (status === 'running' && !nodeExec.startedAt) {
      nodeExec.startedAt = new Date().toISOString()
    }

    if ((status === 'completed' || status === 'failed') && !nodeExec.completedAt) {
      nodeExec.completedAt = new Date().toISOString()
      if (nodeExec.startedAt) {
        nodeExec.duration = Date.now() - new Date(nodeExec.startedAt).getTime()
      }
    }
  }

  function addNodeLog(nodeId: string, message: string) {
    if (!currentExecution.value) return

    const nodeExec = currentExecution.value.nodes.get(nodeId)
    if (nodeExec) {
      nodeExec.logs.push(`[${new Date().toLocaleTimeString()}] ${message}`)
    }
  }

  function updateNodeProgress(nodeId: string, progress: number, message?: string) {
    if (!currentExecution.value) return

    const nodeExec = currentExecution.value.nodes.get(nodeId)
    if (nodeExec) {
      nodeExec.progress = progress
      if (message) {
        addNodeLog(nodeId, message)
      }
    }
  }

  function completeExecution(duration?: number) {
    if (!currentExecution.value) return

    currentExecution.value.status = 'completed'
    currentExecution.value.completedAt = new Date().toISOString()
    currentExecution.value.duration = duration || (
      Date.now() - new Date(currentExecution.value.startedAt!).getTime()
    )

    // 加到歷史記錄
    executionHistory.value.unshift({ ...currentExecution.value })
    if (executionHistory.value.length > 50) {
      executionHistory.value = executionHistory.value.slice(0, 50)
    }
  }

  function failExecution(error: string) {
    if (!currentExecution.value) return

    currentExecution.value.status = 'failed'
    currentExecution.value.completedAt = new Date().toISOString()
    currentExecution.value.error = error
    currentExecution.value.duration = Date.now() - new Date(currentExecution.value.startedAt!).getTime()

    // 加到歷史記錄
    executionHistory.value.unshift({ ...currentExecution.value })
  }

  function clearExecution() {
    currentExecution.value = null
  }

  function getNodeExecution(nodeId: string): NodeExecution | undefined {
    return currentExecution.value?.nodes.get(nodeId)
  }

  // 腳本結果 Modal 相關方法
  function showScriptResult(result: ScriptResult) {
    scriptResultModal.value = result
  }

  function closeScriptResult() {
    scriptResultModal.value = null
  }

  return {
    // State
    currentExecution,
    executionHistory,
    scriptResultModal,

    // Computed
    isRunning,
    executionId,
    runningNodeId,
    executionStats,

    // Actions
    startExecution,
    updateNodeStatus,
    addNodeLog,
    updateNodeProgress,
    completeExecution,
    failExecution,
    clearExecution,
    getNodeExecution,
    isSlowestNode,
    showScriptResult,
    closeScriptResult
  }
})
