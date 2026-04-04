<template>
  <div class="seedance-tab">
    <!-- Generation Form -->
    <section class="card">
      <div class="card-header">
        <span class="card-title">🌱 Seedance 2.0 生成設定</span>
        <div class="header-right">
          <span class="badge" :class="configured ? 'badge-active' : 'badge-trigger'">
            {{ configured ? '已連線 PiAPI' : '尚未設定 API Key' }}
          </span>
          <button class="btn btn-secondary btn-sm" @click="showSettings = !showSettings">
            ⚙️ 設定
          </button>
        </div>
      </div>

      <!-- Inline Settings Panel -->
      <div v-if="showSettings" class="card-body settings-panel">
        <div class="form-group">
          <label class="form-label">PiAPI API Key</label>
          <div class="api-key-row">
            <input
              v-model="apiKeyInput"
              :type="showKey ? 'text' : 'password'"
              class="form-input"
              placeholder="輸入 PiAPI API Key"
            />
            <button class="btn btn-secondary btn-sm" @click="showKey = !showKey">
              {{ showKey ? '隱藏' : '顯示' }}
            </button>
            <button class="btn btn-primary btn-sm" :disabled="savingKey" @click="saveApiKey">
              {{ savingKey ? '儲存中...' : '儲存' }}
            </button>
          </div>
          <p v-if="settingsMsg" class="hint" :class="settingsMsgError ? 'error-hint' : 'success-hint'">{{ settingsMsg }}</p>
        </div>
      </div>

      <div class="card-body seedance-form">
        <!-- Source Mode Tabs -->
        <div class="mode-strip">
          <button
            v-for="m in sourceModes"
            :key="m.value"
            class="mode-pill"
            :class="{ active: activeMode === m.value }"
            @click="switchMode(m.value)"
          >
            <span>{{ m.icon }}</span>
            {{ m.label }}
          </button>
        </div>

        <!-- Prompt -->
        <div class="form-group">
          <div class="label-row">
            <label class="form-label">Prompt{{ activeMode === 'extend' ? '（選填）' : '' }}</label>
            <div class="label-row-right">
              <!-- Insert reference dropdown -->
              <div v-if="hasAnyMedia" class="ref-insert-wrap">
                <button class="btn btn-secondary btn-sm" @click="showRefMenu = !showRefMenu">
                  @ 插入引用 ▾
                </button>
                <div v-if="showRefMenu" class="ref-menu">
                  <button
                    v-for="(_, i) in imageRefs"
                    :key="`img-${i}`"
                    class="ref-menu-item"
                    @click="insertRef(`@image${i + 1}`)"
                  >@image{{ i + 1 }}</button>
                  <button
                    v-for="(_, i) in videoRefs"
                    :key="`vid-${i}`"
                    class="ref-menu-item"
                    @click="insertRef(`@video${i + 1}`)"
                  >@video{{ i + 1 }}</button>
                  <button
                    v-for="(_, i) in audioRefs"
                    :key="`aud-${i}`"
                    class="ref-menu-item"
                    @click="insertRef(`@audio${i + 1}`)"
                  >@audio{{ i + 1 }}</button>
                </div>
              </div>
              <div class="font-size-row">
                <span class="font-size-label">字體</span>
                <input
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  v-model.number="promptFontSize"
                  class="font-size-slider"
                  @input="savePromptFontSize"
                />
                <span class="font-size-label">{{ promptFontSize }}px</span>
              </div>
            </div>
          </div>
          <textarea
            ref="promptTextareaRef"
            v-model="form.prompt"
            class="form-textarea seedance-textarea"
            :style="{ fontSize: promptFontSize + 'px' }"
            :placeholder="promptPlaceholder"
            rows="4"
          />
          <p v-if="hasAnyMedia" class="ref-hint">使用 @image1、@video1、@audio1 在 prompt 中指定素材用途</p>
        </div>

        <!-- Camera Control Presets -->
        <div class="form-group camera-group">
          <label class="form-label">🎥 鏡頭預設</label>
          <div class="camera-presets">
            <button
              v-for="preset in cameraPresets"
              :key="preset.label"
              class="camera-btn"
              :title="preset.instruction"
              @click="appendCameraPreset(preset.instruction)"
            >{{ preset.label }}</button>
          </div>
        </div>

        <!-- === VIDEO EDIT MODE === -->
        <template v-if="activeMode === 'video-edit'">
          <div class="form-group">
            <label class="form-label">上傳要編輯的影片（拖拉或點擊，最多 1 支）</label>
            <div
              class="upload-area"
              :class="{ dragging: draggingEditVideo }"
              @dragover.prevent="draggingEditVideo = true"
              @dragleave="draggingEditVideo = false"
              @drop.prevent="onDropEditVideo"
              @click="editVideoInput?.click()"
            >
              <div v-if="!editVideoRef" class="upload-placeholder">
                <span>拖拉影片到這裡，或點擊上傳</span>
                <span class="upload-sub">支援 MP4 / WebM / MOV</span>
              </div>
              <div v-else class="video-preview-wrap">
                <video :src="editVideoRef.previewUrl" controls playsinline class="upload-video-preview" />
                <button class="remove-media-btn" @click.stop="editVideoRef = null">✕</button>
              </div>
            </div>
            <input ref="editVideoInput" type="file" accept="video/*" hidden @change="onSelectEditVideo" />
          </div>
          <div class="mode-hint">
            <span>📐 輸出影片長度會跟原始影片一樣</span>
          </div>
        </template>

        <!-- === EXTEND MODE === -->
        <template v-if="activeMode === 'extend'">
          <div class="form-group">
            <label class="form-label">選擇要延長的影片</label>
            <div v-if="completedJobs.length === 0" class="empty-extend">
              尚未有已完成的 Seedance 任務，請先生成一支影片。
            </div>
            <div v-else class="extend-job-list">
              <div
                v-for="job in completedJobs"
                :key="job.id"
                class="extend-job-item"
                :class="{ selected: selectedExtendJobId === job.id }"
                @click="selectExtendJob(job)"
              >
                <video
                  v-if="job.outputs && job.outputs.length > 0"
                  :src="resolveUrl(job.outputs[0].localUrl)"
                  class="extend-job-thumb"
                  muted
                  playsinline
                  preload="metadata"
                />
                <div class="extend-job-info">
                  <div class="extend-job-date">{{ formatDate(job.createdAt) }}</div>
                  <div class="extend-job-meta">{{ job.duration }}s · {{ job.aspectRatio }}</div>
                  <div class="extend-job-prompt">{{ truncatePrompt(job.prompt, 50) }}</div>
                </div>
                <div v-if="selectedExtendJobId === job.id" class="extend-check">✓</div>
              </div>
            </div>
            <div v-if="selectedExtendJob && selectedExtendJob.outputs?.length > 0" class="extend-preview">
              <label class="form-label">已選影片預覽</label>
              <video :src="resolveUrl(selectedExtendJob.outputs[0].localUrl)" controls playsinline class="extend-preview-video" />
            </div>
          </div>
          <div class="mode-hint">
            <span>🔗 接續上一段影片，保持場景一致性</span>
          </div>
        </template>

        <!-- === AUDIO-DRIVEN MODE === -->
        <template v-if="activeMode === 'audio-driven'">
          <div class="form-group">
            <label class="form-label">上傳音頻（拖拉或點擊，最多 3 個）</label>
            <div
              class="upload-area"
              :class="{ dragging: draggingAudio }"
              @dragover.prevent="draggingAudio = true"
              @dragleave="draggingAudio = false"
              @drop.prevent="onDropAudio"
              @click="audioInput?.click()"
            >
              <div v-if="audioRefs.length === 0" class="upload-placeholder">
                <span>拖拉音頻到這裡，或點擊上傳</span>
                <span class="upload-sub">支援 MP3 / WAV / M4A / OGG</span>
              </div>
              <div v-else class="audio-list">
                <div v-for="(audio, i) in audioRefs" :key="i" class="audio-item">
                  <span class="audio-badge">@audio{{ i + 1 }}</span>
                  <audio :src="audio.previewUrl" controls class="audio-player" />
                  <button class="remove-media-btn" @click.stop="removeAudio(i)">✕</button>
                </div>
                <button
                  v-if="audioRefs.length < 3"
                  class="add-media-btn"
                  @click.stop="audioInput?.click()"
                >+ 新增音頻</button>
              </div>
            </div>
            <input ref="audioInput" type="file" accept="audio/*" multiple hidden @change="onSelectAudio" />
          </div>
          <div class="mode-hint">
            <span>🎵 支援口型同步和音樂節奏驅動</span>
          </div>
        </template>

        <!-- === IMAGE UPLOAD (text and image modes) === -->
        <div v-if="activeMode === 'text' || activeMode === 'image' || activeMode === 'audio-driven'" class="form-group">
          <label class="form-label">
            {{ activeMode === 'audio-driven' ? '角色參考圖片（選填，最多 9 張）' : '參考圖片（選填，最多 9 張）' }}
          </label>
          <div
            class="upload-area image-upload-area"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
            :class="{ dragging }"
          >
            <div v-if="imageRefs.length === 0" class="upload-placeholder">
              <span>拖拉圖片到這裡，或點擊上傳</span>
              <label class="btn btn-secondary btn-sm upload-label">
                選擇圖片
                <input type="file" accept="image/*" multiple hidden @change="onFileSelect" />
              </label>
            </div>
            <div v-else class="ref-thumbnails">
              <div v-for="(ref, i) in imageRefs" :key="i" class="ref-card">
                <div class="ref-card-img">
                  <span class="ref-badge">@image{{ i + 1 }}</span>
                  <img :src="ref.previewUrl" :alt="`ref-${i}`" />
                  <button class="remove-ref" @click="removeRef(i)">✕</button>
                </div>
                <div class="ref-card-controls">
                  <div class="ref-role-row">
                    <button
                      v-for="role in refRoles"
                      :key="role.value"
                      class="ref-role-btn"
                      :class="{ active: ref.role === role.value }"
                      :title="role.label"
                      @click="ref.role = role.value"
                    >{{ role.icon }}</button>
                  </div>
                  <div v-if="ref.role !== 'none'" class="ref-strength-row">
                    <button
                      v-for="s in refStrengths"
                      :key="s.value"
                      class="ref-strength-btn"
                      :class="{ active: ref.strength === s.value }"
                      @click="ref.strength = s.value"
                    >{{ s.label }}</button>
                  </div>
                </div>
              </div>
              <label v-if="imageRefs.length < 9" class="add-ref-btn">
                + 新增
                <input type="file" accept="image/*" multiple hidden @change="onFileSelect" />
              </label>
            </div>
            <!-- Auto-generated ref prompt -->
            <div v-if="autoRefPrompt" class="auto-ref-prompt">
              <span class="auto-ref-label">🔗 自動引用指令：</span>
              <span class="auto-ref-text">{{ autoRefPrompt }}</span>
              <button class="btn btn-secondary btn-sm" @click="form.prompt = (form.prompt ? form.prompt + ' ' : '') + autoRefPrompt">插入到 Prompt</button>
            </div>
          </div>
        </div>

        <!-- VIDEO UPLOAD (image-to-video mode shows video refs) -->
        <div v-if="activeMode === 'image'" class="form-group">
          <label class="form-label">參考影片（選填，最多 3 支）</label>
          <div
            class="upload-area"
            :class="{ dragging: draggingVideo }"
            @dragover.prevent="draggingVideo = true"
            @dragleave="draggingVideo = false"
            @drop.prevent="onDropVideoRef"
            @click="videoRefInput?.click()"
          >
            <div v-if="videoRefs.length === 0" class="upload-placeholder">
              <span>拖拉影片到這裡，或點擊上傳</span>
              <span class="upload-sub">選填，用作風格/動作參考</span>
            </div>
            <div v-else class="video-ref-list">
              <div v-for="(vid, i) in videoRefs" :key="i" class="video-ref-item">
                <span class="ref-badge">@video{{ i + 1 }}</span>
                <video :src="vid.previewUrl" class="video-ref-thumb" muted playsinline preload="metadata" />
                <button class="remove-media-btn" @click.stop="removeVideoRef(i)">✕</button>
              </div>
              <button
                v-if="videoRefs.length < 3"
                class="add-media-btn"
                @click.stop="videoRefInput?.click()"
              >+ 新增影片</button>
            </div>
          </div>
          <input ref="videoRefInput" type="file" accept="video/*" multiple hidden @change="onSelectVideoRef" />
        </div>

        <!-- Parameters Row (hide duration in video-edit, fix at 5 in extend) -->
        <div class="params-grid">
          <!-- Duration -->
          <div v-if="activeMode !== 'video-edit'" class="form-group">
            <label class="form-label">片長</label>
            <div v-if="activeMode === 'extend'" class="extend-duration-fixed">5s（固定）</div>
            <div v-else class="pill-group">
              <button
                v-for="d in durations"
                :key="d"
                class="pill-btn"
                :class="{ active: form.duration === d }"
                @click="form.duration = d"
              >{{ d }}s</button>
            </div>
          </div>

          <!-- Aspect Ratio -->
          <div class="form-group">
            <label class="form-label">比例</label>
            <div class="pill-group">
              <button
                v-for="r in aspectRatios"
                :key="r"
                class="pill-btn"
                :class="{ active: form.aspectRatio === r }"
                @click="form.aspectRatio = r"
              >{{ r }}</button>
            </div>
          </div>

          <!-- Quality / Task Type -->
          <div class="form-group">
            <label class="form-label">品質</label>
            <div class="pill-group">
              <button
                class="pill-btn"
                :class="{ active: form.taskType === 'seedance-2-preview' }"
                @click="form.taskType = 'seedance-2-preview'"
              >高品質</button>
              <button
                class="pill-btn"
                :class="{ active: form.taskType === 'seedance-2-fast-preview' }"
                @click="form.taskType = 'seedance-2-fast-preview'"
              >快速</button>
            </div>
          </div>
        </div>

        <!-- Estimated Cost -->
        <div class="cost-hint">
          <span class="cost-label">預估費用：</span>
          <span class="cost-value">${{ estimatedCost.toFixed(4) }} USD</span>
          <span class="cost-note">（{{ costNote }}）</span>
        </div>

        <!-- Error Message -->
        <div v-if="errorMessage" class="error-banner">{{ errorMessage }}</div>

        <!-- Submit -->
        <div class="submit-row">
          <button
            class="btn btn-seedance"
            :disabled="submitting || !canSubmit"
            @click="submit"
          >
            <span v-if="submitting">⏳ 生成中...</span>
            <span v-else-if="activeMode === 'extend'">🔗 延長 5 秒</span>
            <span v-else>🌱 開始生成</span>
          </button>
          <span class="submit-hint">{{ submitHint }}</span>
        </div>
      </div>
    </section>

    <!-- History Gallery -->
    <section class="card">
      <div class="card-header">
        <span class="card-title">歷史紀錄</span>
        <button class="btn btn-secondary btn-sm" @click="loadJobs">重新整理</button>
      </div>
      <div class="card-body">
        <div v-if="jobs.length === 0" class="empty-state">
          <div class="empty-state-icon">🎞️</div>
          <div class="empty-state-title">尚未有任何 Seedance 任務</div>
          <div class="empty-state-desc">生成第一支影片後，歷史紀錄會在這裡顯示。</div>
        </div>

        <div v-else class="history-grid">
          <article v-for="job in sortedJobs" :key="job.id" class="history-card">
            <div class="history-head">
              <div class="history-meta">
                <span class="history-type">{{ job.taskType === 'seedance-2-preview' ? '高品質' : '快速' }}</span>
                <span class="history-date">{{ formatDate(job.createdAt) }}</span>
                <span class="history-detail">{{ job.duration }}s · {{ job.aspectRatio }}</span>
              </div>
              <div class="history-actions">
                <span
                  class="badge"
                  :class="
                    job.status === 'completed' ? 'badge-active' :
                    job.status === 'failed' ? 'badge-trigger' :
                    'badge-ai'
                  "
                >{{ statusLabel(job.status) }}</span>
                <button class="btn btn-secondary btn-sm" @click="restoreJob(job)">恢復設定</button>
                <button class="btn btn-danger btn-sm" @click="removeJob(job.id)">刪除</button>
              </div>
            </div>

            <!-- Prompt (collapsible) -->
            <details class="prompt-details">
              <summary class="prompt-summary">{{ truncatePrompt(job.prompt) }}</summary>
              <p class="prompt-full">{{ job.prompt }}</p>
            </details>

            <!-- Cost -->
            <div v-if="job.cost" class="job-cost">費用：${{ job.cost.toFixed(4) }} USD</div>

            <!-- Error -->
            <div v-if="job.error" class="error-text">{{ job.error }}</div>

            <!-- Pending/Processing indicator -->
            <div v-if="job.status === 'pending' || job.status === 'processing'" class="processing-indicator">
              <div class="spinner"></div>
              <span>{{ job.status === 'pending' ? '排隊中...' : '生成中...' }}</span>
            </div>

            <!-- Video output -->
            <div v-if="job.outputs && job.outputs.length > 0" class="video-wrap">
              <video
                v-for="(output, i) in job.outputs"
                :key="i"
                :src="resolveUrl(output.localUrl)"
                controls
                playsinline
                class="job-video"
              />
              <div class="video-actions">
                <a
                  v-for="(output, i) in job.outputs"
                  :key="i"
                  class="btn btn-secondary btn-sm"
                  :href="resolveUrl(output.localUrl)"
                  target="_blank"
                  rel="noreferrer"
                >開啟 #{{ i + 1 }}</a>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createSeedanceJob,
  deleteSeedanceJob,
  extendSeedanceJob,
  getSeedanceSettings,
  getSeedanceStatus,
  listSeedanceJobs,
  pollSeedanceJob,
  saveSeedanceSettings,
  type SeedanceJob,
} from '../../api/seedance'
import { resolveMediaUrl } from '../../api/config'

// ── Types ──────────────────────────────────────────────────────────
type SourceMode = 'text' | 'image' | 'video-edit' | 'extend' | 'audio-driven'

type RefRole = 'character' | 'style' | 'scene' | 'action' | 'none'
type RefStrength = 'strict' | 'moderate' | 'loose'

interface ImageRef {
  base64: string
  mimeType: string
  previewUrl: string
  role: RefRole
  strength: RefStrength
}

interface VideoRef {
  base64: string
  mimeType: string
  previewUrl: string
  file: File
}

interface AudioRef {
  base64: string
  mimeType: string
  previewUrl: string
  name: string
}

// ── Source Modes ───────────────────────────────────────────────────
const sourceModes = [
  { value: 'text', icon: '✍️', label: '文字生成' },
  { value: 'image', icon: '🖼️', label: '圖片生成' },
  { value: 'video-edit', icon: '🎬', label: '影片編輯' },
  { value: 'extend', icon: '📼', label: '延長影片' },
  { value: 'audio-driven', icon: '🎵', label: '音頻驅動' },
] as const

// ── Camera Presets ─────────────────────────────────────────────────
const cameraPresets = [
  { label: '⬅️ Pan Left', instruction: 'Camera: slow pan left to right' },
  { label: '➡️ Pan Right', instruction: 'Camera: slow pan right to left' },
  { label: '⬆️ Tilt Up', instruction: 'Camera: tilt up slowly' },
  { label: '⬇️ Tilt Down', instruction: 'Camera: tilt down slowly' },
  { label: '🔍 Zoom In', instruction: 'Camera: smooth zoom in' },
  { label: '🔎 Zoom Out', instruction: 'Camera: smooth zoom out' },
  { label: '🌀 Dolly Zoom', instruction: 'Camera: dolly zoom effect' },
  { label: '📷 Static', instruction: 'Camera: static shot, no movement' },
  { label: '🔄 Orbit 360°', instruction: 'Camera: 360 degree orbit around subject' },
]

// ── State ──────────────────────────────────────────────────────────
const activeMode = ref<SourceMode>('text')
const configured = ref(false)
const showSettings = ref(false)
const apiKeyInput = ref('')
const showKey = ref(false)
const savingKey = ref(false)
const settingsMsg = ref('')
const settingsMsgError = ref(false)

const jobs = ref<SeedanceJob[]>([])
const submitting = ref(false)
const errorMessage = ref('')
const dragging = ref(false)
const draggingVideo = ref(false)
const draggingAudio = ref(false)
const draggingEditVideo = ref(false)
const promptFontSize = ref(14)
const showRefMenu = ref(false)

const promptTextareaRef = ref<HTMLTextAreaElement | null>(null)
const editVideoInput = ref<HTMLInputElement | null>(null)
const audioInput = ref<HTMLInputElement | null>(null)
const videoRefInput = ref<HTMLInputElement | null>(null)

const form = ref({
  prompt: '',
  duration: 5 as 5 | 10 | 15,
  aspectRatio: '16:9',
  taskType: 'seedance-2-preview',
})

const imageRefs = ref<ImageRef[]>([])
const videoRefs = ref<VideoRef[]>([])
const audioRefs = ref<AudioRef[]>([])
const editVideoRef = ref<VideoRef | null>(null)
const selectedExtendJobId = ref<string | null>(null)

// Cost rates per second
const COST_PER_SECOND: Record<string, number> = {
  'seedance-2-preview': 0.016,
  'seedance-2-fast-preview': 0.008,
}
const COST_EDIT_PER_SECOND: Record<string, number> = {
  'seedance-2-preview': 0.025,
  'seedance-2-fast-preview': 0.013,
}

const durations = [5, 10, 15] as const
const aspectRatios = ['16:9', '9:16', '4:3', '3:4']

const refRoles: { value: RefRole; label: string; icon: string; promptText: string }[] = [
  { value: 'character', label: '角色', icon: '👤', promptText: 'as the main character appearance' },
  { value: 'style', label: '風格', icon: '🎨', promptText: 'as visual style reference' },
  { value: 'scene', label: '場景', icon: '🏞️', promptText: 'as background/scene reference' },
  { value: 'action', label: '動作', icon: '🎬', promptText: 'as motion/pose reference' },
  { value: 'none', label: '自動', icon: '✨', promptText: '' },
]
const refStrengths: { value: RefStrength; label: string; promptPrefix: string }[] = [
  { value: 'strict', label: '強', promptPrefix: 'Strictly follow' },
  { value: 'moderate', label: '中', promptPrefix: 'Reference' },
  { value: 'loose', label: '弱', promptPrefix: 'Loosely inspired by' },
]

// Build auto ref prompt from image roles
const autoRefPrompt = computed(() => {
  if (imageRefs.value.length === 0) return ''
  const parts: string[] = []
  for (let i = 0; i < imageRefs.value.length; i++) {
    const ref = imageRefs.value[i]
    if (ref.role === 'none') continue
    const role = refRoles.find(r => r.value === ref.role)
    const strength = refStrengths.find(s => s.value === ref.strength)
    if (role && strength) {
      parts.push(`${strength.promptPrefix} @image${i + 1} ${role.promptText}`)
    }
  }
  return parts.length > 0 ? parts.join('. ') + '.' : ''
})

// ── Computed ───────────────────────────────────────────────────────
const sortedJobs = computed(() =>
  [...jobs.value].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
)

const completedJobs = computed(() =>
  sortedJobs.value.filter(j => j.status === 'completed' && j.outputs && j.outputs.length > 0)
)

const selectedExtendJob = computed(() =>
  jobs.value.find(j => j.id === selectedExtendJobId.value) || null
)

const hasAnyMedia = computed(() =>
  imageRefs.value.length > 0 || videoRefs.value.length > 0 || audioRefs.value.length > 0
)

const promptPlaceholder = computed(() => {
  switch (activeMode.value) {
    case 'text': return '描述影片場景、動作、風格、光線、節奏…'
    case 'image': return '描述圖片中的動作與場景發展…'
    case 'video-edit': return '描述要如何改變這支影片的風格…'
    case 'extend': return '（選填）描述接下來會發生什麼…'
    case 'audio-driven': return '描述角色動作，音頻會驅動口型和節奏…'
    default: return '描述影片場景…'
  }
})

const effectiveDuration = computed(() => {
  if (activeMode.value === 'extend') return 5
  return form.value.duration
})

const estimatedCost = computed(() => {
  const dur = effectiveDuration.value
  if (activeMode.value === 'video-edit') {
    const rate = COST_EDIT_PER_SECOND[form.value.taskType] ?? 0.025
    return dur * rate
  }
  const rate = COST_PER_SECOND[form.value.taskType] ?? 0.016
  return dur * rate
})

const costNote = computed(() => {
  const quality = form.value.taskType === 'seedance-2-preview' ? '高品質' : '快速'
  if (activeMode.value === 'video-edit') return `依原片長度計費 · ${quality}`
  if (activeMode.value === 'extend') return `5s · ${quality}`
  return `${form.value.duration}s · ${quality}`
})

const canSubmit = computed(() => {
  if (activeMode.value === 'extend') return !!selectedExtendJobId.value
  if (activeMode.value === 'video-edit') return !!editVideoRef.value
  if (activeMode.value === 'audio-driven') return audioRefs.value.length > 0
  return !!form.value.prompt.trim()
})

const submitHint = computed(() => {
  if (!configured.value) return '先到設定頁存好 PiAPI API Key 才能生成影片。'
  if (activeMode.value === 'extend' && !selectedExtendJobId.value) return '請先選擇要延長的影片。'
  if (activeMode.value === 'video-edit' && !editVideoRef.value) return '請先上傳要編輯的影片。'
  if (activeMode.value === 'audio-driven' && audioRefs.value.length === 0) return '請先上傳至少一個音頻檔案。'
  if (activeMode.value !== 'extend' && !form.value.prompt.trim()) return '請先填寫 Prompt。'
  return '提交後會自動輪詢，完成時影片會出現在下方歷史紀錄。'
})

// ── Mode switching ─────────────────────────────────────────────────
function switchMode(mode: SourceMode) {
  activeMode.value = mode
  showRefMenu.value = false
}

// ── Settings ───────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const data = await getSeedanceSettings()
    apiKeyInput.value = data.settings.apiKey || ''
  } catch {
    // ignore
  }
}

async function checkStatus() {
  try {
    const data = await getSeedanceStatus()
    configured.value = data.configured
  } catch {
    configured.value = false
  }
}

async function saveApiKey() {
  savingKey.value = true
  settingsMsg.value = ''
  try {
    await saveSeedanceSettings({ apiKey: apiKeyInput.value.trim() })
    settingsMsg.value = '儲存成功'
    settingsMsgError.value = false
    configured.value = !!apiKeyInput.value.trim()
  } catch (e) {
    settingsMsg.value = e instanceof Error ? e.message : '儲存失敗'
    settingsMsgError.value = true
  } finally {
    savingKey.value = false
  }
}

// ── Jobs ───────────────────────────────────────────────────────────
async function loadJobs() {
  try {
    jobs.value = await listSeedanceJobs()
    schedulePollingForActive()
  } catch {
    // ignore
  }
}

async function removeJob(id: string) {
  try {
    await deleteSeedanceJob(id)
    jobs.value = jobs.value.filter(j => j.id !== id)
  } catch {
    // ignore
  }
}

function restoreJob(job: SeedanceJob) {
  form.value.prompt = job.prompt
  form.value.duration = job.duration as 5 | 10 | 15
  form.value.aspectRatio = job.aspectRatio
  form.value.taskType = job.taskType
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function selectExtendJob(job: SeedanceJob) {
  selectedExtendJobId.value = job.id
}

// ── Image refs ─────────────────────────────────────────────────────
function onDrop(e: DragEvent) {
  dragging.value = false
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))
  addImageFiles(files)
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || []).filter(f => f.type.startsWith('image/'))
  addImageFiles(files)
  input.value = ''
}

function addImageFiles(files: File[]) {
  const remaining = 9 - imageRefs.value.length
  files.slice(0, remaining).forEach(file => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      imageRefs.value.push({ base64, mimeType: file.type, previewUrl: result, role: 'none', strength: 'moderate' })
    }
    reader.readAsDataURL(file)
  })
}

function removeRef(i: number) {
  imageRefs.value.splice(i, 1)
}

// ── Video refs (image-to-video mode) ──────────────────────────────
function onDropVideoRef(e: DragEvent) {
  draggingVideo.value = false
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('video/'))
  addVideoRefFiles(files)
}

function onSelectVideoRef(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || []).filter(f => f.type.startsWith('video/'))
  addVideoRefFiles(files)
  input.value = ''
}

function addVideoRefFiles(files: File[]) {
  const remaining = 3 - videoRefs.value.length
  files.slice(0, remaining).forEach(file => {
    const url = URL.createObjectURL(file)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      videoRefs.value.push({ base64: result.split(',')[1], mimeType: file.type, previewUrl: url, file })
    }
    reader.readAsDataURL(file)
  })
}

function removeVideoRef(i: number) {
  videoRefs.value.splice(i, 1)
}

// ── Edit video ────────────────────────────────────────────────────
function onDropEditVideo(e: DragEvent) {
  draggingEditVideo.value = false
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('video/'))
  if (files[0]) setEditVideo(files[0])
}

function onSelectEditVideo(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) setEditVideo(file)
  input.value = ''
}

function setEditVideo(file: File) {
  const url = URL.createObjectURL(file)
  const reader = new FileReader()
  reader.onload = () => {
    const result = reader.result as string
    editVideoRef.value = { base64: result.split(',')[1], mimeType: file.type, previewUrl: url, file }
  }
  reader.readAsDataURL(file)
}

// ── Audio refs ────────────────────────────────────────────────────
function onDropAudio(e: DragEvent) {
  draggingAudio.value = false
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('audio/'))
  addAudioFiles(files)
}

function onSelectAudio(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || []).filter(f => f.type.startsWith('audio/'))
  addAudioFiles(files)
  input.value = ''
}

function addAudioFiles(files: File[]) {
  const remaining = 3 - audioRefs.value.length
  files.slice(0, remaining).forEach(file => {
    const url = URL.createObjectURL(file)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      audioRefs.value.push({ base64: result.split(',')[1], mimeType: file.type, previewUrl: url, name: file.name })
    }
    reader.readAsDataURL(file)
  })
}

function removeAudio(i: number) {
  audioRefs.value.splice(i, 1)
}

// ── @ Reference insertion ─────────────────────────────────────────
function insertRef(token: string) {
  showRefMenu.value = false
  const el = promptTextareaRef.value
  if (!el) {
    form.value.prompt += token
    return
  }
  const start = el.selectionStart ?? form.value.prompt.length
  const end = el.selectionEnd ?? start
  const text = form.value.prompt
  form.value.prompt = text.slice(0, start) + token + text.slice(end)
  // restore cursor after token
  const newPos = start + token.length
  requestAnimationFrame(() => {
    el.setSelectionRange(newPos, newPos)
    el.focus()
  })
}

// ── Camera presets ────────────────────────────────────────────────
function appendCameraPreset(instruction: string) {
  const existing = form.value.prompt.trim()
  form.value.prompt = existing ? `${existing}\n${instruction}` : instruction
  promptTextareaRef.value?.focus()
}

// ── Submit ─────────────────────────────────────────────────────────
async function submit() {
  errorMessage.value = ''
  submitting.value = true
  try {
    if (activeMode.value === 'extend') {
      if (!selectedExtendJobId.value) throw new Error('請先選擇要延長的影片')
      const { job } = await extendSeedanceJob(selectedExtendJobId.value, form.value.prompt.trim() || undefined)
      jobs.value = [job, ...jobs.value.filter(j => j.id !== job.id)]
      startJobPolling(job.id)
    } else {
      const payload = {
        prompt: form.value.prompt.trim(),
        duration: form.value.duration,
        aspectRatio: form.value.aspectRatio,
        taskType: form.value.taskType,
        sourceMode: activeMode.value,
        imageUrls: imageRefs.value.map(r => `data:${r.mimeType};base64,${r.base64}`),
        videoUrls: videoRefs.value.map(r => `data:${r.mimeType};base64,${r.base64}`),
        audioUrls: audioRefs.value.map(r => `data:${r.mimeType};base64,${r.base64}`),
        editVideoUrl: editVideoRef.value ? `data:${editVideoRef.value.mimeType};base64,${editVideoRef.value.base64}` : undefined,
      }
      const { job } = await createSeedanceJob(payload)
      jobs.value = [job, ...jobs.value.filter(j => j.id !== job.id)]
      startJobPolling(job.id)
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}

// ── Polling ────────────────────────────────────────────────────────
const pollHandles = new Map<string, number>()

function startJobPolling(id: string) {
  if (pollHandles.has(id)) return
  const handle = window.setInterval(async () => {
    try {
      const { job } = await pollSeedanceJob(id)
      const idx = jobs.value.findIndex(j => j.id === id)
      if (idx >= 0) jobs.value[idx] = job
      if (job.status === 'completed' || job.status === 'failed') {
        clearInterval(pollHandles.get(id))
        pollHandles.delete(id)
      }
    } catch {
      // ignore polling errors
    }
  }, 5000)
  pollHandles.set(id, handle)
}

function schedulePollingForActive() {
  jobs.value
    .filter(j => j.status === 'pending' || j.status === 'processing')
    .forEach(j => startJobPolling(j.id))
}

// ── Font size persistence ──────────────────────────────────────────
function savePromptFontSize() {
  localStorage.setItem('seedance_prompt_font_size', String(promptFontSize.value))
}

// ── Helpers ────────────────────────────────────────────────────────
function resolveUrl(path: string) {
  return resolveMediaUrl(path)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncatePrompt(prompt: string, maxLen = 80) {
  return prompt.length > maxLen ? prompt.slice(0, maxLen) + '...' : prompt
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '排隊中',
    processing: '生成中',
    completed: '已完成',
    failed: '失敗',
  }
  return map[status] || status
}

// ── Lifecycle ──────────────────────────────────────────────────────
onMounted(async () => {
  const saved = localStorage.getItem('seedance_prompt_font_size')
  if (saved) promptFontSize.value = Number(saved)
  await Promise.all([checkStatus(), loadJobs(), loadSettings()])
})

onBeforeUnmount(() => {
  pollHandles.forEach(h => clearInterval(h))
  pollHandles.clear()
})

// Close ref menu on outside click
watch(showRefMenu, (val) => {
  if (val) {
    const close = () => {
      showRefMenu.value = false
      document.removeEventListener('click', close)
    }
    setTimeout(() => document.addEventListener('click', close), 0)
  }
})
</script>

<style scoped>
.seedance-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Settings panel ── */
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-panel {
  border-bottom: 1px solid var(--c-border);
  padding-bottom: 16px;
}

.api-key-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.api-key-row .form-input {
  flex: 1;
}

.success-hint { color: #22c55e; }
.error-hint { color: #fda4af; }

/* ── Form ── */
.seedance-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Mode strip (like Veo) ── */
.mode-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mode-pill {
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.03);
  color: var(--c-text-secondary, #888);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 5px;
}

.mode-pill:hover {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.08);
}

.mode-pill.active {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.14);
  font-weight: 600;
}

/* ── Label row ── */
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  gap: 8px;
  flex-wrap: wrap;
}

.label-row-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.font-size-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.font-size-label {
  font-size: 11px;
  color: var(--c-text-secondary, #888);
}

.font-size-slider {
  width: 80px;
  accent-color: #22c55e;
}

.seedance-textarea {
  resize: vertical;
  min-height: 80px;
}

/* ── Ref hint ── */
.ref-hint {
  font-size: 11px;
  color: var(--c-text-secondary, #888);
  margin-top: 4px;
}

/* ── Reference insert dropdown ── */
.ref-insert-wrap {
  position: relative;
}

.ref-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--c-bg-card, #1a1a2e);
  border: 1px solid var(--c-border, #2a2a4a);
  border-radius: 8px;
  padding: 4px;
  z-index: 50;
  min-width: 110px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.ref-menu-item {
  display: block;
  width: 100%;
  padding: 7px 12px;
  font-size: 13px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: #22c55e;
  cursor: pointer;
  transition: background 0.1s;
  font-family: monospace;
}

.ref-menu-item:hover {
  background: rgba(34, 197, 94, 0.12);
}

/* ── Camera presets ── */
.camera-group .form-label {
  margin-bottom: 8px;
}

.camera-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.camera-btn {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--c-border, #2a2a4a);
  background: transparent;
  color: var(--c-text-secondary, #888);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.camera-btn:hover {
  border-color: #22c55e;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.08);
}

/* ── Upload areas ── */
.upload-area {
  border: 2px dashed var(--c-border, #2a2a4a);
  border-radius: 10px;
  padding: 16px;
  min-height: 80px;
  transition: border-color 0.2s, background 0.2s;
  cursor: pointer;
}

.upload-area.dragging,
.upload-area:hover {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.04);
}

.image-upload-area {
  cursor: default;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--c-text-secondary, #888);
  font-size: 13px;
  pointer-events: none;
}

.upload-sub {
  font-size: 11px;
  opacity: 0.7;
}

.upload-label {
  cursor: pointer;
  pointer-events: all;
}

/* ── Image ref thumbnails ── */
.ref-thumbnails {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ref-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100px;
}

.ref-card-img {
  position: relative;
  width: 100px;
  height: 100px;
}

.ref-card-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--c-border);
}

.ref-card-controls {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ref-role-row {
  display: flex;
  gap: 2px;
  justify-content: center;
}

.ref-role-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: rgba(255,255,255,0.04);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  padding: 0;
}

.ref-role-btn:hover {
  border-color: rgba(34,197,94,0.3);
  background: rgba(34,197,94,0.08);
}

.ref-role-btn.active {
  border-color: #22c55e;
  background: rgba(34,197,94,0.15);
  box-shadow: 0 0 6px rgba(34,197,94,0.2);
}

.ref-strength-row {
  display: flex;
  gap: 2px;
  justify-content: center;
}

.ref-strength-btn {
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid transparent;
  background: rgba(255,255,255,0.04);
  color: var(--c-text-secondary, #888);
  font-size: 9px;
  cursor: pointer;
  transition: all 0.15s;
}

.ref-strength-btn:hover {
  border-color: rgba(34,197,94,0.3);
}

.ref-strength-btn.active {
  border-color: #22c55e;
  color: #22c55e;
  background: rgba(34,197,94,0.1);
}

.auto-ref-prompt {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(34,197,94,0.06);
  border: 1px solid rgba(34,197,94,0.15);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.auto-ref-label {
  font-size: 11px;
  color: #22c55e;
  white-space: nowrap;
}

.auto-ref-text {
  font-size: 11px;
  color: var(--c-text-secondary, #999);
  flex: 1;
  min-width: 0;
}

/* Keep old .ref-thumb for backwards compat */
.ref-thumb {
  position: relative;
  width: 72px;
  height: 72px;
}

.ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--c-border);
}

.ref-badge {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.75);
  color: #22c55e;
  font-size: 9px;
  border-radius: 3px;
  padding: 1px 4px;
  white-space: nowrap;
  pointer-events: none;
  font-family: monospace;
}

.remove-ref {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.add-ref-btn {
  width: 72px;
  height: 72px;
  border-radius: 6px;
  border: 2px dashed var(--c-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--c-text-secondary, #888);
  cursor: pointer;
  transition: border-color 0.2s;
  text-align: center;
}

.add-ref-btn:hover {
  border-color: #22c55e;
  color: #22c55e;
}

/* ── Remove / add media ── */
.remove-media-btn {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.add-media-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px dashed var(--c-border);
  background: transparent;
  color: var(--c-text-secondary, #888);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-media-btn:hover {
  border-color: #22c55e;
  color: #22c55e;
}

/* ── Video preview (upload area) ── */
.video-preview-wrap {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.upload-video-preview {
  max-height: 200px;
  border-radius: 8px;
  flex: 1;
  min-width: 0;
}

/* ── Video ref list ── */
.video-ref-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.video-ref-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.video-ref-thumb {
  width: 80px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--c-border);
  background: #000;
}

/* ── Audio list ── */
.audio-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.audio-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(34, 197, 94, 0.05);
  border-radius: 8px;
  padding: 6px 10px;
}

.audio-badge {
  font-family: monospace;
  font-size: 11px;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  border-radius: 4px;
  padding: 2px 6px;
  flex-shrink: 0;
}

.audio-player {
  flex: 1;
  min-width: 0;
  height: 32px;
}

/* ── Mode hints ── */
.mode-hint {
  font-size: 12px;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.07);
  border: 1px solid rgba(34, 197, 94, 0.18);
  border-radius: 8px;
  padding: 7px 12px;
}

/* ── Extend job list ── */
.empty-extend {
  font-size: 13px;
  color: var(--c-text-secondary, #888);
  padding: 16px;
  text-align: center;
  border: 1px dashed var(--c-border);
  border-radius: 8px;
}

.extend-job-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.extend-job-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--c-border, #2a2a4a);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  position: relative;
}

.extend-job-item:hover {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.05);
}

.extend-job-item.selected {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.extend-job-thumb {
  width: 80px;
  height: 50px;
  object-fit: cover;
  border-radius: 5px;
  background: #000;
  flex-shrink: 0;
}

.extend-job-info {
  flex: 1;
  min-width: 0;
}

.extend-job-date {
  font-size: 11px;
  color: var(--c-text-secondary, #888);
}

.extend-job-meta {
  font-size: 12px;
  color: #22c55e;
  font-weight: 600;
}

.extend-job-prompt {
  font-size: 12px;
  color: var(--c-text-secondary, #aaa);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.extend-check {
  font-size: 16px;
  color: #22c55e;
  font-weight: 700;
  flex-shrink: 0;
}

.extend-preview {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.extend-preview-video {
  width: 100%;
  max-height: 200px;
  border-radius: 8px;
  background: #000;
}

.extend-duration-fixed {
  font-size: 13px;
  color: #22c55e;
  font-weight: 600;
  padding: 6px 0;
}

/* ── Params grid ── */
.params-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.params-grid .form-group {
  flex: 1;
  min-width: 180px;
}

.pill-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pill-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text-secondary, #888);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.pill-btn:hover {
  border-color: #22c55e;
  color: #22c55e;
}

.pill-btn.active {
  background: #22c55e;
  border-color: #22c55e;
  color: #000;
  font-weight: 600;
}

/* ── Cost hint ── */
.cost-hint {
  font-size: 13px;
  color: var(--c-text-secondary, #888);
  background: rgba(34, 197, 94, 0.06);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
}

.cost-label { color: var(--c-text-secondary, #888); }
.cost-value { color: #22c55e; font-weight: 600; margin: 0 4px; }
.cost-note { font-size: 12px; }

/* ── Error ── */
.error-banner {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 10px 14px;
  color: #fda4af;
  font-size: 13px;
}

/* ── Submit row ── */
.submit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-seedance {
  background: linear-gradient(135deg, #16a34a, #22c55e);
  color: #fff;
  border: none;
  padding: 10px 28px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  box-shadow: 0 2px 12px rgba(34, 197, 94, 0.35);
}

.btn-seedance:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-seedance:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-hint {
  font-size: 12px;
  color: var(--c-text-secondary, #888);
  flex: 1;
}

/* ── History ── */
.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.history-card {
  border: 1px solid var(--c-border, #2a2a4a);
  border-radius: 10px;
  background: rgba(34, 197, 94, 0.03);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.history-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-type {
  font-size: 13px;
  font-weight: 600;
  color: #22c55e;
}

.history-date {
  font-size: 12px;
  color: var(--c-text-secondary, #888);
}

.history-detail {
  font-size: 12px;
  color: var(--c-text-secondary, #888);
}

.history-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.prompt-details {
  cursor: pointer;
}

.prompt-summary {
  font-size: 13px;
  color: var(--c-text-secondary, #888);
  line-height: 1.5;
  list-style: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.prompt-full {
  font-size: 13px;
  color: var(--c-text, #ddd);
  line-height: 1.6;
  margin-top: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}

.job-cost {
  font-size: 12px;
  color: #22c55e;
}

.error-text {
  font-size: 12px;
  color: #fda4af;
  line-height: 1.5;
}

/* ── Processing spinner ── */
.processing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--c-text-secondary, #888);
  padding: 6px 0;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(34, 197, 94, 0.25);
  border-top-color: #22c55e;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Video ── */
.video-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.job-video {
  width: 100%;
  border-radius: 8px;
  background: #000;
}

.video-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ── Badge overrides ── */
.badge-ai {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

/* ── Empty state ── */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--c-text-secondary, #888);
}

.empty-state-icon { font-size: 40px; margin-bottom: 12px; }
.empty-state-title { font-size: 16px; font-weight: 600; margin-bottom: 6px; color: var(--c-text, #ddd); }
.empty-state-desc { font-size: 13px; }

/* ── Mobile Responsive ── */
@media (max-width: 768px) {
  /* Pill buttons (片長, 比例, 品質): wrap naturally — already flex-wrap, reduce min-width */
  .params-grid .form-group {
    min-width: 120px;
  }

  /* Params grid: stack vertically */
  .params-grid {
    flex-direction: column;
    gap: 12px;
  }

  /* Image upload area: full width (already is, ensure no overflow) */
  .upload-area {
    width: 100%;
    box-sizing: border-box;
  }

  /* Camera movement tags: already flex-wrap, reduce padding */
  .camera-btn {
    padding: 4px 10px;
    font-size: 11px;
  }

  /* History section: single column */
  .history-grid {
    grid-template-columns: 1fr;
  }

  /* History card: less padding */
  .history-card {
    padding: 10px 12px;
  }

  /* History head: wrap */
  .history-head {
    flex-wrap: wrap;
    gap: 6px;
  }

  /* History actions: wrap and compact */
  .history-actions {
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-start;
  }

  /* Mode strip: scrollable (already flex-wrap, but force scroll on very small screens) */
  .mode-strip {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding-bottom: 4px;
  }
  .mode-strip::-webkit-scrollbar {
    display: none;
  }
  .mode-pill {
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* API key row: wrap */
  .api-key-row {
    flex-wrap: wrap;
  }
  .api-key-row .form-input {
    width: 100%;
  }

  /* Label row right: wrap */
  .label-row-right {
    flex-wrap: wrap;
    gap: 6px;
  }

  /* Extend job thumbnail: smaller on mobile */
  .extend-job-thumb {
    width: 60px;
    height: 40px;
  }
}
</style>
