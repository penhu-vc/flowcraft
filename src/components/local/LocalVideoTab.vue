<template>
  <div class="local-video-tab">
    <!-- ── Connection Bar ── -->
    <div class="connection-bar">
      <div class="conn-item">
        <span class="conn-dot" :class="backendOk ? 'green' : 'red'" />
        <span class="conn-label">WanGP InfiniteTalk</span>
        <span class="conn-url">localhost:3001</span>
        <button class="btn-link" @click="checkBackend" :disabled="checking">
          {{ checking ? '檢查中...' : '重新檢查' }}
        </button>
      </div>
      <div class="conn-note" v-if="backendOk">
        ⚡ 14B 模型 · RTX 3080 Ti · 每秒影片約 11 分鐘
      </div>
    </div>

    <!-- ── Not Connected ── -->
    <div v-if="!backendOk && !checking" class="not-connected-hint">
      <div class="hint-icon">⚠️</div>
      <div>
        <div class="hint-title">FlowCraft 後端未連線</div>
        <div class="hint-desc">請確認後端服務（port 3001）已啟動，WanGP InfiniteTalk 模型已就緒</div>
      </div>
    </div>

    <div v-if="checking" class="connecting-hint">
      <span class="spin">⟳</span> 正在連接 ComfyUI...
    </div>

    <!-- ── Main Grid (always shown) ── -->
    <div class="main-grid">

      <!-- Left: Source + Audio -->
      <div class="inputs-col">

        <!-- Source Media -->
        <section class="card">
          <div class="card-header">
            <span class="card-title">📸 來源素材</span>
            <div class="mode-strip">
              <button class="mode-pill" :class="{ active: sourceMode === 'image' }" @click="sourceMode = 'image'">圖片</button>
              <button class="mode-pill" :class="{ active: sourceMode === 'video' }" @click="sourceMode = 'video'">影片</button>
            </div>
          </div>
          <div class="card-body">
            <div
              class="upload-zone"
              :class="{ 'has-preview': !!sourcePreview }"
              @dragover.prevent
              @drop.prevent="onSourceDrop"
              @click="triggerSourceInput"
            >
              <img v-if="sourceMode === 'image' && sourcePreview" :src="sourcePreview" class="preview-img" draggable="false" />
              <video v-else-if="sourceMode === 'video' && sourcePreview" :src="sourcePreview" class="preview-img" controls />
              <div v-else class="upload-placeholder">
                <div class="placeholder-icon">{{ sourceMode === 'image' ? '🖼️' : '🎬' }}</div>
                <div class="placeholder-text">拖放{{ sourceMode === 'image' ? '圖片' : '影片' }}</div>
                <div class="placeholder-hint">或從素材囊拖入 · 點擊選擇檔案</div>
              </div>
            </div>
            <input ref="sourceInputRef" type="file" :accept="sourceMode === 'image' ? 'image/*' : 'video/*,image/*'" hidden @change="onSourceSelect" />
            <div v-if="sourceFile" class="file-chip">
              <span>📎 {{ sourceFile.name }}</span>
              <button class="chip-remove" @click="clearSource">×</button>
            </div>
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
              :class="{ 'has-preview': !!audioPreview }"
              @dragover.prevent
              @drop.prevent="onAudioDrop"
              @click="triggerAudioInput"
            >
              <div v-if="audioPreview" class="audio-preview">
                <div class="audio-icon-big">🎵</div>
                <div class="audio-filename">{{ audioFile?.name }}</div>
                <audio :src="audioPreview" controls class="audio-player" @click.stop />
              </div>
              <div v-else class="upload-placeholder">
                <div class="placeholder-icon">🎵</div>
                <div class="placeholder-text">拖放音頻</div>
                <div class="placeholder-hint">MP3 · WAV · M4A · 或從素材囊拖入</div>
              </div>
            </div>
            <input ref="audioInputRef" type="file" accept="audio/*" hidden @change="onAudioSelect" />
            <div v-if="audioFile" class="file-chip">
              <span>📎 {{ audioFile.name }}</span>
              <button class="chip-remove" @click="clearAudio">×</button>
            </div>
          </div>
        </section>

      </div>

      <!-- Right: Params + Generate + Results -->
      <div class="right-col">

        <!-- Parameters -->
        <section class="card">
          <div class="card-header">
            <span class="card-title">⚙️ 生成參數</span>
          </div>
          <div class="card-body">
            <div class="param-grid">
              <div class="param-item">
                <label>影片長度</label>
                <select v-model.number="form.videoLength">
                  <option :value="16">~1秒 (16幀)</option>
                  <option :value="33">~2秒 (33幀)</option>
                  <option :value="49">~3秒 (49幀)</option>
                  <option :value="81">~5秒 (81幀)</option>
                </select>
              </div>
              <div class="param-item">
                <label>推理步數</label>
                <select v-model.number="form.steps">
                  <option :value="15">15 (快速)</option>
                  <option :value="20">20 (標準)</option>
                  <option :value="25">25 (較佳)</option>
                  <option :value="30">30 (高品質)</option>
                </select>
              </div>
            </div>
            <div class="time-estimate">
              ⏱ 預估時間：約 {{ estimatedMinutes }} 分鐘
            </div>
          </div>
        </section>

        <!-- Auto-test (dev) -->
        <button class="btn btn-secondary btn-sm autotest-btn" :disabled="generating" @click="autoTest">
          🧪 自動測試
        </button>

        <!-- Generate Button -->
        <button
          class="btn btn-primary btn-lg generate-btn"
          :disabled="generating || !sourceFile || !audioFile"
          @click="generate"
        >
          <span v-if="generating" class="generating-label">
            <span class="spin">⟳</span> {{ progressMsg || '生成中...' }}
          </span>
          <span v-else>🚀 開始生成</span>
        </button>

        <!-- Progress Bar -->
        <div v-if="generating" class="progress-bar-wrap">
          <div class="progress-bar" :style="{ width: progressPct + '%' }" />
        </div>

        <!-- Error -->
        <div v-if="errorMsg" class="error-box">
          <span>❌ {{ errorMsg }}</span>
          <button class="error-close" @click="errorMsg = ''">×</button>
        </div>

        <!-- Session Results (just generated) -->
        <section v-if="results.length > 0" class="card results-card">
          <div class="card-header">
            <span class="card-title">✨ 本次生成</span>
            <span class="result-count">{{ results.length }} 個</span>
          </div>
          <div class="results-list">
            <div v-for="(r, i) in results" :key="i" class="result-item">
              <video :src="r.url" controls class="result-video" />
              <div class="result-meta">
                <span class="result-audio">🎵 {{ r.audioName }}</span>
                <div class="result-actions">
                  <a :href="r.url" download class="btn btn-sm btn-secondary">下載</a>
                  <button
                    v-if="!hasAsset(r.url)"
                    class="btn btn-sm btn-primary"
                    @click="collectVideo(r.url)"
                  >🎒 收入囊中</button>
                  <span v-else class="collected-badge">✅ 已收</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Recent Productions (from WanGP outputs dir) -->
        <section class="card results-card">
          <div class="card-header">
            <span class="card-title">🗂️ 最近生產</span>
            <span class="result-count">{{ recentVideos.length }} 個</span>
            <button class="btn-link" @click="loadRecent" style="margin-left:auto">🔄 刷新</button>
          </div>
          <div v-if="recentVideos.length === 0" class="empty-recent">
            尚無生成記錄
          </div>
          <div class="results-list" v-else>
            <div v-for="(v, i) in recentVideos" :key="i" class="result-item">
              <video :src="v.videoUrl" controls class="result-video" preload="metadata" />
              <div class="result-meta">
                <span class="result-audio" :title="v.filename">📁 {{ v.filename }}</span>
                <div class="result-actions">
                  <a :href="v.videoUrl" download class="btn btn-sm btn-secondary">下載</a>
                  <button
                    v-if="!hasAsset(v.videoUrl)"
                    class="btn btn-sm btn-primary"
                    @click="collectVideo(v.videoUrl)"
                  >🎒 收入囊中</button>
                  <span v-else class="collected-badge">✅ 已收</span>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { API_BASE_URL } from '../../api/config'
import { useAssetLibrary } from '../../composables/useAssetLibrary'

const { addAsset, hasAsset } = useAssetLibrary()

// ── Backend connection ──
const backendOk = ref(false)
const checking = ref(false)

async function checkBackend() {
  checking.value = true
  try {
    const r = await fetch(`${API_BASE_URL}/api/health`)
    backendOk.value = r.ok
  } catch {
    backendOk.value = false
  } finally {
    checking.value = false
  }
}

// ── Source file ──
const sourceMode = ref<'image' | 'video'>('image')
const sourceFile = ref<File | null>(null)
const sourcePreview = ref('')
const sourceInputRef = ref<HTMLInputElement | null>(null)

function triggerSourceInput() {
  sourceInputRef.value?.click()
}
function clearSource() {
  sourceFile.value = null
  sourcePreview.value = ''
}
function onSourceSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  sourceFile.value = file
  sourcePreview.value = URL.createObjectURL(file)
}
async function onSourceDrop(e: DragEvent) {
  const assetPayload = e.dataTransfer?.getData('application/x-flowcraft-asset')
  if (assetPayload) {
    try {
      const asset = JSON.parse(assetPayload)
      const url = asset.url.startsWith('/') ? `${API_BASE_URL}${asset.url}` : asset.url
      sourcePreview.value = url
      const resp = await fetch(url)
      const blob = await resp.blob()
      const ext = url.split('.').pop() || (blob.type.startsWith('video') ? 'mp4' : 'jpg')
      sourceFile.value = new File([blob], `source.${ext}`, { type: blob.type })
      if (asset.type === 'video') sourceMode.value = 'video'
      else sourceMode.value = 'image'
    } catch { /* ignore */ }
    return
  }
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  sourceFile.value = file
  sourcePreview.value = URL.createObjectURL(file)
  sourceMode.value = file.type.startsWith('video') ? 'video' : 'image'
}

// ── Audio file ──
const audioFile = ref<File | null>(null)
const audioPreview = ref('')
const audioInputRef = ref<HTMLInputElement | null>(null)

function triggerAudioInput() {
  audioInputRef.value?.click()
}
function clearAudio() {
  audioFile.value = null
  audioPreview.value = ''
}
function onAudioSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  audioFile.value = file
  audioPreview.value = URL.createObjectURL(file)
}
async function onAudioDrop(e: DragEvent) {
  const assetPayload = e.dataTransfer?.getData('application/x-flowcraft-asset')
  if (assetPayload) {
    try {
      const asset = JSON.parse(assetPayload)
      if (asset.type === 'audio') {
        const url = asset.url.startsWith('/') ? `${API_BASE_URL}${asset.url}` : asset.url
        const resp = await fetch(url)
        const blob = await resp.blob()
        const name = url.split('/').pop() || 'audio.mp3'
        audioFile.value = new File([blob], name, { type: blob.type || 'audio/mpeg' })
        audioPreview.value = URL.createObjectURL(audioFile.value)
        return
      }
    } catch { /* ignore */ }
  }
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  audioFile.value = file
  audioPreview.value = URL.createObjectURL(file)
}

// ── Form params ──
const form = reactive({
  videoLength: 81,
  steps: 20,
})

// 預估時間：每步約 31 秒，幀數越多越慢
const estimatedMinutes = computed(() => {
  const frameRatio = form.videoLength / 16
  const totalSecs = form.steps * 31 * frameRatio
  return Math.round(totalSecs / 60)
})

// ── Generation ──
const generating = ref(false)
const progressMsg = ref('')
const progressPct = ref(0)
const errorMsg = ref('')

interface VideoResult {
  url: string
  audioName: string
}
const results = ref<VideoResult[]>([])

async function generate() {
  if (!sourceFile.value || !audioFile.value) return
  generating.value = true
  errorMsg.value = ''
  progressMsg.value = '上傳素材中...'
  progressPct.value = 10

  try {
    const fd = new FormData()
    fd.append('sourceFile', sourceFile.value)
    fd.append('audioFile', audioFile.value)
    fd.append('videoLength', String(form.videoLength))
    fd.append('numSteps', String(form.steps))

    progressMsg.value = `生成中（預估 ${estimatedMinutes.value} 分鐘）...`
    progressPct.value = 20

    const genRes = await fetch(`${API_BASE_URL}/api/infinitetalk/generate-upload`, {
      method: 'POST',
      body: fd,
    })
    const genData = await genRes.json()
    console.log('[LipSync] generate result:', genData)
    progressPct.value = 95

    if (!genData.ok) {
      throw new Error(genData.error || `生成失敗：${JSON.stringify(genData.rawOutput ?? '').slice(0, 200)}`)
    }

    progressPct.value = 100
    progressMsg.value = '完成！'
    results.value.unshift({ url: genData.videoUrl, audioName: audioFile.value?.name || '' })

  } catch (err: unknown) {
    console.error('[LipSync] generate error:', err)
    errorMsg.value = err instanceof Error ? err.message : String(err)
  } finally {
    generating.value = false
    progressMsg.value = ''
    progressPct.value = 0
  }
}

// ── Collect ──
function collectVideo(url: string) {
  addAsset({ type: 'video', url, mimeType: 'video/mp4', label: 'InfiniteTalk' })
}

// ── Recent productions ──
interface RecentVideo {
  filename: string
  videoUrl: string
  videoPath: string
  createdAt: number
}
const recentVideos = ref<RecentVideo[]>([])

async function loadRecent() {
  try {
    const r = await fetch(`${API_BASE_URL}/api/infinitetalk/recent`)
    const data = await r.json()
    if (data.ok) recentVideos.value = data.files
  } catch { /* ignore */ }
}

// ── Auto-test: load sample files and trigger generate ──
async function autoTest() {
  try {
    progressMsg.value = '載入測試素材...'
    const imgRes = await fetch(`${API_BASE_URL}/generated/nano/695a77d2-096d-4425-ba0f-60adf3e64fe0/image-1.jpg`)
    if (!imgRes.ok) throw new Error(`無法載入測試圖片 (${imgRes.status})`)
    const imgBlob = await imgRes.blob()
    sourceFile.value = new File([imgBlob], 'test-image.jpg', { type: 'image/jpeg' })
    sourcePreview.value = URL.createObjectURL(imgBlob)
    sourceMode.value = 'image'

    const audRes = await fetch(`${API_BASE_URL}/generated/assets/test-audio.mp3`)
    if (!audRes.ok) throw new Error(`無法載入測試音頻 (${audRes.status})`)
    const audBlob = await audRes.blob()
    audioFile.value = new File([audBlob], 'test-audio.mp3', { type: 'audio/mpeg' })
    audioPreview.value = URL.createObjectURL(audioFile.value)

    await generate()
  } catch (e: unknown) {
    errorMsg.value = `自動測試失敗: ${e instanceof Error ? e.message : String(e)}`
    progressMsg.value = ''
  }
}

// ── Init ──
onMounted(() => {
  checkBackend()
  loadRecent()
})
</script>

<style scoped>
.local-video-tab {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}

/* ── Connection Bar ── */
.connection-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-secondary, #1a1a2e);
  border-radius: 8px;
  font-size: 13px;
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
  flex-shrink: 0;
}
.conn-dot.green { background: #00b894; box-shadow: 0 0 6px rgba(0,184,148,0.5); }
.conn-dot.red   { background: #d63031; }
.conn-label { font-weight: 600; color: var(--text-primary, #eee); }
.conn-url { font-size: 12px; color: var(--text-secondary, #888); }
.btn-link {
  background: none;
  border: none;
  color: var(--accent, #6c5ce7);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
}
.btn-link:hover { text-decoration: underline; }
.btn-link:disabled { opacity: 0.5; cursor: not-allowed; }
.settings-btn { margin-left: auto; }
.conn-note { font-size: 11px; color: var(--text-secondary, #888); margin-left: auto; }

/* ── Settings ── */
.settings-panel {
  padding: 16px;
}
.settings-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.settings-row label { font-size: 12px; color: var(--text-secondary, #888); }
.settings-row input {
  padding: 6px 10px;
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  background: var(--bg-primary, #0d0d1a);
  color: var(--text-primary, #eee);
  font-size: 13px;
  max-width: 360px;
}
.hint {
  font-size: 11px;
  color: var(--text-secondary, #666);
}

/* ── Not Connected / Connecting ── */
.not-connected-hint {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 28px 24px;
  border: 1px dashed var(--border, #444);
  border-radius: 12px;
  color: var(--text-secondary, #aaa);
  background: rgba(255,255,255,0.02);
}
.hint-icon { font-size: 28px; line-height: 1; }
.hint-title { font-size: 15px; font-weight: 600; color: var(--text-primary, #eee); margin-bottom: 4px; }
.hint-desc { font-size: 13px; line-height: 1.6; }
.hint-desc code {
  background: rgba(255,255,255,0.08);
  padding: 1px 6px;
  border-radius: 4px;
}
.connecting-hint {
  padding: 16px 24px;
  color: var(--text-secondary, #aaa);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Main Grid ── */
.main-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
@media (max-width: 900px) {
  .main-grid { grid-template-columns: 1fr; }
}

.inputs-col,
.right-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Card ── */
.card {
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 12px;
  overflow: hidden;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #2a2a4a);
  gap: 8px;
}
.card-title { font-weight: 600; font-size: 14px; }
.card-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }

/* ── Mode Strip ── */
.mode-strip {
  display: flex;
  gap: 6px;
}
.mode-pill {
  padding: 4px 12px;
  border: 1px solid var(--border, #333);
  border-radius: 20px;
  background: transparent;
  color: var(--text-secondary, #888);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.mode-pill.active,
.mode-pill:hover {
  background: var(--accent, #6c5ce7);
  color: #fff;
  border-color: var(--accent, #6c5ce7);
}

/* ── Upload Zone ── */
.upload-zone {
  border: 2px dashed var(--border, #333);
  border-radius: 10px;
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
  position: relative;
}
.upload-zone:hover {
  border-color: var(--accent, #6c5ce7);
  background: rgba(108, 92, 231, 0.04);
}
.upload-zone.has-preview {
  padding: 6px;
  min-height: 160px;
  cursor: default;
}
.audio-zone {
  min-height: 100px;
}
.audio-zone.has-preview {
  min-height: 120px;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px;
  text-align: center;
}
.placeholder-icon { font-size: 28px; }
.placeholder-text { font-size: 13px; color: var(--text-primary, #ddd); font-weight: 500; }
.placeholder-hint { font-size: 11px; color: var(--text-secondary, #888); }

.preview-img {
  max-width: 100%;
  max-height: 200px;
  border-radius: 6px;
  object-fit: contain;
}

.audio-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 12px;
}
.audio-icon-big { font-size: 24px; }
.audio-filename { font-size: 12px; color: var(--text-primary, #eee); font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audio-player { width: 100%; max-width: 320px; height: 36px; }

/* ── File Chip ── */
.file-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(108, 92, 231, 0.1);
  border: 1px solid rgba(108, 92, 231, 0.2);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-secondary, #aaa);
}
.chip-remove {
  background: none;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}
.chip-remove:hover { color: #ff7675; }

/* ── Param Grid ── */
.param-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.param-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.param-item label { font-size: 11px; color: var(--text-secondary, #888); }
.param-item select,
.param-item input {
  padding: 6px 10px;
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  background: var(--bg-primary, #0d0d1a);
  color: var(--text-primary, #eee);
  font-size: 13px;
  width: 100%;
}

/* ── Time Estimate ── */
.time-estimate {
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  padding: 4px 2px;
}

/* ── Auto-test ── */
.autotest-btn { width: 100%; margin-bottom: 4px; opacity: 0.6; font-size: 11px; }

/* ── Generate Button ── */
.generate-btn {
  width: 100%;
  padding: 14px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  background: linear-gradient(135deg, #6c5ce7, #a29bfe);
  border: none;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.generate-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(108, 92, 231, 0.4);
}
.generate-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}
.generating-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Progress Bar ── */
.progress-bar-wrap {
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6c5ce7, #a29bfe);
  border-radius: 2px;
  transition: width 0.4s ease;
}

/* ── Error ── */
.error-box {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(214, 48, 49, 0.1);
  border: 1px solid rgba(214, 48, 49, 0.3);
  border-radius: 8px;
  color: #ff7675;
  font-size: 13px;
}
.error-close {
  background: none;
  border: none;
  color: #ff7675;
  cursor: pointer;
  font-size: 16px;
  flex-shrink: 0;
}

/* ── Results ── */
.results-card { margin-top: 0; }
.empty-recent {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary, #888);
  font-size: 13px;
}
.result-count {
  font-size: 11px;
  color: var(--text-secondary, #888);
  background: rgba(255,255,255,0.06);
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: auto;
}
.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
}
.result-item {
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 10px;
  overflow: hidden;
}
.result-video {
  width: 100%;
  display: block;
  max-height: 220px;
  object-fit: contain;
  background: #000;
}
.result-meta {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.result-audio {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.result-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
}
.collected-badge {
  font-size: 11px;
  color: #00b894;
}

/* ── Buttons ── */
.btn {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.btn-sm { padding: 4px 10px; font-size: 11px; }
.btn-primary { background: var(--accent, #6c5ce7); color: #fff; }
.btn-primary:hover { filter: brightness(1.1); }
.btn-secondary { background: rgba(255,255,255,0.08); color: var(--text-primary, #eee); }
.btn-secondary:hover { background: rgba(255,255,255,0.14); }

/* ── Spinner ── */
.spin {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
