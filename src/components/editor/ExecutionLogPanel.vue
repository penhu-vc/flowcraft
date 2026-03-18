<template>
  <Transition name="slide-up">
    <div v-if="currentExecution" class="execution-panel">
      <div class="execution-header">
        <div>
          <span class="execution-status" :class="currentExecution.status">
            {{ currentExecution.status === 'running' ? '⏳' :
               currentExecution.status === 'completed' ? '✅' :
               currentExecution.status === 'failed' ? '❌' : '⏸' }}
          </span>
          <span style="font-size:12px;font-weight:600;margin-left:6px;">
            執行 {{ currentExecution.id }}
          </span>
          <span v-if="currentExecution.duration" style="font-size:11px;color:var(--text-muted);margin-left:8px;">
            ({{ (currentExecution.duration / 1000).toFixed(1) }}s)
          </span>
        </div>
        <button class="btn btn-icon btn-sm" @click="$emit('clear-execution')">✕</button>
      </div>
      <div class="execution-body">
        <div v-for="[nodeId, nodeExec] in nodeEntries" :key="nodeId" class="execution-node">
          <div class="execution-node-header">
            <span class="execution-node-status" :class="nodeExec.status">
              {{ nodeExec.status === 'running' ? '🔵' :
                 nodeExec.status === 'completed' ? '🟢' :
                 nodeExec.status === 'failed' ? '🔴' : '⚪' }}
            </span>
            <span style="font-size:11px;font-weight:500;">{{ nodeId }}</span>
            <span v-if="nodeExec.duration" style="font-size:10px;color:var(--text-muted);margin-left:auto;">
              {{ (nodeExec.duration / 1000).toFixed(1) }}s
            </span>
          </div>
          <div v-if="nodeExec.progress !== undefined" class="execution-progress">
            <div class="execution-progress-bar" :style="{ width: nodeExec.progress + '%' }"></div>
            <span class="execution-progress-text">{{ nodeExec.progress }}%</span>
          </div>
          <div v-if="nodeExec.logs.length > 0" class="execution-logs">
            <div v-for="(log, i) in nodeExec.logs.slice(-3)" :key="i" class="execution-log">
              {{ log }}
            </div>
          </div>
          <div v-if="nodeExec.error" class="execution-error">
            ❌ {{ nodeExec.error }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  currentExecution: {
    id: string
    status: string
    duration?: number
    nodes: Map<string, {
      status: string
      duration?: number
      progress?: number
      logs: string[]
      error?: string
    }>
  } | null
}>()

defineEmits<{
  'clear-execution': []
}>()

const nodeEntries = computed(() => {
  if (!props.currentExecution) return []
  return Array.from(props.currentExecution.nodes.entries())
})
</script>

<style scoped>
.execution-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 250px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -4px 12px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.execution-header {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-base);
}

.execution-status {
  font-size: 14px;
}

.execution-status.running { animation: pulse 2s infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.execution-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.execution-node {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.execution-node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.execution-node-status {
  font-size: 12px;
}

.execution-progress {
  position: relative;
  height: 18px;
  background: var(--bg-hover);
  border-radius: 9px;
  margin: 6px 0;
  overflow: hidden;
}

.execution-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  transition: width 0.3s ease;
}

.execution-progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
}

.execution-logs {
  margin-top: 6px;
}

.execution-log {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'Courier New', monospace;
  padding: 2px 0;
}

.execution-error {
  font-size: 11px;
  color: var(--red);
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: var(--radius-sm);
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
