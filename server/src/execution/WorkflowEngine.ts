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
    private emit: EmitFn,
    private nodeCache: Record<string, any> = {}
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

      // 區分觸發器和一般起始節點
      const triggers = this.sortTriggers(startNodes)
      const nonTriggers = startNodes.filter(node => !this.isTriggerNode(node))

      // 如果有觸發器，根據模式執行
      if (triggers.length > 0) {
        const triggerMode = this.workflow.triggerMode || 'fallback'

        if (triggerMode === 'fallback') {
          // 模式 A：運行失敗時更換
          await this.runTriggersInFallbackMode(triggers)
        } else {
          // 模式 B：按順序觸發
          await this.runTriggersInSequentialMode(triggers)
        }
      }

      // 執行非觸發器的起始節點
      if (nonTriggers.length > 0) {
        await Promise.all(
          nonTriggers.map(node => this.executeNode(node))
        )
      }

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

    // 🔀 檢查條件執行：如果所有輸入都是 null/undefined，跳過執行
    const hasAnyValidInput = Object.values(inputs).some(value => value !== null && value !== undefined)
    if (!hasAnyValidInput && Object.keys(inputs).length > 0) {
      // 條件未滿足：跳過執行，輸出 null 讓下游也跳過
      const nullOutputs: Record<string, null> = {}
      const outgoingEdges = this.findOutgoingEdges(node.id)
      for (const edge of outgoingEdges) {
        const key = edge.sourceHandle.replace(/^out-/, '')
        nullOutputs[key] = null
      }
      this.nodeOutputs.set(node.id, nullOutputs)
      this.completedNodes.add(node.id)
      this.pendingNodes.delete(node.id)

      nodeExecution.status = 'skipped'
      nodeExecution.completedAt = new Date().toISOString()
      nodeExecution.duration = 0

      this.emit('node:skipped', {
        executionId: this.executionId,
        nodeId: node.id,
        nodeType: node.type
      })
      this.emit('node:log', {
        executionId: this.executionId,
        nodeId: node.id,
        message: '⏭️ 跳過執行（條件未滿足：所有輸入為 null）'
      })

      // 觸發下游節點
      await this.triggerDownstream(node.id)
      return
    }

    // 🚫 檢查節點是否被停用
    if (node.data.disabled === true) {
      // 停用的節點：跳過執行，但傳遞上游資料（passthrough）
      this.nodeOutputs.set(node.id, inputs)
      this.completedNodes.add(node.id)
      this.pendingNodes.delete(node.id)

      nodeExecution.status = 'skipped'
      nodeExecution.completedAt = new Date().toISOString()
      nodeExecution.duration = 0

      this.emit('node:skipped', {
        executionId: this.executionId,
        nodeId: node.id,
        nodeType: node.type
      })

      // 觸發下游節點
      await this.triggerDownstream(node.id)
      return
    }

    // 發送開始事件
    this.emit('node:start', {
      executionId: this.executionId,
      nodeId: node.id,
      nodeType: node.type
    })

    try {
      // ⚡ 檢查是否使用快取結果
      if (node.data.useCachedResult && this.nodeCache[node.id]) {
        const cachedResult = this.nodeCache[node.id]

        this.emit('node:log', {
          executionId: this.executionId,
          nodeId: node.id,
          message: `⚡ 使用快取結果（跳過執行）`
        })

        // 直接使用快取結果
        this.nodeOutputs.set(node.id, cachedResult)
        this.completedNodes.add(node.id)
        this.pendingNodes.delete(node.id)

        nodeExecution.status = 'completed'
        nodeExecution.completedAt = new Date().toISOString()
        nodeExecution.output = cachedResult
        nodeExecution.duration = 0  // 快取結果執行時間為 0

        this.emit('node:done', {
          executionId: this.executionId,
          nodeId: node.id,
          result: cachedResult,
          duration: 0,
          cached: true
        })

        // 觸發下游節點
        await this.triggerDownstream(node.id)
        return
      }

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
    const targetNode = this.findNodeById(nodeId)
    const inputs: Record<string, any> = {}
    let collectedMetadata: Record<string, any> = {}

    // 🆕 如果目標節點是 execution-logger，使用嵌套結構
    if (targetNode?.data?.nodeType === 'execution-logger') {
      return this.prepareExecutionLoggerInputs(nodeId, incomingEdges)
    }

    // 原本的邏輯（其他節點）
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
          const value = upstreamOutput[sourceKey]

          // 如果同一個 targetKey 已經有值，合併成物件
          if (targetKey in inputs) {
            // 如果已經是物件，合併新欄位
            if (typeof inputs[targetKey] === 'object' && !Array.isArray(inputs[targetKey])) {
              inputs[targetKey] = { ...inputs[targetKey], [sourceKey]: value }
            } else {
              // 否則轉成物件格式
              const oldValue = inputs[targetKey]
              inputs[targetKey] = { _previous: oldValue, [sourceKey]: value }
            }
            this.emit('node:log', {
              executionId: this.executionId,
              nodeId: nodeId,
              message: `[prepareInputs] ✓ Merged: ${sourceKey} → ${targetKey} (multi-input)`
            })
          } else {
            inputs[targetKey] = value
            this.emit('node:log', {
              executionId: this.executionId,
              nodeId: nodeId,
              message: `[prepareInputs] ✓ Mapped: ${sourceKey} → ${targetKey}, value: ${String(value).substring(0, 50)}...`
            })
          }
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

  /**
   * 🆕 為 Execution Logger 準備嵌套結構的輸入資料
   */
  private prepareExecutionLoggerInputs(nodeId: string, incomingEdges: WorkflowEdge[]): Record<string, any> {
    const nodeDataMap = new Map<string, any>()  // nodeId -> { nodeType, label, outputs }

    this.emit('node:log', {
      executionId: this.executionId,
      nodeId: nodeId,
      message: `[ExecutionLogger] 使用嵌套結構模式`
    })

    // 收集所有上游節點的輸出
    for (const edge of incomingEdges) {
      const upstreamOutput = this.nodeOutputs.get(edge.source)
      const sourceNode = this.findNodeById(edge.source)

      if (!upstreamOutput || !sourceNode) continue

      const sourceKey = edge.sourceHandle.replace(/^out-/, '')

      // 初始化節點資料結構
      if (!nodeDataMap.has(edge.source)) {
        nodeDataMap.set(edge.source, {
          nodeType: sourceNode.data.nodeType,
          label: sourceNode.data.label,
          outputs: {}
        })
      }

      // 收集輸出欄位
      if (sourceKey in upstreamOutput) {
        const nodeData = nodeDataMap.get(edge.source)!
        nodeData.outputs[sourceKey] = upstreamOutput[sourceKey]

        this.emit('node:log', {
          executionId: this.executionId,
          nodeId: nodeId,
          message: `[ExecutionLogger] 收集: ${sourceNode.data.label} (${edge.source}) → ${sourceKey}`
        })
      }
    }

    // 組裝最終資料結構
    const data: Record<string, any> = {}
    const index: Record<string, any> = {}

    for (const [sourceNodeId, nodeData] of nodeDataMap) {
      data[sourceNodeId] = nodeData

      // 自動建立快速索引
      for (const [key, value] of Object.entries(nodeData.outputs)) {
        if (this.isIndexableField(key)) {
          index[key] = value
          this.emit('node:log', {
            executionId: this.executionId,
            nodeId: nodeId,
            message: `[ExecutionLogger] 索引欄位: ${key}`
          })
        }
      }
    }

    data._index = index

    this.emit('node:log', {
      executionId: this.executionId,
      nodeId: nodeId,
      message: `[ExecutionLogger] ✓ 收集 ${nodeDataMap.size} 個節點，索引 ${Object.keys(index).length} 個欄位`
    })

    return { data }
  }

  /**
   * 🆕 判斷欄位是否應該加入快速索引
   */
  private isIndexableField(key: string): boolean {
    const indexFields = [
      'message_id',
      'recordCollectionId',
      'url',
      'title',
      'video',
      'thumbnail',
      'channel_name',
      'notebook_url'
    ]
    return indexFields.includes(key)
  }

  // ── 觸發器輪詢機制 ──────────────────────────────────────────────

  /**
   * 判斷節點是否為觸發器
   */
  private isTriggerNode(node: WorkflowNode): boolean {
    // 觸發器通常有 category: 'trigger' 或特定的 type
    const triggerTypes = ['manual-trigger', 'youtube-monitor', 'youtube-recent-videos']
    return node.data.category === 'trigger' || triggerTypes.includes(node.type)
  }

  /**
   * 根據 triggerOrder 排序觸發器
   */
  private sortTriggers(triggers: WorkflowNode[]): WorkflowNode[] {
    return triggers.sort((a, b) => {
      const orderA = a.data.triggerOrder || 999
      const orderB = b.data.triggerOrder || 999
      return orderA - orderB
    })
  }

  /**
   * 判斷觸發器結果是否有內容
   */
  private hasTriggerContent(result: any): boolean {
    if (result === null || result === undefined) return false
    if (result === '') return false
    if (Array.isArray(result) && result.length === 0) return false
    if (typeof result === 'object' && Object.keys(result).length === 0) return false
    return true
  }

  /**
   * 模式 A：運行失敗時更換（Fallback）
   * 依序嘗試觸發器，第一個有內容就停止
   */
  private async runTriggersInFallbackMode(triggers: WorkflowNode[]): Promise<void> {
    this.emit('node:log', {
      executionId: this.executionId,
      message: `🔄 觸發器模式：Fallback（共 ${triggers.length} 個觸發器）`
    })

    for (let i = 0; i < triggers.length; i++) {
      const trigger = triggers[i]

      this.emit('node:log', {
        executionId: this.executionId,
        message: `🎯 嘗試觸發器 ${i + 1}/${triggers.length}：${trigger.data.label || trigger.type}`
      })

      try {
        // 執行觸發器
        await this.executeNode(trigger)

        // 檢查輸出
        const result = this.nodeOutputs.get(trigger.id)

        if (this.hasTriggerContent(result)) {
          // 有內容，停止嘗試其他觸發器
          this.emit('node:log', {
            executionId: this.executionId,
            message: `✅ 觸發器 ${i + 1} 成功，停止嘗試其他觸發器`
          })
          return
        } else {
          // 暫無內容，嘗試下一個
          this.emit('node:log', {
            executionId: this.executionId,
            message: `⏭️ 觸發器 ${i + 1} 暫無內容，嘗試下一個`
          })
        }
      } catch (error) {
        // 執行失敗，嘗試下一個
        this.emit('node:log', {
          executionId: this.executionId,
          message: `⚠️ 觸發器 ${i + 1} 執行失敗：${error}，嘗試下一個`
        })
      }
    }

    // 所有觸發器都沒有內容
    this.emit('node:log', {
      executionId: this.executionId,
      message: `⏸️ 所有觸發器都暫無內容，停止工作流`
    })
  }

  /**
   * 模式 B：按順序觸發（Sequential）
   * 依序執行所有觸發器，每個都執行完整工作流
   */
  private async runTriggersInSequentialMode(triggers: WorkflowNode[]): Promise<void> {
    this.emit('node:log', {
      executionId: this.executionId,
      message: `🔄 觸發器模式：Sequential（共 ${triggers.length} 個觸發器）`
    })

    for (let i = 0; i < triggers.length; i++) {
      const trigger = triggers[i]

      this.emit('node:log', {
        executionId: this.executionId,
        message: `🎯 執行觸發器 ${i + 1}/${triggers.length}：${trigger.data.label || trigger.type}`
      })

      try {
        // 執行觸發器（會自動觸發下游節點）
        await this.executeNode(trigger)

        this.emit('node:log', {
          executionId: this.executionId,
          message: `✅ 觸發器 ${i + 1} 執行完成`
        })
      } catch (error) {
        this.emit('node:log', {
          executionId: this.executionId,
          message: `⚠️ 觸發器 ${i + 1} 執行失敗：${error}`
        })
      }
    }
  }

  // ── 輔助函數 ──────────────────────────────────────────────────

  private findStartNodes(): WorkflowNode[] {
    console.log('[WorkflowEngine] Finding start nodes...')
    console.log('[WorkflowEngine] Total nodes:', this.workflow.nodes.length)
    console.log('[WorkflowEngine] Total edges:', this.workflow.edges.length)
    console.log('[WorkflowEngine] Nodes:', this.workflow.nodes.map(n => ({ id: n.id, type: n.type })))

    // 起始節點條件：
    // 1. 沒有輸入邊（incoming edges）
    // 2. 有輸出邊（outgoing edges）=> 確保節點連接到工作流中
    // 孤立節點（沒有任何連線）不會被執行
    const startNodes = this.workflow.nodes.filter(node => {
      const incoming = this.findIncomingEdges(node.id)
      const outgoing = this.findOutgoingEdges(node.id)
      const isStartNode = incoming.length === 0 && outgoing.length > 0
      console.log(`[WorkflowEngine] Node ${node.id}: incoming=${incoming.length}, outgoing=${outgoing.length}, isStart=${isStartNode}`)
      return isStartNode
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
