<template>
  <div class="topbar">
    <span class="topbar-title">🎬 AI Studio</span>
    <div class="topbar-actions">
      <span class="badge" :class="statusBadgeClass">
        {{ veoStatus.configured ? `已連線 ${statusLabel}` : '尚未設定' }}
      </span>
      <button class="btn btn-secondary btn-sm" @click="loadAll">重新整理</button>
    </div>
  </div>

  <div class="page-content veo-page">
    <!-- Tab Switch -->
    <div class="studio-tabs">
      <button
        class="studio-tab"
        :class="{ active: activeTab === 'video' }"
        @click="activeTab = 'video'"
      >
        🎬 Veo 影片
      </button>
      <button
        class="studio-tab"
        :class="{ active: activeTab === 'image' }"
        @click="activeTab = 'image'"
      >
        🖼️ Nano 圖片
      </button>
      <button
        class="studio-tab"
        :class="{ active: activeTab === 'subject' }"
        @click="activeTab = 'subject'"
      >
        🎭 角色影片
      </button>
      <button
        class="studio-tab"
        :class="{ active: activeTab === 'local' }"
        @click="activeTab = 'local'"
      >
        🗣️ InfiniteTalk
      </button>
      <button
        class="studio-tab"
        :class="{ active: activeTab === 'wav2lip' }"
        @click="activeTab = 'wav2lip'"
      >
        👄 Wav2Lip
      </button>
      <button
        class="studio-tab"
        :class="{ active: activeTab === 'seedance' }"
        @click="activeTab = 'seedance'"
      >
        🌱 Seedance
      </button>
    </div>

    <!-- Image Tab -->
    <NanoImageTab
      v-if="activeTab === 'image'"
      ref="nanoTabRef"
      :configured="veoStatus.configured"
    />

    <!-- Local Video Tab (InfiniteTalk + Wan2GP) -->
    <LocalVideoTab v-if="activeTab === 'local'" />

    <!-- Wav2Lip Tab (ComfyUI) -->
    <ComfyWav2LipTab v-if="activeTab === 'wav2lip'" />

    <!-- Subject Video Tab (Gemini API) -->
    <SubjectVideoTab v-if="activeTab === 'subject'" />

    <!-- Seedance Tab (PiAPI) -->
    <SeedanceTab v-if="activeTab === 'seedance'" />

    <!-- Video Tab -->
    <template v-if="activeTab === 'video'">
    <VeoHeroSection
      :total-jobs="jobs.length"
      :active-count="activeJobs.length"
      :completed-count="completedJobs.length"
    />

    <VeoPromptOptimizer
      ref="optimizerRef"
      :source-modes="sourceModes"
      @apply-prompt="onApplyPrompt"
    />

    <div class="veo-grid">
      <VeoGenerationForm
        ref="generationFormRef"
        :form="form"
        :source-modes="sourceModes"
        :allowed-durations="allowedDurations"
        :allowed-resolutions="allowedResolutions"
        :constraint-hint="constraintHint"
        :submit-hint="submitHint"
        :configured="veoStatus.configured"
        :submitting="submitting"
        :error-message="errorMessage"
        :lossless="lossless"
        :expand-color="expandColor"
        :expanding-image="expandingImage"
        :image-preview="imagePreview"
        :last-frame-preview="lastFramePreview"
        :video-preview="videoPreview"
        :selected-source-video="selectedSourceVideo"
        :completed-video-options="completedVideoOptions"
        :can-add-ref="canAddRef"
        :optimizing="optimizerRef?.optimizing ?? false"
        :has-api-key="hasApiKey"
        @switch-mode="switchMode"
        @update:lossless="lossless = $event"
        @update:expand-color="expandColor = $event"
        @expand-border="expandImageBorder"
        @copy-start-to-end="copyStartToEnd"
        @image-upload="onImageUpload"
        @last-frame-upload="onLastFrameUpload"
        @video-upload="onVideoUpload"
        @start-image-drop="onStartImageDrop"
        @end-image-drop="onEndImageDrop"
        @video-drop="onVideoDrop"
        @drop-reference="onRefSlotDrop"
        @add-reference="onAddReference"
        @remove-reference="onRemoveReference"
        @change-ref-type="onChangeRefType"
        @optimize-refs="onOptimizeRefs"
        @update-descriptions="onUpdateDescriptions"
        @apply-existing-video="onApplyExistingVideo"
        @submit="submit"
      />

      <section class="veo-side-column">
        <VeoActiveJobs :active-jobs="activeJobs" :mode-label-map="modeLabelMap" />
        <VeoConnectionStatus :veo-status="veoStatus" :status-label="statusLabel" />
      </section>
    </div>

    <VeoHistoryGallery
      :jobs="jobs"
      :mode-label-map="modeLabelMap"
      :has-asset="hasAsset"
      @restore="restoreJob"
      @remove="removeJob"
      @extend="useForExtend"
      @collect="collectAsset"
    />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import NanoImageTab from '../components/NanoImageTab.vue'
import LocalVideoTab from '../components/local/LocalVideoTab.vue'
import ComfyWav2LipTab from '../components/local/ComfyWav2LipTab.vue'
import VeoPromptOptimizer from '../components/veo/VeoPromptOptimizer.vue'
import SubjectVideoTab from '../components/SubjectVideoTab.vue'
import SeedanceTab from '../components/seedance/SeedanceTab.vue'
import VeoHeroSection from '../components/veo/VeoHeroSection.vue'
import VeoGenerationForm from '../components/veo/VeoGenerationForm.vue'
import VeoHistoryGallery from '../components/veo/VeoHistoryGallery.vue'
import VeoActiveJobs from '../components/veo/VeoActiveJobs.vue'
import VeoConnectionStatus from '../components/veo/VeoConnectionStatus.vue'
import { useAssetLibrary } from '../composables/useAssetLibrary'
import { useVeoAssetHandlers } from '../composables/useVeoAssetHandlers'
import { API_BASE_URL } from '../api/config'
import {
  createVeoJob,
  createVeoJobGemini,
  deleteVeoJob,
  fetchVeoJob,
  fetchVeoJobs,
  fetchVeoStatus,
  geminiPoll,
  type VeoGenerationPayload,
  type VeoInlineAsset,
  type VeoJob,
  type VeoReferenceAsset,
  type VeoSourceMode,
  type VeoUiStateSnapshot,
} from '../api/veo'

const activeTab = ref<'video' | 'image' | 'local' | 'wav2lip' | 'subject' | 'seedance'>('video')
const nanoTabRef = ref<InstanceType<typeof NanoImageTab> | null>(null)

// ── Component Refs ──
const optimizerRef = ref<InstanceType<typeof VeoPromptOptimizer> | null>(null)
const generationFormRef = ref<InstanceType<typeof VeoGenerationForm> | null>(null)

// ── Veo State ──
const veoStatus = ref({
  configured: false,
  authMode: null as 'apiKey' | 'gcp' | null,
  message: '檢查中...',
})

const jobs = ref<VeoJob[]>([])
const submitting = ref(false)
const errorMessage = ref('')
const selectedSourceVideo = ref('')
const pollHandle = ref<number | null>(null)
const lossless = ref(false)
const refDescriptions = ref<string[]>(['', '', '', ''])

const sourceModes = [
  { value: 'text', label: '文字生成', icon: '✍️' },
  { value: 'image', label: '圖片生成', icon: '🖼️' },
  { value: 'frames', label: '首尾幀', icon: '🪟' },
  { value: 'references', label: '參考圖', icon: '🧷' },
  { value: 'extend', label: '延長影片', icon: '📼' },
] as const

const modeLabelMap: Record<VeoSourceMode, string> = {
  text: 'Text to Video',
  image: 'Image to Video',
  frames: 'First / Last Frame',
  references: 'Reference Images',
  extend: 'Extend Video',
}

// ── Per-Model Constraints ──
const MODEL_DURATION_MAP: Record<string, number[]> = {
  'veo-3.1-generate-preview::text':       [4, 6, 8],
  'veo-3.1-generate-preview::image':      [8],
  'veo-3.1-generate-preview::frames':     [8],
  'veo-3.1-generate-preview::references': [8],
  'veo-3.1-generate-preview::extend':     [8],
  'veo-3.0-generate-preview::text':       [5, 6, 7, 8],
  'veo-3.0-generate-preview::image':      [8],
  'veo-3.0-generate-preview::frames':     [8],
  'veo-3.0-generate-preview::references': [8],
  'veo-3.0-generate-preview::extend':     [8],
  'veo-2.0-generate-001::text':           [5, 6, 7, 8],
  'veo-2.0-generate-001::image':          [5, 6, 7, 8],
  'veo-2.0-generate-001::frames':         [5, 6, 7, 8],
  'veo-2.0-generate-001::references':     [8],
  'veo-2.0-generate-001::extend':         [8],
}

const MODEL_RESOLUTIONS: Record<string, string[]> = {
  'veo-3.1-generate-preview': ['720p'],
  'veo-3.0-generate-preview': ['720p'],
  'veo-2.0-generate-001':     ['720p', '1080p'],
}

const form = reactive<{
  sourceMode: VeoSourceMode
  prompt: string
  negativePrompt: string
  model: string
  aspectRatio: '16:9' | '9:16'
  resolution: '720p' | '1080p'
  durationSeconds: number
  numberOfVideos: number
  seed: number | null
  enhancePrompt: boolean
  generateAudio: boolean
  personGeneration: 'dont_allow' | 'allow_adult'
  fps: number | null
  outputGcsUri: string
  image: VeoInlineAsset | null
  lastFrame: VeoInlineAsset | null
  referenceImages: VeoReferenceAsset[]
  video: VeoInlineAsset | null
  sourceVideoRef: { jobId: string; index: number } | null
}>({
  sourceMode: 'text',
  prompt: '',
  negativePrompt: '',
  model: 'veo-3.1-generate-preview',
  aspectRatio: '16:9',
  resolution: '720p',
  durationSeconds: 4,
  numberOfVideos: 1,
  seed: null,
  enhancePrompt: true,
  generateAudio: false,
  personGeneration: 'allow_adult',
  fps: null,
  outputGcsUri: '',
  image: null,
  lastFrame: null,
  referenceImages: [],
  video: null,
  sourceVideoRef: null,
})

// ── Asset handlers (composable) ──
const {
  expandColor,
  expandingImage,
  onStartImageDrop,
  onEndImageDrop,
  onVideoDrop,
  onRefSlotDrop,
  onImageUpload,
  onLastFrameUpload,
  onVideoUpload,
  expandImageBorder,
  copyStartToEnd,
  resetMediaState,
  normalizeAsset,
} = useVeoAssetHandlers(form, selectedSourceVideo)

// ── Computed constraints ──
const allowedDurations = computed(() => {
  const key = `${form.model}::${form.sourceMode}`
  return MODEL_DURATION_MAP[key] || [8]
})

const allowedResolutions = computed(() => {
  return MODEL_RESOLUTIONS[form.model] || ['720p']
})

const constraintHint = computed(() => {
  const durations = allowedDurations.value
  if (durations.length === 1) {
    const modelShort = form.model.replace('-generate-preview', '').replace('-generate-001', '')
    const modeLabel = modeLabelMap[form.sourceMode] || form.sourceMode
    return `${modelShort} 的 ${modeLabel} 模式僅支援 ${durations[0]}s 片長`
  }
  return ''
})

watch([() => form.model, () => form.sourceMode], () => {
  const durations = allowedDurations.value
  if (!durations.includes(form.durationSeconds)) {
    form.durationSeconds = durations[0]
  }
  const resolutions = allowedResolutions.value
  if (!resolutions.includes(form.resolution)) {
    form.resolution = resolutions[0] as '720p' | '1080p'
  }
})

const activeJobs = computed(() => jobs.value.filter((job) => job.status === 'pending' || job.status === 'running'))
const completedJobs = computed(() => jobs.value.filter((job) => job.status === 'completed'))
const imagePreview = computed(() => form.image?.previewUrl || '')
const lastFramePreview = computed(() => form.lastFrame?.previewUrl || '')
const videoPreview = computed(() => form.video?.previewUrl || (form.sourceVideoRef ? selectedExistingVideoUrl.value : ''))

const statusLabel = computed(() => veoStatus.value.authMode === 'gcp' ? 'Vertex AI' : veoStatus.value.authMode === 'apiKey' ? 'Gemini API Key' : '未設定')
const statusBadgeClass = computed(() => veoStatus.value.configured ? 'badge-active' : 'badge-trigger')
const submitHint = computed(() => {
  if (!veoStatus.value.configured) return '先到設定頁存好 Gemini API Key 或 GCP 憑證，這裡才會真的送到 Veo。'
  if (form.sourceMode === 'references') return 'Reference 模式會吃 prompt + reference images，不能和一般 image/video 混用。'
  if (form.sourceMode === 'extend') return 'Extend 模式可直接上傳影片，或從下方歷史作品挑一支延長。'
  return '送出後後端會建立長任務，頁面每 10 秒自動輪詢一次直到完成。'
})

const canAddRef = computed(() => {
  const assetCount = form.referenceImages.filter(r => r.referenceType === 'ASSET').length
  const styleCount = form.referenceImages.filter(r => r.referenceType === 'STYLE').length
  return form.referenceImages.length < 4 && (assetCount < 3 || styleCount < 1)
})

const completedVideoOptions = computed(() =>
  completedJobs.value.flatMap((job) =>
    job.outputs.map((output) => ({
      value: `${job.id}:${output.index}`,
      label: `${formatDate(job.createdAt)} · ${modeLabelMap[job.sourceMode]} · #${output.index + 1}`,
      localUrl: output.localUrl || '',
    }))
  )
)

const selectedExistingVideoUrl = computed(() => {
  if (!form.sourceVideoRef) return ''
  const job = jobs.value.find((item) => item.id === form.sourceVideoRef?.jobId)
  const output = job?.outputs.find((item) => item.index === form.sourceVideoRef?.index)
  return output?.localUrl ? resolveMediaUrl(output.localUrl) : ''
})

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const { addAsset, hasAsset } = useAssetLibrary()

function resolveMediaUrl(path: string) {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`
}

function collectAsset(url: string, type: 'image' | 'video') {
  const resolved = resolveMediaUrl(url)
  addAsset({ type, url: resolved, mimeType: type === 'video' ? 'video/mp4' : 'image/jpeg', label: 'AI Studio' })
}

// ── Optimizer Events ──
function onApplyPrompt(prompt: string, negativePrompt: string, sourceMode: VeoSourceMode) {
  form.prompt = prompt
  if (negativePrompt) form.negativePrompt = negativePrompt
  form.sourceMode = sourceMode
}

// ── Reference Slots Events ──
function onAddReference(asset: VeoReferenceAsset) { form.referenceImages.push(asset) }
function onRemoveReference(index: number) { form.referenceImages.splice(index, 1) }
function onChangeRefType(index: number, newType: 'ASSET' | 'STYLE') { form.referenceImages[index].referenceType = newType }
function onOptimizeRefs(combined: string) { optimizerRef.value?.triggerRefOptimizer(combined) }
function onUpdateDescriptions(descriptions: string[]) { refDescriptions.value = descriptions }

// ── Mode switching ──
function switchMode(mode: VeoSourceMode) {
  form.sourceMode = mode
  errorMessage.value = ''
  resetMediaState()
}

function onApplyExistingVideo(value: string) {
  selectedSourceVideo.value = value
  if (!value) { form.sourceVideoRef = null; return }
  const [jobId = '', index = '0'] = value.split(':')
  form.sourceVideoRef = { jobId, index: Number(index) }
  form.video = null
}

// ── Build & Submit ──
function buildPayload(): VeoGenerationPayload {
  const uiState: VeoUiStateSnapshot = {
    optimizerMode: optimizerRef.value?.optimizerMode,
    optimizerInput: optimizerRef.value?.optimizerInput,
    optimizeResult: optimizerRef.value?.optimizeResult ? { ...optimizerRef.value.optimizeResult } : null,
    refDescriptions: [...refDescriptions.value],
  }
  return {
    sourceMode: form.sourceMode,
    prompt: form.prompt.trim() || undefined,
    negativePrompt: form.negativePrompt.trim() || undefined,
    model: form.model,
    aspectRatio: form.aspectRatio,
    resolution: form.resolution,
    durationSeconds: form.durationSeconds,
    numberOfVideos: form.numberOfVideos,
    seed: form.seed || undefined,
    enhancePrompt: form.enhancePrompt,
    generateAudio: form.generateAudio,
    personGeneration: form.personGeneration,
    fps: form.fps || undefined,
    outputGcsUri: form.outputGcsUri.trim() || undefined,
    compressionQuality: lossless.value ? 'LOSSLESS' : 'OPTIMIZED',
    image: form.image,
    lastFrame: form.lastFrame,
    referenceImages: form.referenceImages.map(({ base64Data, mimeType, fileName, referenceType }) => ({
      base64Data, mimeType, fileName, referenceType,
    })),
    video: form.video,
    sourceVideoRef: form.sourceVideoRef,
    uiState,
  }
}

async function submit(backend: 'vertex' | 'gemini' = 'vertex') {
  errorMessage.value = ''
  submitting.value = true
  try {
    const payload = buildPayload()
    if (backend === 'gemini') {
      const { job } = await createVeoJobGemini(payload)
      jobs.value = [job, ...jobs.value.filter((item) => item.id !== job.id)]
      startGeminiPolling()
    } else {
      const { job } = await createVeoJob(payload)
      jobs.value = [job, ...jobs.value.filter((item) => item.id !== job.id)]
      startPolling()
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    submitting.value = false
  }
}

// ── Polling & Load ──
let retryHandle: ReturnType<typeof setTimeout> | null = null

async function loadAll() {
  try {
    const [status, list] = await Promise.all([fetchVeoStatus(), fetchVeoJobs()])
    veoStatus.value = { configured: status.configured, authMode: status.authMode, message: status.message }
    jobs.value = list.jobs
    if (activeJobs.value.length > 0) startPolling(); else stopPolling()
    nanoTabRef.value?.loadJobs()
    // 成功後清掉 retry timer
    if (retryHandle !== null) { clearTimeout(retryHandle); retryHandle = null }
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    // 後端未就緒時，每 5 秒自動重試，直到成功
    if (retryHandle === null) {
      retryHandle = setTimeout(function retry() {
        retryHandle = null
        void loadAll()
      }, 5000)
    }
  }
}

async function pollPendingJobs() {
  const pending = activeJobs.value
  if (pending.length === 0) { stopPolling(); return }
  const results = await Promise.allSettled(pending.map((job) => fetchVeoJob(job.id)))
  const updates = new Map<string, VeoJob>()
  for (const result of results) {
    if (result.status === 'fulfilled') updates.set(result.value.job.id, result.value.job)
  }
  jobs.value = jobs.value.map((job) => updates.get(job.id) || job)
}

function startPolling() {
  if (pollHandle.value !== null) return
  pollHandle.value = window.setInterval(() => { void pollPendingJobs() }, 10000)
}

function stopPolling() {
  if (pollHandle.value === null) return
  window.clearInterval(pollHandle.value)
  pollHandle.value = null
}

// Gemini API jobs 的 polling（用 gemini-poll endpoint）
let geminiPollHandle: number | null = null
function startGeminiPolling() {
  // 也啟動常規 polling（Vertex AI jobs）
  startPolling()
  if (geminiPollHandle !== null) return
  geminiPollHandle = window.setInterval(async () => {
    const geminiJobs = jobs.value.filter(
      j => (j.authMode as string) === 'gemini-api' && (j.status === 'pending' || j.status === 'running')
    )
    if (geminiJobs.length === 0) {
      if (geminiPollHandle !== null) { clearInterval(geminiPollHandle); geminiPollHandle = null }
      return
    }
    for (const job of geminiJobs) {
      try {
        const result = await geminiPoll(job.id)
        const idx = jobs.value.findIndex(j => j.id === job.id)
        if (idx >= 0) jobs.value[idx] = result.job
      } catch { /* ignore */ }
    }
  }, 10000)
}

const hasApiKey = computed(() => {
  return veoStatus.value.authMode === 'apiKey' || veoStatus.value.configured
})

async function removeJob(jobId: string) {
  await deleteVeoJob(jobId)
  jobs.value = jobs.value.filter((job) => job.id !== jobId)
}

// ── Restore & Extend ──
function restoreJob(job: VeoJob) {
  const snapshot = job.requestSnapshot
  if (!snapshot) return

  switchMode(snapshot.sourceMode)
  form.prompt = snapshot.prompt || ''
  form.negativePrompt = snapshot.negativePrompt || ''
  form.model = snapshot.model || 'veo-3.1-generate-preview'
  form.aspectRatio = snapshot.aspectRatio || '16:9'
  form.resolution = snapshot.resolution || '720p'
  form.durationSeconds = snapshot.durationSeconds || 4
  form.numberOfVideos = snapshot.numberOfVideos || 1
  form.seed = snapshot.seed ?? null
  form.enhancePrompt = snapshot.enhancePrompt ?? true
  form.generateAudio = snapshot.generateAudio ?? false
  form.personGeneration = snapshot.personGeneration || 'allow_adult'
  form.fps = snapshot.fps ?? null
  form.outputGcsUri = snapshot.outputGcsUri || ''
  lossless.value = snapshot.compressionQuality === 'LOSSLESS'
  form.image = normalizeAsset(snapshot.image)
  form.lastFrame = normalizeAsset(snapshot.lastFrame)
  form.referenceImages = (snapshot.referenceImages || []).map((asset) => normalizeAsset(asset)).filter(Boolean) as VeoReferenceAsset[]
  form.video = normalizeAsset(snapshot.video)
  form.sourceVideoRef = snapshot.sourceVideoRef || null
  selectedSourceVideo.value = form.sourceVideoRef ? `${form.sourceVideoRef.jobId}:${form.sourceVideoRef.index}` : ''

  optimizerRef.value?.setOptimizerState(
    snapshot.uiState?.optimizerMode || snapshot.sourceMode,
    snapshot.uiState?.optimizerInput || '',
    snapshot.uiState?.optimizeResult ? { ...snapshot.uiState.optimizeResult } as any : null
  )

  const restoredDescs = snapshot.uiState?.refDescriptions?.slice(0, 4) || ['', '', '', '']
  while (restoredDescs.length < 4) restoredDescs.push('')
  refDescriptions.value = restoredDescs
  generationFormRef.value?.refSlotsRef?.setDescriptions(restoredDescs)

  errorMessage.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function useForExtend(jobId: string, index: number, localUrl?: string) {
  form.sourceMode = 'extend'
  form.sourceVideoRef = { jobId, index }
  form.video = null
  selectedSourceVideo.value = `${jobId}:${index}`
  errorMessage.value = ''
  if (localUrl) window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => { void loadAll() })
onBeforeUnmount(() => {
  stopPolling()
  if (retryHandle !== null) { clearTimeout(retryHandle); retryHandle = null }
  if (geminiPollHandle !== null) { clearInterval(geminiPollHandle); geminiPollHandle = null }
})
</script>

<style scoped>
.studio-tabs {
  display: flex;
  gap: 4px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 10px;
  padding: 4px;
  width: fit-content;
}

.studio-tab {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--c-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.studio-tab:hover {
  color: var(--c-text);
  background: var(--c-bg);
}

.studio-tab.active {
  background: var(--c-accent);
  color: #fff;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
}

.veo-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.veo-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.8fr);
  gap: 16px;
}

.veo-side-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 1100px) {
  .veo-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  /* Topbar compact */
  .topbar {
    padding: 8px 12px;
    flex-wrap: wrap;
    gap: 6px;
  }

  .topbar-title {
    font-size: 14px;
  }

  .topbar-actions {
    gap: 6px;
  }

  .topbar-actions .badge {
    font-size: 11px;
    padding: 2px 8px;
  }

  .topbar-actions .btn-sm {
    font-size: 12px;
    padding: 4px 10px;
  }

  /* Page content padding */
  .veo-page {
    gap: 12px;
    padding: 8px;
  }

  /* Tabs: sticky, horizontally scrollable, no wrap */
  .studio-tabs {
    position: sticky;
    top: 0;
    z-index: 50;
    width: 100%;
    border-radius: 0;
    border-left: none;
    border-right: none;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
    padding: 4px 6px;
    gap: 4px;
  }

  .studio-tabs::-webkit-scrollbar {
    display: none;
  }

  .studio-tab {
    flex-shrink: 0;
    padding: 7px 14px;
    font-size: 13px;
  }

  /* Grid: full-width single column */
  .veo-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  /* Side column: stack vertically, full width */
  .veo-side-column {
    gap: 12px;
  }
}
</style>
