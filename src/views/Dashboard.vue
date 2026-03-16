<template>
  <div class="topbar">
    <span class="topbar-title">🏠 工作流</span>
    <div class="topbar-actions">
      <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
        ⬆️ 匯入
        <input type="file" accept=".json" style="display:none" @change="onImport" />
      </label>
      <button class="btn btn-primary" @click="showCreate = true">＋ 新建工作流</button>
    </div>
  </div>

  <div class="page-content fade-in">
    <!-- Stats row -->
    <div class="grid-3" style="margin-bottom:24px;">
      <div class="card card-body" style="display:flex;align-items:center;gap:16px;">
        <div style="font-size:28px;">📋</div>
        <div>
          <div style="font-size:22px;font-weight:700;">{{ store.workflows.length }}</div>
          <div style="font-size:12px;color:var(--text-muted);">工作流總數</div>
        </div>
      </div>
      <div class="card card-body" style="display:flex;align-items:center;gap:16px;">
        <div style="font-size:28px;">✅</div>
        <div>
          <div style="font-size:22px;font-weight:700;">{{ store.activeWorkflows.length }}</div>
          <div style="font-size:12px;color:var(--text-muted);">執行中</div>
        </div>
      </div>
      <div class="card card-body" style="display:flex;align-items:center;gap:16px;">
        <div style="font-size:28px;">🧩</div>
        <div>
          <div style="font-size:22px;font-weight:700;">{{ NODE_REGISTRY.length }}</div>
          <div style="font-size:12px;color:var(--text-muted);">可用節點</div>
        </div>
      </div>
    </div>

    <!-- Workflow list -->
    <div v-if="store.workflows.length === 0" class="card empty-state">
      <div class="empty-state-icon">🌊</div>
      <div class="empty-state-title">還沒有工作流</div>
      <div class="empty-state-desc">點擊右上角「新建工作流」開始</div>
    </div>

    <div class="grid-auto" v-else>
      <div
        v-for="wf in store.workflows"
        :key="wf.id"
        class="card workflow-card"
        @click="router.push(`/editor/${wf.id}`)"
      >
        <div class="card-header">
          <span
            v-if="editingId !== wf.id"
            class="card-title"
            style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          >
            {{ wf.name }}
          </span>
          <input
            v-else
            :ref="el => { if (el) editInputRef = el as HTMLInputElement }"
            class="card-title-input"
            v-model="editingName"
            @blur="saveEdit(wf.id)"
            @keyup.enter="saveEdit(wf.id)"
            @keyup.esc="cancelEdit"
            @click.stop
            style="flex:1;"
          />
          <div style="display:flex;align-items:center;gap:6px;">
            <button
              class="btn-copy-card"
              @click.stop="copyName(wf.name)"
              title="複製工作流名稱"
            >📋</button>
            <button
              v-if="editingId !== wf.id"
              class="btn-edit-card"
              @click.stop="startEdit(wf.id, wf.name)"
              title="編輯名稱"
            >✎</button>
            <span :class="['badge', wf.active ? 'badge-active' : 'badge-inactive']">
              {{ wf.active ? '● 執行中' : '○ 停用' }}
            </span>
          </div>
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:12px;">
          <div style="font-size:12px;color:var(--text-muted);">{{ wf.description || '無描述' }}</div>
          <div style="display:flex;gap:8px;font-size:11px;color:var(--text-muted);">
            <span>🧩 {{ wf.nodes.length }} 個節點</span>
            <span>🔗 {{ wf.edges.length }} 個連線</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);">
            更新於 {{ formatDate(wf.updatedAt) }}
          </div>
          <div style="display:flex;gap:6px;margin-top:4px;" @click.stop>
            <label class="toggle" :title="wf.active ? '停用' : '啟用'">
              <input type="checkbox" :checked="wf.active" @change="store.toggleActive(wf.id)" />
              <span class="toggle-slider"></span>
            </label>
            <button class="btn btn-secondary btn-sm" @click.stop="duplicateWorkflow(wf.id)" title="複製工作流">📑 複製</button>
            <button class="btn btn-secondary btn-sm" @click.stop="store.exportWorkflow(wf.id)">⬇️ 匯出</button>
            <button class="btn btn-secondary btn-sm" @click.stop="router.push(`/editor/${wf.id}`)">✏️ 編輯</button>
            <button class="btn btn-danger btn-sm" style="margin-left:auto;" @click.stop="confirmDelete(wf.id, wf.name)">🗑️</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Modal -->
  <Teleport to="body">
    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate=false">
      <div class="modal fade-in">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:20px;">新建工作流</h3>
        <div class="form-group" style="margin-bottom:14px;">
          <label class="form-label">工作流名稱 *</label>
          <input class="form-input" v-model="newName" placeholder="我的工作流" @keyup.enter="doCreate" autofocus />
        </div>
        <div class="form-group" style="margin-bottom:20px;">
          <label class="form-label">描述（選填）</label>
          <input class="form-input" v-model="newDesc" placeholder="這個工作流的用途..." />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" @click="showCreate=false">取消</button>
          <button class="btn btn-primary" :disabled="!newName.trim()" @click="doCreate">建立</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkflowStore } from '../stores/workflow'
import { NODE_REGISTRY } from '../nodes/registry'

const router = useRouter()
const store = useWorkflowStore()

// 從後端同步工作流
onMounted(async () => {
  await store.syncFromBackend()
})

const showCreate = ref(false)
const newName = ref('')
const newDesc = ref('')

// Workflow name editing
const editingId = ref<string | null>(null)
const editingName = ref('')
let editInputRef: HTMLInputElement | null = null

function startEdit(id: string, name: string) {
  editingId.value = id
  editingName.value = name
  setTimeout(() => editInputRef?.focus(), 0)
}

function saveEdit(id: string) {
  if (!editingId.value) return
  const newName = editingName.value.trim()
  const wf = store.getWorkflow(id)
  if (wf && newName && newName !== wf.name) {
    store.updateWorkflow(id, { ...wf, name: newName })
  }
  editingId.value = null
  editingName.value = ''
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

async function copyName(name: string) {
  const nameWithPrefix = `工作流 ${name}`
  try {
    await navigator.clipboard.writeText(nameWithPrefix)
    // Show toast notification
    const toast = document.createElement('div')
    toast.textContent = '✅ 已複製'
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--accent-purple);color:white;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;animation:toast-in 0.3s ease;'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

function doCreate() {
  if (!newName.value.trim()) return
  const wf = store.createWorkflow(newName.value.trim(), newDesc.value.trim())
  showCreate.value = false
  newName.value = ''
  newDesc.value = ''
  router.push(`/editor/${wf.id}`)
}

function duplicateWorkflow(id: string) {
  const duplicate = store.duplicateWorkflow(id)
  if (duplicate) {
    // Show toast notification
    const toast = document.createElement('div')
    toast.textContent = `✅ 已複製「${duplicate.name}」`
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--accent-purple);color:white;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;animation:toast-in 0.3s ease;'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  }
}

function confirmDelete(id: string, name: string) {
  if (confirm(`確定要刪除「${name}」嗎？`)) {
    store.deleteWorkflow(id)
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })
}

function onImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    const wf = store.importWorkflow(ev.target?.result as string)
    if (wf) router.push(`/editor/${wf.id}`)
    else alert('匯入失敗：JSON 格式不正確')
  }
  reader.readAsText(file)
}
</script>

<style scoped>
.workflow-card { cursor: pointer; }
.workflow-card:hover { border-color: var(--accent-purple); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(124,58,237,0.15); transition: var(--transition); }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
  backdrop-filter: blur(4px);
}
.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 28px;
  width: 420px;
  max-width: 90vw;
}

/* Workflow name editing */
.card-title-input {
  background: var(--bg-elevated);
  border: 1px solid var(--accent-purple);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
  width: 100%;
}

/* Copy and edit buttons */
.btn-copy-card, .btn-edit-card {
  background: transparent;
  border: none;
  padding: 2px 6px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  flex-shrink: 0;
  opacity: 0.7;
  color: var(--text-secondary);
}
.btn-copy-card:hover, .btn-edit-card:hover {
  background: rgba(124, 58, 237, 0.15);
  opacity: 1;
  color: var(--accent-purple);
}

@keyframes toast-in {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
