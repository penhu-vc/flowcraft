<template>
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
</template>

<script setup lang="ts">
import type { NanoJob, NanoSourceMode } from '../../api/nano'

defineProps<{
  activeJobs: NanoJob[]
}>()

const modeLabelMap: Record<NanoSourceMode, string> = {
  text: 'Text to Image',
  edit: 'Image Editing',
  reference: 'Reference Images',
  outpaint: 'Outpaint',
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
.status-prompt {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 6px 0;
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
</style>
