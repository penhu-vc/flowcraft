/**
 * Asset Library - 跨 tab 共享的資產管理
 * 從 AI Studio 生成的圖片/影片可「收歸」到此，之後可拖曳到上傳區使用
 */
import { ref, watch } from 'vue'

export interface AssetItem {
  id: string
  type: 'image' | 'video' | 'audio'
  url: string         // resolved URL (server path or blob)
  mimeType: string
  label: string       // e.g. "Image Editing", "Text to Video"
  createdAt: string
  thumbnailUrl?: string
  duration?: number   // seconds, for audio/video
  filename?: string
}

const STORAGE_KEY = 'flowcraft-asset-library'

// Singleton state shared across components
const assets = ref<AssetItem[]>(loadFromStorage())

function loadFromStorage(): AssetItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToStorage() {
  try {
    // 過濾掉 base64/blob URL（太大，無法持久化），只保存伺服器路徑
    const persistable = assets.value.filter(a =>
      !a.url.startsWith('data:') && !a.url.startsWith('blob:') && a.type !== 'audio'
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
  } catch { /* ignore */ }
}

watch(assets, saveToStorage, { deep: true })

export function useAssetLibrary() {
  function addAsset(item: Omit<AssetItem, 'id' | 'createdAt'>) {
    // Prevent duplicates by URL
    if (assets.value.some(a => a.url === item.url)) return
    assets.value.unshift({
      ...item,
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    })
  }

  function removeAsset(id: string) {
    const idx = assets.value.findIndex(a => a.id === id)
    if (idx >= 0) assets.value.splice(idx, 1)
  }

  function clearAll() {
    assets.value.length = 0
  }

  function hasAsset(url: string): boolean {
    return assets.value.some(a => a.url === url)
  }

  return {
    assets,
    addAsset,
    removeAsset,
    clearAll,
    hasAsset,
  }
}
