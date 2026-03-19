/**
 * Asset Library - 跨 tab 共享的資產管理
 * 從 AI Studio 生成的圖片/影片可「收歸」到此，之後可拖曳到上傳區使用
 * 持久化到 backend JSON 檔，不依賴 localStorage
 */
import { ref, watch } from 'vue'
import { API_BASE_URL } from '../api/config'

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

// Singleton state shared across components
const assets = ref<AssetItem[]>([])
let loaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

async function loadFromBackend(): Promise<AssetItem[]> {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/assets/index`)
    const data = await resp.json()
    return data.ok ? data.items : []
  } catch {
    // Fallback: try localStorage migration
    try {
      const raw = localStorage.getItem('flowcraft-asset-library')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }
}

function saveToBackend() {
  // Debounce: wait 500ms before saving
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      // Filter out non-persistable items
      const persistable = assets.value.filter(a =>
        !a.url.startsWith('data:') && !a.url.startsWith('blob:')
      )
      await fetch(`${API_BASE_URL}/api/assets/index`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: persistable }),
      })
      // Clear old localStorage after successful backend save
      localStorage.removeItem('flowcraft-asset-library')
    } catch { /* ignore */ }
  }, 500)
}

watch(assets, saveToBackend, { deep: true })

export function useAssetLibrary() {
  // Load from backend on first use
  if (!loaded) {
    loaded = true
    loadFromBackend().then(items => {
      if (items.length > 0 && assets.value.length === 0) {
        assets.value = items
      }
    })
  }

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
