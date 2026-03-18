<template>
  <div class="wav2lip-tab">
    <!-- Connection Bar -->
    <div class="connection-bar">
      <div class="conn-item">
        <span class="conn-dot" :class="comfyOk ? 'green' : 'red'"></span>
        <span class="conn-label">ComfyUI Wav2Lip</span>
        <span class="conn-url">localhost:8188</span>
        <button class="btn-link" @click="checkHealth">重新檢查</button>
      </div>
      <div class="conn-note">⚡ GPU 加速 · 處理速度快 · 嘴型同步</div>
    </div>

    <!-- Not Connected -->
    <div v-if="!comfyOk" class="not-connected">
      <div class="nc-icon">🔌</div>
      <div class="nc-title">ComfyUI 未連線</div>
      <div class="nc-hint">請啟動 ComfyUI（port 8188）</div>
    </div>

    <!-- Main Grid -->
    <div v-else class="main-grid">
      <!-- Left: Inputs -->
      <div class="inputs-col">
        <!-- Source Image / Video -->
        <section class="card">
          <div class="card-header">
            <span class="card-title">📸 來源素材</span>
            <div class="mode-strip">
              <button class="mode-pill" :class="{ active: srcMode === 'image' }" @click="setSrcMode('image')">圖片</button>
              <button class="mode-pill" :class="{ active: srcMode === 'video' }" @click="setSrcMode('video')">影片</button>
            </div>
          </div>
          <div class="card-body">
            <div
              class="upload-zone"
              :class="{ 'has-file': srcPreview }"
              @click="srcInputRef?.click()"
              @dragover.prevent
              @drop.prevent="onSrcDrop"
            >
              <!-- Image preview -->
              <img v-if="srcMode === 'image' && srcPreview" :src="srcPreview" class="preview-img" />
              <!-- Video preview -->
              <video v-else-if="srcMode === 'video' && srcPreview" :src="srcPreview" controls class="preview-video" />
              <!-- Placeholder -->
              <div v-else class="upload-placeholder">
                <div class="placeholder-icon">{{ srcMode === 'video' ? '🎬' : '🖼️' }}</div>
                <div class="placeholder-text">拖放{{ srcMode === 'video' ? '影片' : '圖片' }}</div>
                <div class="placeholder-hint">{{ srcMode === 'video' ? 'MP4 · MOV · WebM · 含臉部的影片' : 'JPG · PNG · 包含臉部的照片' }}</div>
              </div>
            </div>
            <input
              ref="srcInputRef"
              type="file"
              :accept="srcMode === 'video' ? 'video/*' : 'image/*'"
              hidden
              @change="onSrcChange"
            />
          </div>
        </section>

        <!-- Audio -->
        <section class="card">
          <div class="card-header">
            <span class="card-title">🎵 驅動音頻</span>
          </div>
          <div class="card-body">
            <div
              class="upload-zone audio-zone"
              :class="{ 'has-file': audFile }"
              @click="audInputRef?.click()"
              @dragover.prevent
              @drop.prevent="onAudDrop"
            >
              <div v-if="audFile" class="audio-ready">
                <div class="audio-icon">🎵</div>
                <div class="audio-name">{{ audFile.name }}</div>
                <audio :src="audPreview" controls class="audio-player" />
              </div>
              <div v-else class="upload-placeholder">
                <div class="placeholder-icon">🎵</div>
                <div class="placeholder-text">拖放音頻</div>
                <div class="placeholder-hint">MP3 · WAV · M4A</div>
              </div>
            </div>
            <input ref="audInputRef" type="file" accept="audio/*" hidden @change="onAudChange" />
          </div>
        </section>

        <!-- Generate Button -->
        <button
          class="btn-generate"
          :disabled="!srcFile || !audFile || generating"
          @click="generate"
        >
          <span v-if="generating" class="spinner">⏳</span>
          <span v-else>🎬</span>
          {{ generating ? generatingMsg : '開始生成' }}
        </button>

        <div v-if="errorMsg" class="error-box">⚠️ {{ errorMsg }}</div>
      </div>

      <!-- Right: Result + Recent -->
      <div class="results-col">
        <!-- Current Result -->
        <section v-if="currentVideoUrl" class="card result-card">
          <div class="card-header">
            <span class="card-title">✅ 生成結果</span>
          </div>
          <div class="card-body">
            <video :src="currentVideoUrl" controls class="result-video" />
            <div class="result-actions">
              <a :href="currentVideoUrl" download="wav2lip.mp4" class="btn btn-sm btn-secondary">⬇️ 下載</a>
            </div>
          </div>
        </section>

        <!-- Recent -->
        <section class="card">
          <div class="card-header">
            <span class="card-title">🗂️ 最近生產</span>
            <button class="btn-link" @click="loadRecent">🔄 刷新</button>
          </div>
          <div v-if="recentVideos.length === 0" class="card-body empty-state">
            <div class="empty-icon">🎞️</div>
            <div class="empty-text">還沒有生成記錄</div>
          </div>
          <div v-else class="results-list">
            <div v-for="(v, i) in recentVideos" :key="i" class="result-item">
              <video :src="v.videoUrl" controls class="result-video" preload="metadata" />
              <div class="result-meta">
                <span class="result-name">{{ v.filename }}</span>
                <a :href="v.videoUrl" download class="btn btn-sm btn-secondary">⬇️ 下載</a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const API = 'http://localhost:3001'

const comfyOk = ref(false)
const srcMode = ref<'image' | 'video'>('image')
const srcFile = ref<File | null>(null)
const srcPreview = ref('')
const audFile = ref<File | null>(null)
const audPreview = ref('')
const generating = ref(false)
const generatingMsg = ref('生成中...')
const errorMsg = ref('')
const currentVideoUrl = ref('')
const recentVideos = ref<{ filename: string; videoUrl: string }[]>([])

const srcInputRef = ref<HTMLInputElement | null>(null)
const audInputRef = ref<HTMLInputElement | null>(null)

async function checkHealth() {
  try {
    const r = await fetch(`${API}/api/wav2lip/health`)
    const data = await r.json()
    comfyOk.value = data.comfyOk === true
  } catch {
    comfyOk.value = false
  }
}

function setSrcMode(mode: 'image' | 'video') {
  srcMode.value = mode
  srcFile.value = null
  srcPreview.value = ''
}

function onSrcChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) setSrc(f)
}
function onSrcDrop(e: DragEvent) {
  const f = e.dataTransfer?.files?.[0]
  if (!f) return
  if (f.type.startsWith('video/')) { srcMode.value = 'video'; setSrc(f) }
  else if (f.type.startsWith('image/')) { srcMode.value = 'image'; setSrc(f) }
}
function setSrc(f: File) {
  srcFile.value = f
  srcPreview.value = URL.createObjectURL(f)
}

function onAudChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) setAud(f)
}
function onAudDrop(e: DragEvent) {
  const f = e.dataTransfer?.files?.[0]
  if (f && f.type.startsWith('audio/')) setAud(f)
}
function setAud(f: File) {
  audFile.value = f
  audPreview.value = URL.createObjectURL(f)
}

async function generate() {
  if (!srcFile.value || !audFile.value) return
  generating.value = true
  errorMsg.value = ''
  currentVideoUrl.value = ''
  generatingMsg.value = '上傳檔案...'

  try {
    const form = new FormData()
    form.append('sourceFile', srcFile.value)
    form.append('audioFile', audFile.value)
    form.append('srcMode', srcMode.value)

    const r = await fetch(`${API}/api/wav2lip/generate-upload`, { method: 'POST', body: form })
    const data = await r.json()
    if (!data.ok) throw new Error(data.error || '提交失敗')

    const promptId = data.promptId
    generatingMsg.value = '生成中，輪詢結果...'

    // Poll for result
    let attempts = 0
    const maxAttempts = 120 // 2 min max
    await new Promise<void>((resolve, reject) => {
      const timer = setInterval(async () => {
        attempts++
        try {
          const sr = await fetch(`${API}/api/wav2lip/status/${promptId}`)
          const sd = await sr.json()
          if (sd.status === 'done') {
            currentVideoUrl.value = sd.videoUrl
            clearInterval(timer)
            resolve()
          } else if (sd.status === 'error') {
            clearInterval(timer)
            reject(new Error(sd.error || '生成失敗'))
          } else if (attempts >= maxAttempts) {
            clearInterval(timer)
            reject(new Error('超時（2 分鐘），請重試'))
          }
        } catch (e) {
          clearInterval(timer)
          reject(e)
        }
      }, 1000)
    })

    await loadRecent()
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
  } finally {
    generating.value = false
    generatingMsg.value = '生成中...'
  }
}

async function loadRecent() {
  // List ComfyUI wav2lip outputs via history
  try {
    const r = await fetch(`http://localhost:8188/history?max_items=20`)
    const data = await r.json() as Record<string, any>
    const videos: { filename: string; videoUrl: string }[] = []

    for (const promptId in data) {
      const entry = data[promptId]
      if (entry.status?.status_str !== 'success') continue
      for (const nodeId in (entry.outputs || {})) {
        const gifs = entry.outputs[nodeId]?.gifs
        if (gifs?.length) {
          const g = gifs[0]
          if (g.filename?.endsWith('.mp4') && g.filename.startsWith('wav2lip')) {
            const videoUrl = `${API}/api/wav2lip/video?filename=${encodeURIComponent(g.filename)}&subfolder=${encodeURIComponent(g.subfolder || '')}&type=${g.type || 'output'}`
            videos.push({ filename: g.filename, videoUrl })
          }
        }
      }
    }

    recentVideos.value = videos.slice(0, 10)
  } catch {
    // ignore
  }
}

onMounted(async () => {
  await checkHealth()
  if (comfyOk.value) await loadRecent()
})
</script>

<style scoped>
.wav2lip-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.connection-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 10px;
  flex-wrap: wrap;
}

.conn-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.conn-dot.green { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
.conn-dot.red { background: #ef4444; }

.conn-label { font-weight: 600; font-size: 14px; }
.conn-url { font-size: 12px; color: var(--c-text-secondary); }
.conn-note { font-size: 12px; color: var(--c-text-secondary); margin-left: auto; }

.btn-link {
  background: none;
  border: none;
  color: var(--c-accent);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
}
.btn-link:hover { text-decoration: underline; }

.mode-strip {
  display: flex;
  gap: 4px;
}

.mode-pill {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.mode-pill.active {
  background: var(--c-accent);
  border-color: var(--c-accent);
  color: #fff;
}
.mode-pill:hover:not(.active) {
  background: var(--c-bg);
  color: var(--c-text);
}

.not-connected {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  gap: 8px;
  color: var(--c-text-secondary);
}
.nc-icon { font-size: 48px; }
.nc-title { font-size: 18px; font-weight: 600; }
.nc-hint { font-size: 13px; }

.main-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 900px) {
  .main-grid { grid-template-columns: 1fr; }
}

.inputs-col, .results-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 12px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--c-border);
}

.card-title {
  font-weight: 600;
  font-size: 14px;
}

.card-body {
  padding: 12px;
}

.upload-zone {
  border: 2px dashed var(--c-border);
  border-radius: 8px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-zone:hover, .upload-zone.has-file {
  border-color: var(--c-accent);
  background: rgba(124, 58, 237, 0.04);
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--c-text-secondary);
}
.placeholder-icon { font-size: 36px; }
.placeholder-text { font-size: 14px; font-weight: 500; }
.placeholder-hint { font-size: 12px; opacity: 0.7; }

.preview-img {
  max-height: 200px;
  max-width: 100%;
  border-radius: 6px;
  object-fit: contain;
}

.preview-video {
  max-height: 200px;
  max-width: 100%;
  border-radius: 6px;
}

.audio-zone { min-height: 100px; }

.audio-ready {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.audio-icon { font-size: 28px; }
.audio-name { font-size: 12px; color: var(--c-text-secondary); word-break: break-all; text-align: center; }
.audio-player { width: 100%; height: 36px; }

.btn-generate {
  padding: 14px;
  border-radius: 10px;
  border: none;
  background: var(--c-accent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-generate:hover:not(:disabled) { filter: brightness(1.1); }
.btn-generate:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner { animation: spin 1s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

.error-box {
  padding: 10px 14px;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  font-size: 13px;
  color: #dc2626;
}

.result-card .card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-video {
  width: 100%;
  border-radius: 8px;
  background: #000;
}

.result-actions {
  display: flex;
  gap: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 30px;
  color: var(--c-text-secondary);
}
.empty-icon { font-size: 32px; }
.empty-text { font-size: 13px; }

.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.result-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.result-name {
  font-size: 12px;
  color: var(--c-text-secondary);
  word-break: break-all;
  flex: 1;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
}
.btn-secondary {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text);
}
.btn-secondary:hover { background: var(--c-bg); }
.btn-sm { padding: 4px 10px; font-size: 12px; }
</style>
