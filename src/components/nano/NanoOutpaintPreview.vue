<template>
  <div class="outpaint-preview">
    <div class="preview-canvas-wrap" :style="{ aspectRatio: canvasAspectRatio }">
      <canvas ref="previewCanvasRef" class="preview-canvas" />
    </div>
    <p class="outpaint-info">
      {{ infoText }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { NanoInlineAsset } from '../../api/nano'

const props = defineProps<{
  image: NanoInlineAsset
  targetRatio: string
}>()

const previewCanvasRef = ref<HTMLCanvasElement | null>(null)
const imgNaturalWidth = ref(0)
const imgNaturalHeight = ref(0)

const RATIO_MAP: Record<string, number> = {
  '1:1': 1,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
}

const targetNumericRatio = computed(() => RATIO_MAP[props.targetRatio] || 1)

const canvasAspectRatio = computed(() => {
  const r = targetNumericRatio.value
  return r >= 1 ? `${r} / 1` : `1 / ${1 / r}`
})

const infoText = computed(() => {
  if (!imgNaturalWidth.value) return ''
  const imgRatio = imgNaturalWidth.value / imgNaturalHeight.value
  const target = targetNumericRatio.value
  if (Math.abs(imgRatio - target) < 0.05) {
    return '原圖比例與目標相近，將四方均勻擴展。'
  }
  return `原圖 ${imgNaturalWidth.value}x${imgNaturalHeight.value} → 擴展為 ${props.targetRatio}，紫色區域將由 AI 填充。`
})

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function drawPreview() {
  const canvas = previewCanvasRef.value
  const imgSrc = props.image.previewUrl || props.image.base64Data
  if (!canvas || !imgSrc) return

  const img = await loadImage(imgSrc)
  imgNaturalWidth.value = img.naturalWidth
  imgNaturalHeight.value = img.naturalHeight

  const { canvasW, canvasH, drawX, drawY, drawW, drawH } = computeLayout(
    img.naturalWidth,
    img.naturalHeight,
    targetNumericRatio.value,
  )

  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!

  // Fill background with dark gray
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Draw purple overlay for AI-fill areas
  ctx.fillStyle = 'rgba(168, 85, 247, 0.3)'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Draw original image centered
  ctx.drawImage(img, drawX, drawY, drawW, drawH)

  // Draw border around original image area
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.strokeRect(drawX, drawY, drawW, drawH)
}

function computeLayout(imgW: number, imgH: number, targetRatio: number) {
  const imgRatio = imgW / imgH

  let canvasW: number
  let canvasH: number

  if (Math.abs(imgRatio - targetRatio) < 0.05) {
    // Same ratio → uniform expansion (25% padding each side)
    const padding = 0.25
    canvasW = Math.round(imgW * (1 + padding * 2))
    canvasH = Math.round(imgH * (1 + padding * 2))
  } else if (targetRatio > imgRatio) {
    // Target is wider → expand horizontally, keep height
    canvasH = imgH
    canvasW = Math.round(imgH * targetRatio)
  } else {
    // Target is taller → expand vertically, keep width
    canvasW = imgW
    canvasH = Math.round(imgW / targetRatio)
  }

  const drawX = Math.round((canvasW - imgW) / 2)
  const drawY = Math.round((canvasH - imgH) / 2)

  return { canvasW, canvasH, drawX, drawY, drawW: imgW, drawH: imgH }
}

/** Export the expanded canvas (original image centered on background) as base64 */
async function exportExpandedImage(): Promise<string> {
  const canvas = previewCanvasRef.value
  if (!canvas) return ''

  const imgSrc = props.image.previewUrl || props.image.base64Data
  if (!imgSrc) return ''
  const img = await loadImage(imgSrc)

  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = canvas.width
  tmpCanvas.height = canvas.height
  const ctx = tmpCanvas.getContext('2d')!

  // Fill with neutral gray (helps AI understand the context)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height)

  const { drawX, drawY, drawW, drawH } = computeLayout(
    imgNaturalWidth.value,
    imgNaturalHeight.value,
    targetNumericRatio.value,
  )
  ctx.drawImage(img, drawX, drawY, drawW, drawH)

  return tmpCanvas.toDataURL('image/png')
}

/** Export the mask: white = areas to fill, black = original image area */
function exportMask(): string {
  const canvas = previewCanvasRef.value
  if (!canvas) return ''

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = canvas.width
  maskCanvas.height = canvas.height
  const ctx = maskCanvas.getContext('2d')!

  // Fill entire canvas white (areas to expand)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)

  // Fill original image area black (keep as is)
  const { drawX, drawY, drawW, drawH } = computeLayout(
    imgNaturalWidth.value,
    imgNaturalHeight.value,
    targetNumericRatio.value,
  )
  ctx.fillStyle = '#000000'
  ctx.fillRect(drawX, drawY, drawW, drawH)

  return maskCanvas.toDataURL('image/png')
}

watch([() => props.image, () => props.targetRatio], () => {
  void drawPreview()
})

onMounted(() => {
  void drawPreview()
})

defineExpose({
  exportExpandedImage,
  exportMask,
})
</script>

<style scoped>
.outpaint-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-canvas-wrap {
  position: relative;
  width: 100%;
  max-width: 480px;
  background: #0f0f1a;
  border-radius: 8px;
  overflow: hidden;
}

.preview-canvas {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.outpaint-info {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}
</style>
