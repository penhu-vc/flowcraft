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
      <template v-if="form.sourceMode === 'reference' && !multiAngle">
        <!-- Reference sub-mode toggle -->
        <div class="ref-submode-strip">
          <button class="ref-submode-pill" :class="{ active: refSubMode === 'normal' }" @click="refSubMode = 'normal'">
            🖼️ 一般參考圖
          </button>
          <button class="ref-submode-pill" :class="{ active: refSubMode === 'ai-closeup' }" @click="refSubMode = 'ai-closeup'">
            🤖 AI 特寫
          </button>
        </div>

        <!-- Normal reference panel -->
        <NanoReferencePanel
          v-if="refSubMode === 'normal'"
          :reference-images="form.referenceImages"
          :ref-descriptions="refDescriptions"
          :optimizer-disabled="optimizerDisabled"
          @update:reference-images="form.referenceImages = $event"
          @update:ref-descriptions="$emit('update:refDescriptions', $event)"
          @open-lightbox="$emit('open-lightbox', $event)"
          @run-ref-optimizer="$emit('run-ref-optimizer')"
        />

        <!-- AI 特寫 panel -->
        <div v-if="refSubMode === 'ai-closeup'" class="ai-closeup-panel">

          <!-- Sub-mode toggle -->
          <div class="aic-submode-strip">
            <button class="aic-submode-pill" :class="{ active: aicSubMode === 'subjects' }" @click="aicSubMode = 'subjects'">
              🔍 分析主體
            </button>
            <button class="aic-submode-pill" :class="{ active: aicSubMode === 'angles' }" @click="aicSubMode = 'angles'">
              📐 不同角度
            </button>
          </div>

          <!-- Step 1: Upload scene image -->
          <div class="aic-step">
            <div class="aic-step-label">① 上傳場景圖</div>
            <label v-if="!aiCloseupImage" class="aic-upload-slot" @dragover.prevent @drop="onAicDrop">
              <span class="aic-upload-plus">+</span>
              <span class="aic-upload-hint">上傳場景參考圖 / 拖曳</span>
              <input type="file" accept="image/*" hidden @change="onAicImageUpload" />
            </label>
            <div v-else class="aic-preview-row">
              <img :src="aiCloseupImage.previewUrl" class="aic-preview-img" @click="$emit('open-lightbox', aiCloseupImage.previewUrl!)" />
              <div class="aic-preview-actions">
                <button class="btn btn-secondary btn-sm" @click="aiCloseupImage = null; detectedSubjects = []">🗑 換圖</button>
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="analyzingSubjects"
                  @click="onAnalyzeSubjects"
                >
                  {{ analyzingSubjects ? '🔍 分析中...' : '🔍 分析主體' }}
                </button>
              </div>
            </div>
          </div>

          <!-- 分析主體 Step 2 -->
          <template v-if="aicSubMode === 'subjects'">
            <div v-if="detectedSubjects.length > 0" class="aic-step">
              <div class="aic-step-label">
                ② 選擇要特寫的主體
                <span class="aic-selected-count">已選 {{ selectedSubjectIds.size }} / {{ detectedSubjects.length }}</span>
              </div>
              <div class="aic-subjects-grid">
                <label
                  v-for="subject in detectedSubjects"
                  :key="subject.id"
                  class="aic-subject-card"
                  :class="{ selected: selectedSubjectIds.has(subject.id) }"
                >
                  <input
                    type="checkbox"
                    :checked="selectedSubjectIds.has(subject.id)"
                    @change="toggleSubject(subject.id)"
                  />
                  <div class="aic-subject-body">
                    <div class="aic-subject-name">{{ subject.name }}</div>
                    <div class="aic-subject-desc">{{ subject.description }}</div>
                  </div>
                </label>
              </div>
              <div class="aic-select-actions">
                <button class="btn btn-secondary btn-sm" @click="selectAllSubjects">全選</button>
                <button class="btn btn-secondary btn-sm" @click="selectedSubjectIds.clear()">清除</button>
              </div>
            </div>
            <div v-if="analyzingSubjects" class="aic-analyzing">
              <div class="aic-spinner" />
              <span>AI 正在分析場景主體...</span>
            </div>
          </template>

          <!-- 不同角度 Step 2 -->
          <div v-if="aicSubMode === 'angles'" class="aic-step">
            <div class="aic-step-label">
              ② 選擇角度
              <span class="aic-selected-count">已選 {{ sceneAngleShots.filter(s => s.enabled).length }} 個</span>
            </div>
            <div class="aic-angle-grid">
              <label
                v-for="shot in sceneAngleShots"
                :key="shot.key"
                class="aic-angle-card"
                :class="{ selected: shot.enabled }"
              >
                <input type="checkbox" v-model="shot.enabled" />
                <span class="aic-angle-icon">{{ shot.icon }}</span>
                <span class="aic-angle-label">{{ shot.label }}</span>
              </label>
            </div>
            <div class="aic-select-actions">
              <button class="btn btn-secondary btn-sm" @click="sceneAngleShots.forEach(s => s.enabled = true)">全選</button>
              <button class="btn btn-secondary btn-sm" @click="sceneAngleShots.forEach(s => s.enabled = false)">清除</button>
            </div>
          </div>
        </div>
      </template>

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
        <!-- AI 特寫模式 submit -->
        <template v-if="form.sourceMode === 'reference' && refSubMode === 'ai-closeup' && !multiAngle">
          <!-- 分析主體 submit -->
          <button
            v-if="aicSubMode === 'subjects'"
            class="btn btn-primary"
            :disabled="submitting || !aiCloseupImage || selectedSubjectIds.size === 0"
            @click="onAiCloseupSubmit"
          >
            {{ submitting ? '生成中...' : `🔍 生成 ${selectedSubjectIds.size} 個特寫` }}
          </button>
          <!-- 不同角度 submit -->
          <button
            v-else
            class="btn btn-primary"
            :disabled="submitting || !aiCloseupImage || !sceneAngleShots.some(s => s.enabled)"
            @click="onAiAnglesSubmit"
          >
            {{ submitting ? '生成中...' : `📐 生成 ${sceneAngleShots.filter(s => s.enabled).length} 個角度` }}
          </button>
        </template>
        <!-- 多角度 submit -->
        <button
          v-else-if="multiAngle"
          class="btn btn-primary"
          :disabled="submitting || !canSubmit || !angleShots.some(s => s.enabled)"
          @click="onMultiAngleSubmit"
        >
          {{ submitting ? '分析並生成中...' : `📐 生成 ${angleShots.filter(s => s.enabled).length} 個角度` }}
        </button>
        <!-- 一般 submit -->
        <button
          v-else
          class="btn btn-primary"
          :disabled="submitting || !canSubmit"
          @click="$emit('submit')"
        >
          {{ submitting ? '生成中...' : '🎨 生成圖片' }}
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
import type { NanoInlineAsset, NanoSourceMode, SceneSubject } from '../../api/nano'
import { analyzeNanoSubjects } from '../../api/nano'
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
  (e: 'submit-ai-closeup', subjects: SceneSubject[], image: NanoInlineAsset): void
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

// ── Reference sub-mode ──
const refSubMode = ref<'normal' | 'ai-closeup'>('normal')

// ── AI 特寫 sub-mode ──
const aicSubMode = ref<'subjects' | 'angles'>('subjects')

// ── AI 特寫 state ──
const aiCloseupImage = ref<NanoInlineAsset | null>(null)
const analyzingSubjects = ref(false)
const detectedSubjects = ref<SceneSubject[]>([])
const selectedSubjectIds = ref(new Set<string>())

async function onAicImageUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  aiCloseupImage.value = await fileToAsset(file)
  detectedSubjects.value = []
  selectedSubjectIds.value.clear()
  ;(e.target as HTMLInputElement).value = ''
}

async function onAicDrop(e: DragEvent) {
  e.preventDefault()

  // 原生檔案拖曳（從 OS / 資料夾）
  const files = e.dataTransfer?.files
  if (files?.length) {
    const file = Array.from(files).find(f => f.type.startsWith('image/'))
    if (file) {
      aiCloseupImage.value = await fileToAsset(file)
      detectedSubjects.value = []
      selectedSubjectIds.value.clear()
      return
    }
  }

  // 內部素材囊拖曳（application/x-flowcraft-asset）
  const dropped = getDroppedAssetData(e)
  if (!dropped?.url) return
  const { url, mime } = dropped
  aiCloseupImage.value = await urlToAsset(url, mime)
  detectedSubjects.value = []
  selectedSubjectIds.value.clear()
}

async function onAnalyzeSubjects() {
  if (!aiCloseupImage.value) return
  analyzingSubjects.value = true
  detectedSubjects.value = []
  selectedSubjectIds.value.clear()
  try {
    const result = await analyzeNanoSubjects(aiCloseupImage.value)
    detectedSubjects.value = result.subjects
    // 預設全選
    selectedSubjectIds.value = new Set(result.subjects.map(s => s.id))
  } finally {
    analyzingSubjects.value = false
  }
}

function toggleSubject(id: string) {
  if (selectedSubjectIds.value.has(id)) {
    selectedSubjectIds.value.delete(id)
  } else {
    selectedSubjectIds.value.add(id)
  }
  // Trigger reactivity
  selectedSubjectIds.value = new Set(selectedSubjectIds.value)
}

function selectAllSubjects() {
  selectedSubjectIds.value = new Set(detectedSubjects.value.map(s => s.id))
}

function onAiCloseupSubmit() {
  if (!aiCloseupImage.value || selectedSubjectIds.value.size === 0) return
  const selected = detectedSubjects.value.filter(s => selectedSubjectIds.value.has(s.id))
  emit('submit-ai-closeup', selected, aiCloseupImage.value)
}

function onAiAnglesSubmit() {
  const enabled = sceneAngleShots.value.filter(s => s.enabled)
  if (!aiCloseupImage.value || enabled.length === 0) return
  const shots = enabled.map(s => ({
    key: s.key,
    label: s.label,
    extraPrompt: s.prompt,
    refImage: null as NanoInlineAsset | null,
  }))
  // 把場景圖放進 form.referenceImages 然後走多角度流程
  props.form.referenceImages = [aiCloseupImage.value]
  emit('submit-multi-angle', shots)
}

// ── 場景角度選項（適合場景，不限角色）──
interface SceneAngleShot {
  key: string
  icon: string
  label: string
  prompt: string
  enabled: boolean
}

const sceneAngleShots = ref<SceneAngleShot[]>([
  { key: 'front',               icon: '⬜', label: '正面',   enabled: true,
    prompt: 'The exact same scene and environment, only the camera viewpoint changes. Camera positioned directly in front of the scene at eye level, straight-on frontal shot. All scene elements, lighting, and atmosphere remain identical.' },
  { key: 'left-side',           icon: '◁',  label: '左側面', enabled: true,
    prompt: 'The exact same scene and environment, only the camera viewpoint changes. Camera repositioned to the far left side of the scene, 90 degrees lateral view. All scene elements, props, and lighting are identical, seen from the left profile.' },
  { key: 'right-side',          icon: '▷',  label: '右側面', enabled: false,
    prompt: 'The exact same scene and environment, only the camera viewpoint changes. Camera repositioned to the far right side of the scene, 90 degrees lateral view. All scene elements, props, and lighting are identical, seen from the right profile.' },
  { key: 'back',                icon: '🔙', label: '背面',   enabled: false,
    prompt: 'The exact same scene and environment, only the camera viewpoint changes. Camera moved to the back of the scene looking forward, showing what is behind the original viewpoint. All scene elements remain unchanged, reverse perspective.' },
  { key: 'three-quarter-left',  icon: '↖️', label: '左斜前', enabled: true,
    prompt: 'The exact same scene and environment, only the camera viewpoint changes. Camera positioned at a 45-degree angle from the front-left corner. All scene contents identical, three-quarter left diagonal perspective.' },
  { key: 'three-quarter-right', icon: '↗️', label: '右斜前', enabled: false,
    prompt: 'The exact same scene and environment, only the camera viewpoint changes. Camera positioned at a 45-degree angle from the front-right corner. All scene contents identical, three-quarter right diagonal perspective.' },
  { key: 'bird-eye',            icon: '🦅', label: '鳥瞰',   enabled: false,
    prompt: 'The exact same scene and environment, only the camera viewpoint changes. Camera placed directly overhead looking straight down at the scene from above. Top-down aerial perspective, all scene elements are identical but seen from a bird\'s eye view.' },
  { key: 'high-angle',          icon: '⬇️', label: '高角度', enabled: false,
    prompt: 'The exact same scene and environment, only the camera viewpoint changes. Camera elevated high and tilted downward at 45 degrees onto the scene. Overhead oblique perspective, all scene contents unchanged.' },
  { key: 'low-angle',           icon: '⬆️', label: '低角度', enabled: false,
    prompt: 'The exact same scene and environment, only the camera viewpoint changes. Camera placed very low near ground level pointing upward at the scene. Ground-level perspective looking up, all scene elements identical.' },
  { key: 'wide',                icon: '🌅', label: '遠景',   enabled: true,
    prompt: 'The exact same scene and environment, only the camera distance changes. Camera pulled far back to capture the entire scene as a wide establishing shot, showing the full environment and surroundings.' },
  { key: 'medium',              icon: '📸', label: '中景',   enabled: false,
    prompt: 'The exact same scene and environment, only the camera distance changes. Camera at a moderate distance, medium shot showing the main scene elements centered in frame.' },
  { key: 'close-detail',        icon: '🔍', label: '細節特寫', enabled: false,
    prompt: 'The exact same scene and environment, camera zoomed in close to capture fine details and textures within the scene. Extreme close-up of a key environmental element, all scene materials and atmosphere identical.' },
])

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

/* ── AI 特寫 sub-mode strip ── */
.aic-submode-strip {
  display: flex;
  gap: 6px;
}
.aic-submode-pill {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.03);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: var(--transition);
}
.aic-submode-pill.active,
.aic-submode-pill:hover {
  color: var(--text-primary);
  border-color: rgba(139,92,246,0.4);
  background: rgba(139,92,246,0.12);
}

/* ── 角度選擇網格 ── */
.aic-angle-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}
.aic-angle-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.15s;
  opacity: 0.6;
  font-size: 12px;
}
.aic-angle-card.selected {
  opacity: 1;
  border-color: rgba(139,92,246,0.5);
  background: rgba(139,92,246,0.1);
}
.aic-angle-card input[type=checkbox] {
  accent-color: var(--accent);
  flex-shrink: 0;
}
.aic-angle-icon { font-size: 14px; }
.aic-angle-label { color: var(--text-primary); white-space: nowrap; }

/* ── Reference sub-mode strip ── */
.ref-submode-strip {
  display: flex;
  gap: 6px;
  margin-bottom: 2px;
}
.ref-submode-pill {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.03);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: var(--transition);
}
.ref-submode-pill.active,
.ref-submode-pill:hover {
  color: var(--text-primary);
  border-color: rgba(6, 182, 212, 0.35);
  background: rgba(6, 182, 212, 0.14);
}

/* ── AI 特寫 Panel ── */
.ai-closeup-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.aic-step {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.aic-step-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.aic-selected-count {
  font-weight: 400;
  color: var(--accent);
  font-size: 11px;
  background: rgba(139,92,246,0.15);
  padding: 2px 8px;
  border-radius: 20px;
}
.aic-upload-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 110px;
  border: 2px dashed rgba(255,255,255,0.15);
  border-radius: 10px;
  cursor: pointer;
  transition: var(--transition);
  background: transparent;
}
.aic-upload-slot:hover {
  border-color: rgba(6,182,212,0.5);
  background: rgba(6,182,212,0.06);
}
.aic-upload-plus {
  font-size: 26px;
  color: var(--text-secondary);
  line-height: 1;
}
.aic-upload-hint {
  font-size: 12px;
  color: var(--text-secondary);
}
.aic-preview-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.aic-preview-img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: pointer;
  flex-shrink: 0;
}
.aic-preview-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.aic-subjects-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.aic-subject-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.15s;
  opacity: 0.65;
}
.aic-subject-card.selected {
  opacity: 1;
  border-color: rgba(6,182,212,0.5);
  background: rgba(6,182,212,0.08);
}
.aic-subject-card input[type=checkbox] {
  margin-top: 2px;
  flex-shrink: 0;
  accent-color: var(--accent);
}
.aic-subject-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.aic-subject-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.aic-subject-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.aic-select-actions {
  display: flex;
  gap: 6px;
}
.aic-analyzing {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(6,182,212,0.06);
  border: 1px solid rgba(6,182,212,0.2);
  font-size: 13px;
  color: var(--text-secondary);
}
.aic-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(6,182,212,0.2);
  border-top-color: rgba(6,182,212,0.8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

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
