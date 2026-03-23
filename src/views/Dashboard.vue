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

    <!-- Toolbar: search + sort -->
    <div class="toolbar" v-if="store.workflows.length > 0">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input
          class="search-input"
          v-model="searchQuery"
          placeholder="搜尋工作流名稱..."
          @input="searchQuery = ($event.target as HTMLInputElement).value"
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''" title="清除">✕</button>
      </div>
      <div class="sort-group">
        <button
          v-for="opt in sortOptions"
          :key="opt.key"
          class="sort-btn"
          :class="{ active: sortKey === opt.key }"
          @click="sortKey = opt.key"
        >{{ opt.label }}</button>
      </div>
    </div>

    <!-- Empty state: no workflows at all -->
    <div v-if="store.workflows.length === 0" class="card empty-state">
      <div class="empty-state-icon">🌊</div>
      <div class="empty-state-title">還沒有工作流</div>
      <div class="empty-state-desc">點擊右上角「新建工作流」開始</div>
    </div>

    <!-- Empty state: search returned nothing -->
    <div v-else-if="filteredWorkflows.length === 0" class="card empty-state">
      <div class="empty-state-icon">🔎</div>
      <div class="empty-state-title">找不到工作流</div>
      <div class="empty-state-desc">沒有符合「{{ searchQuery }}」的工作流，請換個關鍵字</div>
    </div>

    <div class="grid-auto" v-else>
      <div
        v-for="wf in filteredWorkflows"
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
        <div class="card-body" style="display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:12px;color:var(--text-muted);">{{ wf.description || '無描述' }}</div>

          <!-- Node count badge + edge count -->
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="node-count-badge">🧩 {{ wf.nodes.length }} 節點</span>
            <span style="font-size:11px;color:var(--text-muted);">🔗 {{ wf.edges.length }} 連線</span>
          </div>

          <!-- Last modified relative time -->
          <div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;">
            <span style="opacity:0.6;">🕐</span>
            <span>{{ relativeTime(wf.updatedAt) }}</span>
          </div>

          <!-- Actions -->
          <div class="card-actions" @click.stop>
            <label class="toggle" :title="wf.active ? '停用' : '啟用'">
              <input type="checkbox" :checked="wf.active" @change="store.toggleActive(wf.id)" />
              <span class="toggle-slider"></span>
            </label>
            <!-- Prominent duplicate button -->
            <button class="btn-duplicate" @click.stop="duplicateWorkflow(wf.id)" title="複製工作流">
              <span>⧉</span> 複製
            </button>
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
import { ref, computed, onMounted } from 'vue'
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

// ── Search & Sort ──────────────────────────────────────────
const searchQuery = ref('')
const sortKey = ref<'updatedAt' | 'name' | 'nodes'>('updatedAt')

const sortOptions = [
  { key: 'updatedAt' as const, label: '最近修改' },
  { key: 'name'      as const, label: '名稱 A-Z' },
  { key: 'nodes'     as const, label: '節點數量' },
]

const filteredWorkflows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  let list = q
    ? store.workflows.filter(wf => wf.name.toLowerCase().includes(q))
    : [...store.workflows]

  if (sortKey.value === 'updatedAt') {
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  } else if (sortKey.value === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
  } else if (sortKey.value === 'nodes') {
    list.sort((a, b) => b.nodes.length - a.nodes.length)
  }

  return list
})

// ── Relative time ──────────────────────────────────────────
function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.floor((now - then) / 1000) // seconds

  if (diff < 60)       return '剛才'
  if (diff < 3600)     return `${Math.floor(diff / 60)} 分鐘前`
  if (diff < 86400)    return `${Math.floor(diff / 3600)} 小時前`
  if (diff < 86400 * 2) return '昨天'
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)} 週前`
  return new Date(iso).toLocaleDateString('zh-TW', { dateStyle: 'short' })
}

// ── Workflow name editing ──────────────────────────────────
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
  const trimmed = editingName.value.trim()
  const wf = store.getWorkflow(id)
  if (wf && trimmed && trimmed !== wf.name) {
    store.updateWorkflow(id, { ...wf, name: trimmed })
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
    showToast('✅ 已複製')
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
    showToast(`✅ 已複製「${duplicate.name}」`)
  }
}

function confirmDelete(id: string, name: string) {
  if (confirm(`確定要刪除「${name}」嗎？`)) {
    store.deleteWorkflow(id)
  }
}

function showToast(text: string) {
  const toast = document.createElement('div')
  toast.textContent = text
  toast.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--accent-purple);color:white;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;animation:toast-in 0.3s ease;'
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2000)
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
/* ── Workflow card ─────────────────────────────────────────── */
.workflow-card { cursor: pointer; }
.workflow-card:hover {
  border-color: var(--accent-purple);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(124,58,237,0.15);
  transition: var(--transition);
}

/* ── Toolbar ───────────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 200px;
}
.search-icon {
  position: absolute;
  left: 10px;
  font-size: 13px;
  pointer-events: none;
  opacity: 0.5;
}
.search-input {
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px 32px 8px 34px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: var(--transition);
}
.search-input::placeholder { color: var(--text-muted); }
.search-input:focus {
  border-color: var(--accent-purple);
  box-shadow: 0 0 0 2px var(--accent-purple-glow);
}
.search-clear {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
  transition: var(--transition);
}
.search-clear:hover { color: var(--text-primary); background: var(--bg-hover); }

.sort-group {
  display: flex;
  gap: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 3px;
}
.sort-btn {
  background: transparent;
  border: none;
  border-radius: calc(var(--radius-md) - 3px);
  padding: 5px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
}
.sort-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.sort-btn.active {
  background: var(--accent-purple);
  color: #fff;
  font-weight: 600;
}

/* ── Node count badge ──────────────────────────────────────── */
.node-count-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(124, 58, 237, 0.12);
  color: var(--accent-purple);
  border: 1px solid rgba(124, 58, 237, 0.25);
  border-radius: 99px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 600;
}

/* ── Card actions row ──────────────────────────────────────── */
.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

/* ── Prominent duplicate button ────────────────────────────── */
.btn-duplicate {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(124, 58, 237, 0.1);
  border: 1px solid rgba(124, 58, 237, 0.3);
  border-radius: var(--radius-sm);
  color: var(--accent-purple);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
}
.btn-duplicate:hover {
  background: rgba(124, 58, 237, 0.22);
  border-color: var(--accent-purple);
  box-shadow: 0 0 8px var(--accent-purple-glow);
}

/* ── Modal ─────────────────────────────────────────────────── */
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

/* ── Workflow name editing ──────────────────────────────────── */
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

/* ── Copy / edit icon buttons ──────────────────────────────── */
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

/* ── Toast animation ───────────────────────────────────────── */
@keyframes toast-in {
  from { transform: translateY(-20px); opacity: 0; }
  to   { transform: translateY(0);     opacity: 1; }
}
</style>
