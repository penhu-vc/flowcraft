/**
 * Workflow Execution API
 */

import { socketManager } from './socket'

const API_BASE = 'http://localhost:3001/api'

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, any>
}

export interface WorkflowEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface Workflow {
  id: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface ExecutionResponse {
  ok: boolean
  executionId: string
  message: string
}

/**
 * 執行工作流
 */
export async function runWorkflow(
  workflow: Workflow,
  nodeCache?: Record<string, any>
): Promise<ExecutionResponse> {
  const socket = socketManager.getSocket()

  if (!socket) {
    throw new Error('WebSocket not connected')
  }

  const response = await fetch(`${API_BASE}/workflow/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workflow,
      socketId: socket.id,
      nodeCache: nodeCache || {}
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to start workflow')
  }

  return response.json()
}

/**
 * 執行單個節點（測試用）
 */
export async function executeNode(
  nodeType: string,
  config: Record<string, any>
): Promise<any> {
  const socket = socketManager.getSocket()

  const response = await fetch(`${API_BASE}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nodeType,
      config,
      socketId: socket?.id
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Execution failed')
  }

  return response.json()
}
