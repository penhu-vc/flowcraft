<template>
  <div class="asset-panel" :class="{ open: isOpen }">
    <button class="asset-toggle" @click="isOpen = !isOpen" :title="isOpen ? '收合素材囊' : '展開素材囊'">
      🎒 <span v-if="!isOpen && assets.length" class="asset-count">{{ assets.length }}</span>
    </button>
    <div v-if="isOpen" class="asset-drawer">
      <div class="asset-drawer-header">
        <span class="asset-drawer-title">🎒 素材囊</span>
        <span class="asset-drawer-count">{{ assets.length }} 項</span>
      </div>

      <!-- Upload button -->
      <label class="asset-upload-btn">
        📤 上傳素材
        <input type="file" accept="image/*,video/*" multiple hidden @change="onUpload" />
      </label>

      <div v-if="assets.length === 0" class="asset-empty">
        <p>尚無素材</p>
        <p class="asset-empty-hint">在作品上 hover 點「🎒 收入囊中」<br/>或上傳已有的圖片/影片</p>
      </div>
      <div v-else class="asset-list">
        <div
          v-for="asset in assets"
          :key="asset.id"
          class="asset-thumb"
          draggable="true"
          @dragstart="onDragStart($event, asset)"
          :title="asset.label"
        >
          <img v-if="asset.type === 'image'" :src="asset.url" alt="" />
          <video v-else :src="asset.url" muted />
          <span class="asset-type-badge">{{ asset.type === 'image' ? '🖼️' : '🎬' }}</span>
          <button class="asset-remove-btn" @click.stop="removeAsset(asset.id)" title="移除">×</button>
        </div>
      </div>
      <button v-if="assets.length > 0" class="btn btn-secondary btn-sm asset-clear-btn" @click="clearAll">
        清空全部
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAssetLibrary, type AssetItem } from '../composables/useAssetLibrary'

const { assets, addAsset, removeAsset, clearAll } = useAssetLibrary()
const isOpen = ref(false)

function onDragStart(e: DragEvent, asset: AssetItem) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-asset-url', asset.url)
  e.dataTransfer.setData('application/x-asset-type', asset.type)
  e.dataTransfer.setData('application/x-asset-mime', asset.mimeType)
  e.dataTransfer.effectAllowed = 'copy'
}

const API_BASE = 'http://localhost:3001'

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    const isVideo = file.type.startsWith('video/')
    const base64 = await fileToBase64(file)
    try {
      const resp = await fetch(`${API_BASE}/api/assets/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type, filename: file.name }),
      })
      const data = await resp.json()
      if (data.ok) {
        addAsset({
          type: isVideo ? 'video' : 'image',
          url: `${API_BASE}${data.url}`,
          mimeType: file.type,
          label: file.name,
        })
      }
    } catch (err) {
      console.error('Asset upload failed:', err)
    }
  }
  input.value = ''
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
  background: var(--c-surface, #1e1e2e);
  border: 1px solid var(--c-border, #333);
  border-right: none;
  border-radius: 8px 0 0 8px;
  padding: 8px 6px;
  cursor: pointer;
  font-size: 16px;
  color: var(--c-text, #ccc);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.asset-toggle:hover {
  background: var(--c-surface-hover, #2a2a3e);
}

.asset-count {
  font-size: 11px;
  background: var(--c-primary, #7c3aed);
  color: white;
  border-radius: 8px;
  padding: 0 5px;
  min-width: 16px;
  text-align: center;
}

.asset-drawer {
  background: var(--c-surface, #1e1e2e);
  border: 1px solid var(--c-border, #333);
  border-right: none;
  border-radius: 8px 0 0 8px;
  width: 220px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.asset-drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.asset-drawer-title {
  font-weight: 600;
  font-size: 14px;
}
.asset-drawer-count {
  font-size: 12px;
  color: var(--c-text-muted, #888);
}

.asset-upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px dashed var(--c-border, #555);
  background: transparent;
  color: var(--c-text-muted, #aaa);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.asset-upload-btn:hover {
  border-color: var(--c-primary, #7c3aed);
  color: var(--c-primary, #7c3aed);
  background: rgba(124, 58, 237, 0.08);
}

.asset-empty {
  text-align: center;
  padding: 16px 0;
  color: var(--c-text-muted, #888);
  font-size: 13px;
}
.asset-empty-hint {
  font-size: 11px;
  margin-top: 4px;
  line-height: 1.5;
}

.asset-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.asset-thumb {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  cursor: grab;
  border: 1px solid var(--c-border, #333);
  aspect-ratio: 1;
}
.asset-thumb:active {
  cursor: grabbing;
}
.asset-thumb img,
.asset-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.asset-type-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  font-size: 10px;
  background: rgba(0,0,0,0.6);
  border-radius: 4px;
  padding: 1px 3px;
}

.asset-remove-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(220, 50, 50, 0.8);
  color: white;
  border: none;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
}
.asset-thumb:hover .asset-remove-btn {
  display: flex;
}

.asset-clear-btn {
  font-size: 11px;
  margin-top: 4px;
}
</style>
