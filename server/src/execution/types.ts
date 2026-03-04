/**
 * Workflow Execution Types
 */

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface Execution {
  id: string                    // exec-1234567890
  workflowId: string
  status: ExecutionStatus
  startedAt: string
  completedAt?: string
  triggeredBy: 'manual' | 'cron' | 'webhook'
  error?: string
  nodes: Map<string, NodeExecution>
}

export interface NodeExecution {
  nodeId: string
  nodeType: string
  status: NodeStatus
  startedAt?: string
  completedAt?: string
  input?: any
  output?: any
  error?: string
  duration?: number
}

export interface Workflow {
  id: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, any>
}

export interface WorkflowEdge {
  id: string
  source: string          // 來源節點 ID
  sourceHandle: string    // 來源輸出埠
  target: string          // 目標節點 ID
  targetHandle: string    // 目標輸入埠
}

export type EmitFn = (event: string, data: unknown) => void
