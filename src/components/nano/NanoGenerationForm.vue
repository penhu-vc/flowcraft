<template>
  <section class="card">
    <div class="card-header">
      <span class="card-title">生成設定</span>
    </div>
    <div class="card-body veo-form">
      <div class="mode-strip">
        <button
          v-for="item in sourceModes"
          :key="item.value"
          class="mode-pill"
          :class="{ active: form.sourceMode === item.value }"
          @click="$emit('switch-mode', item.value)"
        >
          <span>{{ item.icon }}</span>
          {{ item.label }}
        </button>
      </div>

      <div class="form-group">
        <label class="form-label">Prompt</label>
        <textarea
          v-model="form.prompt"
          class="form-textarea veo-textarea"
          placeholder="描述主體、場景、風格、光線、構圖。"
        />
      </div>

      <div class="nano-params-row">
        <div class="form-group">
          <label class="form-label">比例</label>
          <select v-model="form.aspectRatio" class="form-select form-select-sm">
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
            <option value="3:2">3:2</option>
            <option value="2:3">2:3</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">解析度</label>
          <select v-model="form.imageSize" class="form-select form-select-sm">
            <option value="1K">1K</option>
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">數量</label>
          <select v-model.number="form.numberOfImages" class="form-select form-select-sm">
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="3">3</option>
            <option :value="4">4</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">人物</label>
          <select v-model="form.personGeneration" class="form-select form-select-sm">
            <option value="allow_adult">允許</option>
            <option value="dont_allow">禁止</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Negative Prompt</label>
        <textarea
          v-model="form.negativePrompt"
          class="form-textarea"
          placeholder="指定不要出現的內容，例如 blur, watermark, text overlay。"
        />
      </div>

      <!-- Edit mode: upload image + mask painting -->
      <div v-if="form.sourceMode === 'edit'" class="asset-block" @dragover.prevent @drop="onEditDropAsset">
        <div class="asset-head">
          <span>編輯圖片</span>
          <label class="btn btn-secondary btn-sm">
            上傳圖片
            <input type="file" accept="image/*" hidden @change="onImageUpload" />
          </label>
        </div>
        <NanoMaskEditor
          ref="maskEditorRef"
          :image-preview="imagePreview"
          :submitting="submitting"
          :pending-restored-mask="pendingRestoredMask"
          @one-click-remove="$emit('one-click-remove')"
          @mask-has-paint-change="$emit('mask-has-paint-change', $event)"
        />
      </div>

      <!-- Outpaint mode -->
      <div v-if="form.sourceMode === 'outpaint'" class="asset-block" @dragover.prevent @drop="onEditDropAsset">
        <div class="asset-head">
          <span>擴圖來源</span>
          <label v-if="form.image" class="btn btn-secondary btn-sm">
            更換圖片
            <input type="file" accept="image/*" hidden @change="onImageUpload" />
          </label>
        </div>
        <label v-if="!form.image" class="outpaint-upload-slot" @dragover.prevent @drop="onEditDropAsset">
          <span class="outpaint-upload-plus">+</span>
          <span class="outpaint-upload-hint">上傳 / 貼上</span>
          <input type="file" accept="image/*" hidden @change="onImageUpload" />
        </label>
        <template v-if="form.image">
          <div class="outpaint-ratio-bar">
            <span class="outpaint-ratio-label">目標比例</span>
            <div class="outpaint-ratio-options">
              <button
                v-for="r in outpaintRatios"
                :key="r.value"
                class="outpaint-ratio-pill"
                :class="{ active: form.aspectRatio === r.value }"
                @click="form.aspectRatio = r.value"
              >
                <span class="outpaint-ratio-icon">{{ r.icon }}</span>
                {{ r.label }}
              </button>
            </div>
          </div>
          <NanoOutpaintPreview
            ref="outpaintPreviewRef"
            :image="form.image"
            :target-ratio="form.aspectRatio"
          />
        </template>
      </div>

      <!-- Reference mode: upload reference images -->
      <NanoReferencePanel
        v-if="form.sourceMode === 'reference'"
        :reference-images="form.referenceImages"
        :ref-descriptions="refDescriptions"
        :optimizer-disabled="optimizerDisabled"
        @update:reference-images="form.referenceImages = $event"
        @update:ref-descriptions="$emit('update:refDescriptions', $event)"
        @open-lightbox="$emit('open-lightbox', $event)"
        @run-ref-optimizer="$emit('run-ref-optimizer')"
      />

      <div class="submit-row">
        <p class="hint">
          {{ submitHint }}
        </p>
        <button class="btn btn-primary" :disabled="submitting || !canSubmit" @click="$emit('submit')">
          {{ submitting ? '生成中...' : '🎨 生成圖片' }}
        </button>
      </div>

      <!-- Generating overlay -->
      <div v-if="submitting" class="generating-overlay">
        <div class="generating-spinner" />
        <div class="generating-text">圖片生成中，請稍候...</div>
        <div class="generating-progress">
          <div class="generating-progress-bar" />
        </div>
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { NanoInlineAsset, NanoSourceMode } from '../../api/nano'
import NanoMaskEditor from './NanoMaskEditor.vue'
import NanoOutpaintPreview from './NanoOutpaintPreview.vue'
import NanoReferencePanel from './NanoReferencePanel.vue'

export interface NanoFormState {
  sourceMode: NanoSourceMode
  prompt: string
  negativePrompt: string
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'
  imageSize: '1K' | '2K' | '4K'
  numberOfImages: number
  personGeneration: 'dont_allow' | 'allow_adult'
  image: NanoInlineAsset | null
  referenceImages: NanoInlineAsset[]
}

const props = defineProps<{
  form: NanoFormState
  sourceModes: { value: NanoSourceMode; label: string; icon: string }[]
  submitting: boolean
  errorMessage: string
  configured: boolean
  canSubmit: boolean
  refDescriptions: string[]
  optimizerDisabled?: boolean
  pendingRestoredMask?: string | null
}>()

const emit = defineEmits<{
  (e: 'submit'): void
  (e: 'switch-mode', mode: NanoSourceMode): void
  (e: 'image-uploaded', asset: NanoInlineAsset, size: { width: number; height: number }, closestRatio: string): void
  (e: 'one-click-remove'): void
  (e: 'mask-has-paint-change', hasPaint: boolean): void
  (e: 'update:refDescriptions', descriptions: string[]): void
  (e: 'open-lightbox', url: string): void
  (e: 'run-ref-optimizer'): void
}>()

// ── Sub-component refs ──
const maskEditorRef = ref<InstanceType<typeof NanoMaskEditor> | null>(null)
const outpaintPreviewRef = ref<InstanceType<typeof NanoOutpaintPreview> | null>(null)

const imagePreview = computed(() => props.form.image?.previewUrl || '')

const outpaintRatios = [
  { value: '9:16' as const, label: '9:16', icon: '📱' },
  { value: '16:9' as const, label: '16:9', icon: '🖥️' },
  { value: '1:1' as const, label: '1:1', icon: '⬜' },
  { value: '4:3' as const, label: '4:3', icon: '📺' },
  { value: '3:4' as const, label: '3:4', icon: '📋' },
  { value: '3:2' as const, label: '3:2', icon: '🎞️' },
  { value: '2:3' as const, label: '2:3', icon: '🃏' },
]

const submitHint = computed(() => {
  if (!props.configured) {
    return '先到設定頁存好 Gemini API Key 或 GCP 憑證。'
  }
  if (props.form.sourceMode === 'edit') {
    return '上傳圖片後，用文字描述你要做的修改。'
  }
  if (props.form.sourceMode === 'outpaint') {
    return '上傳圖片，選擇目標比例，AI 會自動擴展畫面。可加 Prompt 描述擴展區域的場景。'
  }
  if (props.form.sourceMode === 'reference') {
    return '上傳參考圖，搭配文字描述想要的風格或內容。'
  }
  return '圖片生成是同步的，送出後等待幾秒即可看到結果。'
})

// ── Image upload ──
const SUPPORTED_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
]

function detectClosestRatio(w: number, h: number): string {
  const ratio = w / h
  let best = SUPPORTED_RATIOS[0]
  let bestDiff = Infinity
  for (const r of SUPPORTED_RATIOS) {
    const diff = Math.abs(ratio - r.value)
    if (diff < bestDiff) { bestDiff = diff; best = r }
  }
  return best.label
}

async function fileToAsset(file: File): Promise<NanoInlineAsset> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  return {
    base64Data,
    mimeType: file.type || 'image/png',
    fileName: file.name,
    previewUrl: base64Data,
  }
}

async function urlToAsset(url: string, mime: string): Promise<NanoInlineAsset> {
  const resp = await fetch(url)
  const blob = await resp.blob()
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  return {
    base64Data,
    mimeType: mime || blob.type || 'image/png',
    fileName: url.split('/').pop() || 'dropped-image',
    previewUrl: base64Data,
  }
}

async function onImageUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const asset = await fileToAsset(file)
  if (asset.previewUrl) {
    const img = new Image()
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight }
      const closest = detectClosestRatio(img.naturalWidth, img.naturalHeight)
      emit('image-uploaded', asset, size, closest)
    }
    img.src = asset.previewUrl
  }
}

function getDroppedAssetData(e: DragEvent): { url: string; mime: string; type: string } | null {
  const dt = e.dataTransfer
  if (!dt) return null
  const raw = dt.getData('application/x-flowcraft-asset')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { url?: string; mimeType?: string; type?: string }
      if (parsed.url) {
        return { url: parsed.url, mime: parsed.mimeType || 'image/jpeg', type: parsed.type || '' }
      }
    } catch {}
  }
  const url = dt.getData('application/x-asset-url') || dt.getData('text/uri-list') || dt.getData('text/plain')
  if (!url) return null
  return { url, mime: dt.getData('application/x-asset-mime') || 'image/jpeg', type: dt.getData('application/x-asset-type') || '' }
}

function emitAssetWithSize(asset: NanoInlineAsset) {
  if (!asset.previewUrl) return
  const img = new Image()
  img.onload = () => {
    const size = { width: img.naturalWidth, height: img.naturalHeight }
    const closest = detectClosestRatio(img.naturalWidth, img.naturalHeight)
    emit('image-uploaded', asset, size, closest)
  }
  img.src = asset.previewUrl
}

async function onEditDropAsset(e: DragEvent) {
  e.preventDefault()

  // Handle native file drops from OS (Finder, desktop, etc.)
  const files = e.dataTransfer?.files
  if (files?.length) {
    const file = Array.from(files).find(f => f.type.startsWith('image/'))
    if (file) {
      const asset = await fileToAsset(file)
      emitAssetWithSize(asset)
      return
    }
  }

  // Handle internal drag (from asset library)
  const dropped = getDroppedAssetData(e)
  if (!dropped?.url) return
  const { url, mime } = dropped
  const asset = await urlToAsset(url, mime)
  emitAssetWithSize(asset)
}

// ── Expose mask editor ref for parent access ──
defineExpose({
  maskEditorRef,
  outpaintPreviewRef,
})
</script>

<style scoped>
.mode-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mode-pill {
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.03);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 10px 14px;
  cursor: pointer;
  transition: var(--transition);
}

.mode-pill.active,
.mode-pill:hover {
  color: var(--text-primary);
  border-color: rgba(6, 182, 212, 0.35);
  background: rgba(6, 182, 212, 0.14);
}

.nano-params-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.nano-params-row .form-group {
  gap: 4px;
  min-width: 0;
}

.outpaint-upload-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 160px;
  height: 120px;
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  cursor: pointer;
  transition: var(--transition);
  background: transparent;
}

.outpaint-upload-slot:hover {
  border-color: rgba(6, 182, 212, 0.5);
  background: rgba(6, 182, 212, 0.06);
}

.outpaint-upload-plus {
  font-size: 28px;
  color: var(--text-secondary);
  line-height: 1;
}

.outpaint-upload-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.outpaint-ratio-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.outpaint-ratio-label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.outpaint-ratio-options {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.outpaint-ratio-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: var(--transition);
}

.outpaint-ratio-pill:hover {
  border-color: rgba(168, 85, 247, 0.4);
  color: var(--text-primary);
}

.outpaint-ratio-pill.active {
  border-color: rgba(168, 85, 247, 0.6);
  background: rgba(168, 85, 247, 0.18);
  color: var(--text-primary);
}

.outpaint-ratio-icon {
  font-size: 13px;
}

/* Generating overlay */
.generating-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 20px;
  border-radius: 12px;
  background: rgba(124, 58, 237, 0.08);
  border: 1px solid rgba(124, 58, 237, 0.2);
  animation: fadeIn 0.3s ease;
}

.generating-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(124, 58, 237, 0.2);
  border-top-color: rgba(124, 58, 237, 0.8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.generating-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.generating-progress {
  width: 100%;
  max-width: 280px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.generating-progress-bar {
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.7), transparent);
  animation: indeterminate 1.5s infinite ease-in-out;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
