<template>
  <div class="execution-logger-config">
    <div class="info-banner">
      <div class="banner-icon">📝</div>
      <div>
        <div class="banner-title">執行記錄器 v2.0</div>
        <div class="banner-desc">自動偵測並收集上游節點的所有輸出欄位</div>
      </div>
    </div>

    <!-- Collection Selector -->
    <div class="form-group">
      <label class="label">選擇資料集 <span class="required">*</span></label>
      <select
        v-model="selectedCollectionId"
        class="form-select"
        @change="updateCollectionId"
      >
        <option value="">-- 請選擇資料集 --</option>
        <option
          v-for="collection in collectionStore.collections"
          :key="collection.id"
          :value="collection.id"
        >
          {{ collection.name }} ({{ collection.records.length }} 筆)
        </option>
      </select>
      <div v-if="collectionStore.collections.length === 0" class="hint-text">
        ⚠️ 尚未建立資料集，請先到「資料庫」頁面建立
      </div>
    </div>

    <!-- Connection Status -->
    <div v-if="connectedData" class="connection-section">
      <div class="connection-header">
        <div class="connection-icon">🔌</div>
        <div class="connection-title">已連接 {{ connectedData.count }} 個資料來源</div>
      </div>
      <div class="connection-sources">
        <div v-for="(source, idx) in connectedData.sources" :key="idx" class="source-tag">
          {{ source.label }}
        </div>
      </div>
      <div class="predicted-fields">
        <div class="predicted-title">📋 預計記錄欄位：</div>
        <div class="field-tags">
          <span v-for="field in predictedFields" :key="field" class="field-tag">
            {{ field }}
          </span>
        </div>
        <div class="predicted-hint">
          * 實際欄位以執行時偵測為準
        </div>
      </div>
    </div>

    <!-- Auto Detection Info -->
    <div v-else class="auto-section">
      <div class="auto-icon">🔍</div>
      <div class="auto-content">
        <div class="auto-title">自動偵測模式</div>
        <div class="auto-desc">
          只需將任意節點的輸出連接到「資料」埠，執行記錄器會自動：
        </div>
        <ul class="auto-list">
          <li>偵測所有欄位名稱和值</li>
          <li>展平巢狀物件（例如 a.b.c）</li>
          <li>自動加上時間戳記</li>
          <li>寫入選定的資料集</li>
        </ul>
      </div>
    </div>

    <!-- Example Scenarios -->
    <div class="example-section">
      <div class="example-title">📦 使用範例</div>

      <div class="example-card">
        <div class="example-label">情境 1: NotebookLM 輸出</div>
        <pre class="example-code">輸入: { result: "...", notebook_url: "..." }
↓
記錄: {
  "timestamp": "2026-03-03T13:10:00Z",
  "result": "AI 分析內容...",
  "notebook_url": "https://notebooklm.google.com/xxx"
}</pre>
      </div>

      <div class="example-card">
        <div class="example-label">情境 2: 巢狀物件</div>
        <pre class="example-code">輸入: { video: { url: "...", title: "..." } }
↓
記錄: {
  "timestamp": "2026-03-03T13:10:00Z",
  "video.url": "https://youtube.com/...",
  "video.title": "影片標題"
}</pre>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="actions">
      <button class="btn-link" @click="openCollections">
        📚 管理資料集
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useCollectionStore } from '../stores/collection'

const props = defineProps<{
  config: Record<string, any>
  inputs: { key: string; label: string; type: string }[]
  outputs: { key: string; label: string; type: string }[]
  nodeId?: string
  nodes?: any[]
  edges?: any[]
}>()

const emit = defineEmits<{
  (e: 'update', key: string, value: any): void
}>()

const collectionStore = useCollectionStore()
const selectedCollectionId = ref(props.config.collectionId || '')

function updateCollectionId() {
  emit('update', 'collectionId', selectedCollectionId.value)
}

function openCollections() {
  window.open('/#/collections', '_blank')
}

watch(() => props.config.collectionId, (newId) => {
  if (newId && newId !== selectedCollectionId.value) {
    selectedCollectionId.value = newId
  }
})

// 分析連接的資料
const connectedData = computed(() => {
  if (!props.nodeId || !props.edges || !props.nodes) {
    return null
  }

  // 找出連接到當前節點 data 埠的邊
  const incomingEdges = props.edges.filter(
    (edge: any) => edge.target === props.nodeId && edge.targetHandle === 'in-data'
  )

  if (incomingEdges.length === 0) {
    return null
  }

  // 取得來源節點資訊
  const sourceNodes = incomingEdges.map((edge: any) => {
    const sourceNode = props.nodes!.find((n: any) => n.id === edge.source)
    return {
      id: sourceNode?.id,
      label: sourceNode?.data?.label || sourceNode?.data?.nodeType || '未知節點',
      nodeType: sourceNode?.data?.nodeType,
      outputHandle: edge.sourceHandle,
    }
  })

  return {
    count: sourceNodes.length,
    sources: sourceNodes,
  }
})

// 預測將會記錄的欄位
const predictedFields = computed(() => {
  const fields = ['timestamp'] // 一定會有 timestamp

  if (!connectedData.value) {
    return fields
  }

  // 根據來源節點類型預測欄位
  connectedData.value.sources.forEach((source: any) => {
    const outputHandle = source.outputHandle

    // 如果有指定輸出埠，加入該欄位名稱
    if (outputHandle && outputHandle !== 'output') {
      fields.push(outputHandle)
    }

    // 根據節點類型預測常見欄位
    switch (source.nodeType) {
      case 'notebooklm':
        fields.push('result', 'notebook_url')
        break
      case 'send-telegram':
        fields.push('success', 'message_id')
        break
      case 'youtube-monitor':
        fields.push('url', 'title')
        break
      case 'gemini':
      case 'llm-generate':
        fields.push('result')
        break
    }
  })

  // 去重
  return [...new Set(fields)]
})
</script>

<style scoped>
.execution-logger-config {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.info-banner {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 0.5rem;
  color: white;
}

.banner-icon {
  font-size: 2rem;
}

.banner-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.banner-desc {
  font-size: 0.875rem;
  opacity: 0.9;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.required {
  color: #ef4444;
}

.form-select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background-color: white;
}

.form-select:focus {
  outline: none;
  border-color: #8b5cf6;
  ring: 2px;
  ring-color: rgba(139, 92, 246, 0.2);
}

.hint-text {
  font-size: 0.75rem;
  color: #ef4444;
}

.connection-section {
  padding: 1rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 0.5rem;
  color: white;
}

.connection-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.connection-icon {
  font-size: 1.25rem;
}

.connection-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.connection-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.source-tag {
  padding: 0.25rem 0.75rem;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.predicted-fields {
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.predicted-title {
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.field-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}

.field-tag {
  padding: 0.2rem 0.6rem;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 0.25rem;
  font-size: 0.7rem;
  font-family: 'Courier New', monospace;
  font-weight: 600;
}

.predicted-hint {
  font-size: 0.7rem;
  opacity: 0.8;
  font-style: italic;
}

.auto-section {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 0.5rem;
  color: white;
}

.auto-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.auto-content {
  flex: 1;
}

.auto-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.auto-desc {
  font-size: 0.8rem;
  opacity: 0.95;
  margin-bottom: 0.5rem;
}

.auto-list {
  font-size: 0.8rem;
  opacity: 0.95;
  margin: 0;
  padding-left: 1.25rem;
}

.auto-list li {
  margin-bottom: 0.25rem;
}

.example-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.example-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.example-card {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
}

.example-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.example-code {
  font-size: 0.7rem;
  font-family: 'Courier New', monospace;
  background: #1f2937;
  color: #10b981;
  padding: 0.75rem;
  border-radius: 0.375rem;
  overflow-x: auto;
  margin: 0;
  line-height: 1.5;
}

.actions {
  display: flex;
  justify-content: flex-start;
}

.btn-link {
  background: transparent;
  border: none;
  color: #8b5cf6;
  font-size: 0.875rem;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.btn-link:hover {
  color: #7c3aed;
}
</style>
