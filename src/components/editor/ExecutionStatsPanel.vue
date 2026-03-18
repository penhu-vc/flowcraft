<template>
  <Transition name="fade">
    <div v-if="executionStats" class="execution-stats-panel">
      <div class="stats-header">
        <span class="stats-icon">📊</span>
        <span class="stats-title">執行時間分析</span>
      </div>
      <div class="stats-body">
        <!-- Summary Stats -->
        <div class="stats-summary">
          <div class="stat-item">
            <div class="stat-label">總執行時間</div>
            <div class="stat-value">{{ formatDuration(executionStats.totalDuration || 0) }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">已完成節點</div>
            <div class="stat-value">{{ executionStats.completedCount }} / {{ executionStats.totalCount }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">平均時間</div>
            <div class="stat-value">{{ formatDuration(executionStats.avgDuration) }}</div>
          </div>
        </div>

        <!-- Slowest Nodes -->
        <div v-if="executionStats.slowestNodes.length > 0" class="slowest-nodes">
          <div class="slowest-header">🐌 最慢的節點</div>
          <div class="slowest-list">
            <div
              v-for="(node, index) in executionStats.slowestNodes"
              :key="node.nodeId"
              class="slowest-node-item"
              @click="$emit('jump-to-node', node.nodeId)"
            >
              <span class="slowest-rank">#{{ index + 1 }}</span>
              <span class="slowest-node-id">{{ node.nodeId }}</span>
              <span class="slowest-duration">{{ formatDuration(node.duration || 0) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  executionStats: {
    totalDuration: number
    completedCount: number
    totalCount: number
    avgDuration: number
    slowestNodes: Array<{ nodeId: string; duration: number }>
  } | null
}>()

defineEmits<{
  'jump-to-node': [nodeId: string]
}>()

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
</script>

<style scoped>
.execution-stats-panel {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 360px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 90;
  overflow: hidden;
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-base);
  border-bottom: 1px solid var(--border);
}

.stats-icon {
  font-size: 16px;
}

.stats-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.stats-body {
  padding: 16px;
}

.stats-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: var(--bg-elevated);
  border-radius: 8px;
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-cyan);
}

.slowest-nodes {
  margin-top: 16px;
}

.slowest-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  padding-left: 4px;
}

.slowest-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slowest-node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border-radius: 6px;
  cursor: pointer;
  transition: var(--transition);
}

.slowest-node-item:hover {
  background: var(--bg-hover);
  transform: translateX(2px);
}

.slowest-rank {
  font-size: 11px;
  font-weight: 700;
  color: orange;
  width: 24px;
}

.slowest-node-id {
  flex: 1;
  font-size: 11px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slowest-duration {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
