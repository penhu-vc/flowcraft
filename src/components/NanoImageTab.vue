<template>
  <div class="nano-page">
    <!-- Prompt Optimizer -->
    <NanoPromptOptimizer
      ref="optimizerRef"
      :source-modes="sourceModes"
      @use-prompt="onUsePrompt"
    />

    <!-- Generation Form -->
    <NanoGenerationForm
      ref="generationFormRef"
      :form="form"
      :source-modes="sourceModes"
      :submitting="submitting"
      :error-message="errorMessage"
      :configured="configured"
      :can-submit="canSubmit"
      :ref-descriptions="refDescriptions"
      :optimizer-disabled="optimizerRef?.optimizing"
      :pending-restored-mask="pendingRestoredMask"
      @submit="submit"
      @submit-multi-angle="submitMultiAngle"
      @switch-mode="switchMode"
      @image-uploaded="onImageUploaded"
      @one-click-remove="oneClickRemove"
      @mask-has-paint-change="maskHasPaint = $event"
      @update:ref-descriptions="refDescriptions = $event"
      @open-lightbox="openLightboxDirect"
      @run-ref-optimizer="runRefOptimizer"
    />

    <!-- 即時任務 -->
    <NanoActiveJobs :active-jobs="activeJobs" />

    <!-- History -->
    <NanoJobHistory
      :jobs="jobs"
      :running-count="activeJobs.length"
      :completed-count="completedJobs.length"
      :failed-count="failedJobs.length"
      @restore="restoreJob"
      @remove="removeJob"
      @use-as-edit-source="useAsEditSource"
    />

    <!-- Lightbox -->
    <Teleport to="body">
      <div v-if="lightboxUrl" class="lightbox-overlay" @click.self="closeLightbox" @keydown="onLightboxKeydown" tabindex="0" ref="lightboxRef">
        <button class="lightbox-close" @click="closeLightbox">&times;</button>
        <img :src="lightboxUrl" class="lightbox-img" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { API_BASE_URL } from '../api/config'
import {
  createNanoJob,
  deleteNanoJob,
  fetchNanoJobs,
  type NanoGenerationPayload,
  type NanoInlineAsset,
  type NanoJob,
  type NanoSourceMode,
  type NanoUiStateSnapshot,
} from '../api/nano'

import NanoPromptOptimizer from './nano/NanoPromptOptimizer.vue'
import NanoGenerationForm from './nano/NanoGenerationForm.vue'
import NanoActiveJobs from './nano/NanoActiveJobs.vue'
import NanoJobHistory from './nano/NanoJobHistory.vue'

import type { NanoRefAsset } from './nano/NanoReferencePanel.vue'

const props = defineProps<{
  configured: boolean
}>()

// ── Sub-component refs ──
const optimizerRef = ref<InstanceType<typeof NanoPromptOptimizer> | null>(null)
const generationFormRef = ref<InstanceType<typeof NanoGenerationForm> | null>(null)

// ── Computed accessor for mask editor & outpaint preview (nested in generation form) ──
const maskEditorRef = computed(() => generationFormRef.value?.maskEditorRef ?? null)
const outpaintPreviewRef = computed(() => generationFormRef.value?.outpaintPreviewRef ?? null)
const outpaintDirection = computed(() => generationFormRef.value?.outpaintDirection ?? 'center')
const outpaintFocal = computed(() => generationFormRef.value?.outpaintFocal ?? 'none')
const outpaintFilter = computed(() => generationFormRef.value?.outpaintFilter ?? 'none')

// ── Source Modes ──
const sourceModes = [
  { value: 'text' as const, label: '文字生圖', icon: '✍️' },
  { value: 'edit' as const, label: '圖片編輯', icon: '🖌️' },
  { value: 'reference' as const, label: '參考圖', icon: '🧷' },
  { value: 'outpaint' as const, label: '擴圖', icon: '🔲' },
]

// ── Form State ──
const jobs = ref<NanoJob[]>([])
const submitting = ref(false)
const errorMessage = ref('')
const maskHasPaint = ref(false)

const form = reactive<{
  sourceMode: NanoSourceMode
  prompt: string
  negativePrompt: string
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'
  imageSize: '1K' | '2K' | '4K'
  numberOfImages: number
  personGeneration: 'dont_allow' | 'allow_adult'
  image: NanoInlineAsset | null
  referenceImages: NanoInlineAsset[]
}>({
  sourceMode: 'text',
  prompt: '',
  negativePrompt: '',
  aspectRatio: '1:1',
  imageSize: '2K',
  numberOfImages: 1,
  personGeneration: 'allow_adult',
  image: null,
  referenceImages: [],
})

const activeJobs = computed(() => jobs.value.filter(j => j.status === 'running' || j.status === 'pending'))
const completedJobs = computed(() => jobs.value.filter(j => j.status === 'completed'))
const failedJobs = computed(() => jobs.value.filter(j => j.status === 'failed'))
const pendingRestoredMask = ref<string | null>(null)
const canSubmit = computed(() => {
  if (!props.configured) return false
  if (form.sourceMode === 'outpaint') {
    return !!form.image
  }
  if (!form.prompt.trim()) return false
  if (form.sourceMode === 'edit' && !form.image) return false
  if (form.sourceMode === 'reference' && form.referenceImages.length === 0) return false
  return true
})

// ── Reference descriptions ──
const refDescriptions = ref<string[]>(Array(14).fill(''))

type NanoRefType =
  | 'subject_person' | 'subject_animal' | 'subject_product' | 'subject_default'
  | 'style'
  | 'control_canny' | 'control_scribble' | 'control_face_mesh'

const refTypeLabels: Record<NanoRefType, string> = {
  subject_person: '👤 人物',
  subject_animal: '🐾 動物',
  subject_product: '📦 產品',
  subject_default: '🎯 其他物品',
  style: '🎨 風格參考',
  control_canny: '✏️ 邊緣線稿',
  control_scribble: '🖊️ 手繪草圖',
  control_face_mesh: '🧑 臉部網格',
}

const refSlots = computed(() => {
  const slots: (NanoRefAsset | null)[] = Array(14).fill(null)
  ;(form.referenceImages as NanoRefAsset[]).forEach((item, i) => {
    if (i < 14) slots[i] = item
  })
  return slots
})

function getRefCategoryLabel(type: NanoRefType): string {
  if (type.startsWith('subject_')) return '主體參考'
  if (type === 'style') return '風格參考'
  if (type.startsWith('control_')) return '控制參考'
  return '參考'
}

async function runRefOptimizer() {
  const parts: string[] = []
  refDescriptions.value.forEach((desc, i) => {
    const slot = refSlots.value[i]
    if (slot && desc.trim()) {
      const category = getRefCategoryLabel(slot.referenceType)
      const label = refTypeLabels[slot.referenceType]
      parts.push(`圖${i + 1}（${category} · ${label}）：${desc.trim()}`)
    }
  })
  const combined = parts.join('\n')
  if (!combined || !optimizerRef.value) return
  optimizerRef.value.optimizerInput = combined
  await optimizerRef.value.runOptimizer()
}

// ── Optimizer callback ──
function onUsePrompt(prompt: string, negativePrompt: string, mode: NanoSourceMode) {
  form.prompt = prompt
  if (negativePrompt) {
    form.negativePrompt = negativePrompt
  }
  form.sourceMode = mode
}

// ── Image upload handling ──
const originalImageSize = ref<{ width: number; height: number } | null>(null)

function onImageUploaded(asset: NanoInlineAsset, size: { width: number; height: number }, closestRatio: string) {
  form.image = asset
  maskHasPaint.value = false
  originalImageSize.value = size
  form.aspectRatio = closestRatio as typeof form.aspectRatio
}

// ── One-click remove (mask editor integration) ──
async function oneClickRemove() {
  if (!maskHasPaint.value || !form.image) return
  const origSize = originalImageSize.value
  const needsCrop = origSize && !isRatioMatch(origSize.width, origSize.height, form.aspectRatio)
  form.prompt = 'Remove the masked area and fill with the surrounding background seamlessly. Keep the rest of the image exactly the same.'
  form.negativePrompt = 'artifact, seam, blur, distortion, change, alteration'
  await submit()
  if (needsCrop && origSize) {
    await cropLatestResult(origSize.width, origSize.height)
  }
}

function isRatioMatch(w: number, h: number, ratioLabel: string): boolean {
  const [rw, rh] = ratioLabel.split(':').map(Number)
  const imgRatio = w / h
  const targetRatio = rw / rh
  return Math.abs(imgRatio - targetRatio) < 0.05
}

async function cropLatestResult(origW: number, origH: number) {
  const latestJob = jobs.value.find(j => j.status === 'completed' && j.outputs?.length)
  if (!latestJob?.outputs?.length) return
  for (const output of latestJob.outputs) {
    const url = output.localUrl?.startsWith('http') ? output.localUrl : `${API_BASE_URL}${output.localUrl}`
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = url
      })
      const canvas = document.createElement('canvas')
      const scale = Math.min(img.naturalWidth / origW, img.naturalHeight / origH)
      const cropW = origW * scale
      const cropH = origH * scale
      const sx = (img.naturalWidth - cropW) / 2
      const sy = (img.naturalHeight - cropH) / 2
      canvas.width = cropW
      canvas.height = cropH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH)
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png')
      )
      output.localUrl = URL.createObjectURL(blob)
    } catch {
      // Skip if can't load image
    }
  }
}

// ── Outpaint: two-step analysis + prompt building ──
async function buildOutpaintPrompt(image: NanoInlineAsset, userPrompt: string, targetRatio: string, direction: string = 'center', focal: string = 'none', filter: string = 'none'): Promise<string> {
  // Step 1: Analyze the image
  let analysis: Record<string, string> = {}
  try {
    const res = await fetch(`${API_BASE_URL}/api/nano/describe-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: { base64Data: image.base64Data, mimeType: image.mimeType },
        aspects: ['facial', 'expression', 'pose', 'clothing', 'background', 'lighting', 'color', 'composition', 'skintone', 'bodytype', 'hands', 'text_and_logos', 'depth_of_field', 'ground_surface', 'edge_objects'],
      }),
    })
    if (res.ok) {
      const data = await res.json()
      analysis = data.description || {}
    }
  } catch { /* proceed without analysis */ }

  // Step 2: Build dynamic prompt based on analysis
  const parts: string[] = []

  parts.push(`Outpaint this image: extend the visible scene to ${targetRatio} aspect ratio.`)

  // Direction instruction
  // Direction values represent WHERE to expand (user's perspective)
  // So 'right' = expand to the right = original stays on the left side
  const directionMap: Record<string, string> = {
    'center': 'The original image is centered — extend equally in all directions.',
    'right': 'Extend the scene primarily to the RIGHT. The original content stays on the left side of the frame.',
    'left': 'Extend the scene primarily to the LEFT. The original content stays on the right side of the frame.',
    'bottom': 'Extend the scene primarily DOWNWARD. The original content stays at the top of the frame.',
    'top': 'Extend the scene primarily UPWARD. The original content stays at the bottom of the frame.',
    'bottom-right': 'Extend the scene to the BOTTOM-RIGHT. The original content stays in the top-left area.',
    'bottom-left': 'Extend the scene to the BOTTOM-LEFT. The original content stays in the top-right area.',
    'top-right': 'Extend the scene to the TOP-RIGHT. The original content stays in the bottom-left area.',
    'top-left': 'Extend the scene to the TOP-LEFT. The original content stays in the bottom-right area.',
  }
  if (direction && directionMap[direction]) {
    parts.push(directionMap[direction])
  }

  // Focal length instruction
  if (focal && focal !== 'none') {
    const focalMap: Record<string, string> = {
      '14mm': 'Shot with a 14mm ultra-wide lens — dramatic perspective distortion, exaggerated depth, wide field of view.',
      '24mm': 'Shot with a 24mm wide-angle lens — spacious feel, moderate perspective distortion, great sense of environment.',
      '35mm': 'Shot with a 35mm lens — classic street photography perspective, natural wide view, minimal distortion.',
      '50mm': 'Shot with a 50mm standard lens — closest to human eye perspective, natural proportions, no distortion.',
      '85mm': 'Shot with an 85mm portrait lens — slight background compression, pleasing bokeh, flattering perspective for faces.',
      '135mm': 'Shot with a 135mm telephoto lens — strong background compression, creamy bokeh, intimate feel, flattened perspective.',
      'fisheye': 'Shot with a fisheye lens — extreme barrel distortion, 180-degree field of view, curved lines, creative and dramatic effect.',
    }
    if (focalMap[focal]) {
      parts.push(`LENS SIMULATION: ${focalMap[focal]}`)
    }
  }

  // Filter/style instruction
  if (filter && filter !== 'none') {
    const filterMap: Record<string, string> = {
      'vivid': 'Apply vivid/saturated color grading — boost saturation, make colors pop, enhanced contrast.',
      'dramatic': 'Apply dramatic tone — deep shadows, strong contrast, moody atmosphere, like HDR photography.',
      'mono': 'Convert to black and white monochrome — rich tonal range, no color, emphasis on light and shadow.',
      'noir': 'Apply film noir style — high contrast black and white, deep blacks, dramatic shadows, 1940s cinema feel.',
      'vintage': 'Apply vintage film look — faded colors, slight grain, warm highlights, cool shadows, retro 70s/80s feel.',
      'warm': 'Apply warm color filter — shift overall tone toward golden/amber warmth, like golden hour sunlight.',
      'cool': 'Apply cool color filter — shift overall tone toward blue/teal coolness, like overcast daylight.',
      'film': 'Apply analog film simulation — subtle grain, slightly muted colors, lifted blacks, Kodak Portra-like tones.',
      'cinematic': 'Apply cinematic color grading — teal and orange split toning, letterbox feel, shallow depth of field impression, Hollywood movie look.',
    }
    if (filterMap[filter]) {
      parts.push(`FILTER STYLE: ${filterMap[filter]}`)
    }
  }

  // Face/person instructions (if person detected)
  const hasPerson = !!(analysis.facial || analysis.expression || analysis.pose)
  if (hasPerson) {
    parts.push(
      'PERSON DETECTED — critical rules:',
      `- Face: ${analysis.facial || 'as shown'}. Expression: ${analysis.expression || 'as shown'}. Do NOT modify any facial features whatsoever — keep exact same mouth shape, eye gaze, and cheek contour.`,
      `- Skin tone: ${analysis.skintone || 'as shown'}. Match exactly — no lightening, darkening, or color shifting.`,
      `- Body type: ${analysis.bodytype || 'as shown'}. Current pose: ${analysis.pose || 'as shown'}. Continue the body naturally with correct human proportions.`,
      `- Clothing: ${analysis.clothing || 'as shown'}. Extend the same garment seamlessly. Arms should be natural length with hands visible near mid-thigh.`,
    )
  }

  // Background instructions
  if (analysis.background) {
    parts.push(`Background: ${analysis.background}. Extend this environment naturally and consistently.`)
  }

  // Lighting — single source, no invention
  if (analysis.lighting) {
    parts.push(`Lighting: ${analysis.lighting}. CRITICAL: There is only ONE light source in this image — maintain that same single light source direction and intensity. Do NOT add any new light sources, sun flares, or reflections that don't exist in the original.`)
  }

  // Color — anti red/warm shift
  if (analysis.color) {
    parts.push(`CRITICAL color grading: ${analysis.color}. Reproduce this EXACT color temperature and white balance across the entire output. Do NOT shift toward red, warm, blue, or any other tone. If the original is slightly green-tinted, the output must also be slightly green-tinted.`)
  }

  // Hands — correct finger count
  if (analysis.hands && analysis.hands !== '不可見') {
    parts.push(`Hands: ${analysis.hands}. If hands are extended into new areas, they MUST have exactly 5 fingers each — no extra or missing fingers.`)
  }

  // Text & logos — no mirroring
  if (analysis.text_and_logos && analysis.text_and_logos !== '無') {
    parts.push(`Text/Logos detected: ${analysis.text_and_logos}. Do NOT mirror, reverse, or duplicate any text or logos. Maintain correct reading direction and orientation.`)
  }

  // Depth of field — consistency
  if (analysis.depth_of_field) {
    parts.push(`Depth of field: ${analysis.depth_of_field}. Extended areas must maintain the same focus plane and blur characteristics — if the background is blurry in the original, it must stay blurry in the extension.`)
  }

  // Ground surface — continuity
  if (analysis.ground_surface && analysis.ground_surface !== '不可見') {
    parts.push(`Ground: ${analysis.ground_surface}. Extend the same material and texture seamlessly — no sudden changes in flooring or surface pattern.`)
  }

  // Edge objects — complete them
  if (analysis.edge_objects && analysis.edge_objects !== '無') {
    parts.push(`Edge objects: ${analysis.edge_objects}. These partially visible objects at the image edges must be completed naturally in the extended area — do not ignore or duplicate them.`)
  }

  // Core rules
  parts.push(
    'Keep ALL original pixels unchanged. Do NOT invent new objects or light sources. The result must look like a single photo taken with a wider lens.',
  )

  // User's custom prompt
  if (userPrompt) {
    parts.push(`Additional: ${userPrompt}`)
  }

  return parts.join(' ')
}

function switchMode(mode: NanoSourceMode) {
  form.sourceMode = mode
  errorMessage.value = ''
  if (mode !== 'outpaint' && mode !== 'edit') {
    form.image = null
  }
  if (mode === 'outpaint' || mode === 'edit') {
    form.referenceImages = []
  } else {
    form.image = null
    form.referenceImages = []
  }
}

// ── Submit ──
async function submit() {
  submitting.value = true
  errorMessage.value = ''

  try {
    const uiState: NanoUiStateSnapshot = {
      optimizerMode: optimizerRef.value?.optimizerMode || form.sourceMode,
      optimizerInput: optimizerRef.value?.optimizerInput || '',
      optimizeResult: optimizerRef.value?.optimizeResult ? { ...optimizerRef.value.optimizeResult } : null,
      refDescriptions: [...refDescriptions.value],
    }
    const maskData = maskEditorRef.value?.exportMaskAsBase64() ?? null

    // Outpaint mode: Step 1 analyze image, Step 2 targeted outpaint
    let outpaintPrompt = form.prompt
    if (form.sourceMode === 'outpaint' && form.image) {
      outpaintPrompt = await buildOutpaintPrompt(
        form.image, form.prompt.trim(), form.aspectRatio,
        outpaintDirection.value, outpaintFocal.value, outpaintFilter.value,
      )
    }

    const isOutpaint = form.sourceMode === 'outpaint'
    const payload: NanoGenerationPayload = {
      sourceMode: form.sourceMode,
      prompt: isOutpaint ? outpaintPrompt : form.prompt,
      negativePrompt: form.negativePrompt || undefined,
      aspectRatio: form.aspectRatio,
      imageSize: form.imageSize,
      numberOfImages: form.numberOfImages,
      personGeneration: form.personGeneration,
      image: isOutpaint ? form.image : (form.sourceMode === 'edit' ? form.image : undefined),
      maskImage: form.sourceMode === 'edit' && maskData ? { base64Data: maskData, mimeType: 'image/png' } : undefined,
      referenceImages: form.sourceMode === 'reference' ? form.referenceImages : undefined,
      uiState,
    }

    const placeholderId = `placeholder-${Date.now()}`
    const placeholderJob = {
      id: placeholderId,
      status: 'running' as const,
      sourceMode: form.sourceMode,
      prompt: form.prompt,
      createdAt: new Date().toISOString(),
      outputs: [],
    }
    jobs.value.unshift(placeholderJob as any)
    startPolling()

    const { job } = await createNanoJob(payload)
    const idx = jobs.value.findIndex(j => j.id === placeholderId)
    if (idx >= 0) jobs.value.splice(idx, 1, job)
    else jobs.value.unshift(job)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    submitting.value = false
  }
}

// ── Multi-angle submit ──
async function submitMultiAngle(shots: { key: string; label: string; extraPrompt: string; refImage: NanoInlineAsset | null }[]) {
  submitting.value = true
  errorMessage.value = ''
  const basePrompt = form.prompt.trim()

  try {
    const uiState: NanoUiStateSnapshot = {
      optimizerMode: optimizerRef.value?.optimizerMode || form.sourceMode,
      optimizerInput: optimizerRef.value?.optimizerInput || '',
      optimizeResult: optimizerRef.value?.optimizeResult ? { ...optimizerRef.value.optimizeResult } : null,
      refDescriptions: [...refDescriptions.value],
    }

    for (const shot of shots) {
      // Step 1: AI describe 參考圖（若有）
      let refDescription = ''
      if (shot.refImage) {
        try {
          const descRes = await fetch(`${API_BASE_URL}/api/nano/describe-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: shot.refImage.base64Data,
              mimeType: shot.refImage.mimeType,
              aspects: ['pose', 'clothing', 'expression', 'lighting', 'background'],
            }),
          })
          if (descRes.ok) {
            const descData = await descRes.json()
            // 把各 aspect 的描述串成一段文字
            const parts = Object.values(descData.description || {}).filter(Boolean)
            if (parts.length) refDescription = parts.join(', ')
          }
        } catch { /* 描述失敗就跳過，不影響生成 */ }
      }

      // Step 2: 組合 prompt
      const parts = [basePrompt, shot.extraPrompt, refDescription].filter(Boolean)
      const prompt = parts.join('. ')

      // Step 3: 生成
      const payload: NanoGenerationPayload = {
        sourceMode: shot.refImage ? 'reference' : form.sourceMode,
        prompt,
        negativePrompt: form.negativePrompt || undefined,
        aspectRatio: form.aspectRatio,
        imageSize: form.imageSize,
        numberOfImages: 1,
        personGeneration: form.personGeneration,
        image: !shot.refImage && form.sourceMode === 'edit' ? form.image : undefined,
        referenceImages: shot.refImage ? [shot.refImage] : (form.sourceMode === 'reference' ? form.referenceImages : undefined),
        uiState,
      }

      const placeholderId = `placeholder-${Date.now()}-${shot.key}`
      jobs.value.unshift({
        id: placeholderId,
        status: 'running' as const,
        sourceMode: payload.sourceMode,
        prompt,
        createdAt: new Date().toISOString(),
        outputs: [],
      } as any)
      startPolling()

      const { job } = await createNanoJob(payload)
      const idx = jobs.value.findIndex(j => j.id === placeholderId)
      if (idx >= 0) jobs.value.splice(idx, 1, job)
      else jobs.value.unshift(job)
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    submitting.value = false
  }
}

// ── Actions ──
function resolveMediaUrl(path: string) {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`
}

const lightboxUrl = ref<string | null>(null)
const lightboxRef = ref<HTMLElement | null>(null)

function openLightboxDirect(url: string) {
  lightboxUrl.value = url
  nextTick(() => lightboxRef.value?.focus())
}

function closeLightbox() {
  lightboxUrl.value = null
}

function onLightboxKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeLightbox()
}

function useAsEditSource(localUrl: string) {
  form.sourceMode = 'edit'
  form.image = {
    base64Data: '',
    mimeType: 'image/png',
    previewUrl: resolveMediaUrl(localUrl),
  }
}

function normalizeAsset(asset?: NanoInlineAsset | null): NanoInlineAsset | null {
  if (!asset?.base64Data) return null
  const previewUrl = asset.previewUrl || asset.base64Data
  return { ...asset, previewUrl }
}

async function restoreJob(job: NanoJob) {
  const snapshot = job.requestSnapshot
  if (!snapshot) return

  switchMode(snapshot.sourceMode)
  form.prompt = snapshot.prompt || ''
  form.negativePrompt = snapshot.negativePrompt || ''
  form.aspectRatio = snapshot.aspectRatio || '1:1'
  form.imageSize = snapshot.imageSize || '2K'
  form.numberOfImages = snapshot.numberOfImages || 1
  form.personGeneration = snapshot.personGeneration || 'allow_adult'
  form.image = normalizeAsset(snapshot.image)
  form.referenceImages = (snapshot.referenceImages || []).map((asset) => normalizeAsset(asset)).filter(Boolean) as NanoRefAsset[]

  const uiState = snapshot.uiState
  if (optimizerRef.value) {
    optimizerRef.value.optimizerMode = uiState?.optimizerMode || snapshot.sourceMode
    optimizerRef.value.optimizerInput = uiState?.optimizerInput || ''
    optimizerRef.value.optimizeResult = uiState?.optimizeResult ? { ...uiState.optimizeResult } as any : null
  }
  refDescriptions.value = uiState?.refDescriptions?.slice(0, 14) || Array(14).fill('')
  while (refDescriptions.value.length < 14) refDescriptions.value.push('')

  pendingRestoredMask.value = snapshot.maskImage?.base64Data || null
  if (!pendingRestoredMask.value) {
    maskEditorRef.value?.clearMask()
  }

  errorMessage.value = ''
  await nextTick()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function removeJob(jobId: string) {
  try {
    await deleteNanoJob(jobId)
    jobs.value = jobs.value.filter(j => j.id !== jobId)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

// ── Load & Polling ──
const pollHandle = ref<number | null>(null)

async function loadJobs() {
  try {
    const { jobs: data } = await fetchNanoJobs()
    jobs.value = data
    if (activeJobs.value.length > 0) {
      startPolling()
    } else {
      stopPolling()
    }
  } catch {
    // ignore
  }
}

function startPolling() {
  if (pollHandle.value !== null) return
  pollHandle.value = window.setInterval(() => {
    void loadJobs()
  }, 5000)
}

function stopPolling() {
  if (pollHandle.value === null) return
  window.clearInterval(pollHandle.value)
  pollHandle.value = null
}

defineExpose({ loadJobs })

onMounted(loadJobs)
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.nano-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
  outline: none;
}
.lightbox-img {
  max-width: 92vw;
  max-height: 92vh;
  object-fit: contain;
  border-radius: 6px;
  cursor: default;
}
.lightbox-close {
  position: absolute;
  top: 16px;
  right: 24px;
  background: none;
  border: none;
  color: #fff;
  font-size: 40px;
  cursor: pointer;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.lightbox-close:hover {
  opacity: 1;
}
</style>
