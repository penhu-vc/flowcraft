<template>
  <section class="card optimizer-card">
    <div class="card-header">
      <span class="card-title">✨ 圖片 Prompt 優化器</span>
      <span class="badge badge-ai">RAG · 2-Step</span>
    </div>
    <div class="card-body">
      <div class="optimizer-mode-strip">
        <button
          v-for="item in sourceModes"
          :key="item.value"
          class="opt-mode-pill"
          :class="{ active: optimizerMode === item.value }"
          @click="optimizerMode = item.value"
        >
          <span>{{ item.icon }}</span>
          {{ item.label }}
        </button>
      </div>

      <!-- 匯入上次資料提示 -->
      <div v-if="matchedHistory && optimizerMode === 'reference'" class="history-import-bar">
        <span class="history-import-info">📋 偵測到此圖片有上次的生成紀錄</span>
        <button class="btn btn-primary btn-sm" @click="importHistory">
          直接匯入上次資料
        </button>
        <button class="btn btn-secondary btn-sm" @click="matchedHistory = null">
          略過
        </button>
      </div>

      <!-- 參考圖模式：最多 5 張圖片，各自設定描述面向 -->
      <div v-if="optimizerMode === 'reference'" class="ref-describe-block">
        <div class="ref-slots-grid">
          <div v-for="(slot, idx) in describeSlots" :key="idx" class="ref-slot media-card-wrap" :class="{ active: activeSlotIdx === idx }" @click="activeSlotIdx = idx">
            <div v-if="!slot.preview" class="ref-slot-empty" tabindex="0" @click.stop="triggerSlotUpload(idx)" @dragover.prevent @drop.stop="onSlotDropAsset($event, idx)" @paste.stop="onSlotPaste($event, idx)" @mouseenter="($event.target as HTMLElement).focus()"  @mouseleave="($event.target as HTMLElement).blur()">
              <span class="ref-slot-plus">+</span>
              <span class="ref-slot-paste-hint">上傳 / 貼上</span>
              <input :ref="el => setSlotInputRef(el, idx)" type="file" accept="image/*" hidden @change="onSlotUpload($event, idx)" />
            </div>
            <div v-else class="ref-slot-filled">
              <img :src="slot.preview" :alt="'參考圖 ' + (idx + 1)" class="ref-slot-img" style="cursor: pointer;" />
              <button class="zoom-btn" @click.stop="openLightboxDirect(slot.preview)" title="放大">🔍</button>
              <button
                v-if="!hasAsset(slot.preview)"
                class="collect-btn"
                @click.stop="collectAssetDirect(slot.preview)"
                title="收入囊中"
              >🎒 收入囊中</button>
              <span v-else class="collect-done">✅ 已收</span>
              <button class="ref-slot-clear" @click.stop="clearSlot(idx)">×</button>
              <span v-if="slot.result" class="ref-slot-done">✓</span>
            </div>
          </div>
        </div>

        <!-- 選中圖片的控制面板 -->
        <div v-if="describeSlots[activeSlotIdx]?.preview" class="ref-slot-panel">
          <div class="ref-slot-panel-header">
            <span class="ref-slot-label">圖 {{ activeSlotIdx + 1 }} 描述面向</span>
            <button
              class="btn btn-secondary btn-sm"
              :disabled="describing"
              @click="describeAllSlots()"
            >
              {{ describing ? '描述中...' : '🔍 AI 描述全部' }}
            </button>
          </div>
          <div class="ref-aspect-checks">
            <label
              v-for="asp in describeSlots[activeSlotIdx].aspects"
              :key="asp.key"
              class="ref-aspect-label"
              :class="{ occupied: getAspectOwner(asp.key) >= 0 }"
              :title="getAspectOwner(asp.key) >= 0 ? `已被圖 ${getAspectOwner(asp.key) + 1} 使用` : ''"
            >
              <input
                type="checkbox"
                v-model="asp.checked"
                :disabled="getAspectOwner(asp.key) >= 0"
                @change="rebuildRefDescription"
              />
              {{ asp.label }}
              <span v-if="getAspectOwner(asp.key) >= 0" class="occupied-badge">圖{{ getAspectOwner(asp.key) + 1 }}</span>
            </label>
          </div>

          <div v-if="describeSlots[activeSlotIdx].result" class="ref-describe-result">
            <div v-for="asp in describeSlots[activeSlotIdx].aspects" :key="asp.key" class="ref-describe-item" :class="{ dimmed: !asp.checked }">
              <span class="ref-describe-tag">{{ asp.label }}</span>
              <span class="ref-describe-text">{{ describeSlots[activeSlotIdx].result?.[asp.key] || '—' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="optimizer-input-row">
        <textarea
          v-model="optimizerInput"
          class="form-textarea optimizer-textarea"
          :placeholder="optimizerMode === 'reference'
            ? '上傳參考照片後點「AI 描述」，會自動填入描述；你也可以手動補充或修改'
            : '用中文或英文描述你想生成的圖片，例如：一隻橘貓坐在窗台上，窗外是雨天的東京街景，暖色調'"
        />
        <div class="optimizer-btn-group">
          <button
            class="btn btn-primary optimizer-btn"
            :disabled="optimizing || !optimizerInput.trim()"
            @click="runOptimizer"
          >
            {{ optimizing ? '分析中...' : '優化' }}
          </button>
        </div>
      </div>

      <div v-if="optimizing" class="optimizer-status">
        <div class="optimizer-step" :class="{ active: optimizeStep === 1 }">
          <span class="step-dot" />
          Step 1: 分析內容，決定參考哪些優化分類...
        </div>
        <div class="optimizer-step" :class="{ active: optimizeStep === 2 }">
          <span class="step-dot" />
          Step 2: 載入對應知識，Gemini 優化 Prompt...
        </div>
      </div>

      <div v-if="optimizeResult" class="optimizer-result">
        <div class="optimizer-sections">
          <span class="optimizer-sections-label">參考分類：</span>
          <span v-for="label in optimizeResult.sectionLabels" :key="label" class="section-tag">{{ label }}</span>
        </div>

        <table class="optimizer-table">
          <thead>
            <tr>
              <th>組件</th>
              <th>內容</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="comp in componentRows" :key="comp.key">
              <td class="comp-label">{{ comp.icon }} {{ comp.label }}</td>
              <td class="comp-value">{{ comp.value || '—' }}</td>
            </tr>
            <tr class="neg-row">
              <td class="comp-label">🚫 Negative</td>
              <td class="comp-value">{{ optimizeResult.negativeHints || '—' }}</td>
            </tr>
          </tbody>
        </table>

        <div class="optimizer-full-prompt">
          <div class="full-prompt-header">
            <span class="form-label">完整 Prompt</span>
            <div class="full-prompt-actions">
              <button class="btn btn-secondary btn-sm" @click="copyFullPrompt">
                {{ copied ? '已複製' : '複製' }}
              </button>
              <button class="btn btn-primary btn-sm" @click="useOptimizedPrompt">
                套用到生成
              </button>
            </div>
          </div>
          <div class="full-prompt-text">{{ optimizeResult.fullPrompt }}</div>
        </div>
      </div>

      <p v-if="optimizeError" class="error-text">{{ optimizeError }}</p>
    </div>
  </section>

  <!-- Lightbox -->
  <Teleport to="body">
    <div v-if="lightboxUrl" class="lightbox-overlay" @click="lightboxUrl = null">
      <img :src="lightboxUrl" class="lightbox-img" @click.stop />
      <button class="lightbox-close" @click="lightboxUrl = null">×</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, type Ref } from 'vue'
import { useAssetLibrary } from '../../composables/useAssetLibrary'
import { API_BASE_URL } from '../../api/config'
import { optimizeNanoPrompt, type NanoSourceMode } from '../../api/nano'

const props = defineProps<{
  sourceModes: { value: NanoSourceMode; label: string; icon: string }[]
}>()

const emit = defineEmits<{
  (e: 'use-prompt', prompt: string, negativePrompt: string, mode: NanoSourceMode): void
}>()

const { addAsset, hasAsset } = useAssetLibrary()

function collectAssetDirect(url: string) {
  addAsset({ type: 'image', url, mimeType: 'image/jpeg', label: 'AI Studio' })
}

// ── Optimizer State ──
const optimizerInput = ref('')
const optimizerMode = ref<NanoSourceMode>('text')
const optimizing = ref(false)
const optimizeStep = ref(0)
const optimizeResult = ref<{
  components: Record<string, string>
  fullPrompt: string
  negativeHints: string
  sections: string[]
  sectionLabels: string[]
} | null>(null)
const optimizeError = ref('')
const copied = ref(false)

const componentRows = computed(() => {
  if (!optimizeResult.value) return []
  const c = optimizeResult.value.components
  return [
    { key: 'subject', icon: '👤', label: 'Subject', value: c.subject },
    { key: 'context', icon: '🌍', label: 'Context', value: c.context },
    { key: 'style', icon: '🎨', label: 'Style', value: c.style },
    { key: 'composition', icon: '🖼️', label: 'Composition', value: c.composition },
    { key: 'lighting', icon: '💡', label: 'Lighting', value: c.lighting },
    { key: 'color', icon: '🎨', label: 'Color', value: c.color },
    { key: 'details', icon: '🔍', label: 'Details', value: c.details },
    { key: 'mood', icon: '✨', label: 'Mood', value: c.mood },
  ]
})

// ── Reference Image Describe (multi-slot, max 5) ──
const describing = ref(false)
const activeSlotIdx = ref(0)

interface DescribeAspect {
  key: string
  label: string
  checked: boolean
}

interface RefSlot {
  preview: string
  base64: string
  mime: string
  aspects: DescribeAspect[]
  result: Record<string, string> | null
}

const ASPECT_DEFAULTS: { key: string; label: string }[] = [
  { key: 'facial', label: '五官' },
  { key: 'hairstyle', label: '髮型' },
  { key: 'skintone', label: '膚色' },
  { key: 'bodytype', label: '體型' },
  { key: 'expression', label: '表情' },
  { key: 'pose', label: '動作/姿勢' },
  { key: 'clothing', label: '服裝' },
  { key: 'background', label: '背景/場景' },
  { key: 'lighting', label: '光線' },
  { key: 'composition', label: '構圖' },
  { key: 'color', label: '色調' },
]

function createEmptySlot(): RefSlot {
  return {
    preview: '',
    base64: '',
    mime: '',
    aspects: ASPECT_DEFAULTS.map(a => ({ ...a, checked: true })),
    result: null,
  }
}

// ── Image History (localStorage persistence) ──
const HISTORY_STORAGE_KEY = 'nano-image-history'
const MAX_HISTORY = 50

interface ImageHistorySlot {
  fingerprint: string
  aspects: { key: string; checked: boolean }[]
  result: Record<string, string> | null
}

interface ImageHistory {
  fingerprint: string
  slots: ImageHistorySlot[]
  optimizerInput: string
  optimizeResult: {
    components: Record<string, string>
    fullPrompt: string
    negativeHints: string
    sections: string[]
    sectionLabels: string[]
  } | null
  timestamp: number
}

function getFingerprint(base64: string): string {
  return base64.slice(0, 64)
}

function loadHistory(): ImageHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveHistory(histories: ImageHistory[]) {
  const trimmed = histories.slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed))
}

function findHistoryBySlots(slots: RefSlot[]): ImageHistory | null {
  const histories = loadHistory()
  const fingerprints = slots.filter(s => s.base64).map(s => getFingerprint(s.base64))
  if (fingerprints.length === 0) return null
  for (const h of histories) {
    for (const fp of fingerprints) {
      if (h.slots.some(s => s.fingerprint === fp)) return h
    }
  }
  return null
}

function saveCurrentToHistory() {
  const filledSlots = describeSlots.filter(s => s.base64)
  if (filledSlots.length === 0) return
  const entry: ImageHistory = {
    fingerprint: getFingerprint(filledSlots[0].base64),
    slots: describeSlots.map(s => ({
      fingerprint: s.base64 ? getFingerprint(s.base64) : '',
      aspects: s.aspects.map(a => ({ key: a.key, checked: a.checked })),
      result: s.result,
    })),
    optimizerInput: optimizerInput.value,
    optimizeResult: optimizeResult.value,
    timestamp: Date.now(),
  }
  const histories = loadHistory()
  const filtered = histories.filter(h => h.fingerprint !== entry.fingerprint)
  filtered.unshift(entry)
  saveHistory(filtered)
}

const matchedHistory: Ref<ImageHistory | null> = ref(null)

function checkForHistory() {
  matchedHistory.value = findHistoryBySlots(describeSlots)
}

function importHistory() {
  const h = matchedHistory.value
  if (!h) return
  for (let idx = 0; idx < describeSlots.length; idx++) {
    const current = describeSlots[idx]
    if (!current.base64) continue
    const currentFp = getFingerprint(current.base64)
    const savedSlot = h.slots.find(s => s.fingerprint === currentFp)
    if (savedSlot) {
      current.result = savedSlot.result
      for (const asp of current.aspects) {
        const savedAsp = savedSlot.aspects.find(a => a.key === asp.key)
        if (savedAsp) asp.checked = savedAsp.checked
      }
    }
  }
  optimizerInput.value = h.optimizerInput || ''
  if (h.optimizeResult) {
    optimizeResult.value = h.optimizeResult
  }
  matchedHistory.value = null
}

const describeSlots = reactive<RefSlot[]>([
  createEmptySlot(),
  createEmptySlot(),
  createEmptySlot(),
  createEmptySlot(),
  createEmptySlot(),
])

function getAspectOwner(aspectKey: string): number {
  for (let i = 0; i < describeSlots.length; i++) {
    if (i === activeSlotIdx.value) continue
    if (!describeSlots[i].preview) continue
    const asp = describeSlots[i].aspects.find(a => a.key === aspectKey)
    if (asp?.checked) return i
  }
  return -1
}

function autoUncheckOccupied(idx: number) {
  const prev = activeSlotIdx.value
  activeSlotIdx.value = idx
  for (const asp of describeSlots[idx].aspects) {
    if (getAspectOwner(asp.key) >= 0) {
      asp.checked = false
    }
  }
  activeSlotIdx.value = prev
}

const slotInputRefs: (HTMLInputElement | null)[] = []
function setSlotInputRef(el: unknown, idx: number) {
  slotInputRefs[idx] = el as HTMLInputElement | null
}
function triggerSlotUpload(idx: number) {
  activeSlotIdx.value = idx
  slotInputRefs[idx]?.click()
}

function onSlotUpload(event: Event, idx: number) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    describeSlots[idx].preview = dataUrl
    describeSlots[idx].base64 = dataUrl.split(',')[1]
    describeSlots[idx].mime = file.type
    describeSlots[idx].result = null
    activeSlotIdx.value = idx
    autoUncheckOccupied(idx)
    checkForHistory()
  }
  reader.readAsDataURL(file)
  ;(event.target as HTMLInputElement).value = ''
}

function clearSlot(idx: number) {
  Object.assign(describeSlots[idx], createEmptySlot())
  rebuildRefDescription()
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

async function onSlotPaste(e: ClipboardEvent, idx: number) {
  const result = await handlePasteData(e)
  if (!result) return
  describeSlots[idx].preview = result.dataUrl
  describeSlots[idx].base64 = result.dataUrl.split(',')[1]
  describeSlots[idx].mime = result.mime
  describeSlots[idx].result = null
  activeSlotIdx.value = idx
  autoUncheckOccupied(idx)
  checkForHistory()
}

async function onSlotDropAsset(e: DragEvent, idx: number) {
  e.preventDefault()
  const dt = e.dataTransfer
  if (!dt) return
  let url = ''
  let mime = 'image/jpeg'
  const raw = dt.getData('application/x-flowcraft-asset')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { url?: string; mimeType?: string }
      if (parsed.url) { url = parsed.url; mime = parsed.mimeType || 'image/jpeg' }
    } catch {}
  }
  if (!url) {
    url = dt.getData('application/x-asset-url') || dt.getData('text/uri-list') || dt.getData('text/plain')
    mime = dt.getData('application/x-asset-mime') || 'image/jpeg'
  }
  if (!url) return
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
    describeSlots[idx].preview = dataUrl
    describeSlots[idx].base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
    describeSlots[idx].mime = blob.type || mime
    describeSlots[idx].result = null
    activeSlotIdx.value = idx
    autoUncheckOccupied(idx)
    checkForHistory()
  } catch {}
}

async function describeAllSlots() {
  const slotsToDescribe = describeSlots
    .map((slot, idx) => ({ slot, idx }))
    .filter(({ slot }) => slot.base64 && slot.aspects.some(a => a.checked))
  if (!slotsToDescribe.length) return
  describing.value = true
  try {
    await Promise.all(slotsToDescribe.map(async ({ slot, idx }) => {
      const checkedAspects = slot.aspects.filter(a => a.checked).map(a => a.key)
      const res = await fetch(`${API_BASE_URL}/api/nano/describe-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: { base64Data: slot.base64, mimeType: slot.mime },
          aspects: checkedAspects,
        }),
      })
      if (!res.ok) throw new Error(`圖 ${idx + 1}: ${await res.text()}`)
      const data = await res.json()
      slot.result = data.description
    }))
    rebuildRefDescription()
    saveCurrentToHistory()
  } catch (err) {
    optimizeError.value = err instanceof Error ? err.message : String(err)
  } finally {
    describing.value = false
  }
}

function rebuildRefDescription() {
  const allParts: string[] = []
  describeSlots.forEach((slot, idx) => {
    if (!slot.result) return
    const parts: string[] = []
    for (const asp of slot.aspects) {
      if (asp.checked && slot.result[asp.key]) {
        parts.push(`${asp.label}：${slot.result[asp.key]}`)
      }
    }
    if (parts.length) {
      allParts.push(`【圖 ${idx + 1}】\n${parts.join('\n')}`)
    }
  })
  optimizerInput.value = allParts.join('\n\n')
}

async function runOptimizer() {
  if (!optimizerInput.value.trim()) return
  optimizing.value = true
  optimizeStep.value = 1
  optimizeError.value = ''
  optimizeResult.value = null
  copied.value = false

  try {
    const stepTimer = setTimeout(() => { optimizeStep.value = 2 }, 2000)
    const data = await optimizeNanoPrompt(optimizerInput.value.trim(), optimizerMode.value)
    clearTimeout(stepTimer)

    optimizeResult.value = {
      components: data.components,
      fullPrompt: data.fullPrompt,
      negativeHints: data.negativeHints,
      sections: data.sections,
      sectionLabels: data.sectionLabels,
    }
    if (optimizerMode.value === 'reference') {
      saveCurrentToHistory()
    }
  } catch (err) {
    optimizeError.value = err instanceof Error ? err.message : String(err)
  } finally {
    optimizing.value = false
    optimizeStep.value = 0
  }
}


function copyFullPrompt() {
  if (!optimizeResult.value) return
  const text = optimizeResult.value.fullPrompt
    + (optimizeResult.value.negativeHints ? `\n\nAvoid: ${optimizeResult.value.negativeHints}` : '')
  navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function useOptimizedPrompt() {
  if (!optimizeResult.value) return
  emit('use-prompt', optimizeResult.value.fullPrompt, optimizeResult.value.negativeHints || '', optimizerMode.value)
}

// ── Lightbox (internal) ──
const lightboxUrl = ref<string | null>(null)

function openLightboxDirect(url: string) {
  lightboxUrl.value = url
}

// ── Expose for parent restore ──
defineExpose({
  optimizerMode,
  optimizerInput,
  optimizeResult,
  optimizing,
  runOptimizer,
})
</script>

<style scoped>
.optimizer-card {
  background:
    radial-gradient(circle at top right, rgba(124, 58, 237, 0.12), transparent 40%),
    var(--bg-card);
}

.optimizer-mode-strip {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.opt-mode-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.2s;
}
.opt-mode-pill:hover {
  border-color: var(--accent-purple);
  color: var(--text-primary);
}
.opt-mode-pill.active {
  background: rgba(124,58,237,0.2);
  border-color: var(--accent-purple);
  color: var(--text-primary);
}

.optimizer-input-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.optimizer-textarea {
  flex: 1;
  min-height: 64px;
  max-height: 120px;
  resize: vertical;
}

.optimizer-btn-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-self: stretch;
}

.optimizer-btn {
  white-space: nowrap;
  min-width: 80px;
  flex: 1;
}


.optimizer-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.03);
}

.optimizer-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.4;
  transition: opacity 0.3s;
}

.optimizer-step.active {
  opacity: 1;
  color: var(--accent-cyan);
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-secondary);
  flex-shrink: 0;
}

.optimizer-step.active .step-dot {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.optimizer-result {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.optimizer-sections {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.optimizer-sections-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-right: 4px;
}

.section-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.15);
  color: var(--accent-purple);
  border: 1px solid rgba(124, 58, 237, 0.25);
}

.optimizer-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.optimizer-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.02);
}

.optimizer-table td {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  vertical-align: top;
}

.comp-label {
  white-space: nowrap;
  font-weight: 500;
  color: var(--text-secondary);
  width: 120px;
}

.comp-value {
  color: var(--text-primary);
  line-height: 1.5;
}

.neg-row .comp-label {
  color: #fda4af;
}

.neg-row .comp-value {
  color: #fda4af;
  opacity: 0.8;
}

.optimizer-full-prompt {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  padding: 12px;
}

.full-prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.full-prompt-actions {
  display: flex;
  gap: 6px;
}

.full-prompt-text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.error-text {
  color: #fda4af;
  font-size: 12px;
  line-height: 1.5;
}

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
  cursor: default;
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

.history-import-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-md, 8px);
  background: rgba(124, 58, 237, 0.12);
  border: 1px solid rgba(124, 58, 237, 0.3);
  animation: fadeIn 0.3s ease;
}
.history-import-info {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary, #fff);
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Reference Describe ── */
.ref-describe-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
}
.ref-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}
.ref-slot {
  aspect-ratio: 1;
  border-radius: 8px;
  border: 2px dashed var(--c-border, #444);
  cursor: pointer;
  overflow: hidden;
  position: relative;
  transition: border-color 0.2s;
  width: auto;
  height: auto;
}
.ref-slot.active {
  border-color: var(--c-primary, #7c3aed);
  border-style: solid;
}
.ref-describe-block .ref-slot-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.ref-describe-block .ref-slot-empty:hover {
  background: rgba(124, 58, 237, 0.1);
  border-color: var(--c-primary, #7c3aed);
}
.ref-describe-block .ref-slot-empty:focus {
  outline: 2px solid var(--c-primary, #7c3aed);
  outline-offset: -2px;
  background: rgba(124, 58, 237, 0.15);
}
.ref-describe-block .ref-slot-paste-hint {
  font-size: 11px;
  color: var(--c-text-muted, #888);
}
.ref-describe-block .ref-slot-plus {
  font-size: 28px;
  line-height: 1;
  font-weight: 300;
  color: var(--c-text-muted, #888);
}
.ref-slot-filled {
  width: 100%;
  height: 100%;
  position: relative;
}
.ref-slot-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ref-slot-clear {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(220, 50, 50, 0.9);
  color: white;
  border: none;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.ref-slot-done {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.9);
  color: white;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ref-slot-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ref-slot-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ref-slot-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-primary, #7c3aed);
}
.ref-aspect-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.ref-aspect-label {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  white-space: nowrap;
}
.ref-aspect-label input[type="checkbox"] {
  margin: 0;
}
.ref-aspect-label.occupied {
  opacity: 0.4;
  cursor: not-allowed;
  position: relative;
}
.ref-aspect-label.occupied:hover {
  opacity: 0.7;
}
.occupied-badge {
  font-size: 10px;
  background: rgba(124, 58, 237, 0.3);
  color: var(--c-primary, #7c3aed);
  padding: 0 4px;
  border-radius: 3px;
  margin-left: 2px;
}
.ref-describe-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  background: var(--c-bg, #0e0e18);
  border-radius: 8px;
  padding: 10px;
}
.ref-describe-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.ref-describe-item.dimmed {
  opacity: 0.35;
  text-decoration: line-through;
}
.ref-describe-tag {
  font-weight: 600;
  min-width: 70px;
  flex-shrink: 0;
  color: var(--c-primary, #7c3aed);
}
.ref-describe-text {
  color: var(--c-text, #ccc);
}

/* ── Collect Button ── */
.media-card-wrap {
  position: relative;
}
.zoom-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 12px;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.media-card-wrap:hover .zoom-btn {
  opacity: 1;
}
.zoom-btn:hover {
  background: rgba(124, 58, 237, 0.8);
  border-color: var(--accent-purple);
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
