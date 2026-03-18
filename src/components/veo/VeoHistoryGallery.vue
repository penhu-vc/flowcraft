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
          <p v-if="job.error" class="error-text">{{ job.error }}</p>

          <div v-if="job.outputs.length > 0" class="video-grid">
            <div v-for="output in job.outputs" :key="`${job.id}-${output.index}`" class="video-card media-card-wrap">
              <video
                v-if="output.localUrl"
                :src="resolveMediaUrl(output.localUrl)"
                controls
                playsinline
              />
              <button
                v-if="output.localUrl && !hasAsset(resolveMediaUrl(output.localUrl))"
                class="collect-btn"
                @click="$emit('collect', output.localUrl, 'video')"
                title="收入囊中"
              >🎒 收入囊中</button>
              <span v-else-if="output.localUrl && hasAsset(resolveMediaUrl(output.localUrl))" class="collect-done">✅ 已收</span>
              <div class="video-actions">
                <a v-if="output.localUrl" class="btn btn-secondary btn-sm" :href="resolveMediaUrl(output.localUrl)" target="_blank" rel="noreferrer">
                  開啟
                </a>
                <button class="btn btn-primary btn-sm" @click="$emit('extend', job.id, output.index, output.localUrl)">
                  延長這支
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { API_BASE_URL } from '../../api/config'
import type { VeoJob, VeoSourceMode } from '../../api/veo'

defineProps<{
  jobs: VeoJob[]
  modeLabelMap: Record<VeoSourceMode, string>
  hasAsset: (url: string) => boolean
}>()

defineEmits<{
  (e: 'restore', job: VeoJob): void
  (e: 'remove', jobId: string): void
  (e: 'extend', jobId: string, index: number, localUrl?: string): void
  (e: 'collect', url: string, type: 'video'): void
}>()

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

@media (max-width: 720px) {
  .history-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
