<template>
  <!-- Toolbar -->
  <div class="topbar">
    <div style="display:flex;align-items:center;gap:10px;">
      <button class="btn btn-secondary btn-sm" @click="router.back()">← 返回</button>
      <span class="topbar-title">{{ wf?.name || '載入中...' }}</span>
      <span class="badge badge-active" v-if="wf?.active">● 執行中</span>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-secondary btn-sm" @click="onSave">💾 儲存</button>
      <button class="btn btn-secondary btn-sm" @click="store.exportWorkflow(wfId)">⬇️ 匯出</button>
      <button
        class="btn btn-success btn-sm"
        @click="onExecute"
        :disabled="executionStore.isRunning"
      >
        {{ executionStore.isRunning ? '⏳ 執行中...' : '▶️ 執行工作流' }}
      </button>
      <!-- DEBUG -->
      <span v-if="executionStore.currentExecution" style="color: lime; font-size: 10px; margin-left: 8px;">
        🟢 執行中: {{ executionStore.currentExecution.id }}
      </span>
      <button class="btn btn-primary btn-sm" @click="store.toggleActive(wfId)">
        {{ wf?.active ? '⏹ 停用' : '▶ 啟用' }}
      </button>
    </div>
  </div>

  <div class="editor-layout">
    <!-- Node Palette -->
    <div class="palette">
      <div class="palette-search">
        <input class="form-input" v-model="search" placeholder="🔍 搜尋節點..." />
      </div>
      <div class="palette-body">
        <template v-for="(nodes, cat) in filteredByCategory" :key="cat">
          <div v-if="nodes.length > 0">
            <div class="palette-cat-label">{{ CATEGORY_LABELS[cat] }}</div>
            <div
              v-for="node in nodes"
              :key="node.id"
              class="palette-node"
              draggable="true"
              @dragstart="onDragStart($event, node.id)"
            >
              <span class="palette-node-icon" :style="{ background: CATEGORY_COLORS[node.category] + '22', color: CATEGORY_COLORS[node.category] }">
                {{ node.icon }}
              </span>
              <div>
                <div class="palette-node-name">{{ node.name }}</div>
                <div class="palette-node-desc">{{ node.description }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Canvas -->
    <div class="canvas-area" ref="canvasRef" @dragover.prevent @drop="onDrop">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-edge-options="{ animated: true, selectable: true, deletable: true, interactionWidth: 20 }"
        @node-click="onNodeClick"
        @connect="onConnect"
        :is-valid-connection="() => true"
        nodes-connectable
        edges-deletable
        nodes-deletable
        :delete-key-code="['Delete', 'Backspace']"
        :min-zoom="0.2"
        :max-zoom="2"
        fit-view-on-init
      >
        <Background pattern-color="rgba(255,255,255,0.05)" :gap="24" />
        <Controls />
        <MiniMap :node-color="nodeColor" />

        <template #node-custom="props">
          <CustomNode v-bind="props" />
        </template>
      </VueFlow>

      <!-- Save toast -->
      <Transition name="toast">
        <div v-if="savedToast" class="save-toast">✅ 已儲存</div>
      </Transition>

      <!-- Execution Log Panel -->
      <Transition name="slide-up">
        <div v-if="executionStore.currentExecution" class="execution-panel">
          <div class="execution-header">
            <div>
              <span class="execution-status" :class="executionStore.currentExecution.status">
                {{ executionStore.currentExecution.status === 'running' ? '⏳' :
                   executionStore.currentExecution.status === 'completed' ? '✅' :
                   executionStore.currentExecution.status === 'failed' ? '❌' : '⏸' }}
              </span>
              <span style="font-size:12px;font-weight:600;margin-left:6px;">
                執行 {{ executionStore.currentExecution.id }}
              </span>
              <span v-if="executionStore.currentExecution.duration" style="font-size:11px;color:var(--text-muted);margin-left:8px;">
                ({{ (executionStore.currentExecution.duration / 1000).toFixed(1) }}s)
              </span>
            </div>
            <button class="btn btn-icon btn-sm" @click="executionStore.clearExecution()">✕</button>
          </div>
          <div class="execution-body">
            <div v-for="[nodeId, nodeExec] in Array.from(executionStore.currentExecution.nodes.entries())" :key="nodeId" class="execution-node">
              <div class="execution-node-header">
                <span class="execution-node-status" :class="nodeExec.status">
                  {{ nodeExec.status === 'running' ? '🔵' :
                     nodeExec.status === 'completed' ? '🟢' :
                     nodeExec.status === 'failed' ? '🔴' : '⚪' }}
                </span>
                <span style="font-size:11px;font-weight:500;">{{ nodeId }}</span>
                <span v-if="nodeExec.duration" style="font-size:10px;color:var(--text-muted);margin-left:auto;">
                  {{ (nodeExec.duration / 1000).toFixed(1) }}s
                </span>
              </div>
              <div v-if="nodeExec.progress !== undefined" class="execution-progress">
                <div class="execution-progress-bar" :style="{ width: nodeExec.progress + '%' }"></div>
                <span class="execution-progress-text">{{ nodeExec.progress }}%</span>
              </div>
              <div v-if="nodeExec.logs.length > 0" class="execution-logs">
                <div v-for="(log, i) in nodeExec.logs.slice(-3)" :key="i" class="execution-log">
                  {{ log }}
                </div>
              </div>
              <div v-if="nodeExec.error" class="execution-error">
                ❌ {{ nodeExec.error }}
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Properties Panel -->
    <Transition name="slide-right">
      <div v-if="selectedNodeId" class="props-panel">
        <div class="props-header">
          <div>
            <div style="font-size:11px;color:var(--text-muted);">設定節點</div>
            <div class="props-title">{{ selectedDef?.icon }} {{ selectedDef?.name }}</div>
          </div>
          <button class="btn btn-icon btn-secondary" @click="selectedNodeId = null">✕</button>
        </div>
        <div class="props-body">
          <div v-if="!selectedDef" style="color:var(--text-muted);font-size:13px;">未知節點類型</div>
          <template v-else>
            <!-- Custom config component (e.g. YouTubeMonitorConfig) -->
            <component
              v-if="customConfigComponent"
              :is="customConfigComponent"
              :config="nodeData"
              :inputs="selectedDef.inputs"
              :outputs="selectedDef.outputs"
              @update="onCustomConfigUpdate"
            />
            <!-- Generic config renderer -->
            <template v-else>
              <div v-if="!selectedDef.inputs || selectedDef.inputs.length === 0" style="padding:12px;color:var(--text-muted);font-size:13px;">
                此節點無需設定參數
              </div>
              <div v-else class="form-group" v-for="field in selectedDef.inputs" :key="field.key" style="margin-bottom:14px;">
                <label class="form-label">
                  {{ field.label }} <span v-if="field.required" style="color:var(--red);">*</span>
                </label>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;" v-if="field.description">{{ field.description }}</div>
                <textarea v-if="field.type === 'textarea'" class="form-textarea" v-model="nodeData[field.key]" :placeholder="field.placeholder" />
                <select v-else-if="field.type === 'select'" class="form-select" v-model="nodeData[field.key]">
                  <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <input v-else class="form-input" :type="field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'" v-model="nodeData[field.key]" :placeholder="field.placeholder" />
              </div>
              <div class="divider" />
              <!-- Port visibility for generic nodes -->
              <PortVisibilityEditor
                :inputs="portableInputs"
                :outputs="selectedDef.outputs"
                :hiddenPorts="hiddenPortsFromConfig"
                portColor="var(--accent-cyan)"
                @update="onGenericHiddenPortsUpdate"
              />
            </template>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow, addEdge } from '@vue-flow/core'
import type { Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge } from '@vue-flow/core'
import { useWorkflowStore } from '../stores/workflow'
import { NODE_REGISTRY, CATEGORY_COLORS, CATEGORY_LABELS, getNodeDef } from '../nodes/registry'
import CustomNode from '../components/CustomNode.vue'
import YouTubeMonitorConfig from '../components/YouTubeMonitorConfig.vue'
import NotebookLMConfig from '../components/NotebookLMConfig.vue'
import SendTelegramConfig from '../components/SendTelegramConfig.vue'
import SegmentMiningConfig from '../components/SegmentMiningConfig.vue'
import PortVisibilityEditor from '../components/PortVisibilityEditor.vue'
import { useWorkflowExecution } from '../composables/useWorkflowExecution'
import { useExecutionStore } from '../stores/execution'
import type { Workflow } from '../api/workflow'

// Map of customConfig name -> component
const CUSTOM_CONFIG_MAP: Record<string, any> = {
  YouTubeMonitorConfig,
  NotebookLMConfig,
  SendTelegramConfig,
  SegmentMiningConfig,
}

const route = useRoute()
const router = useRouter()
const store = useWorkflowStore()
const { executeWorkflow } = useWorkflowExecution()
const executionStore = useExecutionStore()  // 直接獲取 store，確保 reactive

const wfId = route.params.id as string
const wf = computed(() => store.getWorkflow(wfId))

const nodes = ref<Node[]>(wf.value?.nodes || [])
const edges = ref<Edge[]>(wf.value?.edges || [])

watch(() => wf.value, (v) => {
  if (v) {
    // Inject dragHandle so port handles are not blocked by node drag
    nodes.value = v.nodes.map(n => ({ ...n, dragHandle: '.node-header' }))
    edges.value = v.edges
  }
}, { immediate: true })

// Palette
const search = ref('')
const filteredByCategory = computed(() => {
  const q = search.value.toLowerCase()
  const result: Record<string, typeof NODE_REGISTRY> = {}
  for (const cat of ['trigger','action','ai','data','media','logic']) {
    result[cat] = NODE_REGISTRY.filter(n => n.category === cat && (
      !q || n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q)
    ))
  }
  return result
})

// Drag & Drop
const draggedNodeType = ref('')
function onDragStart(e: DragEvent, nodeId: string) {
  draggedNodeType.value = nodeId
  e.dataTransfer!.effectAllowed = 'move'
}

const canvasRef = ref<HTMLElement>()
const { project } = useVueFlow()
function onDrop(e: DragEvent) {
  if (!draggedNodeType.value) return
  const bounds = canvasRef.value!.getBoundingClientRect()
  const position = project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
  const def = getNodeDef(draggedNodeType.value)
  if (!def) return
  const newNode: Node = {
    id: `${def.id}-${Date.now()}`,
    type: 'custom',
    position,
    dragHandle: '.node-header',
    data: { nodeType: def.id, label: def.name, icon: def.icon, category: def.category, config: {} },
  }
  nodes.value.push(newNode)
  draggedNodeType.value = ''
}

// Copy & Paste
const copiedNode = ref<Node | null>(null)

function copyNode() {
  if (!selectedNodeId.value) return
  const node = nodes.value.find(n => n.id === selectedNodeId.value)
  if (node) {
    copiedNode.value = JSON.parse(JSON.stringify(node)) // Deep clone
    console.log('📋 Copied node:', node.data.label)
  }
}

function pasteNode() {
  if (!copiedNode.value) return

  // Create new node - only copy necessary properties to avoid grouping issues
  const newNode: Node = {
    id: `${copiedNode.value.data.nodeType}-${Date.now()}`,
    type: copiedNode.value.type,
    position: {
      x: copiedNode.value.position.x + 50,
      y: copiedNode.value.position.y + 50,
    },
    dragHandle: '.node-header',
    data: JSON.parse(JSON.stringify(copiedNode.value.data)), // Deep clone data
  }

  nodes.value.push(newNode)
  selectedNodeId.value = newNode.id
  console.log('📌 Pasted node:', newNode.data.label)
}

function handleKeydown(e: KeyboardEvent) {
  // Check if user is typing in an input/textarea
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

  if (ctrlOrCmd && e.key === 'c') {
    e.preventDefault()
    copyNode()
  } else if (ctrlOrCmd && e.key === 'v') {
    e.preventDefault()
    pasteNode()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// Properties panel
const selectedNodeId = ref<string | null>(null)
const selectedDef = computed(() => {
  const node = nodes.value.find(n => n.id === selectedNodeId.value)
  return node ? getNodeDef(node.data.nodeType) : null
})
const customConfigComponent = computed(() => {
  const name = selectedDef.value?.customConfig
  return name ? CUSTOM_CONFIG_MAP[name] : null
})
const nodeData = ref<Record<string, any>>({})

// ── Connection handler — REQUIRED for edge drag to work ──────────────────
function onConnect(connection: Connection) {
  edges.value = addEdge({ ...connection, animated: true }, edges.value)
}

function onNodeClick({ node }: { node: Node }) {
  selectedNodeId.value = node.id
  const def = getNodeDef(node.data.nodeType)
  const defaults: Record<string, any> = {}
  def?.inputs?.forEach(f => { defaults[f.key] = node.data.config?.[f.key] ?? f.default ?? '' })
  nodeData.value = { ...node.data.config, ...defaults }
}

function onCustomConfigUpdate(newConfig: Record<string, any>) {
  nodeData.value = newConfig
  const node = nodes.value.find(n => n.id === selectedNodeId.value)
  if (node) node.data = { ...node.data, config: { ...newConfig } }
}

// Compute hiddenPorts from generic nodeData for PortVisibilityEditor
const hiddenPortsFromConfig = computed<string[]>(() => {
  try { return JSON.parse(nodeData.value.hiddenPorts ?? '[]') } catch { return [] }
})

// Input ports that can appear as connection handles (no password / select types)
const portableInputs = computed(() =>
  (selectedDef.value?.inputs || []).filter(f =>
    ['string', 'url', 'number', 'textarea', 'object'].includes(f.type)
  )
)

function onGenericHiddenPortsUpdate(hp: string[]) {
  nodeData.value = { ...nodeData.value, hiddenPorts: JSON.stringify(hp) }
}

watch(nodeData, (val) => {
  const node = nodes.value.find(n => n.id === selectedNodeId.value)
  if (node) node.data = { ...node.data, config: { ...val } }
}, { deep: true })

// Save
const savedToast = ref(false)
function onSave() {
  store.saveWorkflow(wfId, nodes.value, edges.value)
  savedToast.value = true
  setTimeout(() => savedToast.value = false, 2000)
}

// Execute
async function onExecute() {
  try {
    // 先儲存
    store.saveWorkflow(wfId, nodes.value, edges.value)

    // 轉換成執行格式
    const workflow: Workflow = {
      id: wfId,
      name: wf.value?.name || 'Untitled',
      nodes: nodes.value.map(n => ({
        id: n.id,
        type: n.data.nodeType,  // 真正的節點類型存在 data.nodeType
        position: n.position,
        data: n.data.config || {}  // 只傳遞配置，不傳整個 data
      })),
      edges: edges.value.map(e => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle || '',
        target: e.target,
        targetHandle: e.targetHandle || ''
      }))
    }

    await executeWorkflow(workflow)
  } catch (error) {
    console.error('Failed to execute workflow:', error)
    alert('執行失敗: ' + (error instanceof Error ? error.message : String(error)))
  }
}

function nodeColor(node: Node) {
  // 檢查節點執行狀態
  const nodeExec = executionStore.getNodeExecution(node.id)

  if (nodeExec) {
    switch (nodeExec.status) {
      case 'running':
        return '#3b82f6'  // 藍色（執行中）
      case 'completed':
        return '#10b981'  // 綠色（完成）
      case 'failed':
        return '#ef4444'  // 紅色（失敗）
      default:
        return '#6b7280'  // 灰色（等待中）
    }
  }

  return CATEGORY_COLORS[node.data?.category] || '#6b7280'
}
</script>

<style scoped>
.editor-layout { display: flex; flex: 1; overflow: hidden; height: calc(100vh - 56px); }

.palette {
  width: 220px; flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.palette-search { padding: 12px; border-bottom: 1px solid var(--border); }
.palette-body { flex: 1; overflow-y: auto; padding: 8px; }
.palette-cat-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 8px 4px; }
.palette-node {
  display: flex; align-items: center; gap: 8px;
  padding: 8px; border-radius: var(--radius-sm);
  cursor: grab; transition: var(--transition);
  margin-bottom: 2px;
}
.palette-node:hover { background: var(--bg-hover); }
.palette-node:active { cursor: grabbing; }
.palette-node-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.palette-node-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
.palette-node-desc { font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }

.canvas-area { flex: 1; position: relative; }

.props-panel {
  width: 280px; flex-shrink: 0;
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.props-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.props-title { font-size: 14px; font-weight: 600; }
.props-body { flex: 1; overflow-y: auto; padding: 16px; }

.save-toast {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--bg-card); border: 1px solid rgba(16,185,129,0.4);
  color: #10B981; padding: 8px 20px; border-radius: 99px; font-size: 13px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}

.slide-right-enter-active, .slide-right-leave-active { transition: all 0.25s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); opacity: 0; }
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(10px); }

/* Execution Panel */
.execution-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 250px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -4px 12px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.execution-header {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-base);
}

.execution-status {
  font-size: 14px;
}

.execution-status.running { animation: pulse 2s infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.execution-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.execution-node {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.execution-node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.execution-node-status {
  font-size: 12px;
}

.execution-progress {
  position: relative;
  height: 18px;
  background: var(--bg-hover);
  border-radius: 9px;
  margin: 6px 0;
  overflow: hidden;
}

.execution-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  transition: width 0.3s ease;
}

.execution-progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
}

.execution-logs {
  margin-top: 6px;
}

.execution-log {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'Courier New', monospace;
  padding: 2px 0;
}

.execution-error {
  font-size: 11px;
  color: var(--red);
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: var(--radius-sm);
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
