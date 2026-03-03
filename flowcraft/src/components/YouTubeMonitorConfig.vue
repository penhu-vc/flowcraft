<template>
  <div class="yt-config">
    <!-- ① Monitor Type -->
    <div class="form-group" style="margin-bottom:16px;">
      <label class="form-label">🎯 監控內容</label>
      <select class="form-select" v-model="localMonitorType">
        <option v-for="opt in MONITOR_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.icon }} {{ opt.label }}
        </option>
      </select>
      <div class="form-hint">{{ currentMonitorOption?.description }}</div>
    </div>

    <!-- ② Interval -->
    <div class="form-group" style="margin-bottom:16px;">
      <label class="form-label">⏱ 檢查間隔（分鐘）</label>
      <input class="form-input" type="number" v-model.number="localInterval" min="5" max="1440" />
    </div>

    <div class="divider" />

    <!-- ③ Channel list -->
    <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;">
      📺 監控頻道列表 <span class="badge badge-active" style="margin-left:6px;">{{ channels.length }} 個</span>
    </div>

    <div class="url-add-area">
      <input
        class="form-input"
        v-model="inputUrl"
        placeholder="貼上任意影片連結...（例如 https://youtu.be/xxxxx）"
        @keyup.enter="addChannel"
        :disabled="detecting"
      />
      <button
        class="btn btn-primary btn-sm"
        style="margin-top:8px;width:100%;"
        @click="addChannel"
        :disabled="!inputUrl.trim() || detecting"
      >
        <span v-if="detecting" class="pulsing">⏳ 偵測中...</span>
        <span v-else>＋ 偵測並加入</span>
      </button>
      <div v-if="errorMsg" style="font-size:11px;color:var(--red);margin-top:6px;">{{ errorMsg }}</div>
    </div>

    <div class="channel-list" v-if="channels.length > 0">
      <div v-for="(ch, i) in channels" :key="ch.id" class="channel-row">
        <div class="channel-thumb">
          <img v-if="ch.thumbnail" :src="ch.thumbnail" @error="ch.thumbnail=''" />
          <span v-else>▶️</span>
        </div>
        <div class="channel-info">
          <div class="channel-name">{{ ch.name }}</div>
          <div class="channel-handle">{{ ch.handle || ch.id }}</div>
        </div>
        <button class="btn btn-danger btn-sm btn-icon" @click="removeChannel(i)" title="移除">✕</button>
      </div>
    </div>
    <div v-else class="empty-state" style="padding:16px 0;gap:6px;">
      <div style="font-size:22px;opacity:0.4;">📺</div>
      <div style="font-size:12px;color:var(--text-muted);">尚未加入任何頻道</div>
    </div>

    <div class="divider" />

    <!-- ④ Port visibility -->
    <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">
      🔌 輸出埠顯示設定
      <span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:6px;">控制節點上顯示哪些埠</span>
    </div>
    <div class="port-toggle-list">
      <div v-for="port in filteredOutputs" :key="port.key" class="port-toggle-row">
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
import { MONITOR_OPTIONS } from '../nodes/youtubeMonitorOptions'

// ─── Component props & emits ──────────────────────────────────────

interface Channel {
  id: string
  name: string
  handle: string
  thumbnail: string
  addedAt: string
}

const props = defineProps<{
  config: Record<string, any>
  outputs: { key: string; label: string; type: string }[]
}>()

const emit = defineEmits<{
  (e: 'update', config: Record<string, any>): void
}>()

// ─── Local state ──────────────────────────────────────────────────
const channels = ref<Channel[]>(
  (() => { try { return JSON.parse(props.config.channels || '[]') } catch { return [] } })()
)
const localInterval = ref<number>(props.config.interval ?? 30)
const localMonitorType = ref<string>(props.config.monitorType ?? 'new_video')

// Port visibility: stored as JSON array of HIDDEN keys (empty = all shown)
const hiddenPorts = ref<string[]>(
  (() => { try { return JSON.parse(props.config.hiddenPorts || '[]') } catch { return [] } })()
)

const currentMonitorOption = computed(() =>
  MONITOR_OPTIONS.find(o => o.value === localMonitorType.value)
)

// Only show ports relevant to current monitor type
const filteredOutputs = computed(() => {
  const relevantKeys = currentMonitorOption.value?.outputs || props.outputs.map(o => o.key)
  return props.outputs.filter(o => relevantKeys.includes(o.key))
})

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

function emitUpdate() {
  emit('update', {
    channels: JSON.stringify(channels.value),
    interval: localInterval.value,
    monitorType: localMonitorType.value,
    hiddenPorts: JSON.stringify(hiddenPorts.value),
    // visiblePorts is what CustomNode reads to know which handles to show
    visiblePorts: hiddenPorts.value.length === 0 ? '' : JSON.stringify(visiblePorts.value),
  })
}

watch([channels, localInterval, localMonitorType, hiddenPorts], emitUpdate, { deep: true })

// ─── URL detection ────────────────────────────────────────────────
const inputUrl = ref('')
const detecting = ref(false)
const errorMsg = ref('')

function extractVideoId(url: string): string | null {
  const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
  if (shortMatch) return shortMatch[1]
  const longMatch = url.match(/(?:youtube\.com\/watch\?.*v=|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/)
  if (longMatch) return longMatch[1]
  const shortsMatch = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/)
  if (shortsMatch) return shortsMatch[1]
  return null
}

async function addChannel() {
  errorMsg.value = ''
  const url = inputUrl.value.trim()
  if (!url) return
  const videoId = extractVideoId(url)
  if (!videoId) { errorMsg.value = '無法識別影片 ID，請確認網址格式'; return }
  detecting.value = true
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
    if (!res.ok) throw new Error('fetch failed')
    const data = await res.json()
    const authorUrl: string = data.author_url || ''
    const handleMatch = authorUrl.match(/@([\w.-]+)/)
    const channelIdMatch = authorUrl.match(/\/channel\/(UC[\w-]+)/)
    const handle = handleMatch ? `@${handleMatch[1]}` : (channelIdMatch ? channelIdMatch[1] : authorUrl)
    const channelId = channelIdMatch ? channelIdMatch[1] : handle
    if (channels.value.some(c => c.id === channelId || c.handle === handle)) {
      errorMsg.value = '這個頻道已在列表中'; detecting.value = false; return
    }
    channels.value.push({
      id: channelId, name: data.author_name || handle, handle,
      thumbnail: `https://img.youtube.com/vi/${videoId}/default.jpg`,
      addedAt: new Date().toISOString(),
    })
    inputUrl.value = ''
  } catch {
    errorMsg.value = '偵測失敗，請確認網址正確或網路連線'
  } finally {
    detecting.value = false
  }
}

function removeChannel(i: number) { channels.value.splice(i, 1) }
</script>

<style scoped>
.yt-config { display: flex; flex-direction: column; }
.form-hint { font-size:10px; color:var(--text-muted); margin-top:4px; line-height:1.4; }

.url-add-area {
  background: var(--bg-base); border: 1px dashed var(--border-hover);
  border-radius: var(--radius-md); padding: 10px; margin-bottom: 10px;
}
.channel-list { display:flex;flex-direction:column;gap:3px;margin-bottom:4px; }
.channel-row {
  display:flex;align-items:center;gap:8px; padding:6px 8px;
  background:var(--bg-base);border:1px solid var(--border);
  border-radius:var(--radius-sm);transition:var(--transition);
}
.channel-row:hover { border-color:var(--border-hover); }
.channel-thumb { width:28px;height:28px;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;font-size:12px; }
.channel-thumb img { width:100%;height:100%;object-fit:cover; }
.channel-info { flex:1;min-width:0; }
.channel-name { font-size:11px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.channel-handle { font-size:9px;color:var(--text-muted); }

.port-toggle-list { display:flex;flex-direction:column;gap:4px; }
.port-toggle-row {
  display:flex;align-items:center;gap:8px;
  padding:6px 8px;
  background:var(--bg-base);border:1px solid var(--border);
  border-radius:var(--radius-sm);
}
</style>
