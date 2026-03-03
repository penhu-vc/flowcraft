<template>
  <div class="pve">
    <!-- Input ports -->
    <template v-if="inputs && inputs.length > 0">
      <div class="pve-label">
        🔵 輸入埠顯示設定
        <span class="pve-hint">控制節點左側顯示哪些輸入接埠</span>
      </div>
      <div class="pve-list">
        <div v-for="port in inputs" :key="`in-${port.key}`" class="pve-row">
          <span style="color:var(--accent-cyan)">◆</span>
          <div class="pve-info">
            <div class="pve-name">{{ port.label }}</div>
            <div class="pve-type">{{ port.type }}</div>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              :checked="!isHidden(`in-${port.key}`)"
              @change="togglePort(`in-${port.key}`)"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </template>

    <!-- Output ports -->
    <template v-if="outputs && outputs.length > 0">
      <div class="pve-label" :style="inputs && inputs.length ? 'margin-top:10px' : ''">
        🔌 輸出埠顯示設定
        <span class="pve-hint">控制節點右側顯示哪些輸出接埠</span>
      </div>
      <div class="pve-list">
        <div v-for="port in outputs" :key="port.key" class="pve-row">
          <span :style="{ color: portColor || 'var(--accent-cyan)' }">◆</span>
          <div class="pve-info">
            <div class="pve-name">{{ port.label }}</div>
            <div class="pve-type">{{ port.type }}</div>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              :checked="!isHidden(port.key)"
              @change="togglePort(port.key)"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  inputs?: { key: string; label: string; type: string }[]
  outputs?: { key: string; label: string; type: string }[]
  hiddenPorts?: string[]
  portColor?: string
}>()

const emit = defineEmits<{
  (e: 'update', hiddenPorts: string[]): void
}>()

const hidden = ref<string[]>(props.hiddenPorts ?? [])
watch(() => props.hiddenPorts, (v) => { if (v) hidden.value = [...v] })

function isHidden(key: string) { return hidden.value.includes(key) }
function togglePort(key: string) {
  const i = hidden.value.indexOf(key)
  if (i === -1) hidden.value.push(key)
  else hidden.value.splice(i, 1)
  emit('update', [...hidden.value])
}
</script>

<style scoped>
.pve { display: flex; flex-direction: column; gap: 4px; }
.pve-label {
  font-size: 11px; font-weight: 600; color: var(--text-secondary);
  display: flex; align-items: center; gap: 6px; margin-bottom: 3px;
}
.pve-hint { font-size: 10px; color: var(--text-muted); font-weight: 400; }
.pve-list { display: flex; flex-direction: column; gap: 3px; }
.pve-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px;
  background: var(--bg-base); border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.pve-info { flex: 1; min-width: 0; }
.pve-name { font-size: 11px; color: var(--text-secondary); }
.pve-type { font-size: 9px; color: var(--text-muted); }
</style>
