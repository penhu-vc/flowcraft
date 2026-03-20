<template>
  <div v-if="visible" class="vfc-panel">
    <div class="vfc-header">
      <span>🎬 影片擷取</span>
      <div class="vfc-header-actions">
        <button v-if="videoSrc" class="vfc-btn-change" @click="changeVideo">🔄 換影片</button>
        <button class="vfc-close" @click="$emit('close')">✕</button>
      </div>
    </div>

    <!-- Upload area -->
    <label v-if="!videoSrc" class="vfc-upload-zone">
      <input type="file" accept="video/*" hidden @change="onVideoUpload" />
      <span class="vfc-upload-icon">📹</span>
      <span class="vfc-upload-text">上傳影片</span>
      <span class="vfc-upload-hint">支援 MP4, WebM, MOV</span>
    </label>

    <!-- Player -->
    <template v-if="videoSrc">
      <div class="vfc-player-wrap" ref="playerWrapRef">
        <video
          ref="videoRef"
          :src="videoSrc"
          preload="auto"
          @loadedmetadata="onMetadata"
          @timeupdate="onTimeUpdate"
          @play="isPlaying = true"
          @pause="isPlaying = false"
        />
        <!-- Crop overlay -->
        <canvas
          v-if="cropEnabled"
          ref="cropCanvasRef"
          class="vfc-crop-overlay"
          @pointerdown="onCropPointerDown"
          @pointermove="onCropPointerMove"
          @pointerup="onCropPointerUp"
        />
      </div>

      <!-- Transport controls -->
      <div class="vfc-transport">
        <button class="vfc-btn" @click="stepFrame(-1)" title="上一幀">⏮</button>
        <button class="vfc-btn vfc-btn-play" @click="togglePlay">{{ isPlaying ? '⏸' : '▶' }}</button>
        <button class="vfc-btn" @click="stepFrame(1)" title="下一幀">⏭</button>
        <input
          type="range"
          class="vfc-timeline"
          min="0"
          :max="duration"
          step="0.001"
          :value="currentTime"
          @input="seekTo(($event.target as HTMLInputElement).value)"
        />
        <span class="vfc-time">
          {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
          <span class="vfc-frame">F{{ currentFrame }}</span>
        </span>
      </div>

      <!-- Controls row -->
      <div class="vfc-controls-row">
        <div class="vfc-fps-group">
          <label>FPS</label>
          <select v-model.number="fps" class="vfc-select">
            <option :value="24">24</option>
            <option :value="25">25</option>
            <option :value="30">30</option>
            <option :value="60">60</option>
          </select>
        </div>

        <label class="vfc-crop-toggle">
          <input type="checkbox" v-model="cropEnabled" />
          <span>裁切模式</span>
        </label>

        <div v-if="cropEnabled" class="vfc-ratio-pills">
          <button
            v-for="r in ratioPresets"
            :key="r.value"
            class="vfc-ratio-pill"
            :class="{ active: cropRatio === r.value }"
            @click="setCropRatio(r.value)"
          >{{ r.label }}</button>
        </div>
      </div>

      <!-- Capture buttons -->
      <div class="vfc-capture-row">
        <button class="btn btn-primary" @click="captureFrame">
          📸 擷取{{ cropEnabled ? '裁切區域' : '完整畫面' }}
        </button>
        <button class="btn btn-secondary vfc-btn-portrait" @click="capturePortrait">
          👤 人像擷取
        </button>
        <span v-if="captureCount > 0" class="vfc-capture-count">已擷取 {{ captureCount }} 張</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'

defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'capture', payload: { base64: string; mimeType: string }): void
  (e: 'capture-portrait', payload: { base64: string; mimeType: string }): void
  (e: 'close'): void
}>()

const videoSrc = ref('')
const videoRef = ref<HTMLVideoElement | null>(null)
const playerWrapRef = ref<HTMLElement | null>(null)
const cropCanvasRef = ref<HTMLCanvasElement | null>(null)

const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const fps = ref(30)
const currentFrame = computed(() => Math.floor(currentTime.value * fps.value))
const captureCount = ref(0)

const cropEnabled = ref(false)
const cropRatio = ref('free')
const cropBox = ref({ x: 0, y: 0, w: 0, h: 0 })
const dragState = ref<{
  type: 'move' | 'resize'
  handle?: string
  startX: number
  startY: number
  startBox: { x: number; y: number; w: number; h: number }
} | null>(null)

const ratioPresets = [
  { label: '自由', value: 'free' },
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
]

let resizeObserver: ResizeObserver | null = null

function onVideoUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (videoSrc.value) URL.revokeObjectURL(videoSrc.value)
  videoSrc.value = URL.createObjectURL(file)
  captureCount.value = 0
}

function changeVideo() {
  if (videoSrc.value) URL.revokeObjectURL(videoSrc.value)
  videoSrc.value = ''
  cropEnabled.value = false
  captureCount.value = 0
}

function onMetadata() {
  const v = videoRef.value!
  duration.value = v.duration
  v.pause()
  v.currentTime = 0
  initCropBox()
  setupResizeObserver()
}

function onTimeUpdate() {
  if (videoRef.value) currentTime.value = videoRef.value.currentTime
}

function togglePlay() {
  const v = videoRef.value!
  if (v.paused) v.play()
  else v.pause()
}

function stepFrame(dir: 1 | -1) {
  const v = videoRef.value!
  v.pause()
  isPlaying.value = false
  v.currentTime = Math.max(0, Math.min(duration.value, v.currentTime + dir / fps.value))
}

function seekTo(val: string) {
  const v = videoRef.value!
  v.pause()
  isPlaying.value = false
  v.currentTime = parseFloat(val)
  currentTime.value = v.currentTime
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const ms = Math.floor((t % 1) * 100)
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}

// ── Video rendering rect (accounts for object-fit: contain) ──────

function getVideoRect(): { ox: number; oy: number; rw: number; rh: number } {
  const v = videoRef.value
  if (!v) return { ox: 0, oy: 0, rw: 1, rh: 1 }
  const cw = v.clientWidth
  const ch = v.clientHeight
  const vw = v.videoWidth
  const vh = v.videoHeight
  const videoAR = vw / vh
  const elemAR = cw / ch
  let rw: number, rh: number, ox: number, oy: number
  if (videoAR > elemAR) {
    // Letterbox top/bottom
    rw = cw
    rh = cw / videoAR
    ox = 0
    oy = (ch - rh) / 2
  } else {
    // Pillarbox left/right
    rh = ch
    rw = ch * videoAR
    ox = (cw - rw) / 2
    oy = 0
  }
  return { ox, oy, rw, rh }
}

// ── Crop Box ──────────────────────────────────────────────────────

function initCropBox() {
  const v = videoRef.value
  if (!v) return
  const vw = v.videoWidth
  const vh = v.videoHeight
  cropBox.value = {
    x: vw * 0.15,
    y: vh * 0.15,
    w: vw * 0.7,
    h: vh * 0.7,
  }
}

function setCropRatio(ratio: string) {
  cropRatio.value = ratio
  if (ratio === 'free') { drawCropOverlay(); return }
  const [rw, rh] = ratio.split(':').map(Number)
  const targetAR = rw / rh
  const v = videoRef.value!
  const vw = v.videoWidth
  const vh = v.videoHeight
  const b = cropBox.value
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  let nw = b.w
  let nh = nw / targetAR
  if (nh > vh * 0.9) { nh = vh * 0.9; nw = nh * targetAR }
  if (nw > vw * 0.9) { nw = vw * 0.9; nh = nw / targetAR }
  cropBox.value = {
    x: Math.max(0, Math.min(vw - nw, cx - nw / 2)),
    y: Math.max(0, Math.min(vh - nh, cy - nh / 2)),
    w: nw,
    h: nh,
  }
  drawCropOverlay()
}

const HANDLE_SIZE = 8

function videoToCanvas(vx: number, vy: number): { cx: number; cy: number } {
  const v = videoRef.value!
  const { ox, oy, rw, rh } = getVideoRect()
  return {
    cx: ox + (vx / v.videoWidth) * rw,
    cy: oy + (vy / v.videoHeight) * rh,
  }
}

function canvasToVideo(cx: number, cy: number): { vx: number; vy: number } {
  const v = videoRef.value!
  const { ox, oy, rw, rh } = getVideoRect()
  return {
    vx: ((cx - ox) / rw) * v.videoWidth,
    vy: ((cy - oy) / rh) * v.videoHeight,
  }
}

function drawCropOverlay() {
  const canvas = cropCanvasRef.value
  const v = videoRef.value
  if (!canvas || !v) return
  canvas.width = v.clientWidth
  canvas.height = v.clientHeight
  const ctx = canvas.getContext('2d')!
  const b = cropBox.value

  const tl = videoToCanvas(b.x, b.y)
  const br = videoToCanvas(b.x + b.w, b.y + b.h)
  const dx = tl.cx
  const dy = tl.cy
  const dw = br.cx - tl.cx
  const dh = br.cy - tl.cy

  // Dim outside
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.clearRect(dx, dy, dw, dh)

  // Border
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.strokeRect(dx, dy, dw, dh)

  // Rule of thirds
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(dx + (dw * i) / 3, dy)
    ctx.lineTo(dx + (dw * i) / 3, dy + dh)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(dx, dy + (dh * i) / 3)
    ctx.lineTo(dx + dw, dy + (dh * i) / 3)
    ctx.stroke()
  }

  // Handles
  ctx.fillStyle = '#fff'
  const hs = HANDLE_SIZE
  const handles = [
    [dx, dy], [dx + dw / 2, dy], [dx + dw, dy],
    [dx, dy + dh / 2], [dx + dw, dy + dh / 2],
    [dx, dy + dh], [dx + dw / 2, dy + dh], [dx + dw, dy + dh],
  ]
  for (const [hx, hy] of handles) {
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
  }
}

function hitTestHandle(px: number, py: number): string | null {
  const b = cropBox.value
  const tl = videoToCanvas(b.x, b.y)
  const br = videoToCanvas(b.x + b.w, b.y + b.h)
  const dx = tl.cx, dy = tl.cy, dw = br.cx - tl.cx, dh = br.cy - tl.cy
  const hs = HANDLE_SIZE + 4
  const pts: [number, number, string][] = [
    [dx, dy, 'tl'], [dx + dw / 2, dy, 'tc'], [dx + dw, dy, 'tr'],
    [dx, dy + dh / 2, 'ml'], [dx + dw, dy + dh / 2, 'mr'],
    [dx, dy + dh, 'bl'], [dx + dw / 2, dy + dh, 'bc'], [dx + dw, dy + dh, 'br'],
  ]
  for (const [hx, hy, name] of pts) {
    if (Math.abs(px - hx) < hs && Math.abs(py - hy) < hs) return name
  }
  if (px >= dx && px <= dx + dw && py >= dy && py <= dy + dh) return 'move'
  return null
}

function onCropPointerDown(e: PointerEvent) {
  const canvas = cropCanvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  const hit = hitTestHandle(px, py)
  if (!hit) return
  canvas.setPointerCapture(e.pointerId)
  dragState.value = {
    type: hit === 'move' ? 'move' : 'resize',
    handle: hit,
    startX: e.clientX,
    startY: e.clientY,
    startBox: { ...cropBox.value },
  }
}

function canvasDeltaToVideo(dcx: number, dcy: number): { dvx: number; dvy: number } {
  const v = videoRef.value!
  const { rw, rh } = getVideoRect()
  return {
    dvx: (dcx / rw) * v.videoWidth,
    dvy: (dcy / rh) * v.videoHeight,
  }
}

function onCropPointerMove(e: PointerEvent) {
  if (!dragState.value) {
    const canvas = cropCanvasRef.value!
    const rect = canvas.getBoundingClientRect()
    const hit = hitTestHandle(e.clientX - rect.left, e.clientY - rect.top)
    const cursors: Record<string, string> = {
      tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize',
      tc: 'ns-resize', bc: 'ns-resize', ml: 'ew-resize', mr: 'ew-resize',
      move: 'move',
    }
    canvas.style.cursor = hit ? (cursors[hit] || 'default') : 'crosshair'
    return
  }

  const { dvx, dvy } = canvasDeltaToVideo(
    e.clientX - dragState.value.startX,
    e.clientY - dragState.value.startY,
  )
  const sb = dragState.value.startBox
  const v = videoRef.value!
  const vw = v.videoWidth
  const vh = v.videoHeight

  if (dragState.value.type === 'move') {
    cropBox.value = {
      x: Math.max(0, Math.min(vw - sb.w, sb.x + dvx)),
      y: Math.max(0, Math.min(vh - sb.h, sb.y + dvy)),
      w: sb.w,
      h: sb.h,
    }
  } else {
    const h = dragState.value.handle!
    let { x, y, w, h: bh } = sb
    const ar = cropRatio.value !== 'free' ? (() => {
      const [rw, rh] = cropRatio.value.split(':').map(Number)
      return rw / rh
    })() : 0

    if (h.includes('r')) w = Math.max(40, sb.w + dvx)
    if (h.includes('l')) { w = Math.max(40, sb.w - dvx); x = sb.x + sb.w - w }
    if (h.includes('b')) bh = Math.max(40, sb.h + dvy)
    if (h.includes('t')) { bh = Math.max(40, sb.h - dvy); y = sb.y + sb.h - bh }

    if (ar > 0) {
      if (h === 'ml' || h === 'mr') { bh = w / ar }
      else if (h === 'tc' || h === 'bc') { w = bh * ar }
      else { bh = w / ar }
      if (h.includes('t')) y = sb.y + sb.h - bh
      if (h.includes('l')) x = sb.x + sb.w - w
    }

    if (x < 0) { w += x; x = 0 }
    if (y < 0) { bh += y; y = 0 }
    if (x + w > vw) w = vw - x
    if (y + bh > vh) bh = vh - y

    cropBox.value = { x, y, w, h: bh }
  }
  drawCropOverlay()
}

function onCropPointerUp(e: PointerEvent) {
  if (dragState.value) {
    cropCanvasRef.value?.releasePointerCapture(e.pointerId)
    dragState.value = null
  }
}

function setupResizeObserver() {
  resizeObserver?.disconnect()
  const wrap = playerWrapRef.value
  if (!wrap) return
  resizeObserver = new ResizeObserver(() => {
    if (cropEnabled.value) drawCropOverlay()
  })
  resizeObserver.observe(wrap)
}

watch(cropEnabled, (v) => {
  if (v) {
    initCropBox()
    nextTick(drawCropOverlay)
  }
})

// ── Capture ───────────────────────────────────────────────────────

async function captureCurrentFrame(): Promise<string | null> {
  const v = videoRef.value!
  v.pause()
  isPlaying.value = false

  await new Promise(resolve => {
    if (v.readyState >= 2) resolve(null)
    else v.addEventListener('seeked', () => resolve(null), { once: true })
  })

  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = v.videoWidth
  fullCanvas.height = v.videoHeight
  fullCanvas.getContext('2d')!.drawImage(v, 0, 0)

  let resultCanvas = fullCanvas
  if (cropEnabled.value) {
    const { x, y, w, h } = cropBox.value
    const rw = Math.round(w)
    const rh = Math.round(h)
    resultCanvas = document.createElement('canvas')
    resultCanvas.width = rw
    resultCanvas.height = rh
    resultCanvas.getContext('2d')!.drawImage(
      fullCanvas,
      Math.round(x), Math.round(y), rw, rh,
      0, 0, rw, rh,
    )
  }

  return resultCanvas.toDataURL('image/png')
}

async function captureFrame() {
  const base64 = await captureCurrentFrame()
  if (!base64) return
  emit('capture', { base64, mimeType: 'image/png' })
  captureCount.value++
}

async function capturePortrait() {
  const base64 = await captureCurrentFrame()
  if (!base64) return
  emit('capture-portrait', { base64, mimeType: 'image/png' })
  captureCount.value += 3
}

onBeforeUnmount(() => {
  if (videoSrc.value) URL.revokeObjectURL(videoSrc.value)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.vfc-panel {
  border: 1px solid var(--border-color, #333);
  border-radius: 10px;
  background: var(--bg-secondary, #1a1a2e);
  overflow: hidden;
  margin-top: 10px;
}

.vfc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color, #333);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #fff);
}

.vfc-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vfc-close {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 18px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  transition: all 0.15s;
}
.vfc-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

/* Upload zone */
.vfc-upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 30px 16px;
  margin: 12px;
  border: 2px dashed var(--border-color, #444);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.vfc-upload-zone:hover {
  border-color: var(--primary, #7c3aed);
  background: rgba(124, 58, 237, 0.05);
}
.vfc-upload-icon { font-size: 28px; }
.vfc-upload-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #fff);
}
.vfc-upload-hint {
  font-size: 11px;
  color: var(--text-muted, #888);
}

/* Player */
.vfc-player-wrap {
  position: relative;
  background: #000;
}
.vfc-player-wrap video {
  display: block;
  width: 100%;
  max-height: 360px;
  object-fit: contain;
}
.vfc-crop-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}

/* Transport */
.vfc-transport {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color, #333);
}

.vfc-btn {
  background: var(--bg-tertiary, #252540);
  border: 1px solid var(--border-color, #444);
  color: var(--text-primary, #fff);
  width: 30px;
  height: 30px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: all 0.15s;
}
.vfc-btn:hover { background: rgba(255, 255, 255, 0.1); }
.vfc-btn-play { width: 36px; }

.vfc-timeline {
  flex: 1;
  height: 6px;
  accent-color: var(--primary, #7c3aed);
  cursor: pointer;
}

.vfc-time {
  font-size: 11px;
  color: var(--text-muted, #888);
  white-space: nowrap;
  min-width: 130px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.vfc-frame {
  color: var(--primary, #7c3aed);
  margin-left: 4px;
  font-weight: 600;
}

/* Controls row */
.vfc-controls-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  flex-wrap: wrap;
  border-top: 1px solid var(--border-color, #333);
}

.vfc-fps-group {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted, #888);
}

.vfc-select {
  background: var(--bg-tertiary, #252540);
  border: 1px solid var(--border-color, #444);
  color: var(--text-primary, #fff);
  padding: 3px 6px;
  border-radius: 6px;
  font-size: 11px;
}

.vfc-crop-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-primary, #fff);
  cursor: pointer;
}
.vfc-crop-toggle input { accent-color: var(--primary, #7c3aed); }

.vfc-ratio-pills {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.vfc-ratio-pill {
  padding: 3px 8px;
  border-radius: 14px;
  border: 1px solid var(--border-color, #444);
  background: var(--bg-tertiary, #252540);
  color: var(--text-muted, #888);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.vfc-ratio-pill:hover {
  border-color: var(--primary, #7c3aed);
  color: var(--text-primary, #fff);
}
.vfc-ratio-pill.active {
  background: var(--primary, #7c3aed);
  border-color: var(--primary, #7c3aed);
  color: #fff;
}

/* Capture row */
.vfc-capture-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-color, #333);
}

.vfc-btn-portrait {
  font-size: 13px;
}

.vfc-capture-count {
  font-size: 12px;
  color: var(--text-muted, #888);
}

.vfc-btn-change {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}
.vfc-btn-change:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary, #fff);
}
</style>
