<template>
  <div v-if="imagePreview" class="mask-editor">
    <div class="mask-toolbar">
      <button
        class="mask-tool-btn"
        :class="{ active: maskTool === 'brush' }"
        @click="maskTool = 'brush'"
        title="筆刷"
      >🖌️</button>
      <button
        class="mask-tool-btn"
        :class="{ active: maskTool === 'eraser' }"
        @click="maskTool = 'eraser'"
        title="橡皮擦"
      >🧹</button>
      <div class="mask-brush-size">
        <label>筆刷</label>
        <input
          v-model.number="maskBrushSize"
          type="range"
          min="5"
          max="100"
          class="mask-range"
        />
        <span class="mask-size-label">{{ maskBrushSize }}px</span>
      </div>
      <button class="mask-tool-btn" @click="clearMask" title="清除蒙版">🗑️</button>
      <div class="mask-toolbar-spacer" />
      <button
        class="btn btn-primary btn-sm mask-remove-btn"
        :disabled="!maskHasPaint || submitting"
        @click="$emit('one-click-remove')"
      >
        ✨ 一鍵去除
      </button>
    </div>
    <div class="mask-canvas-wrap media-card-wrap" ref="maskWrapRef">
      <img
        ref="maskImgRef"
        :src="imagePreview"
        alt="Source"
        class="mask-base-img"
        @load="initMaskCanvas"
      />
      <button
        v-if="imagePreview && !hasAsset(imagePreview)"
        class="collect-btn"
        @click.stop="collectAssetDirect(imagePreview)"
        title="收入囊中"
      >🎒 收入囊中</button>
      <span v-else-if="imagePreview && hasAsset(imagePreview)" class="collect-done">✅ 已收</span>
      <canvas
        ref="maskCanvasRef"
        class="mask-overlay"
        @pointerdown="onMaskPointerDown"
        @pointermove="onMaskPointerMove"
        @pointerup="onMaskPointerUp"
        @pointerleave="onMaskPointerUp"
      />
    </div>
    <p class="mask-hint">在圖片上塗抹要編輯的區域，未塗抹的部分會保持不變。</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAssetLibrary } from '../../composables/useAssetLibrary'

const props = defineProps<{
  imagePreview: string
  submitting?: boolean
  pendingRestoredMask?: string | null
}>()

const emit = defineEmits<{
  (e: 'mask-exported', data: string | null): void
  (e: 'clear-mask'): void
  (e: 'one-click-remove'): void
  (e: 'mask-has-paint-change', hasPaint: boolean): void
}>()

const { addAsset, hasAsset } = useAssetLibrary()

function collectAssetDirect(url: string) {
  addAsset({ type: 'image', url, mimeType: 'image/jpeg', label: 'AI Studio' })
}

// ── Mask Painting ──
const maskCanvasRef = ref<HTMLCanvasElement | null>(null)
const maskImgRef = ref<HTMLImageElement | null>(null)
const maskWrapRef = ref<HTMLDivElement | null>(null)
const maskTool = ref<'brush' | 'eraser'>('brush')
const maskBrushSize = ref(30)
const maskDrawing = ref(false)
const maskHasPaint = ref(false)

watch(maskHasPaint, (val) => {
  emit('mask-has-paint-change', val)
})

function initMaskCanvas() {
  const img = maskImgRef.value
  const canvas = maskCanvasRef.value
  if (!img || !canvas) return
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  maskHasPaint.value = false
  if (props.pendingRestoredMask) {
    const maskImage = new Image()
    maskImage.onload = () => {
      const drawCtx = canvas.getContext('2d')!
      drawCtx.clearRect(0, 0, canvas.width, canvas.height)
      drawCtx.drawImage(maskImage, 0, 0, canvas.width, canvas.height)
      maskHasPaint.value = true
    }
    maskImage.src = props.pendingRestoredMask
  }
}

function getMaskPos(e: PointerEvent) {
  const canvas = maskCanvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}

function drawAt(e: PointerEvent) {
  const canvas = maskCanvasRef.value!
  const ctx = canvas.getContext('2d')!
  const pos = getMaskPos(e)
  ctx.beginPath()
  ctx.arc(pos.x, pos.y, maskBrushSize.value, 0, Math.PI * 2)
  if (maskTool.value === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(168, 85, 247, 0.45)'
  }
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  if (maskTool.value === 'brush') maskHasPaint.value = true
}

function onMaskPointerDown(e: PointerEvent) {
  maskDrawing.value = true
  const canvas = maskCanvasRef.value!
  canvas.setPointerCapture(e.pointerId)
  drawAt(e)
}

function onMaskPointerMove(e: PointerEvent) {
  if (!maskDrawing.value) return
  drawAt(e)
}

function onMaskPointerUp(_e: PointerEvent) {
  maskDrawing.value = false
}

function clearMask() {
  const canvas = maskCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  maskHasPaint.value = false
}

function exportMaskAsBase64(): string | null {
  const canvas = maskCanvasRef.value
  if (!canvas || !maskHasPaint.value) return null
  const w = canvas.width
  const h = canvas.height
  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = w
  tmpCanvas.height = h
  const tmpCtx = tmpCanvas.getContext('2d')!
  tmpCtx.fillStyle = '#000000'
  tmpCtx.fillRect(0, 0, w, h)
  const srcCtx = canvas.getContext('2d')!
  const srcData = srcCtx.getImageData(0, 0, w, h)
  const dstData = tmpCtx.getImageData(0, 0, w, h)
  for (let i = 0; i < srcData.data.length; i += 4) {
    if (srcData.data[i + 3] > 0) {
      dstData.data[i] = 255
      dstData.data[i + 1] = 255
      dstData.data[i + 2] = 255
      dstData.data[i + 3] = 255
    }
  }
  tmpCtx.putImageData(dstData, 0, 0)
  return tmpCanvas.toDataURL('image/png')
}

defineExpose({
  exportMaskAsBase64,
  clearMask,
  maskHasPaint,
})
</script>

<style scoped>
.mask-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mask-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mask-tool-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.mask-tool-btn:hover {
  border-color: var(--c-accent, #a855f7);
}
.mask-tool-btn.active {
  background: var(--c-accent, #a855f7);
  border-color: var(--c-accent, #a855f7);
}
.mask-brush-size {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted, #888);
}
.mask-brush-size label {
  white-space: nowrap;
}
.mask-range {
  width: 100px;
  accent-color: var(--c-accent, #a855f7);
}
.mask-size-label {
  min-width: 36px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.mask-toolbar-spacer {
  flex: 1;
}
.mask-remove-btn {
  white-space: nowrap;
}
.mask-canvas-wrap {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--c-border);
  line-height: 0;
}
.mask-base-img {
  width: 100%;
  display: block;
  pointer-events: none;
  user-select: none;
}
.mask-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}
.mask-hint {
  font-size: 12px;
  color: var(--text-muted, #888);
  margin: 0;
}

/* ── Collect Button ── */
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
