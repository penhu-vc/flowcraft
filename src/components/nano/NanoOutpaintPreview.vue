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

  // Fill background with blurred stretched image (matches export)
  ctx.save()
  ctx.filter = 'blur(30px)'
  ctx.drawImage(img, 0, 0, canvasW, canvasH)
  ctx.restore()

  // Purple tint on AI-fill areas (top, bottom, left, right strips)
  ctx.fillStyle = 'rgba(168, 85, 247, 0.35)'
  ctx.fillRect(0, 0, canvasW, drawY) // top
  ctx.fillRect(0, drawY + drawH, canvasW, canvasH - drawY - drawH) // bottom
  ctx.fillRect(0, drawY, drawX, drawH) // left
  ctx.fillRect(drawX + drawW, drawY, canvasW - drawX - drawW, drawH) // right

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

/** Export the expanded canvas with edge-mirrored fill for seamless AI context */
async function exportExpandedImage(): Promise<string> {
  const canvas = previewCanvasRef.value
  if (!canvas) return ''

  const imgSrc = props.image.previewUrl || props.image.base64Data
  if (!imgSrc) return ''
  const img = await loadImage(imgSrc)

  const { canvasW, canvasH, drawX, drawY, drawW, drawH } = computeLayout(
    imgNaturalWidth.value,
    imgNaturalHeight.value,
    targetNumericRatio.value,
  )

  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = canvasW
  tmpCanvas.height = canvasH
  const ctx = tmpCanvas.getContext('2d')!

  // Fill with blurred, stretched version of the image as background context
  // This gives Gemini natural color/texture context at the boundaries
  ctx.save()
  ctx.filter = 'blur(30px)'
  ctx.drawImage(img, 0, 0, canvasW, canvasH)
  ctx.restore()

  // Draw original image on top, centered
  ctx.drawImage(img, drawX, drawY, drawW, drawH)

  return tmpCanvas.toDataURL('image/png')
}

/** Export the mask: white = areas to fill, black = original image area, feathered edge for blending */
function exportMask(): string {
  const canvas = previewCanvasRef.value
  if (!canvas) return ''

  const { canvasW, canvasH, drawX, drawY, drawW, drawH } = computeLayout(
    imgNaturalWidth.value,
    imgNaturalHeight.value,
    targetNumericRatio.value,
  )

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = canvasW
  maskCanvas.height = canvasH
  const ctx = maskCanvas.getContext('2d')!

  // Fill entire canvas white (areas to expand)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Feather size: ~8% of the shorter image dimension for smooth blending
  const feather = Math.round(Math.min(drawW, drawH) * 0.08)

  // Fill original image area black, with feathered edges via gradients
  // Core area (fully black, fully preserved)
  ctx.fillStyle = '#000000'
  ctx.fillRect(drawX + feather, drawY + feather, drawW - feather * 2, drawH - feather * 2)

  // Top edge gradient (white → black)
  const gradTop = ctx.createLinearGradient(0, drawY, 0, drawY + feather)
  gradTop.addColorStop(0, '#ffffff')
  gradTop.addColorStop(1, '#000000')
  ctx.fillStyle = gradTop
  ctx.fillRect(drawX + feather, drawY, drawW - feather * 2, feather)

  // Bottom edge gradient (black → white)
  const gradBottom = ctx.createLinearGradient(0, drawY + drawH - feather, 0, drawY + drawH)
  gradBottom.addColorStop(0, '#000000')
  gradBottom.addColorStop(1, '#ffffff')
  ctx.fillStyle = gradBottom
  ctx.fillRect(drawX + feather, drawY + drawH - feather, drawW - feather * 2, feather)

  // Left edge gradient (white → black)
  const gradLeft = ctx.createLinearGradient(drawX, 0, drawX + feather, 0)
  gradLeft.addColorStop(0, '#ffffff')
  gradLeft.addColorStop(1, '#000000')
  ctx.fillStyle = gradLeft
  ctx.fillRect(drawX, drawY + feather, feather, drawH - feather * 2)

  // Right edge gradient (black → white)
  const gradRight = ctx.createLinearGradient(drawX + drawW - feather, 0, drawX + drawW, 0)
  gradRight.addColorStop(0, '#000000')
  gradRight.addColorStop(1, '#ffffff')
  ctx.fillStyle = gradRight
  ctx.fillRect(drawX + drawW - feather, drawY + feather, feather, drawH - feather * 2)

  // Corner gradients (radial, from black center to white edge)
  const corners = [
    { cx: drawX + feather, cy: drawY + feather, sx: drawX, sy: drawY },                           // top-left
    { cx: drawX + drawW - feather, cy: drawY + feather, sx: drawX + drawW - feather, sy: drawY },  // top-right
    { cx: drawX + feather, cy: drawY + drawH - feather, sx: drawX, sy: drawY + drawH - feather },  // bottom-left
    { cx: drawX + drawW - feather, cy: drawY + drawH - feather, sx: drawX + drawW - feather, sy: drawY + drawH - feather }, // bottom-right
  ]
  for (const c of corners) {
    const grad = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, feather)
    grad.addColorStop(0, '#000000')
    grad.addColorStop(1, '#ffffff')
    ctx.fillStyle = grad
    ctx.fillRect(c.sx, c.sy, feather, feather)
  }

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
