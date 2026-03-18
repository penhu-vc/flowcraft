<template>
  <Transition name="search">
    <div v-if="show" class="search-panel">
      <div class="search-header">
        <input
          ref="searchInputRef"
          class="search-input"
          :value="query"
          @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
          placeholder="🔍 搜尋節點... (↑↓ 選擇, Enter 跳轉, ESC 關閉)"
          @keydown.esc="$emit('close')"
        />
        <button class="btn btn-icon btn-sm" @click="$emit('close')">✕</button>
      </div>
      <div class="search-results">
        <div v-if="results.length === 0 && query" class="search-empty">
          沒有找到符合的節點
        </div>
        <div
          v-for="(node, index) in results"
          :key="node.id"
          class="search-result-item"
          :class="{ active: index === selectedIndex }"
          @click="$emit('select', node.id)"
        >
          <span class="search-result-icon" :style="{ background: CATEGORY_COLORS[node.data.category] + '22', color: CATEGORY_COLORS[node.data.category] }">
            {{ node.data.icon }}
          </span>
          <div class="search-result-content">
            <div class="search-result-name">{{ node.data.label }}</div>
            <div class="search-result-type">{{ node.data.nodeType }}</div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { CATEGORY_COLORS } from '../../nodes/registry'

interface SearchResultNode {
  id: string
  data: {
    category: string
    icon: string
    label: string
    nodeType: string
    [key: string]: any
  }
}

const props = defineProps<{
  show: boolean
  query: string
  results: SearchResultNode[]
  selectedIndex: number
}>()

defineEmits<{
  'update:query': [value: string]
  'close': []
  'select': [nodeId: string]
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)

watch(() => props.show, (value) => {
  if (value) {
    setTimeout(() => searchInputRef.value?.focus(), 100)
  }
})
</script>

<style scoped>
.search-panel {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
  overflow: hidden;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-base);
}

.search-input {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}

.search-input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(0, 255, 255, 0.1);
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
}

.search-empty {
  padding: 32px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: var(--transition);
  margin-bottom: 4px;
}

.search-result-item:hover {
  background: var(--bg-hover);
}

.search-result-item.active {
  background: rgba(0, 255, 255, 0.1);
  border: 1px solid var(--accent-cyan);
}

.search-result-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.search-result-content {
  flex: 1;
}

.search-result-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.search-result-type {
  font-size: 11px;
  color: var(--text-muted);
}

.search-enter-active,
.search-leave-active {
  transition: all 0.2s ease;
}

.search-enter-from,
.search-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
