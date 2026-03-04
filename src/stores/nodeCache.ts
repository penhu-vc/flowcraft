/**
 * Node Cache Store
 * 記錄每個節點的最後執行結果，支援跳過執行直接使用快取
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

interface NodeCacheEntry {
  nodeId: string
  workflowId: string
  result: any
  executedAt: string
  nodeType: string
}

const STORAGE_KEY = 'flowcraft_node_cache'

function loadFromStorage(): Record<string, NodeCacheEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveToStorage(cache: Record<string, NodeCacheEntry>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch (err) {
    console.warn('[NodeCache] Failed to save to localStorage:', err)
  }
}

export const useNodeCacheStore = defineStore('nodeCache', () => {
  const cache = ref<Record<string, NodeCacheEntry>>(loadFromStorage())

  /**
   * 儲存節點執行結果到快取
   */
  function setCacheResult(nodeId: string, workflowId: string, result: any, nodeType: string) {
    cache.value[nodeId] = {
      nodeId,
      workflowId,
      result,
      executedAt: new Date().toISOString(),
      nodeType
    }
    saveToStorage(cache.value)
  }

  /**
   * 取得節點的快取結果
   */
  function getCacheResult(nodeId: string): NodeCacheEntry | null {
    return cache.value[nodeId] || null
  }

  /**
   * 檢查節點是否有快取
   */
  function hasCache(nodeId: string): boolean {
    return !!cache.value[nodeId]
  }

  /**
   * 清除特定節點的快取
   */
  function clearCache(nodeId: string) {
    delete cache.value[nodeId]
    saveToStorage(cache.value)
  }

  /**
   * 清除所有快取
   */
  function clearAllCache() {
    cache.value = {}
    saveToStorage(cache.value)
  }

  /**
   * 清除特定工作流的所有快取
   */
  function clearWorkflowCache(workflowId: string) {
    const entries = Object.entries(cache.value)
    for (const [nodeId, entry] of entries) {
      if (entry.workflowId === workflowId) {
        delete cache.value[nodeId]
      }
    }
    saveToStorage(cache.value)
  }

  /**
   * 取得快取時間（人類可讀格式）
   */
  function getCacheAge(nodeId: string): string | null {
    const entry = cache.value[nodeId]
    if (!entry) return null

    const now = Date.now()
    const executedAt = new Date(entry.executedAt).getTime()
    const diffMs = now - executedAt

    const seconds = Math.floor(diffMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} 天前`
    if (hours > 0) return `${hours} 小時前`
    if (minutes > 0) return `${minutes} 分鐘前`
    return `${seconds} 秒前`
  }

  return {
    cache,
    setCacheResult,
    getCacheResult,
    hasCache,
    clearCache,
    clearAllCache,
    clearWorkflowCache,
    getCacheAge
  }
})
