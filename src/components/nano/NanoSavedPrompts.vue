<template>
  <div class="saved-prompts-block">
    <div class="sp-pills">
      <span class="sp-label">常用：</span>
      <button
        v-for="p in prompts"
        :key="p.id"
        class="sp-pill"
        @click="$emit('apply', p)"
      >
        <span class="sp-pill-name">{{ p.name }}</span>
        <button class="sp-pill-edit" @click.stop="openModal(p.id)" title="編輯">✎</button>
      </button>
      <button class="sp-pill sp-pill-add" @click="openModal()">+ 新增</button>
    </div>
  </div>

  <!-- Modal -->
  <Teleport to="body">
    <div v-if="showModal" class="sp-overlay" @click.self="closeModal">
      <div class="sp-modal">
        <div class="sp-modal-header">
          <span>{{ editingId ? '編輯常用 Prompt' : '新增常用 Prompt' }}</span>
          <button class="sp-modal-close" @click="closeModal">✕</button>
        </div>
        <div class="sp-modal-body">
          <div class="sp-form-group">
            <label class="sp-form-label">名稱</label>
            <input v-model="form.name" class="sp-form-input" placeholder="例：人像寫真、產品照" />
          </div>
          <div class="sp-form-group">
            <label class="sp-form-label">Prompt</label>
            <textarea v-model="form.prompt" class="sp-form-textarea" rows="4" placeholder="主要 prompt 內容" />
          </div>
          <div class="sp-form-group">
            <label class="sp-form-label">Negative Prompt（選填）</label>
            <textarea v-model="form.negativePrompt" class="sp-form-textarea" rows="2" placeholder="不要出現的內容" />
          </div>
        </div>
        <div class="sp-modal-footer">
          <button v-if="editingId" class="sp-btn-delete" @click="deletePrompt">🗑️ 刪除</button>
          <div style="flex:1" />
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="savePrompt" :disabled="!form.name.trim() || !form.prompt.trim()">
            {{ editingId ? '更新' : '新增' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { API_ENDPOINTS } from '../../api/config'

export interface SavedPrompt {
  id: string
  name: string
  prompt: string
  negativePrompt: string
}

defineEmits<{
  (e: 'apply', prompt: SavedPrompt): void
}>()

const prompts = ref<SavedPrompt[]>([])
const showModal = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', prompt: '', negativePrompt: '' })

async function loadPrompts() {
  try {
    const res = await fetch(API_ENDPOINTS.settingsSavedPrompts)
    const data = await res.json()
    if (data.ok) prompts.value = data.prompts || []
  } catch { /* ignore */ }
}

async function persistPrompts() {
  try {
    await fetch(API_ENDPOINTS.settingsSavedPrompts, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: prompts.value }),
    })
  } catch { /* ignore */ }
}

function openModal(id?: string) {
  if (id) {
    const p = prompts.value.find(x => x.id === id)
    if (!p) return
    editingId.value = id
    form.name = p.name
    form.prompt = p.prompt
    form.negativePrompt = p.negativePrompt
  } else {
    editingId.value = null
    form.name = ''
    form.prompt = ''
    form.negativePrompt = ''
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingId.value = null
}

function savePrompt() {
  if (!form.name.trim() || !form.prompt.trim()) return
  if (editingId.value) {
    const idx = prompts.value.findIndex(p => p.id === editingId.value)
    if (idx >= 0) {
      prompts.value[idx] = { ...prompts.value[idx], name: form.name, prompt: form.prompt, negativePrompt: form.negativePrompt }
    }
  } else {
    prompts.value.push({
      id: `sp-${Date.now()}`,
      name: form.name,
      prompt: form.prompt,
      negativePrompt: form.negativePrompt,
    })
  }
  persistPrompts()
  closeModal()
}

function deletePrompt() {
  if (!editingId.value) return
  prompts.value = prompts.value.filter(p => p.id !== editingId.value)
  persistPrompts()
  closeModal()
}

onMounted(loadPrompts)
</script>

<style scoped>
.saved-prompts-block {
  margin-bottom: 4px;
}

.sp-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.sp-label {
  font-size: 12px;
  color: var(--text-muted, #888);
  white-space: nowrap;
}

.sp-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 16px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary, #aaa);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.sp-pill:hover {
  border-color: rgba(6, 182, 212, 0.4);
  background: rgba(6, 182, 212, 0.08);
  color: var(--text-primary, #fff);
}

.sp-pill-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-pill-edit {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 11px;
  cursor: pointer;
  padding: 0 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.sp-pill:hover .sp-pill-edit {
  opacity: 1;
}

.sp-pill-add {
  border-style: dashed;
  color: var(--text-muted, #888);
}

.sp-pill-add:hover {
  border-color: rgba(6, 182, 212, 0.4);
  color: var(--text-primary, #fff);
}

/* Modal */
.sp-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.sp-modal {
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 12px;
  width: 90vw;
  max-width: 520px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.sp-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color, #333);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #fff);
}

.sp-modal-close {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.sp-modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

.sp-modal-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sp-form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sp-form-label {
  font-size: 12px;
  color: var(--text-muted, #888);
}

.sp-form-input,
.sp-form-textarea {
  padding: 8px 12px;
  border: 1px solid var(--border-color, #444);
  border-radius: 8px;
  background: var(--bg-tertiary, #252540);
  color: var(--text-primary, #fff);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.sp-form-input:focus,
.sp-form-textarea:focus {
  outline: none;
  border-color: var(--primary, #7c3aed);
}

.sp-modal-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-color, #333);
}

.sp-btn-delete {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 13px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
}
.sp-btn-delete:hover {
  background: rgba(239, 68, 68, 0.1);
}
</style>
