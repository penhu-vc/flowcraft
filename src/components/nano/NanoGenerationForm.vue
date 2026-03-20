<template>
  <section class="card">
    <div class="card-header">
      <span class="card-title">生成設定</span>
    </div>
    <div class="card-body veo-form">
      <div v-show="!multiAngle" class="mode-strip">
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

      <div v-show="!multiAngle" class="form-group">
        <label class="form-label">Prompt</label>
        <NanoSavedPrompts @apply="onApplySavedPrompt" />
        <textarea
          v-model="form.prompt"
          class="form-textarea veo-textarea"
          placeholder="描述主體、場景、風格、光線、構圖。"
        />
      </div>

      <div v-show="!multiAngle" class="nano-params-row">
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

      <div v-show="!multiAngle" class="form-group">
        <label class="form-label">Negative Prompt</label>
        <textarea
          v-model="form.negativePrompt"
          class="form-textarea"
          placeholder="指定不要出現的內容，例如 blur, watermark, text overlay。"
        />
      </div>

      <!-- Edit mode: upload image + mask painting -->
      <div v-if="form.sourceMode === 'edit' && !multiAngle" class="asset-block" @dragover.prevent @drop="onEditDropAsset" @paste="onEditPaste">
        <div v-if="form.image" class="asset-head">
          <span>編輯圖片</span>
          <label class="btn btn-secondary btn-sm">
            更換圖片
            <input type="file" accept="image/*" hidden @change="onImageUpload" />
          </label>
        </div>
        <label v-if="!form.image" class="outpaint-upload-slot" @dragover.prevent @drop="onEditDropAsset">
          <span class="outpaint-upload-plus">+</span>
          <span class="outpaint-upload-hint">上傳 / 貼上</span>
          <input type="file" accept="image/*" hidden @change="onImageUpload" />
        </label>
        <NanoMaskEditor
          v-if="form.image"
          ref="maskEditorRef"
          :image-preview="imagePreview"
          :submitting="submitting"
          :pending-restored-mask="pendingRestoredMask"
          @one-click-remove="$emit('one-click-remove')"
          @mask-has-paint-change="$emit('mask-has-paint-change', $event)"
        />
      </div>

      <!-- Outpaint mode -->
      <div v-if="form.sourceMode === 'outpaint' && !multiAngle" class="asset-block" @dragover.prevent @drop="onEditDropAsset">
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
          <!-- Target ratio -->
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

          <!-- Expansion direction -->
          <div class="outpaint-ratio-bar">
            <span class="outpaint-ratio-label">擴張方向</span>
            <div class="outpaint-direction-grid">
              <button
                v-for="d in outpaintDirections"
                :key="d.value"
                class="outpaint-dir-cell"
                :class="{ active: outpaintDirection === d.value }"
                @click="outpaintDirection = d.value"
                :title="d.label"
              >{{ d.icon }}</button>
            </div>
          </div>

          <!-- Focal length -->
          <div class="outpaint-ratio-bar">
            <span class="outpaint-ratio-label">鏡頭焦距</span>
            <div class="outpaint-ratio-options">
              <button
                v-for="f in focalLengths"
                :key="f.value"
                class="outpaint-ratio-pill"
                :class="{ active: outpaintFocal === f.value }"
                @click="outpaintFocal = f.value"
              >
                {{ f.label }}
              </button>
            </div>
          </div>

          <!-- Filter -->
          <div class="outpaint-ratio-bar">
            <span class="outpaint-ratio-label">濾鏡風格</span>
            <div class="outpaint-ratio-options">
              <button
                v-for="f in outpaintFilters"
                :key="f.value"
                class="outpaint-ratio-pill"
                :class="{ active: outpaintFilter === f.value }"
                @click="outpaintFilter = f.value"
              >
                {{ f.label }}
              </button>
            </div>
          </div>

          <NanoOutpaintPreview
            ref="outpaintPreviewRef"
            :image="form.image"
            :target-ratio="form.aspectRatio"
            @clear-image="form.image = null"
          />
        </template>
      </div>

      <!-- Reference mode: upload reference images -->
      <NanoReferencePanel
        v-if="form.sourceMode === 'reference' && !multiAngle"
        :reference-images="form.referenceImages"
        :ref-descriptions="refDescriptions"
        :optimizer-disabled="optimizerDisabled"
        @update:reference-images="form.referenceImages = $event"
        @update:ref-descriptions="$emit('update:refDescriptions', $event)"
        @open-lightbox="$emit('open-lightbox', $event)"
        @run-ref-optimizer="$emit('run-ref-optimizer')"
      />

      <!-- ── 多角度模式（從歷史卡片觸發時才顯示，獨立於其他模式） ── -->
      <div v-if="multiAngle" class="multi-angle-section">
        <div class="multi-angle-header">
          <span class="multi-angle-title">
            📐 多角度模式
          </span>
          <button class="btn btn-secondary btn-sm" @click="multiAngle = false">✕ 關閉</button>
          <span class="ma-badge" v-if="angleShots.some(s => s.enabled)">{{ angleShots.filter(s => s.enabled).length }} 個角度 · {{ angleShots.filter(s => s.enabled && s.refImage).length }} 張參考圖</span>
        </div>

        <div class="multi-angle-body">
          <!-- 來源圖片預覽 -->
          <div v-if="multiAngleSourceUrl" class="ma-source-preview">
            <span class="ma-source-label">來源圖片</span>
            <img :src="multiAngleSourceUrl" class="ma-source-img" />
          </div>

          <div class="ma-info-bar">
            💡 選擇要生成的角度，每個角度可選填參考圖讓結果更精準。
          </div>

          <div class="ma-shot-cards">
            <div
              v-for="shot in angleShots"
              :key="shot.key"
              class="ma-shot-card"
              :class="{ active: shot.enabled }"
            >
              <label class="ma-shot-card-label">
                <input type="checkbox" v-model="shot.enabled" />
                <span class="ma-shot-icon">{{ shot.icon }}</span>
                <span>{{ shot.label }}</span>
              </label>
              <div class="ma-shot-ref">
                <div v-if="shot.refImage" class="ma-shot-ref-filled">
                  <img :src="shot.refImage.previewUrl" />
                  <button class="ma-ref-remove" @click.stop="shot.refImage = null">×</button>
                </div>
                <label v-else class="ma-shot-ref-empty" :title="shot.enabled ? '上傳此角度的參考圖（選填）' : '請先啟用此角度'">
                  <span>{{ shot.enabled ? '+' : '—' }}</span>
                  <input v-if="shot.enabled" type="file" accept="image/*" hidden @change="onAngleRefUpload($event, shot)" />
                </label>
              </div>
            </div>
          </div>

          <div class="ma-facing-row">
            <span class="ma-facing-label">未提供參考圖的角度，角色朝向：</span>
            <label class="ma-radio"><input type="radio" v-model="facingMode" value="camera" /> 面向鏡頭</label>
            <label class="ma-radio"><input type="radio" v-model="facingMode" value="free" /> 不限制</label>
          </div>

          <div v-if="!angleShots.some(s => s.enabled)" class="ma-warn">請至少啟用一個角度</div>
        </div>
      </div>

      <div class="submit-row">
        <p class="hint">{{ submitHint }}</p>
        <button
          v-if="!multiAngle"
          class="btn btn-primary"
          :disabled="submitting || !canSubmit"
          @click="$emit('submit')"
        >
          {{ submitting ? '生成中...' : '🎨 生成圖片' }}
        </button>
        <button
          v-else
          class="btn btn-primary"
          :disabled="submitting || !canSubmit || !angleShots.some(s => s.enabled)"
          @click="onMultiAngleSubmit"
        >
          {{ submitting ? '分析並生成中...' : `📐 生成 ${angleShots.filter(s => s.enabled).length} 個角度` }}
        </button>
      </div>

      <!-- Generating overlay -->
      <div v-if="submitting" class="generating-overlay">
        <div class="generating-spinner" />
        <div v-if="form.sourceMode === 'outpaint'" class="generating-steps">
          <div class="generating-text">🔍 Step 1: AI 分析原圖內容...</div>
          <div class="generating-text">🎨 Step 2: 根據分析結果擴圖中...</div>
        </div>
        <div v-else class="generating-text">圖片生成中，請稍候...</div>
        <div class="generating-progress">
          <div class="generating-progress-bar" />
        </div>
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { NanoInlineAsset, NanoSourceMode } from '../../api/nano'
import NanoMaskEditor from './NanoMaskEditor.vue'
import NanoOutpaintPreview from './NanoOutpaintPreview.vue'
import NanoReferencePanel from './NanoReferencePanel.vue'
import NanoSavedPrompts from './NanoSavedPrompts.vue'
import type { SavedPrompt } from './NanoSavedPrompts.vue'

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
  activateMultiAngle?: boolean
  multiAngleSourceUrl?: string
}>()

const emit = defineEmits<{
  (e: 'submit'): void
  (e: 'submit-multi-angle', shots: { key: string; label: string; extraPrompt: string; refImage: NanoInlineAsset | null }[]): void
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

// ── Multi-angle mode ──
const multiAngle = ref(false)
const multiAngleSourceUrl = computed(() => props.multiAngleSourceUrl || '')
watch(() => props.activateMultiAngle, (v) => { if (v) multiAngle.value = true })
const facingMode = ref<'camera' | 'free'>('camera')

interface AngleShot {
  key: string
  icon: string
  label: string
  prompt: string
  enabled: boolean
  refImage: NanoInlineAsset | null
}

const angleShots = ref<AngleShot[]>([
  { key: 'close-up',      icon: '🔍', label: '特寫',   prompt: 'extreme close-up portrait, face and shoulders only', enabled: true,  refImage: null },
  { key: 'medium',        icon: '🧍', label: '中景',   prompt: 'medium shot, waist-up portrait',                     enabled: true,  refImage: null },
  { key: 'full-body',     icon: '👤', label: '全身',   prompt: 'full body shot, head to toe, entire figure visible',  enabled: true,  refImage: null },
  { key: 'three-quarter', icon: '↗️', label: '3/4 側', prompt: 'three-quarter view, slight side angle',              enabled: false, refImage: null },
  { key: 'side',          icon: '👈', label: '側面',   prompt: 'side profile view',                                  enabled: true,  refImage: null },
  { key: 'back',          icon: '🔙', label: '背面',   prompt: 'back view, character facing away from camera',        enabled: false, refImage: null },
  { key: 'low-angle',     icon: '⬆️', label: '仰角',   prompt: 'low angle shot, camera looking up at subject',       enabled: false, refImage: null },
  { key: 'top-down',      icon: '⬇️', label: '俯角',   prompt: "top-down bird's eye view angle",                    enabled: false, refImage: null },
])

async function onAngleRefUpload(e: Event, shot: AngleShot) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  shot.refImage = await fileToAsset(file)
  ;(e.target as HTMLInputElement).value = ''
}

function onMultiAngleSubmit() {
  const facing = facingMode.value === 'camera' ? ', character looking directly at camera' : ''
  const shots = angleShots.value
    .filter(s => s.enabled)
    .map(s => ({
      key: s.key,
      label: s.label,
      extraPrompt: s.prompt + (s.refImage ? '' : facing),
      refImage: s.refImage,
    }))
  emit('submit-multi-angle', shots)
}

function onApplySavedPrompt(p: SavedPrompt) {
  props.form.prompt = p.prompt
  if (p.negativePrompt) props.form.negativePrompt = p.negativePrompt
}

const imagePreview = computed(() => props.form.image?.previewUrl || '')

// ── Outpaint: direction ──
const outpaintDirection = ref('center')
const outpaintDirections = [
  { value: 'top-left', icon: '↖', label: '向左上擴張' },
  { value: 'top', icon: '↑', label: '向上擴張' },
  { value: 'top-right', icon: '↗', label: '向右上擴張' },
  { value: 'left', icon: '←', label: '向左擴張' },
  { value: 'center', icon: '◉', label: '四周擴張' },
  { value: 'right', icon: '→', label: '向右擴張' },
  { value: 'bottom-left', icon: '↙', label: '向左下擴張' },
  { value: 'bottom', icon: '↓', label: '向下擴張' },
  { value: 'bottom-right', icon: '↘', label: '向右下擴張' },
]

// ── Outpaint: focal length ──
const outpaintFocal = ref('none')
const focalLengths = [
  { value: 'none', label: '原始' },
  { value: '14mm', label: '14mm 超廣角' },
  { value: '24mm', label: '24mm 廣角' },
  { value: '35mm', label: '35mm 街拍' },
  { value: '50mm', label: '50mm 人眼' },
  { value: '85mm', label: '85mm 人像' },
  { value: '135mm', label: '135mm 長焦' },
  { value: 'fisheye', label: '🐟 魚眼' },
]

// ── Outpaint: filter ──
const outpaintFilter = ref('none')
const outpaintFilters = [
  { value: 'none', label: '原始' },
  { value: 'vivid', label: '🌈 鮮豔' },
  { value: 'dramatic', label: '🎭 戲劇' },
  { value: 'mono', label: '⬛ 黑白' },
  { value: 'noir', label: '🎬 黑色電影' },
  { value: 'vintage', label: '📷 復古底片' },
  { value: 'warm', label: '🔥 暖色調' },
  { value: 'cool', label: '❄️ 冷色調' },
  { value: 'film', label: '🎞️ 膠片感' },
  { value: 'cinematic', label: '🎥 電影感' },
]

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

async function onEditPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const asset = await fileToAsset(file)
      emitAssetWithSize(asset)
      return
    }
  }
}

// ── Expose mask editor ref for parent access ──
defineExpose({
  maskEditorRef,
  outpaintPreviewRef,
  outpaintDirection,
  outpaintFocal,
  outpaintFilter,
})
</script>

<style scoped>
/* ── Consistent form layout ── */
.veo-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px !important;
}
.veo-form > .form-group,
.veo-form > .nano-params-row,
.veo-form > .asset-block,
.veo-form > .mode-strip {
  margin: 0; /* reset any inherited margins, gap handles spacing */
}

.asset-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.asset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

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
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
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

.outpaint-direction-grid {
  display: grid;
  grid-template-columns: repeat(3, 32px);
  gap: 4px;
}

.outpaint-dir-cell {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: var(--transition);
  padding: 0;
}

.outpaint-dir-cell:hover {
  border-color: rgba(168, 85, 247, 0.4);
  color: var(--text-primary);
}

.outpaint-dir-cell.active {
  border-color: rgba(168, 85, 247, 0.6);
  background: rgba(168, 85, 247, 0.18);
  color: var(--text-primary);
}

/* Generating overlay */
.generating-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px;
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

/* ── Multi-angle ── */
.ma-source-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.ma-source-label {
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.ma-source-img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  border: 2px solid var(--border);
}
.multi-angle-section {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  margin-top: 4px;
}
.multi-angle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  background: var(--bg-card);
  transition: background 0.15s;
}
.multi-angle-header:hover { background: var(--bg-hover); }
.multi-angle-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.ma-toggle-icon { font-size: 11px; color: var(--text-muted); }
.ma-badge { font-size: 11px; color: var(--accent); background: rgba(139,92,246,0.15); padding: 2px 8px; border-radius: 20px; }
.multi-angle-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); }
.ma-ref-hint {
  display: flex; gap: 10px; align-items: flex-start;
  background: rgba(99,179,237,0.08); border: 1px solid rgba(99,179,237,0.2);
  border-radius: 8px; padding: 10px 12px; font-size: 12px; line-height: 1.5;
}
.ma-ref-hint-icon { font-size: 16px; flex-shrink: 0; }
.ma-ref-hint-sub { color: var(--text-muted); }
.ma-info-bar {
  font-size: 12px; color: var(--text-muted); background: rgba(99,179,237,0.07);
  border: 1px solid rgba(99,179,237,0.18); border-radius: 8px; padding: 8px 12px; line-height: 1.5;
}
.ma-shot-cards { display: flex; flex-wrap: wrap; gap: 6px; }
.ma-shot-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg-card); opacity: 0.5; transition: all 0.15s;
  flex: 1 1 calc(50% - 3px); min-width: 140px;
}
.ma-shot-card.active { opacity: 1; border-color: var(--accent); background: rgba(139,92,246,0.07); }
.ma-shot-card-label {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; cursor: pointer; user-select: none;
}
.ma-shot-icon { font-size: 16px; }
.ma-shot-ref { display: flex; align-items: center; }
.ma-shot-ref-filled {
  width: 48px; height: 48px; border-radius: 6px; overflow: hidden;
  border: 1px solid var(--border); position: relative; flex-shrink: 0;
}
.ma-shot-ref-filled img { width: 100%; height: 100%; object-fit: cover; }
.ma-ref-remove {
  position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6);
  color: #fff; border: none; border-radius: 50%; width: 16px; height: 16px;
  font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
}
.ma-shot-ref-empty {
  width: 48px; height: 48px; border-radius: 6px; border: 1px dashed var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; color: var(--text-muted); cursor: pointer; transition: border-color 0.15s;
}
.ma-shot-card.active .ma-shot-ref-empty:hover { border-color: var(--accent); color: var(--accent); }
.ma-facing-row { display: flex; align-items: center; gap: 16px; font-size: 13px; }
.ma-facing-label { color: var(--text-muted); font-size: 12px; white-space: nowrap; }
.ma-radio { display: flex; align-items: center; gap: 5px; cursor: pointer; }
.ma-shots-label { font-size: 12px; color: var(--text-muted); }
.ma-shots-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.ma-shot-pill {
  padding: 5px 12px; border-radius: 20px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border); background: var(--bg-card); transition: all 0.15s;
}
.ma-shot-pill.active { border-color: var(--accent); background: rgba(139,92,246,0.15); color: var(--accent); }
.ma-warn { font-size: 12px; color: #f59e0b; }

/* ── Submit row ── */
.submit-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.submit-row .hint {
  font-size: 12px;
  color: var(--text-muted, #888);
  margin: 0;
}
</style>
