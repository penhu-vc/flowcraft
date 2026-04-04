<template>
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
              <button v-if="job.requestSnapshot" class="btn btn-secondary btn-sm" @click="$emit('restore', job)">恢復設定</button>
              <button class="btn btn-danger btn-sm" @click="$emit('remove', job.id)">刪除</button>
            </div>
          </div>
          <p class="history-prompt">{{ job.prompt || '無文字 prompt' }}</p>
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
              @click="runAnalysis(job)"
            >
              {{ analyzingJobId === job.id ? '🔍 AI 分析中...' : '🔍 AI 分析失敗原因' }}
            </button>
          </div>

          <!-- Single or few videos: show all -->
          <div v-if="job.outputs.length > 0 && job.outputs.length <= 3" class="video-grid">
            <div v-for="output in job.outputs" :key="`${job.id}-${output.index}`" class="video-card media-card-wrap">
              <video v-if="output.localUrl" :src="resolveMediaUrl(output.localUrl)" controls playsinline />
              <button v-if="output.localUrl && !hasAsset(resolveMediaUrl(output.localUrl))" class="collect-btn" @click="$emit('collect', output.localUrl, 'video')" title="收入囊中">🎒 收入囊中</button>
              <span v-else-if="output.localUrl && hasAsset(resolveMediaUrl(output.localUrl))" class="collect-done">✅ 已收</span>
              <div class="video-actions">
                <a v-if="output.localUrl" class="btn btn-secondary btn-sm" :href="resolveMediaUrl(output.localUrl)" target="_blank" rel="noreferrer"> 開啟 </a>
                <button class="btn btn-primary btn-sm" @click="$emit('extend', job.id, output.index, output.localUrl)"> 延長這支 </button>
              </div>
            </div>
          </div>

          <!-- Multi-video (4+): hero video + collapsible scene grid -->
          <div v-else-if="job.outputs.length > 3" class="multi-video-layout">
            <!-- Hero: first video (full version) -->
            <div class="hero-video media-card-wrap">
              <div v-if="(job.outputs[0] as any)?.label" class="hero-label">{{ (job.outputs[0] as any).label }}</div>
              <video v-if="job.outputs[0]?.localUrl" :src="resolveMediaUrl(job.outputs[0].localUrl)" controls playsinline />
              <button v-if="job.outputs[0]?.localUrl && !hasAsset(resolveMediaUrl(job.outputs[0].localUrl))" class="collect-btn" @click="$emit('collect', job.outputs[0].localUrl!, 'video')" title="收入囊中">🎒 收入囊中</button>
              <div class="video-actions">
                <a v-if="job.outputs[0]?.localUrl" class="btn btn-secondary btn-sm" :href="resolveMediaUrl(job.outputs[0].localUrl)" target="_blank" rel="noreferrer"> 開啟 </a>
                <button class="btn btn-primary btn-sm" @click="$emit('extend', job.id, 0, job.outputs[0]?.localUrl)"> 延長這支 </button>
              </div>
            </div>
            <!-- Collapsible scene grid -->
            <details class="scene-details">
              <summary class="scene-summary">📎 {{ job.outputs.length - 1 }} 個分段場景</summary>
              <div class="scene-grid">
                <div v-for="output in job.outputs.slice(1)" :key="`${job.id}-${output.index}`" class="scene-thumb media-card-wrap">
                  <div v-if="(output as any)?.label" class="scene-label">{{ (output as any).label }}</div>
                  <video v-if="output.localUrl" :src="resolveMediaUrl(output.localUrl)" controls playsinline />
                  <div class="video-actions">
                    <a v-if="output.localUrl" class="btn btn-secondary btn-sm" :href="resolveMediaUrl(output.localUrl)" target="_blank" rel="noreferrer"> 開啟 </a>
                    <button class="btn btn-primary btn-sm" @click="$emit('extend', job.id, output.index, output.localUrl)"> 延長 </button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { API_BASE_URL } from '../../api/config'
import { analyzeFailure, type VeoJob, type VeoSourceMode } from '../../api/veo'

const props = defineProps<{
  jobs: VeoJob[]
  modeLabelMap: Record<VeoSourceMode, string>
  hasAsset: (url: string) => boolean
}>()

const emit = defineEmits<{
  (e: 'restore', job: VeoJob): void
  (e: 'remove', jobId: string): void
  (e: 'extend', jobId: string, index: number, localUrl?: string): void
  (e: 'collect', url: string, type: 'video'): void
  (e: 'updateJob', job: VeoJob): void
}>()

const analyzingJobId = ref<string | null>(null)

async function runAnalysis(job: VeoJob) {
  if (!job.error || !job.prompt) return
  analyzingJobId.value = job.id
  try {
    const result = await analyzeFailure(job.prompt, job.error)
    job.failureAnalysis = result.analysis
    emit('updateJob', job)
  } catch {
    // ignore
  } finally {
    analyzingJobId.value = null
  }
}

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
</script>

<style scoped>
.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.history-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.03);
  padding: 14px;
}

.history-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.history-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.history-prompt {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.mini-meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.error-text {
  color: #fda4af;
  font-size: 12px;
  line-height: 1.5;
}

.failure-block {
  margin-bottom: 10px;
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
  color: var(--text-secondary, #888);
  font-weight: 600;
  margin-bottom: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.fa-text {
  font-size: 12px;
  color: var(--text-primary, #ddd);
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

.video-grid {
  display: grid;
  gap: 12px;
}

.video-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.03);
  padding: 10px;
}

.video-card video {
  width: 100%;
  border-radius: 10px;
  background: #000;
  margin-bottom: 10px;
}

.video-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.media-card-wrap {
  position: relative;
}
.collect-btn {
  position: absolute;
  top: 16px;
  right: 16px;
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
  top: 16px;
  right: 16px;
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

/* ── Multi-video layout ── */
.multi-video-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hero-video {
  position: relative;
}
.hero-video video {
  width: 100%;
  max-height: 480px;
  object-fit: contain;
  border-radius: 10px;
  background: #000;
}
.hero-label {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(139, 92, 246, 0.85);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 6px;
  z-index: 5;
}
.scene-details {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  overflow: hidden;
}
.scene-summary {
  cursor: pointer;
  padding: 10px 16px;
  font-size: 14px;
  color: rgba(255,255,255,0.6);
  background: rgba(255,255,255,0.03);
  user-select: none;
}
.scene-summary:hover {
  color: rgba(255,255,255,0.9);
  background: rgba(255,255,255,0.06);
}
.scene-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 12px;
}
.scene-thumb {
  position: relative;
}
.scene-thumb video {
  width: 100%;
  border-radius: 8px;
  background: #000;
}
.scene-label {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0,0,0,0.7);
  color: rgba(255,255,255,0.8);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  z-index: 5;
}
.scene-thumb .video-actions {
  justify-content: center;
  gap: 4px;
  padding: 4px 0;
}
.scene-thumb .video-actions .btn {
  font-size: 11px;
  padding: 2px 8px;
}

@media (max-width: 720px) {
  .history-head {
    flex-direction: column;
    align-items: flex-start;
  }
  .scene-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  /* Video grid: single column */
  .history-grid {
    grid-template-columns: 1fr;
  }

  /* History cards: smaller padding */
  .history-card {
    padding: 10px;
  }

  /* Failure analysis panels: full width */
  .failure-analysis {
    width: 100%;
    box-sizing: border-box;
  }

  /* Action buttons: smaller on mobile */
  .video-actions .btn {
    font-size: 11px;
    padding: 5px 10px;
  }

  /* History head actions: wrap on small screens */
  .history-actions {
    flex-wrap: wrap;
    gap: 6px;
  }

  /* Scene grid: single column on mobile */
  .scene-grid {
    grid-template-columns: 1fr;
  }
}
</style>
