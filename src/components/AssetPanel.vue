<template>
  <div class="asset-panel" :class="{ open: isOpen }">
    <button class="asset-toggle" @click="isOpen = !isOpen" :title="isOpen ? '收合素材囊' : '展開素材囊'">
      🎒
      <span v-if="!isOpen && assets.length" class="asset-count">{{ assets.length }}</span>
    </button>

    <div v-if="isOpen" class="asset-drawer">
      <!-- Header -->
      <div class="asset-drawer-header">
        <span class="asset-drawer-title">素材囊</span>
        <span class="asset-drawer-count">{{ assets.length }} 項</span>
      </div>

      <!-- Filter tabs -->
      <div class="asset-filter-tabs">
        <button
          v-for="tab in filterTabs"
          :key="tab.key"
          class="filter-tab"
          :class="{ active: activeFilter === tab.key }"
          @click="activeFilter = tab.key"
        >
          {{ tab.icon }} {{ tab.label }}
          <span v-if="tab.count" class="filter-count">{{ tab.count }}</span>
        </button>
      </div>

      <!-- Upload drop zone -->
      <label
        class="asset-upload-zone"
        :class="{ dragging: isDraggingUpload }"
        @dragover.prevent="isDraggingUpload = true"
        @dragleave="isDraggingUpload = false"
        @drop.prevent="onDropUpload"
      >
        <span class="upload-icon">📤</span>
        <span class="upload-text">拖放或點擊上傳</span>
        <span class="upload-hint">圖片・影片・音頻</span>
        <input type="file" accept="image/*,video/*,audio/*" multiple hidden @change="onUpload" />
      </label>

      <!-- Empty state -->
      <div v-if="filteredAssets.length === 0" class="asset-empty">
        <p>{{ activeFilter === 'all' ? '尚無素材' : `尚無${filterTabs.find(t=>t.key===activeFilter)?.label}` }}</p>
        <p class="asset-empty-hint">上傳或從作品上點「🎒 收入囊中」</p>
      </div>

      <!-- Asset grid (images/videos) -->
      <div v-if="gridAssets.length > 0" class="asset-grid">
        <div
          v-for="asset in gridAssets"
          :key="asset.id"
          class="asset-thumb"
          draggable="true"
          @dragstart="onDragStart($event, asset)"
          :title="asset.label"
        >
          <img v-if="asset.type === 'image'" :src="resolveMediaUrl(asset.url)" alt="" draggable="false" />
          <video v-else :src="resolveMediaUrl(asset.url)" muted draggable="false" />
          <div class="asset-thumb-overlay">
            <span class="asset-type-badge">{{ asset.type === 'image' ? '🖼️' : '🎬' }}</span>
            <button class="asset-remove-btn" @click.stop="removeAsset(asset.id)" title="移除">×</button>
          </div>
          <div class="asset-label">{{ asset.filename || asset.label }}</div>
        </div>
      </div>

      <!-- Audio list -->
      <div v-if="audioAssets.length > 0" class="audio-list">
        <div
          v-for="asset in audioAssets"
          :key="asset.id"
          class="audio-item"
          draggable="true"
          @dragstart="onDragStart($event, asset)"
        >
          <div class="audio-icon">🎵</div>
          <div class="audio-info">
            <div class="audio-name">{{ asset.filename || asset.label }}</div>
            <div class="audio-meta">
              {{ asset.duration ? formatDuration(asset.duration) : '' }}
              {{ asset.mimeType.split('/')[1]?.toUpperCase() }}
            </div>
          </div>
          <button class="audio-remove-btn" @click.stop="removeAsset(asset.id)" title="移除">×</button>
        </div>
      </div>

      <!-- Footer -->
      <div v-if="assets.length > 0" class="asset-footer">
        <button class="btn btn-secondary btn-sm asset-clear-btn" @click="clearAll">🗑️ 清空全部</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAssetLibrary, type AssetItem } from '../composables/useAssetLibrary'
import { resolveMediaUrl } from '../api/config'

const { assets, addAsset, removeAsset, clearAll } = useAssetLibrary()
const isOpen = ref(false)
const isDraggingUpload = ref(false)
const activeFilter = ref<'all' | 'image' | 'video' | 'audio'>('all')

const imageCount = computed(() => assets.value.filter(a => a.type === 'image').length)
const videoCount = computed(() => assets.value.filter(a => a.type === 'video').length)
const audioCount = computed(() => assets.value.filter(a => a.type === 'audio').length)

const filterTabs = computed(() => [
  { key: 'all' as const, icon: '📦', label: '全部', count: assets.value.length },
  { key: 'image' as const, icon: '🖼️', label: '圖片', count: imageCount.value },
  { key: 'video' as const, icon: '🎬', label: '影片', count: videoCount.value },
  { key: 'audio' as const, icon: '🎵', label: '音頻', count: audioCount.value },
].filter(t => t.key === 'all' || t.count > 0))

const filteredAssets = computed(() =>
  activeFilter.value === 'all' ? assets.value : assets.value.filter(a => a.type === activeFilter.value)
)

const gridAssets = computed(() => filteredAssets.value.filter(a => a.type !== 'audio'))
const audioAssets = computed(() => filteredAssets.value.filter(a => a.type === 'audio'))

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')} · `
}

function onDragStart(e: DragEvent, asset: AssetItem) {
  if (!e.dataTransfer) return
  const payload = JSON.stringify({ url: asset.url, type: asset.type, mimeType: asset.mimeType })
  e.dataTransfer.setData('application/x-flowcraft-asset', payload)
  e.dataTransfer.setData('text/plain', asset.url)
  e.dataTransfer.setData('text/uri-list', asset.url)
  e.dataTransfer.effectAllowed = 'copy'
}

async function processFiles(files: File[]) {
  for (const file of files) {
    const isVideo = file.type.startsWith('video/')
    const isAudio = file.type.startsWith('audio/')

    if (isAudio) {
      // Audio: use blob URL, get duration
      const url = URL.createObjectURL(file)
      const duration = await getAudioDuration(url)
      addAsset({ type: 'audio', url, mimeType: file.type, label: file.name, filename: file.name, duration })
      continue
    }

    // Image/Video: upload to server
    const reader = new FileReader()
    const base64 = await new Promise<string>(r => { reader.onload = () => r(reader.result as string); reader.readAsDataURL(file) })
    try {
      const resp = await fetch(`${API_BASE_URL}/api/assets/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type, filename: file.name }),
      })
      const data = await resp.json()
      if (data.ok) {
        addAsset({ type: isVideo ? 'video' : 'image', url: data.url, mimeType: file.type, label: file.name, filename: file.name })
      }
    } catch {
      // fallback: use blob URL for images
      if (!isVideo) addAsset({ type: 'image', url: URL.createObjectURL(file), mimeType: file.type, label: file.name, filename: file.name })
    }
  }
}

function getAudioDuration(url: string): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio(url)
    audio.onloadedmetadata = () => resolve(audio.duration)
    audio.onerror = () => resolve(0)
  })
}

async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  await processFiles(Array.from(input.files))
  input.value = ''
}

async function onDropUpload(e: DragEvent) {
  isDraggingUpload.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length) await processFiles(files)
}
</script>

<style scoped>
.asset-panel {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
}

.asset-toggle {
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border, #333);
  border-right: none;
  border-radius: 8px 0 0 8px;
  padding: 10px 7px;
  cursor: pointer;
  font-size: 18px;
  color: var(--text-secondary, #ccc);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: background 0.15s;
}
.asset-toggle:hover { background: rgba(124,58,237,0.15); }

.asset-count {
  font-size: 10px;
  background: var(--accent-purple, #7c3aed);
  color: white;
  border-radius: 8px;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
}

.asset-drawer {
  background: var(--bg-card, #1a1a2e);
  border: 1px solid var(--border, #333);
  border-right: none;
  border-radius: 12px 0 0 12px;
  width: 260px;
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  box-shadow: -4px 0 24px rgba(0,0,0,0.4);
}

.asset-drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border, #333);
}
.asset-drawer-title { font-weight: 700; font-size: 14px; color: var(--text-primary, #fff); }
.asset-drawer-count { font-size: 11px; color: var(--text-secondary, #888); background: rgba(255,255,255,0.06); padding: 2px 7px; border-radius: 10px; }

/* Filter tabs */
.asset-filter-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.filter-tab {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid transparent;
  background: rgba(255,255,255,0.05);
  color: var(--text-secondary, #aaa);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.filter-tab:hover { border-color: var(--accent-purple, #7c3aed); color: var(--text-primary, #fff); }
.filter-tab.active { background: rgba(124,58,237,0.2); border-color: var(--accent-purple, #7c3aed); color: var(--text-primary, #fff); }
.filter-count { font-size: 10px; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 0 4px; }

/* Upload zone */
.asset-upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px;
  border: 2px dashed var(--border, #444);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  background: rgba(255,255,255,0.02);
}
.asset-upload-zone:hover,
.asset-upload-zone.dragging {
  border-color: var(--accent-purple, #7c3aed);
  background: rgba(124,58,237,0.08);
}
.upload-icon { font-size: 20px; }
.upload-text { font-size: 12px; color: var(--text-primary, #ddd); font-weight: 500; }
.upload-hint { font-size: 10px; color: var(--text-secondary, #888); }

/* Empty */
.asset-empty { text-align: center; padding: 12px 0; color: var(--text-secondary, #888); font-size: 12px; }
.asset-empty-hint { font-size: 10px; margin-top: 4px; line-height: 1.5; }

/* Grid */
.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.asset-thumb {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  cursor: grab;
  border: 1px solid var(--border, #333);
  aspect-ratio: 1;
  transition: border-color 0.15s;
}
.asset-thumb:hover { border-color: var(--accent-purple, #7c3aed); }
.asset-thumb:active { cursor: grabbing; }
.asset-thumb img,
.asset-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }

.asset-thumb-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 3px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 40%);
  opacity: 0;
  transition: opacity 0.15s;
}
.asset-thumb:hover .asset-thumb-overlay { opacity: 1; }

.asset-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
  color: #fff;
  font-size: 9px;
  padding: 8px 4px 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s;
}
.asset-thumb:hover .asset-label { opacity: 1; }

.asset-type-badge {
  font-size: 11px;
  background: rgba(0,0,0,0.55);
  border-radius: 4px;
  padding: 1px 3px;
}
.asset-remove-btn {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(220,50,50,0.85);
  color: white;
  border: none;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Audio list */
.audio-list { display: flex; flex-direction: column; gap: 4px; }
.audio-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border, #333);
  cursor: grab;
  transition: all 0.15s;
}
.audio-item:hover { border-color: var(--accent-purple, #7c3aed); background: rgba(124,58,237,0.08); }
.audio-item:active { cursor: grabbing; }
.audio-icon { font-size: 20px; flex-shrink: 0; }
.audio-info { flex: 1; min-width: 0; }
.audio-name { font-size: 11px; color: var(--text-primary, #ddd); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audio-meta { font-size: 10px; color: var(--text-secondary, #888); margin-top: 1px; }
.audio-remove-btn {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(220,50,50,0.7);
  color: white;
  border: none;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.audio-item:hover .audio-remove-btn { opacity: 1; }

/* Footer */
.asset-footer { padding-top: 4px; border-top: 1px solid var(--border, #333); }
.asset-clear-btn { width: 100%; font-size: 11px; }
</style>
