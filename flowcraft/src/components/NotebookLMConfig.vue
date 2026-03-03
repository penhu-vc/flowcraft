<template>
  <div class="nlm-config">
    <!-- ① URL Input -->
    <div class="form-group">
      <label class="form-label">🔗 內容網址</label>
      <input
        class="form-input"
        v-model="localUrl"
        type="url"
        placeholder="https://youtube.com/watch?v=... 或任意網頁"
      />
      <div class="form-hint">貼上 YouTube 影片連結，或任意網頁 URL。可從上游節點的「影片網址」埠自動填入。</div>
    </div>

    <div class="divider" />

    <!-- ② Prompt Template Section -->
    <div class="section-header">
      💬 提示詞模板
      <button class="btn btn-sm btn-ghost" @click="addTemplate" style="margin-left:auto;">＋ 新增</button>
    </div>

    <div class="template-select">
      <div
        v-for="(tpl, i) in templates"
        :key="i"
        class="template-chip"
        :class="{ active: selectedIdx === i }"
        @click="selectTemplate(i)"
      >
        <span>{{ tpl.name }}</span>
        <button class="chip-del" @click.stop="deleteTemplate(i)" title="刪除">✕</button>
      </div>
    </div>

    <!-- Template editor -->
    <div v-if="editingTemplate" class="template-editor">
      <input
        class="form-input"
        v-model="editingTemplate.name"
        placeholder="模板名稱"
        style="margin-bottom:6px;"
      />
      <textarea
        class="form-input"
        v-model="editingTemplate.text"
        rows="5"
        placeholder="輸入提示詞..."
      />
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="btn btn-primary btn-sm" style="flex:1" @click="saveTemplate">✓ 儲存</button>
        <button class="btn btn-ghost btn-sm" @click="cancelEdit">取消</button>
      </div>
    </div>
    <div v-else class="prompt-preview">
      <textarea class="form-input" v-model="localPrompt" rows="4" placeholder="選擇上方模板，或直接輸入提示詞..." />
    </div>

    <div class="divider" />

    <!-- ③ Timeout -->
    <div class="form-group">
      <label class="form-label">⏱ 逾時（秒）</label>
      <input class="form-input" type="number" v-model.number="localTimeout" min="30" max="300" />
    </div>

    <div class="divider" />

    <!-- ④ Port Visibility -->
    <PortVisibilityEditor
      :inputs="portableInputs"
      :outputs="outputs"
      :hiddenPorts="hiddenPortsList"
      portColor="var(--accent-purple)"
      @update="onHiddenPortsUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import PortVisibilityEditor from './PortVisibilityEditor.vue'

interface Template { name: string; text: string }

const DEFAULT_TEMPLATES: Template[] = [
  { name: '📋 中文重點整理', text: '請用繁體中文，以條列方式整理這份內容的主要重點，每項不超過兩行。' },
  { name: '📝 英文摘要', text: 'Please provide a concise English summary of this content in 3-5 bullet points.' },
  { name: '❓ 問答格式', text: '請根據這份內容，提出 5 個重要問題並給出答案，使用繁體中文。' },
  { name: '🎯 重點與結論', text: '請幫我分析這份內容：\n1. 核心主題\n2. 三個關鍵重點\n3. 結論與建議\n使用繁體中文輸出。' },
  { name: '📊 結構化分析', text: '請對這份內容進行結構化分析，包含：背景、主要論點、數據支撐、結論。以繁體中文輸出。' },
]

const props = defineProps<{
  config: Record<string, any>
  inputs: { key: string; label: string; type: string }[]
  outputs: { key: string; label: string; type: string }[]
}>()

const emit = defineEmits<{ (e: 'update', config: Record<string, any>): void }>()

// Portable inputs = those that can be connection handles
const portableInputs = computed(() =>
  props.inputs.filter(f => ['string', 'url', 'number', 'textarea', 'object'].includes(f.type))
)

// State
const localUrl     = ref(props.config.url ?? '')
const localPrompt  = ref(props.config.prompt ?? '')
const localTimeout = ref(props.config.timeout ?? 120)
const hiddenPortsList = ref<string[]>((() => { try { return JSON.parse(props.config.hiddenPorts ?? '[]') } catch { return [] } })())

// Templates - 初始化時如果沒有模板就用預設模板
const templates = ref<Template[]>((() => {
  try {
    const saved = JSON.parse(props.config.templates ?? '[]')
    return saved.length > 0 ? saved : [...DEFAULT_TEMPLATES]
  } catch {
    return [...DEFAULT_TEMPLATES]
  }
})())
const selectedIdx = ref<number>(-1)

// Editing state
const editingTemplate = ref<Template | null>(null)
const editingIsNew = ref(false)

function selectTemplate(i: number) {
  if (editingTemplate.value) return
  selectedIdx.value = i
  localPrompt.value = templates.value[i].text
}

function addTemplate() {
  editingTemplate.value = { name: '', text: '' }
  editingIsNew.value = true
}
function deleteTemplate(i: number) {
  templates.value.splice(i, 1)
  if (selectedIdx.value === i) { selectedIdx.value = -1; localPrompt.value = '' }
  else if (selectedIdx.value > i) { selectedIdx.value-- }
}
function saveTemplate() {
  if (!editingTemplate.value) return
  if (editingIsNew.value) {
    templates.value.push({ ...editingTemplate.value })
    selectedIdx.value = templates.value.length - 1
    localPrompt.value = editingTemplate.value.text
  } else {
    if (selectedIdx.value >= 0) templates.value[selectedIdx.value] = { ...editingTemplate.value }
    localPrompt.value = editingTemplate.value.text
  }
  editingTemplate.value = null
}
function cancelEdit() { editingTemplate.value = null }

function onHiddenPortsUpdate(hp: string[]) { hiddenPortsList.value = hp }

function emitUpdate() {
  emit('update', {
    url: localUrl.value,
    prompt: localPrompt.value,
    timeout: localTimeout.value,
    hiddenPorts: JSON.stringify(hiddenPortsList.value),
    templates: JSON.stringify(templates.value),
    visiblePorts: hiddenPortsList.value.length === 0 ? '' :
      JSON.stringify(props.outputs.filter(o => !hiddenPortsList.value.includes(o.key)).map(o => o.key)),
  })
}

watch([localUrl, localPrompt, localTimeout, hiddenPortsList, templates], emitUpdate, { deep: true })
</script>

<style scoped>
.nlm-config { display: flex; flex-direction: column; }
.section-header {
  display: flex; align-items: center;
  font-size: 11px; font-weight: 600; color: var(--text-secondary);
  margin-bottom: 8px;
}
.template-select { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.template-chip {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 12px; font-size: 10px;
  background: var(--bg-base); border: 1px solid var(--border);
  cursor: pointer; transition: var(--transition); color: var(--text-secondary);
}
.template-chip:hover { border-color: var(--accent-purple); color: var(--accent-purple); }
.template-chip.active { background: var(--accent-purple)22; border-color: var(--accent-purple); color: var(--accent-purple); }
.chip-del {
  background: none; border: none; color: inherit; cursor: pointer;
  padding: 0; opacity: 0.6; font-size: 10px; line-height: 1;
}
.chip-del:hover { opacity: 1; }
.template-editor { display: flex; flex-direction: column; background: var(--bg-base); border: 1px solid var(--border-hover); border-radius: var(--radius-md); padding: 8px; margin-bottom:4px; }
.prompt-preview {  }
</style>
