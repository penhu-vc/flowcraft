<template>
  <div class="asset-block">
    <div class="asset-head">
      <span>參考圖片</span>
      <span class="ref-rule-hint ref-tooltip-wrap">
        Asset 最多 3 張 · Style 最多 1 張 · 不可混用 <span class="hint-icon">?</span>
        <span class="ref-tooltip">
          <strong>🎯 Asset（素材）</strong><br/>
          告訴 Veo「這個東西長什麼樣子」<br/>
          例：logo 圖、角色臉、產品照片<br/><br/>
          <strong>🎨 Style（風格）</strong><br/>
          告訴 Veo「要這種視覺感覺」<br/>
          例：賽博龐克風截圖、油畫風格的圖<br/><br/>
          ⚠️ Asset 和 Style <strong>不能同時使用</strong>
        </span>
      </span>
    </div>
    <div v-if="assetCount > 0 && styleCount > 0" class="ref-mix-warning">
      ⚠️ 不能同時混用 Asset 和 Style，請統一選一種類型
    </div>
    <div class="ref-slots-grid">
      <div
        v-for="slot in 4"
        :key="slot"
        class="ref-slot-wrapper"
      >
        <div
          class="ref-slot"
          :class="{ filled: !!refSlots[slot - 1], disabled: !refSlots[slot - 1] && !canAddRef }"
        >
          <template v-if="refSlots[slot - 1]">
            <img :src="refSlots[slot - 1]!.previewUrl" alt="Reference" />
            <div class="ref-slot-controls">
              <select
                :value="refSlots[slot - 1]!.referenceType"
                class="form-select form-select-sm ref-type-select"
                @change="onRefTypeChange(slot - 1, ($event.target as HTMLSelectElement).value as 'ASSET' | 'STYLE')"
              >
                <option value="ASSET" :disabled="!canSetAsset(slot - 1)">🎯 Asset</option>
                <option value="STYLE" :disabled="!canSetStyle(slot - 1)">🎨 Style</option>
              </select>
              <button class="ref-remove-btn" @click="removeReference(slot - 1)" title="移除">✕</button>
            </div>
          </template>
          <template v-else>
            <div
              v-if="canAddRef"
              class="ref-slot-empty"
              tabindex="0"
              @click.stop="triggerRefSlotUpload(slot - 1)"
              @keydown.enter.prevent="triggerRefSlotUpload(slot - 1)"
              @keydown.space.prevent="triggerRefSlotUpload(slot - 1)"
              @dragover.prevent
              @drop.prevent="onRefSlotDrop($event, slot - 1)"
            >
              <span class="ref-slot-plus">+</span>
              <span class="ref-slot-label">上傳圖片</span>
              <input :ref="(el) => setRefInputRef(el, slot - 1)" type="file" accept="image/*" hidden @change="onRefSlotUpload($event, slot - 1)" />
            </div>
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
        />
      </div>
    </div>
    <button
      v-if="hasAnyRefDescription"
      class="btn btn-primary btn-sm ref-optimize-btn"
      :disabled="optimizing"
      @click="onOptimizeClick"
    >
      ✨ 一鍵優化指令
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { VeoReferenceAsset } from '../../api/veo'

const props = defineProps<{
  referenceImages: VeoReferenceAsset[]
  canAddRef: boolean
  optimizing: boolean
}>()

const emit = defineEmits<{
  (e: 'add-reference', asset: VeoReferenceAsset): void
  (e: 'remove-reference', index: number): void
  (e: 'change-ref-type', index: number, newType: 'ASSET' | 'STYLE'): void
  (e: 'optimize-refs', combined: string): void
  (e: 'update-descriptions', descriptions: string[]): void
  (e: 'drop-reference', event: DragEvent, slotIndex: number): void
}>()

const localDescriptions = ref<string[]>(['', '', '', ''])
const refInputRefs = ref<(HTMLInputElement | null)[]>([])

// Sync descriptions upward
watch(localDescriptions, (val) => {
  emit('update-descriptions', [...val])
}, { deep: true })

const refSlots = computed(() => {
  const slots: (VeoReferenceAsset | null)[] = [null, null, null, null]
  props.referenceImages.forEach((item, i) => {
    if (i < 4) slots[i] = item
  })
  return slots
})

const assetCount = computed(() => props.referenceImages.filter(r => r.referenceType === 'ASSET').length)
const styleCount = computed(() => props.referenceImages.filter(r => r.referenceType === 'STYLE').length)

const hasAnyRefDescription = computed(() =>
  localDescriptions.value.some((d, i) => d.trim() && refSlots.value[i])
)

function canSetAsset(index: number) {
  const current = props.referenceImages[index]
  if (current?.referenceType === 'ASSET') return true
  return assetCount.value < 3
}

function canSetStyle(index: number) {
  const current = props.referenceImages[index]
  if (current?.referenceType === 'STYLE') return true
  return styleCount.value < 1
}

function onRefTypeChange(index: number, newType: 'ASSET' | 'STYLE') {
  if (newType === 'ASSET' && !canSetAsset(index)) return
  if (newType === 'STYLE' && !canSetStyle(index)) return
  emit('change-ref-type', index, newType)
}

function setRefInputRef(el: Element | null, index: number) {
  refInputRefs.value[index] = el as HTMLInputElement | null
}

function triggerRefSlotUpload(index: number) {
  refInputRefs.value[index]?.click()
}

async function fileToAsset(file: File) {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  return {
    base64Data,
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
    previewUrl: base64Data,
  }
}

async function onRefSlotUpload(event: Event, _slotIndex: number) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const asset = await fileToAsset(file)
  const defaultType = assetCount.value < 3 ? 'ASSET' : 'STYLE'
  emit('add-reference', { ...asset, referenceType: defaultType } as VeoReferenceAsset)
  input.value = ''
}

function onRefSlotDrop(e: DragEvent, slotIndex: number) {
  emit('drop-reference', e, slotIndex)
}

function removeReference(index: number) {
  emit('remove-reference', index)
  localDescriptions.value.splice(index, 1)
  localDescriptions.value.push('')
}

function onOptimizeClick() {
  const parts: string[] = []
  localDescriptions.value.forEach((desc, i) => {
    const slot = refSlots.value[i]
    if (slot && desc.trim()) {
      const type = slot.referenceType === 'STYLE' ? '風格參考' : '素材參考'
      parts.push(`圖${i + 1}（${type}）：${desc.trim()}`)
    }
  })
  const combined = parts.join('\n')
  if (!combined) return
  emit('optimize-refs', combined)
}

// Expose for parent to set descriptions (e.g., restoreJob)
function setDescriptions(descriptions: string[]) {
  localDescriptions.value = descriptions.slice(0, 4)
  while (localDescriptions.value.length < 4) localDescriptions.value.push('')
}

defineExpose({
  localDescriptions,
  setDescriptions,
})
</script>

<style scoped>
.asset-block {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
  background: rgba(255,255,255,0.02);
}
.asset-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.ref-rule-hint {
  font-size: 11px;
  color: var(--text-muted);
}
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
  border: 1px solid var(--text-muted);
  font-size: 10px;
  vertical-align: middle;
  margin-left: 2px;
}
.ref-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 260px;
  padding: 12px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  z-index: 100;
  pointer-events: none;
}
.ref-tooltip-wrap:hover .ref-tooltip {
  display: block;
}
.ref-slots-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 8px;
}
.ref-slot {
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  aspect-ratio: 3 / 4;
  overflow: hidden;
  position: relative;
  transition: border-color 0.2s;
}
.ref-slot.filled {
  border-style: solid;
  border-color: var(--accent-purple);
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
  font-size: 11px !important;
  padding: 3px 4px !important;
  background: rgba(0,0,0,0.5) !important;
  border-color: rgba(255,255,255,0.2) !important;
  color: var(--text-primary) !important;
}
.ref-remove-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(220,38,38,0.6);
  color: white;
  font-size: 12px;
  cursor: pointer;
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
  color: var(--text-muted);
}
.ref-slot-empty:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
}
.ref-slot-locked {
  cursor: default;
}
.ref-slot-locked:hover {
  background: transparent;
  color: var(--text-muted);
}
.ref-slot-plus {
  font-size: 28px;
  line-height: 1;
  font-weight: 300;
}
.ref-slot-label {
  font-size: 11px;
}
.ref-mix-warning {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  margin-bottom: 8px;
}
.ref-slot-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ref-desc-input {
  font-size: 11px !important;
  padding: 5px 8px !important;
}
.ref-desc-input:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.ref-optimize-btn {
  margin-top: 10px;
  align-self: flex-start;
}
</style>
