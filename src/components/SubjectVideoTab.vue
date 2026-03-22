<template>
  <div class="subject-page">
    <!-- Reference Images -->
    <section class="card">
      <div class="card-header">
        <h3>📸 參考圖</h3>
      </div>
      <div class="card-body">
        <div class="ref-grid">
          <div
            v-for="(slot, idx) in refSlots"
            :key="idx"
            class="ref-slot"
            @dragover.prevent
            @drop.prevent="onDrop(idx, $event)"
            @click="pickFile(idx)"
          >
            <template v-if="slot && slot.previewUrl">
              <img :src="slot.previewUrl" class="ref-preview" />
              <button class="ref-remove" @click.stop="removeRef(idx)">×</button>
              <div class="ref-label">{{ slotLabels[idx] }}</div>
            </template>
            <template v-else>
              <div class="ref-placeholder">
                <div class="ref-placeholder-icon">+</div>
                <div class="ref-placeholder-text">{{ slotLabels[idx] }}</div>
              </div>
            </template>
          </div>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          style="display: none"
          @change="onFileChange"
        />

        <button
          v-if="filledCount > 0"
          class="btn btn-secondary btn-sm"
          :disabled="analyzing"
          style="margin-top: 8px"
          @click="analyzeImages"
        >
          {{ analyzing ? '🔍 AI 分析中...' : '🔍 AI 分析參考圖' }}
        </button>

        <div v-if="aiDescription" class="ai-desc">
          <label>AI 分析結果：</label>
          <textarea
            v-model="aiDescription"
            class="form-input"
            rows="3"
            style="font-size: 13px"
          />
        </div>
      </div>
    </section>

    <!-- Action Description -->
    <section class="card">
      <div class="card-header">
        <h3>🎬 動作描述</h3>
      </div>
      <div class="card-body">
        <textarea
          v-model="actionPrompt"
          class="form-input"
          rows="3"
          placeholder="描述人物要做什麼動作，例如：她面帶微笑，自信地對著鏡頭介紹自己..."
          style="font-size: 14px"
        />
      </div>
    </section>

    <!-- Settings -->
    <section class="card">
      <div class="card-header">
        <h3>⚙️ 設定</h3>
      </div>
      <div class="card-body settings-row">
        <div class="setting-item">
          <label>比例</label>
          <select v-model="aspectRatio" class="form-input form-input-sm">
            <option value="9:16">9:16（直式）</option>
            <option value="16:9">16:9（橫式）</option>
          </select>
        </div>
        <div class="setting-item">
          <label>
            <input type="checkbox" v-model="asianEmphasis" />
            強調亞洲/台灣人特徵
          </label>
        </div>
      </div>
    </section>

    <!-- Generate -->
    <button
      class="btn btn-primary generate-btn"
      :disabled="!canGenerate || generating"
      @click="generate"
    >
      {{ generating ? '🚀 生成中...' : '🚀 生成角色影片' }}
    </button>
    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <!-- Jobs -->
    <section v-if="jobs.length > 0" class="card">
      <div class="card-header">
        <h3>📋 生成歷史</h3>
      </div>
      <div class="card-body">
        <div class="job-list">
          <div v-for="job in jobs" :key="job.id" class="job-card">
            <div class="job-head">
              <span class="badge" :class="badgeClass(job.status)">{{ job.status }}</span>
              <span class="job-date">{{ formatDate(job.createdAt) }}</span>
              <button class="btn btn-danger btn-sm" @click="deleteJob(job.id)">刪除</button>
            </div>
            <p class="job-prompt">{{ job.prompt.substring(0, 120) }}...</p>
            <div v-if="job.outputs?.length" class="job-videos">
              <div v-for="output in job.outputs" :key="output.index" class="video-card">
                <video :src="output.localUrl" controls preload="metadata" />
                <a :href="output.localUrl" download class="btn btn-secondary btn-sm">下載</a>
              </div>
            </div>
            <div v-if="job.status === 'running' || job.status === 'pending'" class="job-loading">
              ⏳ 生成中，約需 1-2 分鐘...
            </div>
            <!-- 失敗說明 -->
            <div v-if="job.error" class="failure-block">
              <p class="error-text">{{ job.error }}</p>
              <div v-if="job.failureAnalysis" class="failure-analysis">
                <div class="fa-header">
                  <span class="fa-badge">{{ job.failureAnalysis.reason }}</span>
                </div>
                <div class="fa-section">
                  <div class="fa-label">說明</div>
                  <p class="fa-text">{{ job.failureAnalysis.explanation }}</p>
                </div>
                <div v-if="job.failureAnalysis.promptIssues?.length" class="fa-section">
                  <div class="fa-label">AI 檢測到的問題</div>
                  <ul class="fa-issues">
                    <li v-for="(issue, i) in job.failureAnalysis.promptIssues" :key="i">{{ issue }}</li>
                  </ul>
                </div>
                <div class="fa-section">
                  <div class="fa-label">修改建議</div>
                  <p class="fa-text">{{ job.failureAnalysis.suggestion }}</p>
                </div>
              </div>
              <button
                v-else-if="job.status === 'failed'"
                class="btn btn-secondary btn-sm fa-analyze-btn"
                :disabled="analyzingJobId === job.id"
                @click="runJobAnalysis(job)"
              >
                {{ analyzingJobId === job.id ? '🔍 AI 分析中...' : '🔍 AI 分析失敗原因' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  geminiGenerate,
  geminiPoll,
  describeForVideo,
  deleteVeoJob,
  analyzeFailure,
  type VeoJob,
  type FailureAnalysis,
} from '../api/veo'

interface RefSlot {
  base64Data: string
  mimeType: string
  previewUrl: string
}

const slotLabels = ['🖼️ 首幀（場景+人物）', '👤 正面特寫', '👤 側面/其他角度']
const refSlots = ref<(RefSlot | null)[]>([null, null, null])
const fileInput = ref<HTMLInputElement | null>(null)
const activeSlotIdx = ref(0)
const aiDescription = ref('')
const actionPrompt = ref('')
const aspectRatio = ref<'9:16' | '16:9'>('9:16')
const asianEmphasis = ref(true)
const analyzing = ref(false)
const generating = ref(false)
const errorMessage = ref('')
const jobs = ref<VeoJob[]>([])
let pollTimer: number | null = null

const analyzingJobId = ref<string | null>(null)

const filledCount = computed(() => refSlots.value.filter(Boolean).length)
const canGenerate = computed(() => filledCount.value > 0 && actionPrompt.value.trim().length > 0)

function pickFile(idx: number) {
  if (refSlots.value[idx]) return // 已有圖，不再開檔
  activeSlotIdx.value = idx
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileToSlot(file, activeSlotIdx.value)
  ;(e.target as HTMLInputElement).value = ''
}

function onDrop(idx: number, e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (file) fileToSlot(file, idx)
}

function fileToSlot(file: File, idx: number) {
  const reader = new FileReader()
  reader.onload = () => {
    const base64 = reader.result as string
    refSlots.value[idx] = {
      base64Data: base64,
      mimeType: file.type || 'image/jpeg',
      previewUrl: base64,
    }
  }
  reader.readAsDataURL(file)
}

function removeRef(idx: number) {
  refSlots.value[idx] = null
}

async function analyzeImages() {
  const first = refSlots.value.find(Boolean)
  if (!first) return
  analyzing.value = true
  try {
    const result = await describeForVideo({
      base64Data: first.base64Data,
      mimeType: first.mimeType,
    })
    aiDescription.value = result.description
  } catch (err: any) {
    errorMessage.value = err.message || '分析失敗'
  } finally {
    analyzing.value = false
  }
}

function buildPrompt(): string {
  const parts: string[] = []

  if (asianEmphasis.value) {
    parts.push('A young East Asian Taiwanese woman, exactly matching the person in the reference images — same face, same hair, same outfit, same skin tone.')
  } else {
    parts.push('A person exactly matching the reference images — same face, same hair, same outfit, same skin tone.')
  }

  if (aiDescription.value.trim()) {
    parts.push(aiDescription.value.trim())
  }

  parts.push(actionPrompt.value.trim())

  if (asianEmphasis.value) {
    parts.push('The woman must look authentically East Asian with natural Asian facial features as shown in the references.')
  }

  parts.push('Vlog-style, medium close-up at eye level. Soft natural lighting.')

  return parts.join(' ')
}

async function generate() {
  const filled = refSlots.value.map((slot, idx) => slot ? { ...slot, idx } : null).filter(Boolean) as (RefSlot & { idx: number })[]
  if (filled.length === 0) return
  generating.value = true
  errorMessage.value = ''

  try {
    const prompt = buildPrompt()
    // 第 0 格 = style（鎖背景），其餘 = subject（鎖臉）
    const result = await geminiGenerate({
      referenceImages: filled.map((r) => ({
        base64Data: r.base64Data,
        mimeType: r.mimeType,
        referenceType: r.idx === 0 ? 'style' : 'subject',
      })),
      prompt,
      aspectRatio: aspectRatio.value,
      personGeneration: 'allow_adult',
    })

    jobs.value.unshift(result.job)
    startPolling()
  } catch (err: any) {
    errorMessage.value = err.message || '生成失敗'
  } finally {
    generating.value = false
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = window.setInterval(async () => {
    const pendingJobs = jobs.value.filter(
      (j) => j.status === 'pending' || j.status === 'running'
    )
    if (pendingJobs.length === 0) {
      stopPolling()
      return
    }
    for (const job of pendingJobs) {
      try {
        const result = await geminiPoll(job.id)
        const idx = jobs.value.findIndex((j) => j.id === job.id)
        if (idx >= 0) jobs.value[idx] = result.job
      } catch {
        // ignore poll errors
      }
    }
  }, 10000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function deleteJob(jobId: string) {
  try {
    await deleteVeoJob(jobId)
    jobs.value = jobs.value.filter((j) => j.id !== jobId)
  } catch {
    // ignore
  }
}

async function runJobAnalysis(job: VeoJob) {
  if (!job.error || !job.prompt) return
  analyzingJobId.value = job.id
  try {
    const result = await analyzeFailure(job.prompt, job.error)
    const idx = jobs.value.findIndex(j => j.id === job.id)
    if (idx >= 0) {
      jobs.value[idx] = { ...jobs.value[idx], failureAnalysis: result.analysis }
    }
  } catch {
    // ignore
  } finally {
    analyzingJobId.value = null
  }
}

function badgeClass(status: string) {
  return {
    'badge-active': status === 'completed',
    'badge-trigger': status === 'failed',
    'badge-pending': status === 'pending' || status === 'running',
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 載入歷史（從 veo jobs 中篩選 gemini-api 的 references jobs）
async function loadJobs() {
  try {
    const res = await fetch('/api/veo/jobs')
    const data = await res.json()
    if (data.ok) {
      jobs.value = (data.jobs as VeoJob[]).filter(
        (j) => j.authMode === ('gemini-api' as any) && j.sourceMode === 'references'
      )
      // 如果有 pending/running 的，開始 polling
      if (jobs.value.some((j) => j.status === 'pending' || j.status === 'running')) {
        startPolling()
      }
    }
  } catch {
    // ignore
  }
}

onMounted(loadJobs)
onUnmounted(stopPolling)
</script>

<style scoped>
.subject-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ref-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.ref-slot {
  position: relative;
  aspect-ratio: 3 / 4;
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.2s;
}

.ref-slot:hover {
  border-color: rgba(255, 255, 255, 0.35);
}

.ref-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ref-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ref-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  text-align: center;
}

.ref-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: rgba(255, 255, 255, 0.4);
}

.ref-placeholder-icon {
  font-size: 28px;
}

.ref-placeholder-text {
  font-size: 12px;
}

.ai-desc {
  margin-top: 10px;
}

.ai-desc label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
  display: block;
}

.settings-row {
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.setting-item label {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.generate-btn {
  width: 100%;
  padding: 12px;
  font-size: 16px;
}

.error-text {
  color: #f44;
  font-size: 13px;
  margin-top: 6px;
}

.failure-block {
  margin-top: 6px;
}

.failure-analysis {
  margin-top: 8px;
  background: rgba(255, 100, 100, 0.06);
  border: 1px solid rgba(255, 100, 100, 0.15);
  border-radius: 8px;
  padding: 12px;
}

.fa-header {
  margin-bottom: 8px;
}

.fa-badge {
  background: rgba(255, 100, 100, 0.2);
  color: #fda4af;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.fa-section {
  margin-bottom: 8px;
}

.fa-section:last-child {
  margin-bottom: 0;
}

.fa-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 600;
  margin-bottom: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.fa-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.6;
  margin: 0;
}

.fa-issues {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: #fbbf24;
  line-height: 1.8;
}

.fa-analyze-btn {
  margin-top: 6px;
  font-size: 12px;
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.job-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px;
}

.job-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.job-date {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  flex: 1;
}

.job-prompt {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
}

.job-videos {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.video-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 300px;
}

.video-card video {
  width: 100%;
  border-radius: 8px;
}

.job-loading {
  padding: 12px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
}

.badge-pending {
  background: rgba(255, 165, 0, 0.2);
  color: orange;
}
</style>
