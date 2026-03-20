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
  url: string         // resolved URL (server path)
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

/** Strip host prefix from URL so all stored URLs are server-relative paths */
function normalizeUrl(url: string): string {
  if (!url) return url
  // Remove http://localhost:3001 or http://localhost:XXXX prefix
  return url.replace(/^https?:\/\/localhost:\d+/, '')
}

async function loadFromBackend(): Promise<AssetItem[]> {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/assets/index`)
    const data = await resp.json()
    const items: AssetItem[] = data.ok ? (data.index || data.items || []) : []
    // Normalize any absolute localhost URLs to relative paths
    return items.map(item => ({ ...item, url: normalizeUrl(item.url) }))
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
      // All items should already have server URLs (uploaded in addAsset)
      // Filter out any remaining blob/data URLs as safety net
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

/**
 * Convert a blob: or data: URL to a server-persisted path
 * by uploading to /api/assets/upload
 */
async function uploadToServer(url: string, mimeType: string, label: string): Promise<string | null> {
  try {
    let base64: string

    if (url.startsWith('data:')) {
      // Already a data URL — extract base64
      base64 = url
    } else if (url.startsWith('blob:')) {
      // Fetch blob and convert to data URL
      const resp = await fetch(url)
      const blob = await resp.blob()
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      mimeType = blob.type || mimeType
    } else {
      // Already a server path
      return url
    }

    const uploadResp = await fetch(`${API_BASE_URL}/api/assets/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64,
        mimeType,
        filename: `${label.replace(/\s+/g, '-')}-${Date.now()}`,
      }),
    })
    const data = await uploadResp.json()
    return data.ok ? data.url : null
  } catch {
    return null
  }
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

  async function addAsset(item: Omit<AssetItem, 'id' | 'createdAt'>) {
    // Prevent duplicates by URL
    if (assets.value.some(a => a.url === item.url)) return

    const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const createdAt = new Date().toISOString()

    // If URL is blob: or data:, upload to server first
    if (item.url.startsWith('blob:') || item.url.startsWith('data:')) {
      const serverUrl = await uploadToServer(item.url, item.mimeType, item.label)
      if (serverUrl) {
        assets.value.unshift({
          ...item,
          id,
          createdAt,
          url: serverUrl,
          thumbnailUrl: item.thumbnailUrl?.startsWith('blob:') || item.thumbnailUrl?.startsWith('data:')
            ? serverUrl
            : item.thumbnailUrl,
        })
      } else {
        // Upload failed — still add with original URL (won't persist cross-browser)
        assets.value.unshift({ ...item, id, createdAt })
      }
    } else {
      // Already a server path
      assets.value.unshift({ ...item, id, createdAt })
    }
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
