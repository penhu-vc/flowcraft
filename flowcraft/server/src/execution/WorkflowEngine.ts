/**
 * Workflow Execution Engine (MVP Version)
 *
 * 功能：
 * - 執行線性工作流（A → B → C）
 * - 依賴檢查
 * - 資料傳遞
 * - 進度回報（透過 emit）
 */

import {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  Execution,
  NodeExecution,
  EmitFn
} from './types'
import { executeNode } from '../executor'

export class WorkflowEngine {
  private completedNodes = new Set<string>()
  private nodeOutputs = new Map<string, any>()
  private pendingNodes = new Set<string>()
  private execution: Execution

  constructor(
    private workflow: Workflow,
    private executionId: string,
    private emit: EmitFn
  ) {
    this.execution = {
      id: executionId,
      workflowId: workflow.id,
      status: 'running',
      startedAt: new Date().toISOString(),
      triggeredBy: 'manual',
      nodes: new Map()
    }
  }

  /**
   * 執行工作流
   */
  async run(): Promise<void> {
    try {
      this.emit('execution:start', {
        executionId: this.executionId,
        workflowId: this.workflow.id
      })

      // 找出起始節點（沒有任何邊指向它的節點）
      const startNodes = this.findStartNodes()

      if (startNodes.length === 0) {
        throw new Error('工作流沒有起始節點')
      }

      // 並行執行所有起始節點
      await Promise.all(
        startNodes.map(node => this.executeNode(node))
      )

      // 標記執行完成
      this.execution.status = 'completed'
      this.execution.completedAt = new Date().toISOString()

      this.emit('execution:complete', {
        executionId: this.executionId,
        duration: Date.now() - new Date(this.execution.startedAt).getTime()
      })

    } catch (error) {
      this.execution.status = 'failed'
      this.execution.error = error instanceof Error ? error.message : String(error)
      this.execution.completedAt = new Date().toISOString()

      this.emit('execution:failed', {
        executionId: this.executionId,
        error: this.execution.error
      })

      throw error
    }
  }

  /**
   * 執行單個節點
   */
  private async executeNode(node: WorkflowNode): Promise<void> {
    // 防止重複執行
    if (this.completedNodes.has(node.id) || this.pendingNodes.has(node.id)) {
      return
    }

    // 檢查依賴是否都完成
    if (!this.canExecuteNode(node.id)) {
      return
    }

    this.pendingNodes.add(node.id)

    // 建立節點執行記錄
    const nodeExecution: NodeExecution = {
      nodeId: node.id,
      nodeType: node.type,
      status: 'running',
      startedAt: new Date().toISOString()
    }
    this.execution.nodes.set(node.id, nodeExecution)

    // 準備輸入資料
    const inputs = this.prepareInputs(node.id)

    // 發送開始事件
    this.emit('node:start', {
      executionId: this.executionId,
      nodeId: node.id,
      nodeType: node.type
    })

    try {
      // 執行節點邏輯
      const result = await executeNode(
        node.type,
        { ...node.data, ...inputs },
        (event, data) => {
          // 轉發節點內部的事件（node:log, node:progress 等）
          this.emit(event, {
            executionId: this.executionId,
            nodeId: node.id,
            ...data
          })
        }
      )

      // 儲存輸出
      this.nodeOutputs.set(node.id, result)
      this.completedNodes.add(node.id)
      this.pendingNodes.delete(node.id)

      // 更新節點執行記錄
      nodeExecution.status = 'completed'
      nodeExecution.completedAt = new Date().toISOString()
      nodeExecution.output = result
      nodeExecution.duration = Date.now() - new Date(nodeExecution.startedAt!).getTime()

      // 發送完成事件
      this.emit('node:done', {
        executionId: this.executionId,
        nodeId: node.id,
        result,
        duration: nodeExecution.duration
      })

      // 🔥 觸發下游節點
      await this.triggerDownstream(node.id)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // 更新節點執行記錄
      nodeExecution.status = 'failed'
      nodeExecution.completedAt = new Date().toISOString()
      nodeExecution.error = errorMessage
      nodeExecution.duration = Date.now() - new Date(nodeExecution.startedAt!).getTime()

      this.pendingNodes.delete(node.id)

      // 發送錯誤事件
      this.emit('node:error', {
        executionId: this.executionId,
        nodeId: node.id,
        error: errorMessage
      })

      throw error
    }
  }

  /**
   * 觸發下游節點
   */
  private async triggerDownstream(nodeId: string): Promise<void> {
    const outgoingEdges = this.findOutgoingEdges(nodeId)
    const downstreamNodeIds = [...new Set(outgoingEdges.map(e => e.target))]

    // 並行執行所有下游節點（如果依賴滿足）
    await Promise.all(
      downstreamNodeIds.map(id => {
        const node = this.findNodeById(id)
        if (node) {
          return this.executeNode(node)
        }
      })
    )
  }

  /**
   * 檢查節點是否可以執行（所有依賴都完成）
   */
  private canExecuteNode(nodeId: string): boolean {
    const incomingEdges = this.findIncomingEdges(nodeId)
    return incomingEdges.every(edge => this.completedNodes.has(edge.source))
  }

  /**
   * 準備節點的輸入資料（從上游節點的輸出）
   */
  private prepareInputs(nodeId: string): Record<string, any> {
    const incomingEdges = this.findIncomingEdges(nodeId)
    const inputs: Record<string, any> = {}
    let collectedMetadata: Record<string, any> = {}

    for (const edge of incomingEdges) {
      const upstreamOutput = this.nodeOutputs.get(edge.source)
      if (upstreamOutput) {
        // 去掉 handle 前綴 (out-, in-)
        const sourceKey = edge.sourceHandle.replace(/^out-/, '')
        const targetKey = edge.targetHandle.replace(/^in-/, '')

        // Debug log
        this.emit('node:log', {
          executionId: this.executionId,
          nodeId: nodeId,
          message: `[prepareInputs] Edge: ${edge.sourceHandle} → ${edge.targetHandle}`
        })
        this.emit('node:log', {
          executionId: this.executionId,
          nodeId: nodeId,
          message: `[prepareInputs] Normalized: ${sourceKey} → ${targetKey}`
        })
        this.emit('node:log', {
          executionId: this.executionId,
          nodeId: nodeId,
          message: `[prepareInputs] Upstream output keys: ${Object.keys(upstreamOutput).join(', ')}`
        })

        // 傳遞 edge 指定的資料（強連結）
        if (sourceKey in upstreamOutput) {
          inputs[targetKey] = upstreamOutput[sourceKey]
          this.emit('node:log', {
            executionId: this.executionId,
            nodeId: nodeId,
            message: `[prepareInputs] ✓ Mapped: ${sourceKey} → ${targetKey}, value: ${String(upstreamOutput[sourceKey]).substring(0, 50)}...`
          })
        } else {
          this.emit('node:log', {
            executionId: this.executionId,
            nodeId: nodeId,
            message: `[prepareInputs] ✗ Source key '${sourceKey}' not found in upstream output`
          })
        }

        // 自動收集 metadata（弱連結）
        if (upstreamOutput._metadata) {
          collectedMetadata = { ...collectedMetadata, ...upstreamOutput._metadata }
        }
      }
    }

    // 合併 metadata 到 inputs（不覆蓋已有的 inputs）
    return { ...collectedMetadata, ...inputs }
  }

  // ── 輔助函數 ──────────────────────────────────────────────────

  private findStartNodes(): WorkflowNode[] {
    console.log('[WorkflowEngine] Finding start nodes...')
    console.log('[WorkflowEngine] Total nodes:', this.workflow.nodes.length)
    console.log('[WorkflowEngine] Total edges:', this.workflow.edges.length)
    console.log('[WorkflowEngine] Nodes:', this.workflow.nodes.map(n => ({ id: n.id, type: n.type })))

    const startNodes = this.workflow.nodes.filter(node => {
      const incoming = this.findIncomingEdges(node.id)
      console.log(`[WorkflowEngine] Node ${node.id} has ${incoming.length} incoming edges`)
      return incoming.length === 0
    })

    console.log('[WorkflowEngine] Start nodes found:', startNodes.length)
    return startNodes
  }

  private findIncomingEdges(nodeId: string): WorkflowEdge[] {
    return this.workflow.edges.filter(edge => edge.target === nodeId)
  }

  private findOutgoingEdges(nodeId: string): WorkflowEdge[] {
    return this.workflow.edges.filter(edge => edge.source === nodeId)
  }

  private findNodeById(nodeId: string): WorkflowNode | undefined {
    return this.workflow.nodes.find(n => n.id === nodeId)
  }

  /**
   * 取得執行結果
   */
  getExecution(): Execution {
    return this.execution
  }
}
