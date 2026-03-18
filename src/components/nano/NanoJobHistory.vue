<template>
  <section class="card">
    <div class="card-header">
      <span class="card-title">作品與歷史</span>
      <div class="history-stats" v-if="jobs.length > 0">
        <span v-if="runningCount" class="stat-badge stat-running">🔄 {{ runningCount }} 進行中</span>
        <span v-if="completedCount" class="stat-badge stat-completed">✅ {{ completedCount }} 已完成</span>
        <span v-if="failedCount" class="stat-badge stat-failed">❌ {{ failedCount }} 失敗</span>
      </div>
    </div>
    <div class="card-body">
      <div v-if="jobs.length === 0" class="empty-state">
        <div class="empty-state-icon">🖼️</div>
        <div class="empty-state-title">尚未有任何圖片</div>
        <div class="empty-state-desc">生成第一張圖片後，這裡會保留可下載的歷史紀錄。</div>
      </div>

      <div v-else class="history-grid">
        <article v-for="job in jobs" :key="job.id" class="history-card">
          <div class="history-head">
            <div>
              <strong>{{ modeLabelMap[job.sourceMode] }}</strong>
              <div class="mini-meta">{{ formatDate(job.createdAt) }}</div>
            </div>
            <div class="history-actions">
              <span class="badge" :class="job.status === 'completed' ? 'badge-active' : job.status === 'failed' ? 'badge-trigger' : 'badge-ai'">
                {{ job.status }}
              </span>
              <button v-if="job.requestSnapshot" class="btn btn-secondary btn-sm" @click="$emit('restore', job)">恢復設定</button>
              <button class="btn btn-danger btn-sm" @click="$emit('remove', job.id)">刪除</button>
            </div>
          </div>
          <p class="history-prompt">{{ job.prompt }}</p>
          <p v-if="job.error" class="error-text">{{ job.error }}</p>

          <div v-if="job.outputs.length > 0" class="image-grid">
            <div v-for="output in job.outputs" :key="`${job.id}-${output.index}`" class="image-card media-card-wrap">
              <img
                v-if="output.localUrl"
                :src="resolveMediaUrl(output.localUrl)"
                alt="Generated image"
                @click="openImage(output.localUrl!)"
              />
              <button
                v-if="output.localUrl && !hasAsset(resolveMediaUrl(output.localUrl))"
                class="collect-btn"
                @click.stop="collectAsset(output.localUrl!)"
                title="收入囊中"
              >🎒 收入囊中</button>
              <span v-else-if="output.localUrl && hasAsset(resolveMediaUrl(output.localUrl))" class="collect-done">✅ 已收</span>
              <div class="video-actions">
                <a
                  v-if="output.localUrl"
                  class="btn btn-secondary btn-sm"
                  :href="resolveMediaUrl(output.localUrl)"
                  target="_blank"
                  rel="noreferrer"
                  download
                >
                  下載
                </a>
                <button class="btn btn-primary btn-sm" @click="$emit('use-as-edit-source', output.localUrl!)">
                  編輯這張
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <!-- Lightbox -->
  <Teleport to="body">
    <div
      v-if="lightboxUrl"
      class="lightbox-overlay"
      @click="closeLightbox"
      @wheel.prevent="onLbWheel"
      @mousedown.prevent="onLbMouseDown"
    >
      <img
        :src="lightboxUrl"
        class="lightbox-img"
        :style="{ transform: `scale(${lbScale}) translate(${lbPan.x / lbScale}px, ${lbPan.y / lbScale}px)`, cursor: lbScale > 1 ? 'grab' : 'default' }"
        @click.stop
        @dragstart.prevent
      />
      <div class="lightbox-hint" v-if="lbScale === 1">滾輪縮放</div>
      <button class="lightbox-close" @click="closeLightbox">×</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useAssetLibrary } from '../../composables/useAssetLibrary'
import { API_BASE_URL } from '../../api/config'
import type { NanoJob, NanoSourceMode } from '../../api/nano'

const props = defineProps<{
  jobs: NanoJob[]
  runningCount: number
  completedCount: number
  failedCount: number
}>()

defineEmits<{
  (e: 'restore', job: NanoJob): void
  (e: 'remove', jobId: string): void
  (e: 'use-as-edit-source', localUrl: string): void
}>()

const modeLabelMap: Record<NanoSourceMode, string> = {
  text: 'Text to Image',
  edit: 'Image Editing',
  reference: 'Reference Images',
}

const { addAsset, hasAsset } = useAssetLibrary()

function resolveMediaUrl(path: string) {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function collectAsset(url: string) {
  const resolved = resolveMediaUrl(url)
  addAsset({ type: 'image', url: resolved, mimeType: 'image/jpeg', label: 'AI Studio' })
}

// ── Lightbox (internal) ──
const lightboxUrl = ref<string | null>(null)
const lightboxRef = ref<HTMLElement | null>(null)
const lbScale = ref(1)
const lbPan = ref({ x: 0, y: 0 })
let lbDragging = false
let lbDragStart = { x: 0, y: 0 }
let lbPanStart = { x: 0, y: 0 }

function openImage(localUrl: string) {
  lightboxUrl.value = resolveMediaUrl(localUrl)
  lbScale.value = 1
  lbPan.value = { x: 0, y: 0 }
  nextTick(() => lightboxRef.value?.focus())
}

function closeLightbox() {
  lightboxUrl.value = null
  lbScale.value = 1
  lbPan.value = { x: 0, y: 0 }
}

function onLbWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  lbScale.value = Math.min(8, Math.max(1, lbScale.value * delta))
  if (lbScale.value === 1) lbPan.value = { x: 0, y: 0 }
}

function onLbMouseDown(e: MouseEvent) {
  if (lbScale.value <= 1) return
  lbDragging = true
  lbDragStart = { x: e.clientX, y: e.clientY }
  lbPanStart = { ...lbPan.value }
  const onMove = (ev: MouseEvent) => {
    if (!lbDragging) return
    lbPan.value = {
      x: lbPanStart.x + (ev.clientX - lbDragStart.x),
      y: lbPanStart.y + (ev.clientY - lbDragStart.y),
    }
  }
  const onUp = () => {
    lbDragging = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: zoom-out;
}
.lightbox-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
  transition: transform 0.1s ease;
  user-select: none;
}
.lightbox-hint {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  pointer-events: none;
}
.lightbox-close {
  position: fixed;
  top: 20px;
  right: 24px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  font-size: 24px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-stats {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.stat-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.stat-running { background: rgba(33, 150, 243, 0.15); color: #64b5f6; }
.stat-completed { background: rgba(76, 175, 80, 0.15); color: #81c784; }
.stat-failed { background: rgba(244, 67, 54, 0.15); color: #e57373; }

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 8px;
}

.image-card {
  border-radius: 8px;
  overflow: hidden;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}

.image-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  cursor: pointer;
  transition: transform 0.2s;
}

.image-card img:hover {
  transform: scale(1.02);
}

/* ── Collect Button ── */
.media-card-wrap {
  position: relative;
}
.collect-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 5;
}
.media-card-wrap:hover .collect-btn {
  opacity: 1;
}
.collect-btn:hover {
  background: var(--c-primary, #7c3aed);
  border-color: var(--c-primary, #7c3aed);
}
.collect-done {
  position: absolute;
  top: 8px;
  left: 8px;
  font-size: 11px;
  color: var(--c-text-muted, #888);
  background: rgba(0, 0, 0, 0.5);
  padding: 3px 8px;
  border-radius: 6px;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 5;
}
.media-card-wrap:hover .collect-done {
  opacity: 1;
}
</style>
