<template>
  <div class="yt-recent-config">
    <!-- ① URL 輸入 -->
    <div class="form-group" style="margin-bottom:16px;">
      <label class="form-label">📺 YouTube 頻道或影片連結</label>
      <input
        class="form-input"
        v-model="channelUrl"
        placeholder="貼上頻道 URL 或任意影片連結..."
        @keyup.enter="fetchVideos"
        :disabled="loading"
      />
      <div class="form-hint">可輸入頻道 URL (youtube.com/channel/UCxxxxx) 或影片 URL (自動提取頻道)</div>
    </div>

    <button
      class="btn btn-primary btn-sm"
      style="width:100%;margin-bottom:16px;"
      @click="fetchVideos"
      :disabled="!channelUrl.trim() || loading"
    >
      <span v-if="loading" class="pulsing">⏳ 獲取中...</span>
      <span v-else>📹 獲取最近 5 支影片</span>
    </button>

    <div v-if="errorMsg" style="font-size:11px;color:var(--red);margin-bottom:12px;padding:8px;background:var(--bg-base);border-radius:var(--radius-sm);">
      ❌ {{ errorMsg }}
    </div>

    <div class="divider" v-if="videos.length > 0" />

    <!-- ② 影片列表 -->
    <div v-if="videos.length > 0">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;">
        🎬 選擇影片 <span class="badge badge-active" style="margin-left:6px;">{{ videos.length }} 個</span>
      </div>

      <div class="video-list">
        <div
          v-for="(video, i) in videos"
          :key="video.videoId"
          class="video-row"
          :class="{ active: selectedVideoIndex === i }"
          @click="selectedVideoIndex = i"
        >
          <div class="video-index">{{ i + 1 }}</div>
          <div class="video-info">
            <div class="video-title">{{ video.title }}</div>
            <div class="video-date">{{ formatDate(video.publishedAt) }}</div>
          </div>
          <div v-if="selectedVideoIndex === i" class="video-check">✓</div>
        </div>
      </div>
    </div>

    <div v-else-if="!loading" class="empty-state" style="padding:16px 0;gap:6px;">
      <div style="font-size:22px;opacity:0.4;">📹</div>
      <div style="font-size:12px;color:var(--text-muted);">輸入頻道連結後點擊「獲取影片」</div>
    </div>

    <div class="divider" />

    <!-- ③ 輸出埠顯示設定 -->
    <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">
      🔌 輸出埠顯示設定
      <span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:6px;">控制節點上顯示哪些埠</span>
    </div>
    <div class="port-toggle-list">
      <div v-for="port in outputs" :key="port.key" class="port-toggle-row">
        <span style="color:var(--accent-cyan);font-size:11px;">◆</span>
        <div style="flex:1;">
          <div style="font-size:12px;color:var(--text-secondary);">{{ port.label }}</div>
          <div style="font-size:10px;color:var(--text-muted);">{{ port.type }}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" :checked="isPortVisible(port.key)" @change="togglePort(port.key)" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { API_ENDPOINTS } from '../api/config'

interface Video {
  videoId: string
  title: string
  url: string
  publishedAt: string
}

const props = defineProps<{
  config: Record<string, any>
  outputs: { key: string; label: string; type: string }[]
}>()

const emit = defineEmits<{
  (e: 'update', config: Record<string, any>): void
}>()

// ─── Local state ──────────────────────────────────────────────────
const channelUrl = ref<string>(props.config.channelUrl || '')
const videos = ref<Video[]>(
  (() => { try { return JSON.parse(props.config.videos || '[]') } catch { return [] } })()
)
const selectedVideoIndex = ref<number>(props.config.selectedVideoIndex ?? 0)
const loading = ref(false)
const errorMsg = ref('')

// Port visibility: stored as JSON array of HIDDEN keys (empty = all shown)
const hiddenPorts = ref<string[]>(
  (() => { try { return JSON.parse(props.config.hiddenPorts || '[]') } catch { return [] } })()
)

function isPortVisible(key: string) {
  return !hiddenPorts.value.includes(key)
}

function togglePort(key: string) {
  const i = hiddenPorts.value.indexOf(key)
  if (i === -1) hiddenPorts.value.push(key)
  else hiddenPorts.value.splice(i, 1)
}

// Build visiblePorts for the node canvas (inverse of hiddenPorts)
const visiblePorts = computed(() =>
  props.outputs
    .filter(o => !hiddenPorts.value.includes(o.key))
    .map(o => o.key)
)

// ─── Fetch videos ─────────────────────────────────────────────────
async function fetchVideos() {
  errorMsg.value = ''
  const url = channelUrl.value.trim()
  if (!url) return

  loading.value = true

  try {
    const response = await fetch(`${API_ENDPOINTS.youtubeRecentVideos}?url=${encodeURIComponent(url)}`)
    const data = await response.json()

    if (!data.ok) {
      throw new Error(data.error || '獲取影片失敗')
    }

    videos.value = data.videos
    selectedVideoIndex.value = 0 // 預設選第一支

    if (videos.value.length === 0) {
      errorMsg.value = '沒有找到影片（頻道可能沒有公開影片）'
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
    videos.value = []
  } finally {
    loading.value = false
  }
}

// ─── Format date ──────────────────────────────────────────────────
function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays} 天前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 週前`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} 個月前`
  return `${Math.floor(diffDays / 365)} 年前`
}

// ─── Emit update ──────────────────────────────────────────────────
function emitUpdate() {
  emit('update', {
    channelUrl: channelUrl.value,
    videos: JSON.stringify(videos.value),
    selectedVideoIndex: selectedVideoIndex.value,
    hiddenPorts: JSON.stringify(hiddenPorts.value),
    // visiblePorts is what CustomNode reads to know which handles to show
    visiblePorts: hiddenPorts.value.length === 0 ? '' : JSON.stringify(visiblePorts.value)
  })
}

watch([channelUrl, videos, selectedVideoIndex, hiddenPorts], emitUpdate, { deep: true })
</script>

<style scoped>
.yt-recent-config { display: flex; flex-direction: column; }
.form-hint { font-size:10px; color:var(--text-muted); margin-top:4px; line-height:1.4; }

.video-list { display:flex;flex-direction:column;gap:4px; }
.video-row {
  display:flex;align-items:center;gap:10px;
  padding:8px 10px;
  background:var(--bg-base);
  border:1px solid var(--border);
  border-radius:var(--radius-sm);
  cursor:pointer;
  transition:var(--transition);
}
.video-row:hover { border-color:var(--border-hover); background:var(--bg-hover); }
.video-row.active {
  border-color:var(--accent-cyan);
  background:rgba(var(--accent-cyan-rgb), 0.05);
}

.video-index {
  width:24px;height:24px;
  border-radius:50%;
  background:var(--bg-hover);
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:600;
  color:var(--text-muted);
  flex-shrink:0;
}
.video-row.active .video-index {
  background:var(--accent-cyan);
  color:white;
}

.video-info { flex:1;min-width:0; }
.video-title {
  font-size:11px;font-weight:500;
  color:var(--text-primary);
  line-height:1.4;
  overflow:hidden;
  text-overflow:ellipsis;
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
}
.video-date {
  font-size:9px;
  color:var(--text-muted);
  margin-top:2px;
}

.video-check {
  font-size:14px;
  color:var(--accent-cyan);
  flex-shrink:0;
}

.pulsing {
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.port-toggle-list { display:flex;flex-direction:column;gap:4px; }
.port-toggle-row {
  display:flex;align-items:center;gap:8px;
  padding:6px 8px;
  background:var(--bg-base);border:1px solid var(--border);
  border-radius:var(--radius-sm);
}
</style>
