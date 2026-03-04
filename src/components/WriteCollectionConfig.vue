<template>
  <div class="write-collection-config">
    <!-- Collection Selector -->
    <div class="form-group">
      <label class="label">選擇資料集</label>
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
          {{ collection.name }} ({{ collection.records.length }} 筆資料)
        </option>
      </select>
      <div v-if="collectionStore.collections.length === 0" class="hint-text">
        ⚠️ 尚未建立任何資料集，請先到「資料庫」頁面建立
      </div>
    </div>

    <!-- Collection Info -->
    <div v-if="selectedCollection" class="collection-info">
      <div class="info-header">
        <span class="info-icon">📊</span>
        <div>
          <div class="info-title">{{ selectedCollection.name }}</div>
          <div class="info-desc">{{ selectedCollection.description || '無描述' }}</div>
        </div>
      </div>
      <div class="info-stats">
        <span>{{ selectedCollection.records.length }} 筆資料</span>
        <span>{{ formatDate(selectedCollection.updatedAt) }}</span>
      </div>
    </div>

    <!-- Data Input -->
    <div class="form-group">
      <label class="label">要寫入的資料</label>
      <textarea
        :value="props.config.data || ''"
        @input="updateData"
        class="form-textarea"
        rows="6"
        placeholder='連接上游節點，或手動輸入 JSON：&#10;{&#10;  "title": "範例標題",&#10;  "content": "範例內容"&#10;}'
      ></textarea>
      <div class="hint-text">
        💡 可以連接上游節點的輸出，或手動輸入 JSON 格式資料
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
import { ref, computed, watch } from 'vue'
import { useCollectionStore } from '../stores/collection'
import { useRouter } from 'vue-router'

const props = defineProps<{
  config: Record<string, any>
  inputs: { key: string; label: string; type: string }[]
  outputs: { key: string; label: string; type: string }[]
}>()

const emit = defineEmits<{
  (e: 'update', key: string, value: any): void
}>()

const router = useRouter()
const collectionStore = useCollectionStore()

const selectedCollectionId = ref(props.config.collectionId || '')

const selectedCollection = computed(() => {
  if (!selectedCollectionId.value) return null
  return collectionStore.getCollection(selectedCollectionId.value)
})

function updateCollectionId() {
  emit('update', 'collectionId', selectedCollectionId.value)
}

function updateData(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update', 'data', target.value)
}

function openCollections() {
  window.open('/#/collections', '_blank')
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-TW')
}

// Sync with config changes
watch(() => props.config.collectionId, (newId) => {
  if (newId && newId !== selectedCollectionId.value) {
    selectedCollectionId.value = newId
  }
})
</script>

<style scoped>
.write-collection-config {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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

.form-textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-family: 'Courier New', monospace;
  resize: vertical;
}

.form-textarea:focus {
  outline: none;
  border-color: #8b5cf6;
  ring: 2px;
  ring-color: rgba(139, 92, 246, 0.2);
}

.hint-text {
  font-size: 0.75rem;
  color: #6b7280;
}

.collection-info {
  padding: 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}

.info-header {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.info-icon {
  font-size: 1.5rem;
}

.info-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1f2937;
}

.info-desc {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.info-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: #6b7280;
  padding-top: 0.75rem;
  border-top: 1px solid #e5e7eb;
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
