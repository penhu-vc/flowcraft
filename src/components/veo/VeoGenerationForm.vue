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

      <div v-if="needsPrompt" class="form-group">
        <label class="form-label">Prompt</label>
        <textarea
          v-model="form.prompt"
          class="form-textarea veo-textarea"
          placeholder="描述鏡頭、運動、角色、場景、光線、節奏。"
        />
      </div>

      <div class="veo-params-grid">
        <div class="form-group">
          <label class="form-label">模型</label>
          <select v-model="form.model" class="form-select form-select-sm">
            <option value="veo-3.1-generate-preview">Veo 3.1 Generate Preview</option>
            <option value="veo-3.0-generate-preview">Veo 3.0 Generate Preview</option>
            <option value="veo-2.0-generate-001">Veo 2.0 Generate 001</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">比例</label>
          <select v-model="form.aspectRatio" class="form-select form-select-sm">
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">解析度</label>
          <select v-model="form.resolution" class="form-select form-select-sm">
            <option v-for="r in allowedResolutions" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">片長</label>
          <select v-model.number="form.durationSeconds" class="form-select form-select-sm">
            <option v-for="d in allowedDurations" :key="d" :value="d">{{ d }}s</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">數量</label>
          <select v-model.number="form.numberOfVideos" class="form-select form-select-sm">
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
        <div class="form-group">
          <label class="form-label">Seed</label>
          <input v-model.number="form.seed" type="number" class="form-input form-input-sm" placeholder="42" />
        </div>
        <div class="form-group">
          <label class="form-label">FPS</label>
          <input v-model.number="form.fps" type="number" class="form-input form-input-sm" min="1" max="60" placeholder="24" />
        </div>
      </div>

      <p v-if="constraintHint" class="hint constraint-hint">⚠️ {{ constraintHint }}</p>

      <div class="form-group">
        <label class="form-label">GCS 輸出路徑（Vertex AI 進階）</label>
        <input
          v-model="form.outputGcsUri"
          type="text"
          class="form-input"
          placeholder="gs://your-bucket/veo-output/"
        />
        <p class="hint">
          Extend、較大輸出或特定模型組合時，Vertex AI 可能要求提供 `outputGcsUri`。
        </p>
      </div>

      <div class="form-group">
        <label class="form-label">Negative Prompt</label>
        <textarea
          v-model="form.negativePrompt"
          class="form-textarea"
          placeholder="指定不要出現的內容，例如 blur, distortion, text overlay。"
        />
      </div>

      <!-- Start Image Block -->
      <div v-if="form.sourceMode === 'image' || form.sourceMode === 'frames'" class="asset-block" @dragover.prevent @drop="$emit('start-image-drop', $event)">
        <div class="asset-head">
          <span>起始圖片</span>
          <div class="asset-head-actions">
            <button
              v-if="form.image && !expandingImage"
              class="btn btn-secondary btn-sm"
              @click="$emit('expand-border', 'start')"
              title="在圖片四周加上邊距，防止裁切"
            >🔲 拓展邊界</button>
            <span v-if="expandingImage === 'start'" class="expanding-hint">拓展中...</span>
            <button
              v-if="form.image && form.sourceMode === 'frames'"
              class="btn btn-secondary btn-sm"
              @click="$emit('copy-start-to-end')"
            >📋 套用到結尾</button>
            <label class="btn btn-secondary btn-sm">
              上傳圖片
              <input type="file" accept="image/*" hidden @change="$emit('image-upload', $event)" />
            </label>
          </div>
        </div>
        <div v-if="imagePreview" class="asset-preview">
          <img :src="imagePreview" alt="Start frame preview" />
        </div>
        <div v-if="form.image" class="expand-options">
          <label class="form-label" style="font-size:11px;margin-bottom:4px;">邊界填充色</label>
          <div class="expand-color-row">
            <button
              v-for="c in expandColors"
              :key="c.value"
              class="color-chip"
              :class="{ active: expandColor === c.value }"
              :style="{ background: c.value }"
              :title="c.label"
              @click="$emit('update:expandColor', c.value)"
            />
          </div>
        </div>
      </div>

      <!-- End Image Block -->
      <div v-if="form.sourceMode === 'frames'" class="asset-block" @dragover.prevent @drop="$emit('end-image-drop', $event)">
        <div class="asset-head">
          <span>結尾圖片</span>
          <div class="asset-head-actions">
            <button
              v-if="form.lastFrame && !expandingImage"
              class="btn btn-secondary btn-sm"
              @click="$emit('expand-border', 'end')"
              title="在圖片四周加上邊距，防止裁切"
            >🔲 拓展邊界</button>
            <span v-if="expandingImage === 'end'" class="expanding-hint">拓展中...</span>
            <label class="btn btn-secondary btn-sm">
              上傳結尾圖
              <input type="file" accept="image/*" hidden @change="$emit('last-frame-upload', $event)" />
            </label>
          </div>
        </div>
        <div v-if="lastFramePreview" class="asset-preview">
          <img :src="lastFramePreview" alt="Last frame preview" />
        </div>
      </div>

      <!-- Reference Slots -->
      <VeoReferenceSlots
        v-if="form.sourceMode === 'references'"
        ref="refSlotsRef"
        :reference-images="form.referenceImages"
        :can-add-ref="canAddRef"
        :optimizing="optimizing"
        @add-reference="$emit('add-reference', $event)"
        @remove-reference="$emit('remove-reference', $event)"
        @change-ref-type="(index: number, type: 'ASSET' | 'STYLE') => $emit('change-ref-type', index, type)"
        @optimize-refs="$emit('optimize-refs', $event)"
        @update-descriptions="$emit('update-descriptions', $event)"
        @drop-reference="(e: DragEvent, idx: number) => $emit('drop-reference', e, idx)"
      />

      <!-- Extend Video Block -->
      <div v-if="form.sourceMode === 'extend'" class="asset-block" @dragover.prevent @drop="$emit('video-drop', $event)">
        <div class="asset-head">
          <span>延長既有影片</span>
          <label class="btn btn-secondary btn-sm">
            上傳 MP4
            <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden @change="$emit('video-upload', $event)" />
          </label>
        </div>
        <div class="extend-choice">
          <select :value="selectedSourceVideo" class="form-select" @change="$emit('apply-existing-video', ($event.target as HTMLSelectElement).value)">
            <option value="">或改用已生成影片</option>
            <option v-for="option in completedVideoOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div v-if="videoPreview" class="asset-preview video-preview">
          <video :src="videoPreview" controls playsinline />
        </div>
      </div>

      <div class="toggle-row">
        <label class="toggle-item">
          <input v-model="form.enhancePrompt" type="checkbox" />
          自動強化 prompt
        </label>
        <label class="toggle-item">
          <input v-model="form.generateAudio" type="checkbox" />
          同步生成音訊
        </label>
        <label class="toggle-item">
          <input :checked="lossless" type="checkbox" @change="$emit('update:lossless', ($event.target as HTMLInputElement).checked)" />
          Lossless 壓縮
        </label>
      </div>

      <div class="submit-row">
        <p class="hint">
          {{ submitHint }}
        </p>
        <button class="btn btn-primary" :disabled="submitting || !configured" @click="$emit('submit')">
          {{ submitting ? '送出中...' : '開始生成' }}
        </button>
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import VeoReferenceSlots from './VeoReferenceSlots.vue'
import type { VeoInlineAsset, VeoReferenceAsset, VeoSourceMode } from '../../api/veo'

export interface VeoFormState {
  sourceMode: VeoSourceMode
  prompt: string
  negativePrompt: string
  model: string
  aspectRatio: '16:9' | '9:16'
  resolution: '720p' | '1080p'
  durationSeconds: number
  numberOfVideos: number
  seed: number | null
  enhancePrompt: boolean
  generateAudio: boolean
  personGeneration: 'dont_allow' | 'allow_adult'
  fps: number | null
  outputGcsUri: string
  image: VeoInlineAsset | null
  lastFrame: VeoInlineAsset | null
  referenceImages: VeoReferenceAsset[]
  video: VeoInlineAsset | null
  sourceVideoRef: { jobId: string; index: number } | null
}

interface CompletedVideoOption {
  value: string
  label: string
  localUrl: string
}

const props = defineProps<{
  form: VeoFormState
  sourceModes: readonly { value: string; label: string; icon: string }[]
  allowedDurations: number[]
  allowedResolutions: string[]
  constraintHint: string
  submitHint: string
  configured: boolean
  submitting: boolean
  errorMessage: string
  lossless: boolean
  expandColor: string
  expandingImage: 'start' | 'end' | null
  imagePreview: string
  lastFramePreview: string
  videoPreview: string
  selectedSourceVideo: string
  completedVideoOptions: CompletedVideoOption[]
  canAddRef: boolean
  optimizing: boolean
}>()

defineEmits<{
  'switch-mode': [mode: VeoSourceMode]
  'update:lossless': [value: boolean]
  'update:expandColor': [value: string]
  'expand-border': [target: 'start' | 'end']
  'copy-start-to-end': []
  'image-upload': [event: Event]
  'last-frame-upload': [event: Event]
  'video-upload': [event: Event]
  'start-image-drop': [event: DragEvent]
  'end-image-drop': [event: DragEvent]
  'video-drop': [event: DragEvent]
  'drop-reference': [event: DragEvent, index: number]
  'add-reference': [asset: VeoReferenceAsset]
  'remove-reference': [index: number]
  'change-ref-type': [index: number, type: 'ASSET' | 'STYLE']
  'optimize-refs': [combined: string]
  'update-descriptions': [descriptions: string[]]
  'apply-existing-video': [value: string]
  'submit': []
}>()

const needsPrompt = computed(() => props.form.sourceMode !== 'image')

const expandColors = [
  { value: '#000000', label: '黑色' },
  { value: '#ffffff', label: '白色' },
  { value: '#808080', label: '灰色' },
  { value: '#00b140', label: '綠幕' },
]

const refSlotsRef = ref<InstanceType<typeof VeoReferenceSlots> | null>(null)

defineExpose({
  refSlotsRef,
})
</script>

<style scoped>
.veo-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.veo-params-grid {
  display: grid;
  grid-template-columns: 1.5fr repeat(5, 1fr) repeat(2, 1fr);
  gap: 10px;
}

.veo-params-grid .form-group {
  gap: 4px;
}

.form-select-sm,
.form-input-sm {
  padding: 6px 8px;
  font-size: 12px;
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

.veo-textarea {
  min-height: 124px;
}

.asset-block {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  padding: 14px;
}

.asset-head-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.expanding-hint {
  font-size: 11px;
  color: var(--accent-purple);
  animation: pulse 1s infinite;
}

.expand-options {
  margin-top: 8px;
}

.expand-color-row {
  display: flex;
  gap: 6px;
}

.color-chip {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
}

.color-chip:hover {
  transform: scale(1.15);
}

.color-chip.active {
  border-color: var(--accent-purple);
  box-shadow: 0 0 0 2px rgba(124,58,237,0.4);
}

.asset-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.asset-preview {
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-base);
  border: 1px solid var(--border);
  min-height: 180px;
}

.asset-preview img,
.asset-preview video {
  width: 100%;
  display: block;
  object-fit: cover;
  max-height: 280px;
}

.toggle-row {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}

.toggle-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.submit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.hint {
  color: var(--text-secondary);
  font-size: 12px;
  max-width: 640px;
}

.constraint-hint {
  color: #fbbf24;
  margin-top: -4px;
}

.error-text {
  color: #fda4af;
  font-size: 12px;
  line-height: 1.5;
}

.extend-choice {
  margin-bottom: 12px;
}

@media (max-width: 720px) {
  .submit-row,
  .asset-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
