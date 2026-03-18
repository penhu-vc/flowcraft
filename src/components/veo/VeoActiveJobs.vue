<template>
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
</template>

<script setup lang="ts">
import type { VeoJob, VeoSourceMode } from '../../api/veo'

defineProps<{
  activeJobs: VeoJob[]
  modeLabelMap: Record<VeoSourceMode, string>
}>()

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
.status-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.compact-empty {
  padding: 28px 16px;
}

.status-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.03);
  padding: 14px;
}

.status-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.status-prompt {
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

.mini-meta {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
