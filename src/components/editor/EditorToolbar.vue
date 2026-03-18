<template>
  <div class="topbar">
    <div style="display:flex;align-items:center;gap:10px;">
      <button class="btn btn-secondary btn-sm" @click="$emit('go-back')">← 返回</button>
      <div style="display:flex;align-items:center;gap:12px;">
        <span v-if="!editingName" class="topbar-title" @dblclick="startEditName" style="cursor:pointer;">
          {{ workflowName || '載入中...' }}
        </span>
        <input
          v-else
          ref="nameInputRef"
          class="topbar-title-input"
          v-model="editingNameValue"
          @blur="saveWorkflowName"
          @keyup.enter="saveWorkflowName"
          @keyup.esc="cancelEditName"
        />
        <button
          class="btn-copy"
          @click="copyWorkflowName"
          title="複製工作流名稱"
        >📋</button>
      </div>
      <span class="badge badge-active" v-if="isActive">● 執行中</span>
    </div>
    <div class="topbar-actions">
      <button v-if="hasMultiSelection" class="btn btn-secondary btn-sm" @click="$emit('align-center')" title="垂直置中對齊">⫼ 置中</button>
      <button v-if="hasMultiSelection" class="btn btn-secondary btn-sm" @click="$emit('align-horizontal')" title="水平對齊">⫻ 水平</button>
      <button class="btn btn-secondary btn-sm" @click="$emit('auto-layout')" title="自動排版節點">✨ 自動排版</button>
      <button class="btn btn-secondary btn-sm" @click="$emit('save')">💾 儲存</button>
      <button class="btn btn-secondary btn-sm" @click="$emit('export')">⬇️ 匯出</button>
      <button
        class="btn btn-success btn-sm"
        @click="$emit('execute')"
        :disabled="isRunning"
      >
        {{ isRunning ? '⏳ 執行中...' : '▶️ 執行工作流' }}
      </button>
      <!-- DEBUG -->
      <span v-if="currentExecutionId" style="color: lime; font-size: 10px; margin-left: 8px;">
        🟢 執行中: {{ currentExecutionId }}
      </span>
      <button class="btn btn-primary btn-sm" @click="$emit('toggle-active')">
        {{ isActive ? '⏹ 停用' : '▶ 啟用' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  workflowName: string
  isActive: boolean
  hasMultiSelection: boolean
  isRunning: boolean
  currentExecutionId: string | null
}>()

const emit = defineEmits<{
  'go-back': []
  'align-center': []
  'align-horizontal': []
  'auto-layout': []
  'save': []
  'export': []
  'execute': []
  'toggle-active': []
  'update-name': [name: string]
}>()

const editingName = ref(false)
const editingNameValue = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

function startEditName() {
  if (!props.workflowName) return
  editingNameValue.value = props.workflowName
  editingName.value = true
  setTimeout(() => nameInputRef.value?.focus(), 0)
}

function saveWorkflowName() {
  if (!editingName.value) return
  const newName = editingNameValue.value.trim()
  if (newName && newName !== props.workflowName) {
    emit('update-name', newName)
  }
  editingName.value = false
}

function cancelEditName() {
  editingName.value = false
  editingNameValue.value = ''
}

async function copyWorkflowName() {
  if (!props.workflowName) return
  const nameWithPrefix = `工作流 ${props.workflowName}`
  try {
    await navigator.clipboard.writeText(nameWithPrefix)
    const toast = document.createElement('div')
    toast.className = 'copy-toast'
    toast.textContent = '✅ 已複製'
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--accent-cyan);color:white;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;animation:toast-in 0.3s ease;'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<style scoped>
/* Workflow name editing */
.topbar-title-input {
  background: var(--bg-elevated);
  border: 1px solid var(--accent-cyan);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
  min-width: 200px;
}

/* Copy button */
.btn-copy {
  background: transparent;
  border: none;
  padding: 4px 8px;
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s ease;
}
.btn-copy:hover {
  background: rgba(255, 255, 255, 0.1);
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
