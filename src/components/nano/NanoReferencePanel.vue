<template>
  <div class="asset-block">
    <div class="asset-head">
      <span>參考圖片</span>
      <span class="ref-rule-hint ref-tooltip-wrap">
        最多 14 張 · 3 種參考類型
        <span class="hint-icon">?</span>
        <span class="ref-tooltip">
          <strong>🎯 Subject（主體）</strong><br/>
          告訴模型「這個東西長什麼樣子」<br/>
          · Person — 人物臉/身體<br/>
          · Animal — 動物<br/>
          · Product — 產品照<br/>
          · Default — Logo、建築等<br/><br/>
          <strong>🎨 Style（風格）</strong><br/>
          告訴模型「要這種視覺感覺」<br/>
          例：水彩風、賽博龐克、油畫風格<br/><br/>
          <strong>🕹️ Control（進階控制）</strong><br/>
          用結構圖控制構圖和姿勢<br/>
          · Canny Edge — 邊緣線稿<br/>
          · Scribble — 手繪草圖<br/>
          · Face Mesh — 臉部網格
        </span>
      </span>
    </div>
    <div class="ref-slots-grid">
      <div
        v-for="slot in 14"
        :key="slot"
        class="ref-slot-wrapper"
      >
        <div
          class="ref-slot media-card-wrap"
          :class="{ filled: !!refSlots[slot - 1], disabled: !refSlots[slot - 1] && referenceImages.length >= 14 }"
        >
          <template v-if="refSlots[slot - 1]">
            <img :src="refSlots[slot - 1]!.previewUrl" alt="Reference" @click="$emit('open-lightbox', refSlots[slot - 1]!.previewUrl)" style="cursor: zoom-in;" />
            <button
              v-if="!hasAsset(refSlots[slot - 1]!.previewUrl)"
              class="collect-btn"
              @click.stop="collectAssetDirect(refSlots[slot - 1]!.previewUrl)"
              title="收入囊中"
            >🎒 收入囊中</button>
            <span v-else class="collect-done">✅ 已收</span>
            <div class="ref-slot-controls">
              <select
                :value="refSlots[slot - 1]!.referenceType"
                class="form-select form-select-sm ref-type-select"
                @change="onRefTypeChange(slot - 1, ($event.target as HTMLSelectElement).value as NanoRefType)"
              >
                <optgroup label="主體 Subject">
                  <option value="subject_person">👤 人物</option>
                  <option value="subject_animal">🐾 動物</option>
                  <option value="subject_product">📦 產品</option>
                  <option value="subject_default">🎯 其他物品</option>
                </optgroup>
                <optgroup label="風格 Style">
                  <option value="style">🎨 風格參考</option>
                </optgroup>
                <optgroup label="控制 Control">
                  <option value="control_canny">✏️ 邊緣線稿</option>
                  <option value="control_scribble">🖊️ 手繪草圖</option>
                  <option value="control_face_mesh">🧑 臉部網格</option>
                </optgroup>
              </select>
              <button class="ref-remove-btn" @click="removeReference(slot - 1)" title="移除">✕</button>
            </div>
          </template>
          <template v-else>
            <label v-if="referenceImages.length < 14" class="ref-slot-empty" tabindex="0" @dragover.prevent @drop.prevent="onRefDropAsset($event, slot - 1)" @paste.prevent="onRefPaste($event, slot - 1)" @mouseenter="($event.target as HTMLElement).focus()" @mouseleave="($event.target as HTMLElement).blur()">
              <span class="ref-slot-plus">+</span>
              <span class="ref-slot-label">上傳 / 貼上</span>
              <input type="file" accept="image/*" hidden @change="onRefSlotUpload($event, slot - 1)" />
            </label>
            <div v-else class="ref-slot-empty ref-slot-locked">
              <span class="ref-slot-label">已滿</span>
            </div>
          </template>
        </div>
        <input
          v-model="localDescriptions[slot - 1]"
          type="text"
          class="form-input form-input-sm ref-desc-input"
          :placeholder="refSlots[slot - 1] ? '描述這張圖的用途...' : '上傳後輸入描述'"
          :disabled="!refSlots[slot - 1]"
          @input="$emit('update:refDescriptions', [...localDescriptions])"
        />
      </div>
    </div>
    <div class="ref-action-row">
      <button class="btn btn-secondary btn-sm" @click="showVideoCapture = true">
        🎬 從影片擷取
      </button>
      <button
        v-if="hasAnyRefDescription"
        class="btn btn-primary btn-sm ref-optimize-btn"
        :disabled="optimizerDisabled"
        @click="$emit('run-ref-optimizer')"
      >
        ✨ 一鍵優化指令
      </button>
    </div>

    <VideoFrameCapture
      :visible="showVideoCapture"
      @capture="onVideoCapture"
      @capture-portrait="onPortraitCapture"
      @close="showVideoCapture = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAssetLibrary } from '../../composables/useAssetLibrary'
import type { NanoInlineAsset } from '../../api/nano'
import VideoFrameCapture from './VideoFrameCapture.vue'

export type NanoRefType =
  | 'subject_person' | 'subject_animal' | 'subject_product' | 'subject_default'
  | 'style'
  | 'control_canny' | 'control_scribble' | 'control_face_mesh'

export type NanoRefAsset = NanoInlineAsset & { referenceType: NanoRefType }

const props = defineProps<{
  referenceImages: NanoInlineAsset[]
  refDescriptions: string[]
  optimizerDisabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:referenceImages', images: NanoInlineAsset[]): void
  (e: 'update:refDescriptions', descriptions: string[]): void
  (e: 'open-lightbox', url: string): void
  (e: 'run-ref-optimizer'): void
}>()

const { addAsset, hasAsset } = useAssetLibrary()

const showVideoCapture = ref(false)

function onVideoCapture(payload: { base64: string; mimeType: string }) {
  if (props.referenceImages.length >= 14) return
  const images = [...props.referenceImages] as NanoRefAsset[]
  images.push({
    base64Data: payload.base64,
    mimeType: payload.mimeType,
    previewUrl: payload.base64,
    referenceType: 'subject_default',
  })
  emit('update:referenceImages', images)
}

function onPortraitCapture(payload: { base64: string; mimeType: string }) {
  const remaining = 14 - props.referenceImages.length
  if (remaining <= 0) return
  const types: NanoRefType[] = ['subject_person', 'style', 'control_face_mesh']
  const images = [...props.referenceImages] as NanoRefAsset[]
  for (const refType of types.slice(0, remaining)) {
    images.push({
      base64Data: payload.base64,
      mimeType: payload.mimeType,
      previewUrl: payload.base64,
      referenceType: refType,
    })
  }
  emit('update:referenceImages', images)
}

function collectAssetDirect(url: string) {
  addAsset({ type: 'image', url, mimeType: 'image/jpeg', label: 'AI Studio' })
}

// Local copy of descriptions to enable v-model on inputs
const localDescriptions = ref<string[]>([...props.refDescriptions])

watch(() => props.refDescriptions, (val) => {
  localDescriptions.value = [...val]
}, { deep: true })

const refSlots = computed(() => {
  const slots: (NanoRefAsset | null)[] = Array(14).fill(null)
  ;(props.referenceImages as NanoRefAsset[]).forEach((item, i) => {
    if (i < 14) slots[i] = item
  })
  return slots
})

const hasAnyRefDescription = computed(() =>
  localDescriptions.value.some((d, i) => d.trim() && refSlots.value[i])
)

function removeReference(index: number) {
  const images = [...props.referenceImages]
  images.splice(index, 1)
  emit('update:referenceImages', images)

  const descs = [...localDescriptions.value]
  descs.splice(index, 1)
  descs.push('')
  localDescriptions.value = descs
  emit('update:refDescriptions', descs)
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

async function onRefSlotUpload(event: Event, _slotIndex: number) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const asset = await fileToAsset(file)
  const images = [...props.referenceImages] as NanoRefAsset[]
  images.push({ ...asset, referenceType: 'subject_default' })
  emit('update:referenceImages', images)
  ;(event.target as HTMLInputElement).value = ''
}

function onRefTypeChange(index: number, newType: NanoRefType) {
  const images = [...props.referenceImages] as NanoRefAsset[]
  images[index] = { ...images[index], referenceType: newType }
  emit('update:referenceImages', images)
}

async function handlePasteData(e: ClipboardEvent): Promise<{ dataUrl: string; mime: string } | null> {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (!file) continue
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      return { dataUrl, mime: file.type }
    }
  }
  const text = e.clipboardData?.getData('text/plain')?.trim()
  if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image/'))) {
    try {
      if (text.startsWith('data:image/')) {
        const mime = text.match(/^data:([^;]+);/)?.[1] || 'image/png'
        return { dataUrl: text, mime }
      }
      const resp = await fetch(text)
      const blob = await resp.blob()
      if (!blob.type.startsWith('image/')) return null
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      return { dataUrl, mime: blob.type }
    } catch {
      return null
    }
  }
  return null
}

async function onRefPaste(e: ClipboardEvent, _slotIndex: number) {
  const result = await handlePasteData(e)
  if (!result || props.referenceImages.length >= 14) return
  const images = [...props.referenceImages] as NanoRefAsset[]
  images.push({
    base64Data: result.dataUrl,
    mimeType: result.mime,
    previewUrl: result.dataUrl,
    referenceType: 'subject_default',
  })
  emit('update:referenceImages', images)
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

async function onRefDropAsset(e: DragEvent, _slotIndex: number) {
  e.preventDefault()
  if (props.referenceImages.length >= 14) return

  // Handle native file drops from OS (Finder, desktop, etc.)
  const files = e.dataTransfer?.files
  if (files?.length) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') || props.referenceImages.length >= 14) continue
      const asset = await fileToAsset(file)
      const images = [...props.referenceImages] as NanoRefAsset[]
      images.push({ ...asset, referenceType: 'subject_default' })
      emit('update:referenceImages', images)
    }
    return
  }

  // Handle internal drag (from asset library)
  const dropped = getDroppedAssetData(e)
  if (!dropped?.url) return
  const { url, mime } = dropped
  const asset = await urlToAsset(url, mime)
  const images = [...props.referenceImages] as NanoRefAsset[]
  images.push({ ...asset, referenceType: 'subject_default' })
  emit('update:referenceImages', images)
}
</script>

<style scoped>
/* Reference image tooltip */
.ref-tooltip-wrap {
  position: relative;
  cursor: help;
}
.hint-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1px solid var(--text-muted, #888);
  font-size: 10px;
  vertical-align: middle;
  margin-left: 2px;
}
.ref-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 300px;
  padding: 12px 14px;
  background: var(--bg-surface, var(--c-surface));
  border: 1px solid var(--border, var(--c-border));
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary, var(--c-text));
  z-index: 100;
  pointer-events: none;
}
.ref-tooltip-wrap:hover .ref-tooltip {
  display: block;
}

/* Reference slots grid (generation form, 14 slots) */
.asset-block .ref-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  margin-top: 8px;
}
.ref-slot-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.asset-block .ref-slot {
  border: 2px dashed var(--c-border);
  border-radius: 8px;
  aspect-ratio: 1;
  overflow: hidden;
  position: relative;
  transition: border-color 0.2s;
  width: auto;
  height: auto;
}
.ref-slot.filled {
  border-style: solid;
  border-color: var(--c-accent, #a855f7);
}
.ref-slot.disabled {
  opacity: 0.35;
}
.ref-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ref-slot-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 4px;
  padding: 6px;
  background: linear-gradient(transparent, rgba(0,0,0,0.8));
}
.ref-type-select {
  flex: 1;
  font-size: 10px !important;
  padding: 2px 3px !important;
  background: rgba(0,0,0,0.5) !important;
  border-color: rgba(255,255,255,0.2) !important;
  color: var(--text-primary, #fff) !important;
}
.ref-type-select optgroup {
  font-weight: 600;
  font-size: 11px;
  color: #aaa;
}
.ref-type-select option {
  font-weight: 400;
  font-size: 11px;
  padding: 2px 4px;
}
.ref-remove-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(220,38,38,0.6);
  cursor: pointer;
  color: white;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.ref-remove-btn:hover {
  background: rgba(220,38,38,0.9);
}
.ref-slot-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: background 0.2s;
  color: var(--text-muted, #888);
}
.ref-slot-empty:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary, #fff);
}
.ref-slot-locked {
  cursor: default;
}
.ref-slot-locked:hover {
  background: transparent;
  color: var(--text-muted, #888);
}
.ref-slot-plus {
  font-size: 28px;
  line-height: 1;
  font-weight: 300;
}
.ref-slot-label {
  font-size: 11px;
}
.ref-desc-input {
  font-size: 11px !important;
  padding: 5px 8px !important;
}
.ref-desc-input:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.ref-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.ref-optimize-btn {
  align-self: flex-start;
}

/* Collect Button */
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
