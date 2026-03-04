/**
 * History Management Composable
 * 提供 Undo/Redo 功能給工作流編輯器
 */

import { ref, computed, type Ref, watch } from 'vue'
import type { Node, Edge } from '@vue-flow/core'

interface HistoryState {
  nodes: Node[]
  edges: Edge[]
}

const MAX_HISTORY_SIZE = 50  // 最多保留 50 個歷史記錄

export function useHistory(
  nodes: Ref<Node[]>,
  edges: Ref<Edge[]>
) {
  // 歷史堆疊
  const history = ref<HistoryState[]>([])
  const historyIndex = ref(-1)
  const isUndoingOrRedoing = ref(false)

  // 計算屬性
  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  /**
   * 深拷貝節點和邊（避免引用問題）
   */
  function cloneState(): HistoryState {
    return {
      nodes: JSON.parse(JSON.stringify(nodes.value)),
      edges: JSON.parse(JSON.stringify(edges.value))
    }
  }

  /**
   * 記錄當前狀態到歷史
   */
  function recordHistory() {
    if (isUndoingOrRedoing.value) return

    const currentState = cloneState()

    // 如果當前不在歷史末端，刪除之後的記錄（分支）
    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1)
    }

    // 添加新狀態
    history.value.push(currentState)
    historyIndex.value = history.value.length - 1

    // 限制歷史大小
    if (history.value.length > MAX_HISTORY_SIZE) {
      history.value.shift()
      historyIndex.value--
    }
  }

  /**
   * 初始化歷史（記錄初始狀態）
   */
  function initHistory() {
    history.value = [cloneState()]
    historyIndex.value = 0
  }

  /**
   * 撤銷 (Undo)
   */
  function undo() {
    if (!canUndo.value) return

    isUndoingOrRedoing.value = true
    historyIndex.value--
    const state = history.value[historyIndex.value]

    nodes.value = JSON.parse(JSON.stringify(state.nodes))
    edges.value = JSON.parse(JSON.stringify(state.edges))

    // 使用 nextTick 確保狀態更新完成後再允許記錄
    setTimeout(() => {
      isUndoingOrRedoing.value = false
    }, 100)

    console.log(`[History] Undo to state ${historyIndex.value}`)
  }

  /**
   * 重做 (Redo)
   */
  function redo() {
    if (!canRedo.value) return

    isUndoingOrRedoing.value = true
    historyIndex.value++
    const state = history.value[historyIndex.value]

    nodes.value = JSON.parse(JSON.stringify(state.nodes))
    edges.value = JSON.parse(JSON.stringify(state.edges))

    setTimeout(() => {
      isUndoingOrRedoing.value = false
    }, 100)

    console.log(`[History] Redo to state ${historyIndex.value}`)
  }

  /**
   * 清除歷史
   */
  function clearHistory() {
    history.value = []
    historyIndex.value = -1
  }

  return {
    // 狀態
    canUndo,
    canRedo,
    historyIndex: computed(() => historyIndex.value),
    historyLength: computed(() => history.value.length),

    // 方法
    recordHistory,
    initHistory,
    undo,
    redo,
    clearHistory
  }
}
