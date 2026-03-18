<template>
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
</template>

<script setup lang="ts">
defineProps<{
  veoStatus: {
    configured: boolean
    authMode: 'apiKey' | 'gcp' | null
    message: string
  }
  statusLabel: string
}>()
</script>

<style scoped>
.status-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
