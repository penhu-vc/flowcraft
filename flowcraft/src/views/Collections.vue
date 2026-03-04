<template>
  <div class="collections-page">
    <div class="topbar">
      <div style="display:flex;align-items:center;gap:10px;">
        <h1 class="topbar-title">📚 資料庫</h1>
        <span class="badge">{{ collections.length }} 個資料集</span>
      </div>
      <button class="btn btn-primary" @click="showCreateModal = true">
        ➕ 新增資料集
      </button>
    </div>

    <div class="collections-container">
      <!-- Empty State -->
      <div v-if="collections.length === 0" class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>尚未建立任何資料集</h3>
        <p>點擊「新增資料集」開始創建您的第一個資料庫</p>
        <button class="btn btn-primary" @click="showCreateModal = true">
          ➕ 新增資料集
        </button>
      </div>

      <!-- Collections List -->
      <div v-else class="collections-grid">
        <div
          v-for="collection in collections"
          :key="collection.id"
          class="collection-card"
          @click="viewCollection(collection.id)"
        >
          <div class="card-header">
            <h3 class="card-title">{{ collection.name }}</h3>
            <div class="card-actions" @click.stop>
              <button
                class="btn-icon"
                title="匯出資料"
                @click="store.exportRecordsOnly(collection.id)"
              >📥</button>
              <button
                class="btn-icon"
                title="刪除"
                @click="confirmDelete(collection)"
              >🗑️</button>
            </div>
          </div>
          <p class="card-description">{{ collection.description || '無描述' }}</p>
          <div class="card-stats">
            <span class="stat">📊 {{ collection.records.length }} 筆資料</span>
            <span class="stat-date">{{ formatDate(collection.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click="showCreateModal = false">
        <div class="modal-content" @click.stop>
          <h2>新增資料集</h2>
          <div class="form-group">
            <label>名稱</label>
            <input
              v-model="newCollection.name"
              class="form-input"
              placeholder="例如：用戶反饋記錄"
            />
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea
              v-model="newCollection.description"
              class="form-input"
              rows="3"
              placeholder="說明此資料集的用途"
            ></textarea>
          </div>
          <div class="form-group">
            <label>資料結構（選填，JSON Schema）</label>
            <textarea
              v-model="newCollection.schema"
              class="form-input"
              rows="4"
              placeholder='{"title": "string", "content": "string"}'
            ></textarea>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="showCreateModal = false">取消</button>
            <button class="btn btn-primary" @click="createCollection">建立</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- View Collection Modal -->
    <Teleport to="body">
      <div v-if="viewingCollection" class="modal-overlay" @click="viewingCollection = null">
        <div class="modal-content modal-large" @click.stop>
          <div class="modal-header">
            <h2>{{ viewingCollection.name }}</h2>
            <button class="btn-close" @click="viewingCollection = null">✕</button>
          </div>

          <div class="collection-info">
            <p>{{ viewingCollection.description }}</p>
            <div class="info-stats">
              <span>📊 {{ viewingCollection.records.length }} 筆資料</span>
              <span>📅 {{ formatDate(viewingCollection.updatedAt) }}</span>
            </div>
          </div>

          <div class="records-actions">
            <button class="btn btn-secondary btn-sm" @click="store.exportRecordsOnly(viewingCollection.id)">
              📥 匯出資料
            </button>
            <button
              class="btn btn-danger btn-sm"
              @click="confirmClearRecords(viewingCollection.id)"
              :disabled="viewingCollection.records.length === 0"
            >
              🗑️ 清空資料
            </button>
          </div>

          <div class="records-container">
            <div v-if="viewingCollection.records.length === 0" class="empty-records">
              尚無資料記錄
            </div>
            <div v-else class="records-list">
              <div
                v-for="record in viewingCollection.records"
                :key="record.id"
                class="record-item"
              >
                <div class="record-header">
                  <span class="record-time">{{ formatDateTime(record.timestamp) }}</span>
                  <button class="btn-icon" @click="deleteRecord(viewingCollection.id, record.id)">🗑️</button>
                </div>
                <pre class="record-data">{{ JSON.stringify(record.data, null, 2) }}</pre>
                <div v-if="record.workflowId" class="record-meta">
                  來源：工作流 {{ record.workflowId }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useCollectionStore } from '../stores/collection'
import type { DataCollection } from '../stores/collection'

const store = useCollectionStore()
const { collections } = store

const showCreateModal = ref(false)
const viewingCollection = ref<DataCollection | null>(null)

const newCollection = ref({
  name: '',
  description: '',
  schema: ''
})

function createCollection() {
  if (!newCollection.value.name.trim()) {
    alert('請輸入資料集名稱')
    return
  }

  store.createCollection(
    newCollection.value.name,
    newCollection.value.description,
    newCollection.value.schema
  )

  newCollection.value = { name: '', description: '', schema: '' }
  showCreateModal.value = false
}

function viewCollection(id: string) {
  viewingCollection.value = store.getCollection(id)
}

function confirmDelete(collection: DataCollection) {
  if (confirm(`確定要刪除資料集「${collection.name}」？\n此操作無法復原。`)) {
    store.deleteCollection(collection.id)
  }
}

function confirmClearRecords(id: string) {
  if (confirm('確定要清空所有資料記錄？\n此操作無法復原。')) {
    store.clearRecords(id)
    viewingCollection.value = store.getCollection(id)
  }
}

function deleteRecord(collectionId: string, recordId: string) {
  if (confirm('確定要刪除此筆資料？')) {
    store.deleteRecord(collectionId, recordId)
    viewingCollection.value = store.getCollection(collectionId)
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-TW')
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-TW')
}
</script>

<style scoped>
.collections-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.topbar-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
}

.badge {
  padding: 0.25rem 0.75rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border-radius: 1rem;
  font-size: 0.875rem;
}

.collections-container {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: white;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
}

.empty-state p {
  margin: 0 0 2rem;
  opacity: 0.8;
}

.collections-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}

.collection-card {
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.collection-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.card-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  opacity: 0.6;
  transition: opacity 0.2s;
  padding: 0.25rem;
}

.btn-icon:hover {
  opacity: 1;
}

.card-description {
  margin: 0 0 1rem;
  color: #6b7280;
  font-size: 0.875rem;
  line-height: 1.5;
}

.card-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  border-top: 1px solid #e5e7eb;
  font-size: 0.875rem;
}

.stat {
  color: #8b5cf6;
  font-weight: 500;
}

.stat-date {
  color: #9ca3af;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 0.75rem;
  padding: 2rem;
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-large {
  max-width: 800px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.modal-content h2 {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
  color: #1f2937;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.btn-close:hover {
  opacity: 1;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #374151;
}

.form-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.form-input:focus {
  outline: none;
  border-color: #8b5cf6;
  ring: 2px;
  ring-color: rgba(139, 92, 246, 0.2);
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.btn-primary {
  background: #8b5cf6;
  color: white;
}

.btn-primary:hover {
  background: #7c3aed;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover {
  background: #d1d5db;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.collection-info {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
}

.info-stats {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: #6b7280;
}

.records-actions {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.records-container {
  max-height: 500px;
  overflow-y: auto;
}

.empty-records {
  text-align: center;
  padding: 3rem;
  color: #9ca3af;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.record-item {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  background: #f9fafb;
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.record-time {
  font-size: 0.875rem;
  color: #6b7280;
}

.record-data {
  background: white;
  padding: 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  overflow-x: auto;
  margin: 0 0 0.5rem;
}

.record-meta {
  font-size: 0.75rem;
  color: #9ca3af;
}
</style>
