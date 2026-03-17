<template>
  <div class="nano-page">
    <!-- Prompt Optimizer -->
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
                <img :src="slot.preview" :alt="'參考圖 ' + (idx + 1)" class="ref-slot-img" @click.stop="openLightboxDirect(slot.preview)" title="點擊放大" style="cursor: zoom-in;" />
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

    <!-- Generation Form -->
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

          <div class="form-group">
            <label class="form-label">Prompt</label>
            <textarea
              v-model="form.prompt"
              class="form-textarea veo-textarea"
              placeholder="描述主體、場景、風格、光線、構圖。"
            />
          </div>

          <div class="nano-params-row">
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

          <div class="form-group">
            <label class="form-label">Negative Prompt</label>
            <textarea
              v-model="form.negativePrompt"
              class="form-textarea"
              placeholder="指定不要出現的內容，例如 blur, watermark, text overlay。"
            />
          </div>

          <!-- Edit mode: upload image + mask painting -->
          <div v-if="form.sourceMode === 'edit'" class="asset-block" @dragover.prevent @drop="onEditDropAsset">
            <div class="asset-head">
              <span>編輯圖片</span>
              <label class="btn btn-secondary btn-sm">
                上傳圖片
                <input type="file" accept="image/*" hidden @change="onImageUpload" />
              </label>
            </div>
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
                  @click="oneClickRemove"
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
          </div>

          <!-- Reference mode: upload reference images -->
          <div v-if="form.sourceMode === 'reference'" class="asset-block">
            <div class="asset-head">
              <span>參考圖片</span>
              <span class="ref-rule-hint ref-tooltip-wrap">
                最多 14 張 · 3 種參考類型
                <span class="hint-icon">?</span>
                <span class="ref-tooltip">
                  <strong>🎯 Subject（主體）</strong><br/>
                  告訴模型「這個東西長什麼樣子」<br/>
                  · Person — 人物臉/身體<br/>
                  · Animal — 動物<br/>
                  · Product — 產品照<br/>
                  · Default — Logo、建築等<br/><br/>
                  <strong>🎨 Style（風格）</strong><br/>
                  告訴模型「要這種視覺感覺」<br/>
                  例：水彩風、賽博龐克、油畫風格<br/><br/>
                  <strong>🕹️ Control（進階控制）</strong><br/>
                  用結構圖控制構圖和姿勢<br/>
                  · Canny Edge — 邊緣線稿<br/>
                  · Scribble — 手繪草圖<br/>
                  · Face Mesh — 臉部網格
                </span>
              </span>
            </div>
            <div class="ref-slots-grid">
              <div
                v-for="slot in 14"
                :key="slot"
                class="ref-slot-wrapper"
              >
                <div
                  class="ref-slot media-card-wrap"
                  :class="{ filled: !!refSlots[slot - 1], disabled: !refSlots[slot - 1] && form.referenceImages.length >= 14 }"
                >
                  <template v-if="refSlots[slot - 1]">
                    <img :src="refSlots[slot - 1]!.previewUrl" alt="Reference" @click="openLightboxDirect(refSlots[slot - 1]!.previewUrl)" style="cursor: zoom-in;" />
                    <button
                      v-if="!hasAsset(refSlots[slot - 1]!.previewUrl)"
                      class="collect-btn"
                      @click.stop="collectAssetDirect(refSlots[slot - 1]!.previewUrl)"
                      title="收入囊中"
                    >🎒 收入囊中</button>
                    <span v-else class="collect-done">✅ 已收</span>
                    <div class="ref-slot-controls">
                      <select
                        :value="refSlots[slot - 1]!.referenceType"
                        class="form-select form-select-sm ref-type-select"
                        @change="onRefTypeChange(slot - 1, ($event.target as HTMLSelectElement).value as NanoRefType)"
                      >
                        <optgroup label="主體 Subject">
                          <option value="subject_person">👤 人物</option>
                          <option value="subject_animal">🐾 動物</option>
                          <option value="subject_product">📦 產品</option>
                          <option value="subject_default">🎯 其他物品</option>
                        </optgroup>
                        <optgroup label="風格 Style">
                          <option value="style">🎨 風格參考</option>
                        </optgroup>
                        <optgroup label="控制 Control">
                          <option value="control_canny">✏️ 邊緣線稿</option>
                          <option value="control_scribble">🖊️ 手繪草圖</option>
                          <option value="control_face_mesh">🧑 臉部網格</option>
                        </optgroup>
                      </select>
                      <button class="ref-remove-btn" @click="removeReference(slot - 1)" title="移除">✕</button>
                    </div>
                  </template>
                  <template v-else>
                    <label v-if="form.referenceImages.length < 14" class="ref-slot-empty" tabindex="0" @dragover.prevent @drop.prevent="onRefDropAsset($event, slot - 1)" @paste.prevent="onRefPaste($event, slot - 1)" @mouseenter="($event.target as HTMLElement).focus()" @mouseleave="($event.target as HTMLElement).blur()">
                      <span class="ref-slot-plus">+</span>
                      <span class="ref-slot-label">上傳 / 貼上</span>
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

          <div class="submit-row">
            <p class="hint">
              {{ submitHint }}
            </p>
            <button class="btn btn-primary" :disabled="submitting || !canSubmit" @click="submit">
              {{ submitting ? '生成中...' : '🎨 生成圖片' }}
            </button>
          </div>

          <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        </div>
    </section>

    <!-- 即時任務 -->
    <section class="card">
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
          <p class="status-prompt">{{ job.prompt }}</p>
          <div class="progress-shell">
            <div class="progress-bar progress-indeterminate" />
          </div>
        </div>
      </div>
    </section>

    <!-- History -->
    <section class="card">
      <div class="card-header">
        <span class="card-title">作品與歷史</span>
        <div class="history-stats" v-if="jobs.length > 0">
          <span v-if="activeJobs.length" class="stat-badge stat-running">🔄 {{ activeJobs.length }} 進行中</span>
          <span v-if="completedJobs.length" class="stat-badge stat-completed">✅ {{ completedJobs.length }} 已完成</span>
          <span v-if="failedJobs.length" class="stat-badge stat-failed">❌ {{ failedJobs.length }} 失敗</span>
        </div>
      </div>
      <div class="card-body">
        <div v-if="jobs.length === 0" class="empty-state">
          <div class="empty-state-icon">🖼️</div>
          <div class="empty-state-title">尚未有任何圖片</div>
          <div class="empty-state-desc">生成第一張圖片後，這裡會保留可下載的歷史紀錄。</div>
        </div>

        <div v-else class="history-grid">
          <article v-for="job in jobs" :key="job.id" class="history-card">
            <div class="history-head">
              <div>
                <strong>{{ modeLabelMap[job.sourceMode] }}</strong>
                <div class="mini-meta">{{ formatDate(job.createdAt) }}</div>
              </div>
              <div class="history-actions">
                <span class="badge" :class="job.status === 'completed' ? 'badge-active' : job.status === 'failed' ? 'badge-trigger' : 'badge-ai'">
                  {{ job.status }}
                </span>
                <button v-if="job.requestSnapshot" class="btn btn-secondary btn-sm" @click="restoreJob(job)">恢復設定</button>
                <button class="btn btn-danger btn-sm" @click="removeJob(job.id)">刪除</button>
              </div>
            </div>
            <p class="history-prompt">{{ job.prompt }}</p>
            <p v-if="job.error" class="error-text">{{ job.error }}</p>

            <div v-if="job.outputs.length > 0" class="image-grid">
              <div v-for="output in job.outputs" :key="`${job.id}-${output.index}`" class="image-card media-card-wrap">
                <img
                  v-if="output.localUrl"
                  :src="resolveMediaUrl(output.localUrl)"
                  alt="Generated image"
                  @click="openImage(output.localUrl!)"
                />
                <button
                  v-if="output.localUrl && !hasAsset(resolveMediaUrl(output.localUrl))"
                  class="collect-btn"
                  @click.stop="collectAsset(output.localUrl)"
                  title="收入囊中"
                >🎒 收入囊中</button>
                <span v-else-if="output.localUrl && hasAsset(resolveMediaUrl(output.localUrl))" class="collect-done">✅ 已收</span>
                <div class="video-actions">
                  <a
                    v-if="output.localUrl"
                    class="btn btn-secondary btn-sm"
                    :href="resolveMediaUrl(output.localUrl)"
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    下載
                  </a>
                  <button class="btn btn-primary btn-sm" @click="useAsEditSource(output.localUrl!)">
                    編輯這張
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Lightbox -->
    <Teleport to="body">
      <div v-if="lightboxUrl" class="lightbox-overlay" @click.self="closeLightbox" @keydown="onLightboxKeydown" tabindex="0" ref="lightboxRef">
        <button class="lightbox-close" @click="closeLightbox">&times;</button>
        <img :src="lightboxUrl" class="lightbox-img" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import { useAssetLibrary } from '../composables/useAssetLibrary'
import { API_BASE_URL, API_ENDPOINTS } from '../api/config'
import {
  createNanoJob,
  deleteNanoJob,
  fetchNanoJobs,
  optimizeNanoPrompt,
  type NanoGenerationPayload,
  type NanoInlineAsset,
  type NanoJob,
  type NanoSourceMode,
  type NanoUiStateSnapshot,
} from '../api/nano'

const props = defineProps<{
  configured: boolean
}>()

// ── Source Modes ──
const sourceModes = [
  { value: 'text' as const, label: '文字生圖', icon: '✍️' },
  { value: 'edit' as const, label: '圖片編輯', icon: '🖌️' },
  { value: 'reference' as const, label: '參考圖', icon: '🧷' },
]

const modeLabelMap: Record<NanoSourceMode, string> = {
  text: 'Text to Image',
  edit: 'Image Editing',
  reference: 'Reference Images',
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
  /** First 64 chars of base64 as fingerprint (from first slot) */
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
  // Use first 64 chars of the base64 data as a simple fingerprint
  return base64.slice(0, 64)
}

function loadHistory(): ImageHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveHistory(histories: ImageHistory[]) {
  // Keep only latest MAX_HISTORY
  const trimmed = histories.slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed))
}

function findHistoryBySlots(slots: RefSlot[]): ImageHistory | null {
  const histories = loadHistory()
  const fingerprints = slots.filter(s => s.base64).map(s => getFingerprint(s.base64))
  if (fingerprints.length === 0) return null
  // Match if any slot fingerprint matches any history slot fingerprint
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
  // Remove existing entry with same fingerprint
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
  // Match current uploaded slots to saved slots by fingerprint
  // Restore aspects checkboxes and AI describe results for matching slots
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
  // Restore optimizer state
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

/** Returns the index of the OTHER slot that has this aspect checked, or -1 */
function getAspectOwner(aspectKey: string): number {
  for (let i = 0; i < describeSlots.length; i++) {
    if (i === activeSlotIdx.value) continue
    if (!describeSlots[i].preview) continue
    const asp = describeSlots[i].aspects.find(a => a.key === aspectKey)
    if (asp?.checked) return i
  }
  return -1
}

/** When a slot is uploaded, auto-uncheck aspects already occupied by other slots */
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

async function onRefPaste(e: ClipboardEvent, _slotIndex: number) {
  const result = await handlePasteData(e)
  if (!result || form.referenceImages.length >= 14) return
  ;(form.referenceImages as NanoRefAsset[]).push({
    base64Data: result.dataUrl,
    mimeType: result.mime,
    previewUrl: result.dataUrl,
    referenceType: 'subject_default',
  })
}

async function handlePasteData(e: ClipboardEvent): Promise<{ dataUrl: string; mime: string } | null> {
  const items = e.clipboardData?.items
  if (!items) return null

  // Check for image in clipboard
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

  // Check for text (URL)
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
    // Save to history if in reference mode with filled slots
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
  form.prompt = optimizeResult.value.fullPrompt
  if (optimizeResult.value.negativeHints) {
    form.negativePrompt = optimizeResult.value.negativeHints
  }
  form.sourceMode = optimizerMode.value
}

// ── Form State ──
const jobs = ref<NanoJob[]>([])
const submitting = ref(false)
const errorMessage = ref('')

const form = reactive<{
  sourceMode: NanoSourceMode
  prompt: string
  negativePrompt: string
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'
  imageSize: '1K' | '2K' | '4K'
  numberOfImages: number
  personGeneration: 'dont_allow' | 'allow_adult'
  image: NanoInlineAsset | null
  referenceImages: NanoInlineAsset[]
}>({
  sourceMode: 'text',
  prompt: '',
  negativePrompt: '',
  aspectRatio: '1:1',
  imageSize: '2K',
  numberOfImages: 1,
  personGeneration: 'allow_adult',
  image: null,
  referenceImages: [],
})

const activeJobs = computed(() => jobs.value.filter(j => j.status === 'running' || j.status === 'pending'))
const completedJobs = computed(() => jobs.value.filter(j => j.status === 'completed'))
const failedJobs = computed(() => jobs.value.filter(j => j.status === 'failed'))
const imagePreview = computed(() => form.image?.previewUrl || '')
const pendingRestoredMask = ref<string | null>(null)
const canSubmit = computed(() => {
  if (!props.configured) return false
  if (!form.prompt.trim()) return false
  if (form.sourceMode === 'edit' && !form.image) return false
  if (form.sourceMode === 'reference' && form.referenceImages.length === 0) return false
  return true
})

const submitHint = computed(() => {
  if (!props.configured) {
    return '先到設定頁存好 Gemini API Key 或 GCP 憑證。'
  }
  if (form.sourceMode === 'edit') {
    return '上傳圖片後，用文字描述你要做的修改。'
  }
  if (form.sourceMode === 'reference') {
    return '上傳參考圖，搭配文字描述想要的風格或內容。'
  }
  return '圖片生成是同步的，送出後等待幾秒即可看到結果。'
})

// ── Reference slots ──
type NanoRefType =
  | 'subject_person' | 'subject_animal' | 'subject_product' | 'subject_default'
  | 'style'
  | 'control_canny' | 'control_scribble' | 'control_face_mesh'

type NanoRefAsset = NanoInlineAsset & { referenceType: NanoRefType }

const refTypeLabels: Record<NanoRefType, string> = {
  subject_person: '👤 人物',
  subject_animal: '🐾 動物',
  subject_product: '📦 產品',
  subject_default: '🎯 其他物品',
  style: '🎨 風格參考',
  control_canny: '✏️ 邊緣線稿',
  control_scribble: '🖊️ 手繪草圖',
  control_face_mesh: '🧑 臉部網格',
}

const refDescriptions = ref<string[]>(Array(14).fill(''))

const refSlots = computed(() => {
  const slots: (NanoRefAsset | null)[] = Array(14).fill(null)
  ;(form.referenceImages as NanoRefAsset[]).forEach((item, i) => {
    if (i < 14) slots[i] = item
  })
  return slots
})

const hasAnyRefDescription = computed(() =>
  refDescriptions.value.some((d, i) => d.trim() && refSlots.value[i])
)

function removeReference(index: number) {
  form.referenceImages.splice(index, 1)
  refDescriptions.value.splice(index, 1)
  refDescriptions.value.push('')
}

async function onRefSlotUpload(event: Event, _slotIndex: number) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const asset = await fileToAsset(file)
  ;(form.referenceImages as NanoRefAsset[]).push({
    ...asset,
    referenceType: 'subject_default',
  })
  ;(event.target as HTMLInputElement).value = ''
}

function onRefTypeChange(index: number, newType: NanoRefType) {
  ;(form.referenceImages[index] as NanoRefAsset).referenceType = newType
}

function getRefCategoryLabel(type: NanoRefType): string {
  if (type.startsWith('subject_')) return '主體參考'
  if (type === 'style') return '風格參考'
  if (type.startsWith('control_')) return '控制參考'
  return '參考'
}

async function runRefOptimizer() {
  const parts: string[] = []
  refDescriptions.value.forEach((desc, i) => {
    const slot = refSlots.value[i]
    if (slot && desc.trim()) {
      const category = getRefCategoryLabel(slot.referenceType)
      const label = refTypeLabels[slot.referenceType]
      parts.push(`圖${i + 1}（${category} · ${label}）：${desc.trim()}`)
    }
  })
  const combined = parts.join('\n')
  if (!combined) return
  optimizerInput.value = combined
  await runOptimizer()
}

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
const originalImageSize = ref<{ width: number; height: number } | null>(null)

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

async function onImageUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  form.image = await fileToAsset(file)
  maskHasPaint.value = false

  // Auto-detect aspect ratio from uploaded image
  if (form.image?.previewUrl) {
    const img = new Image()
    img.onload = () => {
      originalImageSize.value = { width: img.naturalWidth, height: img.naturalHeight }
      const closest = detectClosestRatio(img.naturalWidth, img.naturalHeight)
      form.aspectRatio = closest as typeof form.aspectRatio
    }
    img.src = form.image.previewUrl
  }
}

// ── Mask Painting ──
const maskCanvasRef = ref<HTMLCanvasElement | null>(null)
const maskImgRef = ref<HTMLImageElement | null>(null)
const maskWrapRef = ref<HTMLDivElement | null>(null)
const maskTool = ref<'brush' | 'eraser'>('brush')
const maskBrushSize = ref(30)
const maskDrawing = ref(false)
const maskHasPaint = ref(false)

function initMaskCanvas() {
  const img = maskImgRef.value
  const canvas = maskCanvasRef.value
  if (!img || !canvas) return
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  maskHasPaint.value = false
  if (pendingRestoredMask.value) {
    const maskImage = new Image()
    maskImage.onload = () => {
      const drawCtx = canvas.getContext('2d')!
      drawCtx.clearRect(0, 0, canvas.width, canvas.height)
      drawCtx.drawImage(maskImage, 0, 0, canvas.width, canvas.height)
      maskHasPaint.value = true
      pendingRestoredMask.value = null
    }
    maskImage.src = pendingRestoredMask.value
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

function onMaskPointerDown(e: PointerEvent) {
  maskDrawing.value = true
  const canvas = maskCanvasRef.value!
  canvas.setPointerCapture(e.pointerId)
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

function onMaskPointerMove(e: PointerEvent) {
  if (!maskDrawing.value) return
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

async function oneClickRemove() {
  if (!maskHasPaint.value || !form.image) return

  // Check if original image matches the selected ratio
  const origSize = originalImageSize.value
  const needsCrop = origSize && !isRatioMatch(origSize.width, origSize.height, form.aspectRatio)

  form.prompt = 'Remove the masked area and fill with the surrounding background seamlessly. Keep the rest of the image exactly the same.'
  form.negativePrompt = 'artifact, seam, blur, distortion, change, alteration'
  await submit()

  // If original didn't match the ratio, auto-crop the latest result back to original dimensions
  if (needsCrop && origSize) {
    await cropLatestResult(origSize.width, origSize.height)
  }
}

function isRatioMatch(w: number, h: number, ratioLabel: string): boolean {
  const [rw, rh] = ratioLabel.split(':').map(Number)
  const imgRatio = w / h
  const targetRatio = rw / rh
  return Math.abs(imgRatio - targetRatio) < 0.05
}

async function cropLatestResult(origW: number, origH: number) {
  // Find the latest completed job and crop its output images
  const latestJob = jobs.value.find(j => j.status === 'completed' && j.outputs?.length)
  if (!latestJob?.outputs?.length) return

  for (const output of latestJob.outputs) {
    const url = output.localUrl?.startsWith('http') ? output.localUrl : `${API_BASE_URL}${output.localUrl}`
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = url
      })

      // Center crop to original aspect ratio
      const canvas = document.createElement('canvas')
      const scale = Math.min(img.naturalWidth / origW, img.naturalHeight / origH)
      const cropW = origW * scale
      const cropH = origH * scale
      const sx = (img.naturalWidth - cropW) / 2
      const sy = (img.naturalHeight - cropH) / 2
      canvas.width = cropW
      canvas.height = cropH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH)

      // Replace the output URL with cropped version (as blob URL)
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png')
      )
      output.localUrl = URL.createObjectURL(blob)
    } catch {
      // Skip if can't load image
    }
  }
}

function exportMaskAsBase64(): string | null {
  const canvas = maskCanvasRef.value
  if (!canvas || !maskHasPaint.value) return null
  // Create a black & white mask: white = painted area, black = keep
  const w = canvas.width
  const h = canvas.height
  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = w
  tmpCanvas.height = h
  const tmpCtx = tmpCanvas.getContext('2d')!
  // Fill black (keep)
  tmpCtx.fillStyle = '#000000'
  tmpCtx.fillRect(0, 0, w, h)
  // Get painted pixels from overlay
  const srcCtx = canvas.getContext('2d')!
  const srcData = srcCtx.getImageData(0, 0, w, h)
  const dstData = tmpCtx.getImageData(0, 0, w, h)
  for (let i = 0; i < srcData.data.length; i += 4) {
    if (srcData.data[i + 3] > 0) {
      // Has paint → white (edit this area)
      dstData.data[i] = 255
      dstData.data[i + 1] = 255
      dstData.data[i + 2] = 255
      dstData.data[i + 3] = 255
    }
  }
  tmpCtx.putImageData(dstData, 0, 0)
  return tmpCanvas.toDataURL('image/png')
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

function getDroppedAssetData(e: DragEvent): { url: string; mime: string; type: string } | null {
  const dt = e.dataTransfer
  if (!dt) return null

  const raw = dt.getData('application/x-flowcraft-asset')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { url?: string; mimeType?: string; type?: string }
      if (parsed.url) {
        return {
          url: parsed.url,
          mime: parsed.mimeType || 'image/jpeg',
          type: parsed.type || '',
        }
      }
    } catch {}
  }

  const url = dt.getData('application/x-asset-url') || dt.getData('text/uri-list') || dt.getData('text/plain')
  if (!url) return null

  return {
    url,
    mime: dt.getData('application/x-asset-mime') || 'image/jpeg',
    type: dt.getData('application/x-asset-type') || '',
  }
}

async function onEditDropAsset(e: DragEvent) {
  e.preventDefault()
  const dropped = getDroppedAssetData(e)
  if (!dropped?.url) return
  const { url, mime } = dropped
  form.image = await urlToAsset(url, mime)
  maskHasPaint.value = false
  if (form.image?.previewUrl) {
    const img = new Image()
    img.onload = () => {
      originalImageSize.value = { width: img.naturalWidth, height: img.naturalHeight }
      form.aspectRatio = detectClosestRatio(img.naturalWidth, img.naturalHeight) as typeof form.aspectRatio
    }
    img.src = form.image.previewUrl
  }
}

async function onRefDropAsset(e: DragEvent, slotIndex: number) {
  e.preventDefault()
  const dropped = getDroppedAssetData(e)
  if (!dropped?.url || form.referenceImages.length >= 14) return
  const { url, mime } = dropped
  const asset = await urlToAsset(url, mime)
  ;(form.referenceImages as NanoRefAsset[]).push({
    ...asset,
    referenceType: 'subject_default',
  })
}

async function onSlotDropAsset(e: DragEvent, idx: number) {
  e.preventDefault()
  const dropped = getDroppedAssetData(e)
  if (!dropped?.url) return
  const { url, mime } = dropped
  const asset = await urlToAsset(url, mime)
  describeSlots[idx].preview = asset.previewUrl
  describeSlots[idx].base64 = asset.base64Data.replace(/^data:[^;]+;base64,/, '')
  describeSlots[idx].mime = asset.mimeType
  describeSlots[idx].result = null
  activeSlotIdx.value = idx
  autoUncheckOccupied(idx)
  checkForHistory()
}

function switchMode(mode: NanoSourceMode) {
  form.sourceMode = mode
  errorMessage.value = ''
  form.image = null
  form.referenceImages = []
}

// ── Submit ──
async function submit() {
  submitting.value = true
  errorMessage.value = ''

  try {
    const uiState: NanoUiStateSnapshot = {
      optimizerMode: optimizerMode.value,
      optimizerInput: optimizerInput.value,
      optimizeResult: optimizeResult.value ? { ...optimizeResult.value } : null,
      refDescriptions: [...refDescriptions.value],
    }
    const payload: NanoGenerationPayload = {
      sourceMode: form.sourceMode,
      prompt: form.prompt,
      negativePrompt: form.negativePrompt || undefined,
      aspectRatio: form.aspectRatio,
      imageSize: form.imageSize,
      numberOfImages: form.numberOfImages,
      personGeneration: form.personGeneration,
      image: form.sourceMode === 'edit' ? form.image : undefined,
      maskImage: form.sourceMode === 'edit' ? (() => {
        const maskData = exportMaskAsBase64()
        return maskData ? { base64Data: maskData, mimeType: 'image/png' } : undefined
      })() : undefined,
      referenceImages: form.sourceMode === 'reference' ? form.referenceImages : undefined,
      uiState,
    }

    // Add placeholder job so 即時任務 shows progress
    const placeholderId = `placeholder-${Date.now()}`
    const placeholderJob = {
      id: placeholderId,
      status: 'running' as const,
      sourceMode: form.sourceMode,
      prompt: form.prompt,
      createdAt: new Date().toISOString(),
      outputs: [],
    }
    jobs.value.unshift(placeholderJob as any)
    startPolling()

    const { job } = await createNanoJob(payload)
    // Replace placeholder with real job
    const idx = jobs.value.findIndex(j => j.id === placeholderId)
    if (idx >= 0) jobs.value.splice(idx, 1, job)
    else jobs.value.unshift(job)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    submitting.value = false
  }
}

// ── Asset Library ──
const { addAsset, hasAsset } = useAssetLibrary()

function collectAsset(url: string) {
  const resolved = resolveMediaUrl(url)
  addAsset({ type: 'image', url: resolved, mimeType: 'image/jpeg', label: 'AI Studio' })
}

function collectAssetDirect(url: string) {
  addAsset({ type: 'image', url, mimeType: 'image/jpeg', label: 'AI Studio' })
}

// ── Actions ──
function resolveMediaUrl(path: string) {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const lightboxUrl = ref<string | null>(null)
const lightboxRef = ref<HTMLElement | null>(null)

function openImage(localUrl: string) {
  lightboxUrl.value = resolveMediaUrl(localUrl)
  nextTick(() => lightboxRef.value?.focus())
}

function openLightboxDirect(url: string) {
  lightboxUrl.value = url
  nextTick(() => lightboxRef.value?.focus())
}

function closeLightbox() {
  lightboxUrl.value = null
}

function onLightboxKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeLightbox()
}

function useAsEditSource(localUrl: string) {
  form.sourceMode = 'edit'
  form.image = {
    base64Data: '',
    mimeType: 'image/png',
    previewUrl: resolveMediaUrl(localUrl),
  }
}

function normalizeAsset(asset?: NanoInlineAsset | null): NanoInlineAsset | null {
  if (!asset?.base64Data) return null
  const previewUrl = asset.previewUrl || asset.base64Data
  return {
    ...asset,
    previewUrl,
  }
}

async function restoreJob(job: NanoJob) {
  const snapshot = job.requestSnapshot
  if (!snapshot) return

  switchMode(snapshot.sourceMode)
  form.prompt = snapshot.prompt || ''
  form.negativePrompt = snapshot.negativePrompt || ''
  form.aspectRatio = snapshot.aspectRatio || '1:1'
  form.imageSize = snapshot.imageSize || '2K'
  form.numberOfImages = snapshot.numberOfImages || 1
  form.personGeneration = snapshot.personGeneration || 'allow_adult'
  form.image = normalizeAsset(snapshot.image)
  form.referenceImages = (snapshot.referenceImages || []).map((asset) => normalizeAsset(asset)).filter(Boolean) as NanoRefAsset[]

  const uiState = snapshot.uiState
  optimizerMode.value = uiState?.optimizerMode || snapshot.sourceMode
  optimizerInput.value = uiState?.optimizerInput || ''
  optimizeResult.value = uiState?.optimizeResult ? { ...uiState.optimizeResult } as any : null
  refDescriptions.value = uiState?.refDescriptions?.slice(0, 14) || Array(14).fill('')
  while (refDescriptions.value.length < 14) refDescriptions.value.push('')

  pendingRestoredMask.value = snapshot.maskImage?.base64Data || null
  if (!pendingRestoredMask.value) {
    clearMask()
  }

  errorMessage.value = ''
  await nextTick()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function removeJob(jobId: string) {
  try {
    await deleteNanoJob(jobId)
    jobs.value = jobs.value.filter(j => j.id !== jobId)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

// ── Load & Polling ──
const pollHandle = ref<number | null>(null)

async function loadJobs() {
  try {
    const { jobs: data } = await fetchNanoJobs()
    jobs.value = data
    // Auto-start/stop polling based on active jobs
    if (activeJobs.value.length > 0) {
      startPolling()
    } else {
      stopPolling()
    }
  } catch {
    // ignore
  }
}

function startPolling() {
  if (pollHandle.value !== null) return
  pollHandle.value = window.setInterval(() => {
    void loadJobs()
  }, 5000)
}

function stopPolling() {
  if (pollHandle.value === null) return
  window.clearInterval(pollHandle.value)
  pollHandle.value = null
}

defineExpose({ loadJobs })

onMounted(loadJobs)
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.nano-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.nano-params-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.nano-params-row .form-group {
  gap: 4px;
  min-width: 0;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 8px;
}

.image-card {
  border-radius: 8px;
  overflow: hidden;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}

.image-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  cursor: pointer;
  transition: transform 0.2s;
}

.image-card img:hover {
  transform: scale(1.02);
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

/* Reference image tooltip */
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
  border: 1px solid var(--text-muted, #888);
  font-size: 10px;
  vertical-align: middle;
  margin-left: 2px;
}
.ref-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 300px;
  padding: 12px 14px;
  background: var(--bg-surface, var(--c-surface));
  border: 1px solid var(--border, var(--c-border));
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary, var(--c-text));
  z-index: 100;
  pointer-events: none;
}
.ref-tooltip-wrap:hover .ref-tooltip {
  display: block;
}

/* Reference slots grid (generation form, 14 slots) */
.asset-block .ref-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  margin-top: 8px;
}
.ref-slot-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.asset-block .ref-slot {
  border: 2px dashed var(--c-border);
  border-radius: 8px;
  aspect-ratio: 1;
  overflow: hidden;
  position: relative;
  transition: border-color 0.2s;
  width: auto;
  height: auto;
}
.ref-slot.filled {
  border-style: solid;
  border-color: var(--c-accent, #a855f7);
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
  font-size: 10px !important;
  padding: 2px 3px !important;
  background: rgba(0,0,0,0.5) !important;
  border-color: rgba(255,255,255,0.2) !important;
  color: var(--text-primary, #fff) !important;
}
.ref-type-select optgroup {
  font-weight: 600;
  font-size: 11px;
  color: #aaa;
}
.ref-type-select option {
  font-weight: 400;
  font-size: 11px;
  padding: 2px 4px;
}
.ref-remove-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(220,38,38,0.6);
  cursor: pointer;
  color: white;
  font-size: 14px;
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
  color: var(--text-muted, #888);
}
.ref-slot-empty:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary, #fff);
}
.ref-slot-locked {
  cursor: default;
}
.ref-slot-locked:hover {
  background: transparent;
  color: var(--text-muted, #888);
}
.ref-slot-plus {
  font-size: 28px;
  line-height: 1;
  font-weight: 300;
}
.ref-slot-label {
  font-size: 11px;
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

/* Mask editor */
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
.history-stats {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.stat-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.stat-pending { background: rgba(255, 193, 7, 0.15); color: #ffc107; }
.stat-running { background: rgba(33, 150, 243, 0.15); color: #64b5f6; }
.stat-completed { background: rgba(76, 175, 80, 0.15); color: #81c784; }
.stat-failed { background: rgba(244, 67, 54, 0.15); color: #e57373; }
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

.progress-indeterminate {
  width: 100% !important;
  animation: indeterminate 1.5s infinite ease-in-out;
  background: linear-gradient(90deg, transparent, var(--c-accent), transparent);
}

@keyframes indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
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

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
  outline: none;
}
.lightbox-img {
  max-width: 92vw;
  max-height: 92vh;
  object-fit: contain;
  border-radius: 6px;
  cursor: default;
}
.lightbox-close {
  position: absolute;
  top: 16px;
  right: 24px;
  background: none;
  border: none;
  color: #fff;
  font-size: 40px;
  cursor: pointer;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.lightbox-close:hover {
  opacity: 1;
}
</style>
