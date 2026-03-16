<template>
  <div class="topbar">
    <span class="topbar-title">🎬 Veo Studio</span>
    <div class="topbar-actions">
      <span class="badge" :class="statusBadgeClass">
        {{ veoStatus.configured ? `已連線 ${statusLabel}` : '尚未設定 Veo' }}
      </span>
      <button class="btn btn-secondary btn-sm" @click="loadAll">重新整理</button>
    </div>
  </div>

  <div class="page-content veo-page">
    <section class="veo-hero card">
      <div class="veo-hero-copy">
        <span class="veo-kicker">Google Veo 直連工作台</span>
        <h1>同一頁完成生成、延長、參考圖控制、輪詢與下載。</h1>
        <p>
          支援 text-to-video、image-to-video、first/last frame、reference images、extend existing video。
        </p>
      </div>
      <div class="veo-hero-stats">
        <div class="veo-stat">
          <strong>{{ jobs.length }}</strong>
          <span>總任務</span>
        </div>
        <div class="veo-stat">
          <strong>{{ activeJobs.length }}</strong>
          <span>進行中</span>
        </div>
        <div class="veo-stat">
          <strong>{{ completedJobs.length }}</strong>
          <span>已完成</span>
        </div>
      </div>
    </section>

    <section class="card optimizer-card">
      <div class="card-header">
        <span class="card-title">✨ Gemini Prompt 優化器</span>
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

        <div class="optimizer-input-row">
          <textarea
            v-model="optimizerInput"
            class="form-textarea optimizer-textarea"
            placeholder="用中文或英文描述你想生成的影片，例如：一個女生在咖啡廳看書，陽光灑進來，慢動作翻頁"
          />
          <button
            class="btn btn-primary optimizer-btn"
            :disabled="optimizing || !optimizerInput.trim()"
            @click="runOptimizer"
          >
            {{ optimizing ? '分析中...' : '優化' }}
          </button>
        </div>

        <div v-if="optimizing" class="optimizer-status">
          <div class="optimizer-step" :class="{ active: optimizeStep === 1 }">
            <span class="step-dot" />
            Step 1: 分析內容，決定參考哪些 Guide 分類...
          </div>
          <div class="optimizer-step" :class="{ active: optimizeStep === 2 }">
            <span class="step-dot" />
            Step 2: 載入對應段落，Gemini 優化 Prompt...
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
                <td class="comp-value">{{ optimizeResult.negativePrompt || '—' }}</td>
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

    <div class="veo-grid">
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
              @click="switchMode(item.value)"
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

          <div v-if="form.sourceMode === 'image' || form.sourceMode === 'frames'" class="asset-block">
            <div class="asset-head">
              <span>起始圖片</span>
              <div class="asset-head-actions">
                <button
                  v-if="form.image && !expandingImage"
                  class="btn btn-secondary btn-sm"
                  @click="expandImageBorder('start')"
                  title="在圖片四周加上邊距，防止裁切"
                >🔲 拓展邊界</button>
                <span v-if="expandingImage === 'start'" class="expanding-hint">拓展中...</span>
                <button
                  v-if="form.image && form.sourceMode === 'frames'"
                  class="btn btn-secondary btn-sm"
                  @click="copyStartToEnd"
                >📋 套用到結尾</button>
                <label class="btn btn-secondary btn-sm">
                  上傳圖片
                  <input type="file" accept="image/*" hidden @change="onImageUpload" />
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
                  @click="expandColor = c.value"
                />
              </div>
            </div>
          </div>

          <div v-if="form.sourceMode === 'frames'" class="asset-block">
            <div class="asset-head">
              <span>結尾圖片</span>
              <div class="asset-head-actions">
                <button
                  v-if="form.lastFrame && !expandingImage"
                  class="btn btn-secondary btn-sm"
                  @click="expandImageBorder('end')"
                  title="在圖片四周加上邊距，防止裁切"
                >🔲 拓展邊界</button>
                <span v-if="expandingImage === 'end'" class="expanding-hint">拓展中...</span>
                <label class="btn btn-secondary btn-sm">
                  上傳結尾圖
                  <input type="file" accept="image/*" hidden @change="onLastFrameUpload" />
                </label>
              </div>
            </div>
            <div v-if="lastFramePreview" class="asset-preview">
              <img :src="lastFramePreview" alt="Last frame preview" />
            </div>
          </div>

          <div v-if="form.sourceMode === 'references'" class="asset-block">
            <div class="asset-head">
              <span>參考圖片</span>
              <span class="ref-rule-hint ref-tooltip-wrap">
                Asset 最多 3 張 · Style 最多 1 張 <span class="hint-icon">?</span>
                <span class="ref-tooltip">
                  <strong>🎯 Asset（素材）</strong><br/>
                  告訴 Veo「這個東西長什麼樣子」<br/>
                  例：logo 圖、角色臉、產品照片<br/><br/>
                  <strong>🎨 Style（風格）</strong><br/>
                  告訴 Veo「要這種視覺感覺」<br/>
                  例：賽博龐克風截圖、油畫風格的圖
                </span>
              </span>
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
                    <label v-if="canAddRef" class="ref-slot-empty">
                      <span class="ref-slot-plus">+</span>
                      <span class="ref-slot-label">上傳圖片</span>
                      <input type="file" accept="image/*" hidden @change="onRefSlotUpload($event, slot - 1)" />
                    </label>
                    <div v-else class="ref-slot-empty ref-slot-locked">
                      <span class="ref-slot-label">已滿</span>
                    </div>
                  </template>
                </div>
                <input
                  v-model="refDescriptions[slot - 1]"
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
              @click="runRefOptimizer"
            >
              ✨ 一鍵優化指令
            </button>
          </div>

          <div v-if="form.sourceMode === 'extend'" class="asset-block">
            <div class="asset-head">
              <span>延長既有影片</span>
              <label class="btn btn-secondary btn-sm">
                上傳 MP4
                <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden @change="onVideoUpload" />
              </label>
            </div>
            <div class="extend-choice">
              <select v-model="selectedSourceVideo" class="form-select" @change="applyExistingVideo">
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
              <input v-model="lossless" type="checkbox" />
              Lossless 壓縮
            </label>
          </div>

          <div class="submit-row">
            <p class="hint">
              {{ submitHint }}
            </p>
            <button class="btn btn-primary" :disabled="submitting || !veoStatus.configured" @click="submit">
              {{ submitting ? '送出中...' : '開始生成' }}
            </button>
          </div>

          <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        </div>
      </section>

      <section class="veo-side-column">
        <div class="card">
          <div class="card-header">
            <span class="card-title">即時任務</span>
          </div>
          <div class="card-body status-stack">
            <div v-if="activeJobs.length === 0" class="empty-state compact-empty">
              <div class="empty-state-icon">⏳</div>
              <div class="empty-state-title">目前沒有進行中的生成</div>
              <div class="empty-state-desc">送出後會自動輪詢進度，完成後會出現在下方作品區。</div>
            </div>
            <div v-for="job in activeJobs" :key="job.id" class="status-card">
              <div class="status-card-head">
                <div>
                  <strong>{{ modeLabelMap[job.sourceMode] }}</strong>
                  <div class="mini-meta">{{ formatDate(job.createdAt) }}</div>
                </div>
                <span class="badge badge-ai">{{ job.status }}</span>
              </div>
              <p class="status-prompt">{{ job.prompt || '無文字 prompt' }}</p>
              <div class="progress-shell">
                <div class="progress-bar" :style="{ width: `${job.progress || 12}%` }" />
              </div>
              <div class="mini-meta">Operation: {{ job.operationName }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">連線狀態</span>
          </div>
          <div class="card-body status-stack">
            <div class="status-line">
              <span>認證模式</span>
              <strong>{{ statusLabel }}</strong>
            </div>
            <div class="status-line">
              <span>狀態訊息</span>
              <strong>{{ veoStatus.message }}</strong>
            </div>
            <div class="status-line">
              <span>支援模式</span>
              <strong>text / image / frames / references / extend</strong>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-header">
        <span class="card-title">作品與歷史</span>
      </div>
      <div class="card-body">
        <div v-if="jobs.length === 0" class="empty-state">
          <div class="empty-state-icon">🎞️</div>
          <div class="empty-state-title">尚未有任何 Veo 任務</div>
          <div class="empty-state-desc">建立第一支影片後，這裡會保留可下載、可延長的歷史紀錄。</div>
        </div>

        <div v-else class="history-grid">
          <article v-for="job in jobs" :key="job.id" class="history-card">
            <div class="history-head">
              <div>
                <strong>{{ modeLabelMap[job.sourceMode] }}</strong>
                <div class="mini-meta">{{ job.model }} · {{ formatDate(job.createdAt) }}</div>
              </div>
              <div class="history-actions">
                <span class="badge" :class="job.status === 'completed' ? 'badge-active' : job.status === 'failed' ? 'badge-trigger' : 'badge-ai'">
                  {{ job.status }}
                </span>
                <button class="btn btn-danger btn-sm" @click="removeJob(job.id)">刪除</button>
              </div>
            </div>
            <p class="history-prompt">{{ job.prompt || '無文字 prompt' }}</p>
            <p v-if="job.error" class="error-text">{{ job.error }}</p>

            <div v-if="job.outputs.length > 0" class="video-grid">
              <div v-for="output in job.outputs" :key="`${job.id}-${output.index}`" class="video-card">
                <video
                  v-if="output.localUrl"
                  :src="resolveMediaUrl(output.localUrl)"
                  controls
                  playsinline
                />
                <div class="video-actions">
                  <a v-if="output.localUrl" class="btn btn-secondary btn-sm" :href="resolveMediaUrl(output.localUrl)" target="_blank" rel="noreferrer">
                    開啟
                  </a>
                  <button class="btn btn-primary btn-sm" @click="useForExtend(job.id, output.index, output.localUrl)">
                    延長這支
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { API_BASE_URL, API_ENDPOINTS } from '../api/config'
import {
  createVeoJob,
  deleteVeoJob,
  fetchVeoJob,
  fetchVeoJobs,
  fetchVeoStatus,
  type VeoGenerationPayload,
  type VeoInlineAsset,
  type VeoJob,
  type VeoReferenceAsset,
  type VeoSourceMode,
} from '../api/veo'

// ── Optimizer State ──
interface OptimizeComponents {
  subject: string
  context: string
  action: string
  style: string
  camera: string
  composition: string
  ambiance: string
  audio: string
}

interface OptimizeResult {
  components: OptimizeComponents
  fullPrompt: string
  negativePrompt: string
  sections: string[]
  sectionLabels: string[]
}

const optimizerInput = ref('')
const optimizerMode = ref<VeoSourceMode>('text')
const optimizing = ref(false)
const optimizeStep = ref(0)
const optimizeResult = ref<OptimizeResult | null>(null)
const optimizeError = ref('')
const copied = ref(false)

const componentRows = computed(() => {
  if (!optimizeResult.value) return []
  const c = optimizeResult.value.components
  return [
    { key: 'subject', icon: '👤', label: 'Subject', value: c.subject },
    { key: 'context', icon: '🏗️', label: 'Context', value: c.context },
    { key: 'action', icon: '🎬', label: 'Action', value: c.action },
    { key: 'style', icon: '🎨', label: 'Style', value: c.style },
    { key: 'camera', icon: '📹', label: 'Camera', value: c.camera },
    { key: 'composition', icon: '🖼️', label: 'Composition', value: c.composition },
    { key: 'ambiance', icon: '💡', label: 'Ambiance', value: c.ambiance },
    { key: 'audio', icon: '🎵', label: 'Audio', value: c.audio },
  ]
})

async function runOptimizer() {
  if (!optimizerInput.value.trim()) return
  optimizing.value = true
  optimizeStep.value = 1
  optimizeError.value = ''
  optimizeResult.value = null
  copied.value = false

  try {
    // 模擬 Step 1 → Step 2 過渡
    const stepTimer = setTimeout(() => { optimizeStep.value = 2 }, 2000)

    const res = await fetch(API_ENDPOINTS.veoOptimizePrompt, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: optimizerInput.value.trim(), mode: optimizerMode.value })
    })

    clearTimeout(stepTimer)
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '優化失敗')

    optimizeResult.value = {
      components: data.components,
      fullPrompt: data.fullPrompt,
      negativePrompt: data.negativePrompt,
      sections: data.sections,
      sectionLabels: data.sectionLabels
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
    + (optimizeResult.value.negativePrompt ? `\n\nNegative prompt: ${optimizeResult.value.negativePrompt}` : '')
  navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function useOptimizedPrompt() {
  if (!optimizeResult.value) return
  form.prompt = optimizeResult.value.fullPrompt
  if (optimizeResult.value.negativePrompt) {
    form.negativePrompt = optimizeResult.value.negativePrompt
  }
  // 同步模式到生成設定
  form.sourceMode = optimizerMode.value
}

// ── Veo State ──
const veoStatus = ref({
  configured: false,
  authMode: null as 'apiKey' | 'gcp' | null,
  message: '檢查中...',
})

const jobs = ref<VeoJob[]>([])
const submitting = ref(false)
const errorMessage = ref('')
const selectedSourceVideo = ref('')
const pollHandle = ref<number | null>(null)
const lossless = ref(false)

const sourceModes = [
  { value: 'text', label: '文字生成', icon: '✍️' },
  { value: 'image', label: '圖片生成', icon: '🖼️' },
  { value: 'frames', label: '首尾幀', icon: '🪟' },
  { value: 'references', label: '參考圖', icon: '🧷' },
  { value: 'extend', label: '延長影片', icon: '📼' },
] as const

const modeLabelMap: Record<VeoSourceMode, string> = {
  text: 'Text to Video',
  image: 'Image to Video',
  frames: 'First / Last Frame',
  references: 'Reference Images',
  extend: 'Extend Video',
}

// ── Per-Model Constraints ──
// key = "model::sourceMode", value = allowed durations
// fallback: if no specific sourceMode key, use "model::*"
const MODEL_DURATION_MAP: Record<string, number[]> = {
  // Veo 3.1
  'veo-3.1-generate-preview::text':       [4, 6, 8],
  'veo-3.1-generate-preview::image':      [8],
  'veo-3.1-generate-preview::frames':     [8],
  'veo-3.1-generate-preview::references': [8],
  'veo-3.1-generate-preview::extend':     [8],
  // Veo 3.0
  'veo-3.0-generate-preview::text':       [5, 6, 7, 8],
  'veo-3.0-generate-preview::image':      [8],
  'veo-3.0-generate-preview::frames':     [8],
  'veo-3.0-generate-preview::references': [8],
  'veo-3.0-generate-preview::extend':     [8],
  // Veo 2.0
  'veo-2.0-generate-001::text':           [5, 6, 7, 8],
  'veo-2.0-generate-001::image':          [5, 6, 7, 8],
  'veo-2.0-generate-001::frames':         [5, 6, 7, 8],
  'veo-2.0-generate-001::references':     [8],
  'veo-2.0-generate-001::extend':         [8],
}

// Models that support each source mode
const MODEL_SUPPORTED_MODES: Record<string, VeoSourceMode[]> = {
  'veo-3.1-generate-preview': ['text', 'image', 'frames', 'references', 'extend'],
  'veo-3.0-generate-preview': ['text', 'image', 'frames', 'references', 'extend'],
  'veo-2.0-generate-001':     ['text', 'image', 'frames', 'references', 'extend'],
}

// Resolution constraints per model
const MODEL_RESOLUTIONS: Record<string, string[]> = {
  'veo-3.1-generate-preview': ['720p'],
  'veo-3.0-generate-preview': ['720p'],
  'veo-2.0-generate-001':     ['720p', '1080p'],
}

const form = reactive<{
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
}>({
  sourceMode: 'text',
  prompt: '',
  negativePrompt: '',
  model: 'veo-3.1-generate-preview',
  aspectRatio: '16:9',
  resolution: '720p',
  durationSeconds: 4,
  numberOfVideos: 1,
  seed: null,
  enhancePrompt: true,
  generateAudio: false,
  personGeneration: 'allow_adult',
  fps: null,
  outputGcsUri: '',
  image: null,
  lastFrame: null,
  referenceImages: [],
  video: null,
  sourceVideoRef: null,
})

// ── Computed constraints (must be after form) ──
const allowedDurations = computed(() => {
  const key = `${form.model}::${form.sourceMode}`
  return MODEL_DURATION_MAP[key] || [8]
})

const allowedResolutions = computed(() => {
  return MODEL_RESOLUTIONS[form.model] || ['720p']
})

const constraintHint = computed(() => {
  const durations = allowedDurations.value
  if (durations.length === 1) {
    const modelShort = form.model.replace('-generate-preview', '').replace('-generate-001', '')
    const modeLabel = modeLabelMap[form.sourceMode] || form.sourceMode
    return `${modelShort} 的 ${modeLabel} 模式僅支援 ${durations[0]}s 片長`
  }
  return ''
})

// Auto-correct when model or sourceMode changes
watch([() => form.model, () => form.sourceMode], () => {
  const durations = allowedDurations.value
  if (!durations.includes(form.durationSeconds)) {
    form.durationSeconds = durations[0]
  }
  const resolutions = allowedResolutions.value
  if (!resolutions.includes(form.resolution)) {
    form.resolution = resolutions[0] as '720p' | '1080p'
  }
})

const activeJobs = computed(() => jobs.value.filter((job) => job.status === 'pending' || job.status === 'running'))
const completedJobs = computed(() => jobs.value.filter((job) => job.status === 'completed'))
const needsPrompt = computed(() => form.sourceMode !== 'image')
const imagePreview = computed(() => form.image?.previewUrl || '')
const lastFramePreview = computed(() => form.lastFrame?.previewUrl || '')
const videoPreview = computed(() => form.video?.previewUrl || (form.sourceVideoRef ? selectedExistingVideoUrl.value : ''))

const statusLabel = computed(() => veoStatus.value.authMode === 'gcp' ? 'Vertex AI' : veoStatus.value.authMode === 'apiKey' ? 'Gemini API Key' : '未設定')
const statusBadgeClass = computed(() => veoStatus.value.configured ? 'badge-active' : 'badge-trigger')
const submitHint = computed(() => {
  if (!veoStatus.value.configured) {
    return '先到設定頁存好 Gemini API Key 或 GCP 憑證，這裡才會真的送到 Veo。'
  }

  if (form.sourceMode === 'references') {
    return 'Reference 模式會吃 prompt + reference images，不能和一般 image/video 混用。'
  }

  if (form.sourceMode === 'extend') {
    return 'Extend 模式可直接上傳影片，或從下方歷史作品挑一支延長。'
  }

  return '送出後後端會建立長任務，頁面每 10 秒自動輪詢一次直到完成。'
})

const completedVideoOptions = computed(() =>
  completedJobs.value.flatMap((job) =>
    job.outputs.map((output) => ({
      value: `${job.id}:${output.index}`,
      label: `${formatDate(job.createdAt)} · ${modeLabelMap[job.sourceMode]} · #${output.index + 1}`,
      localUrl: output.localUrl || '',
    }))
  )
)

const selectedExistingVideoUrl = computed(() => {
  if (!form.sourceVideoRef) return ''
  const job = jobs.value.find((item) => item.id === form.sourceVideoRef?.jobId)
  const output = job?.outputs.find((item) => item.index === form.sourceVideoRef?.index)
  return output?.localUrl ? resolveMediaUrl(output.localUrl) : ''
})

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveMediaUrl(path: string) {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`
}

function resetMediaState() {
  form.image = null
  form.lastFrame = null
  form.referenceImages = []
  form.video = null
  form.sourceVideoRef = null
  selectedSourceVideo.value = ''
}

function switchMode(mode: VeoSourceMode) {
  form.sourceMode = mode
  errorMessage.value = ''
  resetMediaState()
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

async function onImageUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  form.image = await fileToAsset(file)
  form.sourceVideoRef = null
}

async function onLastFrameUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  form.lastFrame = await fileToAsset(file)
}

// ── Expand Border ──
const expandColor = ref('#000000')
const expandingImage = ref<'start' | 'end' | null>(null)
const expandColors = [
  { value: '#000000', label: '黑色' },
  { value: '#ffffff', label: '白色' },
  { value: '#808080', label: '灰色' },
  { value: '#00b140', label: '綠幕' },
]

function expandImageBorder(target: 'start' | 'end') {
  const asset = target === 'start' ? form.image : form.lastFrame
  if (!asset?.previewUrl) return

  expandingImage.value = target
  const img = new Image()
  img.onload = () => {
    const padding = 0.25 // 25% padding on each side
    const newW = Math.round(img.width * (1 + padding * 2))
    const newH = Math.round(img.height * (1 + padding * 2))
    const offsetX = Math.round(img.width * padding)
    const offsetY = Math.round(img.height * padding)

    const canvas = document.createElement('canvas')
    canvas.width = newW
    canvas.height = newH
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = expandColor.value
    ctx.fillRect(0, 0, newW, newH)
    ctx.drawImage(img, offsetX, offsetY, img.width, img.height)

    const dataUrl = canvas.toDataURL('image/png')
    // Extract base64 part
    const base64Data = dataUrl

    const expanded = {
      ...asset,
      previewUrl: dataUrl,
      base64Data,
      mimeType: 'image/png',
      fileName: `expanded-${asset.fileName || 'image.png'}`,
    }

    if (target === 'start') {
      form.image = expanded
    } else {
      form.lastFrame = expanded
    }
    expandingImage.value = null
  }
  img.src = asset.previewUrl
}

function copyStartToEnd() {
  if (!form.image) return
  form.lastFrame = { ...form.image }
}

// ── Reference Slots (4 fixed) ──
const refDescriptions = ref<string[]>(['', '', '', ''])

const hasAnyRefDescription = computed(() =>
  refDescriptions.value.some((d, i) => d.trim() && refSlots.value[i])
)

async function runRefOptimizer() {
  // Build combined description from all ref slot descriptions
  const parts: string[] = []
  refDescriptions.value.forEach((desc, i) => {
    const slot = refSlots.value[i]
    if (slot && desc.trim()) {
      const type = slot.referenceType === 'STYLE' ? '風格參考' : '素材參考'
      parts.push(`圖${i + 1}（${type}）：${desc.trim()}`)
    }
  })
  const combined = parts.join('\n')
  if (!combined) return

  // Set optimizer mode to references and fill the input
  optimizerMode.value = 'references'
  optimizerInput.value = combined
  // Trigger the optimizer
  await runOptimizer()
}

const refSlots = computed(() => {
  const slots: (VeoReferenceAsset | null)[] = [null, null, null, null]
  form.referenceImages.forEach((item, i) => {
    if (i < 4) slots[i] = item
  })
  return slots
})

const assetCount = computed(() => form.referenceImages.filter(r => r.referenceType === 'ASSET').length)
const styleCount = computed(() => form.referenceImages.filter(r => r.referenceType === 'STYLE').length)
const canAddRef = computed(() => form.referenceImages.length < 4 && (assetCount.value < 3 || styleCount.value < 1))

function canSetAsset(index: number) {
  const current = form.referenceImages[index]
  if (current?.referenceType === 'ASSET') return true
  return assetCount.value < 3
}

function canSetStyle(index: number) {
  const current = form.referenceImages[index]
  if (current?.referenceType === 'STYLE') return true
  return styleCount.value < 1
}

function onRefTypeChange(index: number, newType: 'ASSET' | 'STYLE') {
  if (newType === 'ASSET' && !canSetAsset(index)) return
  if (newType === 'STYLE' && !canSetStyle(index)) return
  form.referenceImages[index].referenceType = newType
}

async function onRefSlotUpload(event: Event, _slotIndex: number) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const asset = await fileToAsset(file)
  // Default to Asset, unless already 3 assets then Style
  const defaultType = assetCount.value < 3 ? 'ASSET' : 'STYLE'
  form.referenceImages.push({ ...asset, referenceType: defaultType } as VeoReferenceAsset)
  // Reset input so same file can be re-selected
  ;(event.target as HTMLInputElement).value = ''
}

async function onVideoUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  form.video = await fileToAsset(file)
  form.sourceVideoRef = null
  selectedSourceVideo.value = ''
}

function applyExistingVideo() {
  if (!selectedSourceVideo.value) {
    form.sourceVideoRef = null
    return
  }

  const [jobId = '', index = '0'] = selectedSourceVideo.value.split(':')
  form.sourceVideoRef = {
    jobId,
    index: Number(index),
  }
  form.video = null
}

function removeReference(index: number) {
  form.referenceImages.splice(index, 1)
  // Shift descriptions to match
  refDescriptions.value.splice(index, 1)
  refDescriptions.value.push('')
}

function buildPayload(): VeoGenerationPayload {
  return {
    sourceMode: form.sourceMode,
    prompt: form.prompt.trim() || undefined,
    negativePrompt: form.negativePrompt.trim() || undefined,
    model: form.model,
    aspectRatio: form.aspectRatio,
    resolution: form.resolution,
    durationSeconds: form.durationSeconds,
    numberOfVideos: form.numberOfVideos,
    seed: form.seed || undefined,
    enhancePrompt: form.enhancePrompt,
    generateAudio: form.generateAudio,
    personGeneration: form.personGeneration,
    fps: form.fps || undefined,
    outputGcsUri: form.outputGcsUri.trim() || undefined,
    compressionQuality: lossless.value ? 'LOSSLESS' : 'OPTIMIZED',
    image: form.image,
    lastFrame: form.lastFrame,
    referenceImages: form.referenceImages.map(({ base64Data, mimeType, fileName, referenceType }) => ({
      base64Data,
      mimeType,
      fileName,
      referenceType,
    })),
    video: form.video,
    sourceVideoRef: form.sourceVideoRef,
  }
}

async function submit() {
  errorMessage.value = ''
  submitting.value = true

  try {
    const { job } = await createVeoJob(buildPayload())
    jobs.value = [job, ...jobs.value.filter((item) => item.id !== job.id)]
    startPolling()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    submitting.value = false
  }
}

async function loadAll() {
  try {
    const [status, list] = await Promise.all([fetchVeoStatus(), fetchVeoJobs()])
    veoStatus.value = {
      configured: status.configured,
      authMode: status.authMode,
      message: status.message,
    }
    jobs.value = list.jobs
    if (activeJobs.value.length > 0) {
      startPolling()
    } else {
      stopPolling()
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

async function pollPendingJobs() {
  const pending = activeJobs.value
  if (pending.length === 0) {
    stopPolling()
    return
  }

  const results = await Promise.allSettled(pending.map((job) => fetchVeoJob(job.id)))
  const updates = new Map<string, VeoJob>()

  for (const result of results) {
    if (result.status === 'fulfilled') {
      updates.set(result.value.job.id, result.value.job)
    }
  }

  jobs.value = jobs.value.map((job) => updates.get(job.id) || job)
}

function startPolling() {
  if (pollHandle.value !== null) return
  pollHandle.value = window.setInterval(() => {
    void pollPendingJobs()
  }, 10000)
}

function stopPolling() {
  if (pollHandle.value === null) return
  window.clearInterval(pollHandle.value)
  pollHandle.value = null
}

async function removeJob(jobId: string) {
  await deleteVeoJob(jobId)
  jobs.value = jobs.value.filter((job) => job.id !== jobId)
}

function useForExtend(jobId: string, index: number, localUrl?: string) {
  form.sourceMode = 'extend'
  form.sourceVideoRef = { jobId, index }
  form.video = null
  selectedSourceVideo.value = `${jobId}:${index}`
  errorMessage.value = ''
  if (localUrl) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

onMounted(() => {
  void loadAll()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped>
.veo-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.veo-hero {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(6, 182, 212, 0.22), transparent 32%),
    radial-gradient(circle at bottom right, rgba(124, 58, 237, 0.26), transparent 30%),
    linear-gradient(135deg, rgba(16, 24, 40, 0.96), rgba(13, 13, 20, 0.98));
}

.veo-hero-copy {
  padding: 28px;
}

.veo-kicker {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-cyan);
  margin-bottom: 12px;
}

.veo-hero-copy h1 {
  font-size: 30px;
  line-height: 1.08;
  max-width: 680px;
  margin-bottom: 12px;
}

.veo-hero-copy p {
  color: var(--text-secondary);
  max-width: 640px;
}

.veo-hero-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-left: 1px solid var(--border);
}

.veo-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 24px;
}

.veo-stat strong {
  font-size: 32px;
}

.veo-stat span {
  color: var(--text-secondary);
  font-size: 12px;
}

.veo-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.8fr);
  gap: 16px;
}

.veo-side-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── Optimizer ─────────────────────────────────── */
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

.optimizer-btn {
  white-space: nowrap;
  min-width: 80px;
  align-self: stretch;
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

.reference-grid,
.video-grid,
.history-grid {
  display: grid;
  gap: 12px;
}

.reference-grid {
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}

/* ── Reference Slots (4 fixed) ── */
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

.reference-card,
.video-card,
.history-card,
.status-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.03);
}

.reference-card {
  overflow: hidden;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reference-card img {
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  border-radius: 8px;
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

.status-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.compact-empty {
  padding: 28px 16px;
}

.status-card,
.history-card {
  padding: 14px;
}

.status-card-head,
.history-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.status-prompt,
.history-prompt {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 10px;
}

.progress-shell {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-cyan), var(--accent-purple));
}

.status-line,
.mini-meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.status-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.history-grid {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.history-actions,
.video-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.video-card {
  padding: 10px;
}

.video-card video {
  width: 100%;
  border-radius: 10px;
  background: #000;
  margin-bottom: 10px;
}

.extend-choice {
  margin-bottom: 12px;
}

@media (max-width: 1100px) {
  .veo-grid,
  .veo-hero {
    grid-template-columns: 1fr;
  }

  .veo-hero-stats {
    border-left: none;
    border-top: 1px solid var(--border);
  }
}

@media (max-width: 720px) {
  .submit-row,
  .status-card-head,
  .history-head,
  .asset-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .veo-hero-copy {
    padding: 22px;
  }

  .veo-hero-copy h1 {
    font-size: 24px;
  }
}
</style>
