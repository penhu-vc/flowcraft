<template>
  <!-- Toolbar -->
  <div class="topbar">
    <div style="display:flex;align-items:center;gap:10px;">
      <button class="btn btn-secondary btn-sm" @click="router.back()">← 返回</button>
      <div style="display:flex;align-items:center;gap:12px;">
        <span v-if="!editingName" class="topbar-title" @dblclick="startEditName" style="cursor:pointer;">
          {{ wf?.name || '載入中...' }}
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
      <!-- Workflow Settings -->
      <div class="workflow-settings">
        <div class="workflow-settings-header">⚙️ 工作流設定</div>
        <div class="workflow-settings-body">
          <div class="form-group-compact">
            <label class="form-label-sm">觸發器運行模式</label>
            <select class="form-select-sm" v-model="triggerMode" @change="onTriggerModeChange">
              <option value="fallback">運行失敗時更換</option>
              <option value="sequential">按順序觸發</option>
            </select>
            <div class="form-hint">
              <span v-if="triggerMode === 'fallback'">依序嘗試觸發器，第一個成功就停止</span>
              <span v-else>依序執行所有觸發器，每個都執行完整工作流</span>
            </div>
          </div>

          <div class="form-group-compact" v-if="triggerNodes.length > 0">
            <label class="form-label-sm">觸發器順序（{{ triggerNodes.length }} 個）</label>
            <div class="trigger-list">
              <div v-for="trigger in sortedTriggers" :key="trigger.id" class="trigger-item">
                <input
                  type="number"
                  class="trigger-order-input"
                  :value="trigger.data.triggerOrder || 999"
                  @input="updateTriggerOrder(trigger.id, $event)"
                  min="1"
                  max="99"
                />
                <span class="trigger-icon">{{ trigger.data.icon || '▶️' }}</span>
                <span class="trigger-name">{{ trigger.data.label || trigger.type }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
        :edges="styledEdges"
        :default-edge-options="{ animated: true, selectable: true, deletable: true, interactionWidth: 20 }"
        @node-click="onNodeClick"
        @edge-click="onEdgeClick"
        @pane-click="onPaneClick"
        @connect="onConnect"
        @nodes-change="onNodesChange"
        @edges-change="onEdgesChange"
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
              :nodeId="selectedNodeId"
              :nodes="nodes"
              :edges="edges"
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
                :inputOrder="inputOrderFromConfig"
                :outputOrder="outputOrderFromConfig"
                portColor="var(--accent-cyan)"
                @update="onGenericHiddenPortsUpdate"
                @update-input-order="onInputOrderUpdate"
                @update-order="onOutputOrderUpdate"
              />
            </template>

            <!-- 🆕 快取開關（所有節點都有） -->
            <div class="divider" />
            <div class="cache-control">
              <div class="cache-header">
                <span>⚡ 使用快取結果</span>
                <label class="switch">
                  <input
                    type="checkbox"
                    v-model="nodeData.useCachedResult"
                    :disabled="!nodeCacheStore.hasCache(selectedNodeId || '')"
                    @change="updateNodeConfig"
                  />
                  <span class="slider"></span>
                </label>
              </div>
              <div class="cache-hint">
                <template v-if="nodeCacheStore.hasCache(selectedNodeId || '')">
                  ✅ 有快取（{{ nodeCacheStore.getCacheAge(selectedNodeId || '') }}）
                </template>
                <template v-else>
                  ⚪ 無快取（需先執行一次）
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </div>

  <!-- Script Result Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="executionStore.scriptResultModal" class="modal-overlay" @click.self="executionStore.closeScriptResult()">
        <div class="script-modal">
          <div class="script-modal-header">
            <div class="script-modal-title">
              <span class="script-modal-icon">🎬</span>
              腳本生成完成
            </div>
            <button class="btn btn-icon btn-sm" @click="executionStore.closeScriptResult()">✕</button>
          </div>
          <div class="script-modal-body">
            <div v-if="executionStore.scriptResultModal.keywords?.length" class="script-keywords">
              <span class="keywords-label">關鍵字：</span>
              <span v-for="(kw, i) in executionStore.scriptResultModal.keywords" :key="i" class="keyword-tag">
                {{ kw }}
              </span>
            </div>
            <div class="script-content">
              <pre>{{ executionStore.scriptResultModal.script }}</pre>
            </div>
          </div>
          <div class="script-modal-footer">
            <span class="script-timestamp">
              {{ new Date(executionStore.scriptResultModal.timestamp).toLocaleString('zh-TW') }}
            </span>
            <div class="script-actions">
              <button class="btn btn-secondary btn-sm" @click="copyScript">
                📋 複製腳本
              </button>
              <button class="btn btn-primary btn-sm" @click="executionStore.closeScriptResult()">
                確定
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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
import YouTubeRecentVideosConfig from '../components/YouTubeRecentVideosConfig.vue'
import NotebookLMConfig from '../components/NotebookLMConfig.vue'
import SendTelegramConfig from '../components/SendTelegramConfig.vue'
import SegmentMiningConfig from '../components/SegmentMiningConfig.vue'
import BulletPointReferenceConfig from '../components/BulletPointReferenceConfig.vue'
import WriteCollectionConfig from '../components/WriteCollectionConfig.vue'
import ExecutionLoggerConfig from '../components/ExecutionLoggerConfig.vue'
import PortVisibilityEditor from '../components/PortVisibilityEditor.vue'
import { useWorkflowExecution } from '../composables/useWorkflowExecution'
import { useHistory } from '../composables/useHistory'
import { useExecutionStore } from '../stores/execution'
import { useNodeCacheStore } from '../stores/nodeCache'
import type { Workflow } from '../api/workflow'

// Map of customConfig name -> component
const CUSTOM_CONFIG_MAP: Record<string, any> = {
  YouTubeMonitorConfig,
  YouTubeRecentVideosConfig,
  NotebookLMConfig,
  SendTelegramConfig,
  SegmentMiningConfig,
  BulletPointReferenceConfig,
  WriteCollectionConfig,
  ExecutionLoggerConfig,
}

const route = useRoute()
const router = useRouter()
const store = useWorkflowStore()
const { executeWorkflow } = useWorkflowExecution()
const executionStore = useExecutionStore()
const nodeCacheStore = useNodeCacheStore()  // 直接獲取 store，確保 reactive

const wfId = route.params.id as string
const wf = computed(() => store.getWorkflow(wfId))

const nodes = ref<Node[]>(wf.value?.nodes || [])
const edges = ref<Edge[]>(wf.value?.edges || [])

// Undo/Redo 歷史管理
const { canUndo, canRedo, recordHistory, initHistory, undo, redo } = useHistory(nodes, edges)

// 觸發器設定
const triggerMode = ref<'fallback' | 'sequential'>(wf.value?.triggerMode || 'fallback')
const triggerNodes = computed(() => {
  const triggerTypes = ['manual-trigger', 'youtube-monitor', 'youtube-recent-videos']
  return nodes.value.filter(node => {
    // 使用 node.data.nodeType 來判斷（因為 node.type 通常是 'custom'）
    const nodeType = node.data?.nodeType || node.type
    const nodeDef = getNodeDef(nodeType)
    return nodeDef?.category === 'trigger' || triggerTypes.includes(nodeType)
  })
})
const sortedTriggers = computed(() => {
  return [...triggerNodes.value].sort((a, b) => {
    const orderA = a.data.triggerOrder || 999
    const orderB = b.data.triggerOrder || 999
    return orderA - orderB
  })
})

// Sync nodes/edges when workflow changes (e.g., after save)
watch(wf, (newWf) => {
  if (newWf && newWf.nodes && newWf.edges) {
    // Only sync if not currently editing to avoid overwriting changes
    if (!selectedNodeId.value) {
      nodes.value = newWf.nodes
      edges.value = newWf.edges
    }
  }
})

// Workflow name editing
const editingName = ref(false)
const editingNameValue = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

function startEditName() {
  if (!wf.value) return
  editingNameValue.value = wf.value.name
  editingName.value = true
  setTimeout(() => nameInputRef.value?.focus(), 0)
}

function saveWorkflowName() {
  if (!editingName.value || !wf.value) return
  const newName = editingNameValue.value.trim()
  if (newName && newName !== wf.value.name) {
    store.updateWorkflow(wfId, { ...wf.value, name: newName })
  }
  editingName.value = false
}

function cancelEditName() {
  editingName.value = false
  editingNameValue.value = ''
}

async function copyWorkflowName() {
  if (!wf.value) return
  const nameWithPrefix = `工作流 ${wf.value.name}`
  try {
    await navigator.clipboard.writeText(nameWithPrefix)
    // Show toast notification
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

async function copyScript() {
  const script = executionStore.scriptResultModal?.script
  if (!script) return
  try {
    await navigator.clipboard.writeText(script)
    const toast = document.createElement('div')
    toast.textContent = '✅ 腳本已複製'
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--accent-cyan);color:white;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;animation:toast-in 0.3s ease;'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  } catch (err) {
    console.error('Failed to copy script:', err)
  }
}

// 觸發器設定相關函數
function onTriggerModeChange() {
  if (!wf.value) return
  // 直接更新工作流，不調用 saveWorkflow（會覆蓋）
  store.updateWorkflow(wfId, { ...wf.value, triggerMode: triggerMode.value })
}

function updateTriggerOrder(nodeId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const order = parseInt(input.value) || 999
  const node = nodes.value.find(n => n.id === nodeId)
  if (node) {
    node.data.triggerOrder = order
    store.saveWorkflow(wfId, nodes.value, edges.value)
  }
}

// Computed edges with dynamic styling based on selection and disabled state
const styledEdges = computed(() => {
  return edges.value.map(edge => {
    const sourceNode = nodes.value.find(n => n.id === edge.source)
    const targetNode = nodes.value.find(n => n.id === edge.target)

    // Check if connected to disabled node
    const isDisabledEdge = sourceNode?.data.disabled || targetNode?.data.disabled

    // Check if this edge is selected
    const isSelectedEdge = edge.id === selectedEdgeId.value

    // Check if connected to selected node
    const isConnectedToSelected = selectedNodeId.value &&
      (edge.source === selectedNodeId.value || edge.target === selectedNodeId.value)

    // Check if connected to executing node
    const runningNodeId = executionStore.runningNodeId
    const isConnectedToExecuting = runningNodeId &&
      (edge.source === runningNodeId || edge.target === runningNodeId)
    const isDownstreamOfExecuting = runningNodeId && edge.source === runningNodeId

    // Determine edge class (priority: executing > disabled > edge selection > node selection)
    let edgeClass = ''
    let animated = false

    if (isDisabledEdge) {
      // Disabled nodes always have dimmed edges
      edgeClass = 'edge-dimmed'
    } else if (runningNodeId) {
      // When a node is executing
      if (isDownstreamOfExecuting) {
        edgeClass = 'edge-executing'
        animated = true
      } else {
        edgeClass = 'edge-dimmed'
      }
    } else if (selectedEdgeId.value) {
      // When an edge is selected
      edgeClass = isSelectedEdge ? 'edge-highlighted' : 'edge-dimmed'
      animated = isSelectedEdge
    } else if (selectedNodeId.value) {
      // When a node is selected
      edgeClass = isConnectedToSelected ? 'edge-highlighted' : 'edge-dimmed'
      animated = isConnectedToSelected
    }

    return {
      ...edge,
      class: edgeClass,
      animated
    }
  })
})

watch(() => wf.value, (v) => {
  if (v) {
    // Inject dragHandle so port handles are not blocked by node drag
    nodes.value = v.nodes.map(n => ({ ...n, dragHandle: '.node-header' }))
    edges.value = v.edges
  }
}, { immediate: true })

// Palette
const search = ref('')

// 取得隱藏的節點列表
function getHiddenNodes(): Set<string> {
  const stored = localStorage.getItem('flowcraft_hidden_nodes')
  return stored ? new Set(JSON.parse(stored)) : new Set()
}

const filteredByCategory = computed(() => {
  const q = search.value.toLowerCase()
  const hiddenNodes = getHiddenNodes()
  const result: Record<string, typeof NODE_REGISTRY> = {}

  for (const cat of ['trigger','action','ai','data','media','logic']) {
    result[cat] = NODE_REGISTRY.filter(n =>
      n.category === cat &&
      !hiddenNodes.has(n.id) &&  // 過濾隱藏的節點
      (!q || n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q))
    )
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
const { project, updateNode } = useVueFlow()
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
  recordHistory()  // 記錄歷史
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
  recordHistory()  // 記錄歷史
}

function handleKeydown(e: KeyboardEvent) {
  // Check if user is typing in an input/textarea
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

  // Undo: Ctrl+Z (Windows) / Cmd+Z (Mac)
  if (ctrlOrCmd && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    if (canUndo.value) {
      undo()
      showUndoRedoToast('↩️ 復原')
    }
    return
  }

  // Redo: Ctrl+Shift+Z (Windows) / Cmd+Shift+Z (Mac) or Ctrl+Y (Windows)
  if ((ctrlOrCmd && e.shiftKey && e.key === 'z') || (ctrlOrCmd && e.key === 'y')) {
    e.preventDefault()
    if (canRedo.value) {
      redo()
      showUndoRedoToast('↪️ 重做')
    }
    return
  }

  if (ctrlOrCmd && e.key === 'c') {
    e.preventDefault()
    copyNode()
  } else if (ctrlOrCmd && e.key === 'v') {
    e.preventDefault()
    pasteNode()
  } else if (e.key === 'd' || e.key === 'D') {
    // Toggle disabled state for selected node
    e.preventDefault()
    toggleNodeDisabled()
  }
}

function showUndoRedoToast(message: string) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--bg-elevated);color:var(--text-primary);padding:8px 16px;border-radius:8px;font-size:12px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;animation:toast-in 0.2s ease;border:1px solid var(--border);'
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 1000)
}

function toggleNodeDisabled() {
  if (!selectedNodeId.value) return
  const node = nodes.value.find(n => n.id === selectedNodeId.value)
  if (!node) return

  // Toggle disabled state
  node.data.disabled = !node.data.disabled

  const status = node.data.disabled ? '🚫 已停用' : '✅ 已啟用'
  console.log(`${status}: ${node.data.label}`)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  // 初始化歷史記錄（延遲一點確保 nodes/edges 已載入）
  setTimeout(() => initHistory(), 100)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// Properties panel
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
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
  recordHistory()  // 記錄歷史
}

function onEdgesChange(changes: any[]) {
  // Handle edge changes (remove, add, update)
  let hasChanges = false
  changes.forEach(change => {
    if (change.type === 'remove') {
      edges.value = edges.value.filter(e => e.id !== change.id)
      hasChanges = true
    }
  })
  if (hasChanges) recordHistory()  // 記錄歷史
}

function onNodesChange(changes: any[]) {
  // Handle node changes (remove, position, etc.)
  let hasRemoval = false
  changes.forEach(change => {
    if (change.type === 'remove') {
      hasRemoval = true
      // 同時刪除相關的邊
      edges.value = edges.value.filter(e => e.source !== change.id && e.target !== change.id)
    }
  })
  if (hasRemoval) recordHistory()  // 記錄歷史（節點刪除）
}

function onNodeClick({ node }: { node: Node }) {
  selectedNodeId.value = node.id
  selectedEdgeId.value = null  // Clear edge selection when selecting node
  const def = getNodeDef(node.data.nodeType)
  const defaults: Record<string, any> = {}
  def?.inputs?.forEach(f => { defaults[f.key] = node.data.config?.[f.key] ?? f.default ?? '' })
  nodeData.value = { ...defaults, ...node.data.config }

  // 🆕 自動檢查快取：如果勾選了「使用快取」但沒有快取數據，自動取消勾選
  if (nodeData.value.useCachedResult && !nodeCacheStore.hasCache(node.id)) {
    console.log(`[Cache] 節點 ${node.id} 沒有快取，自動取消「使用快取結果」`)
    nodeData.value.useCachedResult = false
    // 同步更新到節點配置
    setTimeout(() => updateNodeConfig(), 0)
  }
}

function onEdgeClick({ edge }: { edge: Edge }) {
  selectedEdgeId.value = edge.id
  selectedNodeId.value = null  // Clear node selection when selecting edge
}

function onPaneClick() {
  // Clear all selections when clicking on empty canvas
  selectedNodeId.value = null
  selectedEdgeId.value = null
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

// Compute inputOrder from generic nodeData for PortVisibilityEditor
const inputOrderFromConfig = computed<string[]>(() => {
  try { return JSON.parse(nodeData.value.inputOrder ?? '[]') } catch { return [] }
})

// Compute outputOrder from generic nodeData for PortVisibilityEditor
const outputOrderFromConfig = computed<string[]>(() => {
  try { return JSON.parse(nodeData.value.outputOrder ?? '[]') } catch { return [] }
})

// Input ports that can appear as connection handles (no password / select types)
const portableInputs = computed(() =>
  (selectedDef.value?.inputs || []).filter(f =>
    ['string', 'url', 'number', 'textarea', 'object'].includes(f.type)
  )
)

function onGenericHiddenPortsUpdate(hp: string[]) {
  nodeData.value = { ...nodeData.value, hiddenPorts: JSON.stringify(hp) }
  updateNodeConfig()
}

function onInputOrderUpdate(order: string[]) {
  nodeData.value = { ...nodeData.value, inputOrder: JSON.stringify(order) }
  updateNodeConfig()
}

function onOutputOrderUpdate(order: string[]) {
  nodeData.value = { ...nodeData.value, outputOrder: JSON.stringify(order) }
  updateNodeConfig()
}

function updateNodeConfig() {
  if (!selectedNodeId.value) return

  // Update using VueFlow API
  updateNode(selectedNodeId.value, (node) => ({
    ...node,
    data: { ...node.data, config: { ...nodeData.value } }
  }))

  // Auto-save
  setTimeout(() => {
    store.saveWorkflow(wfId, nodes.value, edges.value)
  }, 100)
}

// Watch nodeData for other changes (not from port order/visibility)
// Removed auto-update here to avoid conflicts with updateNodeConfig()

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

    // 🆕 收集快取資料（只收集開啟「使用快取」的節點）
    const nodeCache: Record<string, any> = {}
    for (const node of nodes.value) {
      if (node.data.config?.useCachedResult) {
        const cacheEntry = nodeCacheStore.getCacheResult(node.id)
        if (cacheEntry) {
          nodeCache[node.id] = cacheEntry.result
          console.log('[Execute] Using cache for node:', node.id)
        }
      }
    }

    // 轉換成執行格式
    const workflow: Workflow = {
      id: wfId,
      name: wf.value?.name || 'Untitled',
      nodes: nodes.value.map(n => ({
        id: n.id,
        type: n.data.nodeType,  // 真正的節點類型存在 data.nodeType
        position: n.position,
        data: {
          ...(n.data.config || {}),  // 配置項
          disabled: n.data.disabled,  // 停用狀態（重要！）
          useCachedResult: n.data.config?.useCachedResult  // 快取標記
        }
      })),
      edges: edges.value.map(e => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle || '',
        target: e.target,
        targetHandle: e.targetHandle || ''
      }))
    }

    await executeWorkflow(workflow, nodeCache)
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
.workflow-settings {
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}
.workflow-settings-header {
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-bottom: 1px solid var(--border);
}
.workflow-settings-body {
  padding: 12px;
}
.form-group-compact {
  margin-bottom: 12px;
}
.form-group-compact:last-child {
  margin-bottom: 0;
}
.form-label-sm {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.form-select-sm {
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-primary);
}
.form-hint {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
  line-height: 1.4;
}
.trigger-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.trigger-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.trigger-order-input {
  width: 40px;
  padding: 4px 6px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.trigger-icon {
  font-size: 14px;
  flex-shrink: 0;
}
.trigger-name {
  font-size: 11px;
  color: var(--text-secondary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* Edge highlighting styles */
:deep(.vue-flow__edge.edge-highlighted path) {
  stroke: var(--accent-cyan) !important;
  stroke-width: 2.5px !important;
  filter: drop-shadow(0 0 4px var(--accent-cyan));
}

:deep(.vue-flow__edge.edge-executing path) {
  stroke: lime !important;
  stroke-width: 3px !important;
  filter: drop-shadow(0 0 6px lime);
  animation: pulse-edge 1.5s ease-in-out infinite;
}

@keyframes pulse-edge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

:deep(.vue-flow__edge.edge-dimmed path) {
  stroke: rgba(148, 163, 184, 0.25) !important;
  stroke-width: 1.5px !important;
}

:deep(.vue-flow__edge.edge-dimmed .vue-flow__edge-text) {
  opacity: 0.3;
}

/* Cache control */
.cache-control {
  padding: 12px;
  background: var(--bg-elevated);
  border-radius: 6px;
}
.cache-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.cache-hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* Toggle switch */
.switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-card);
  border: 1.5px solid var(--border);
  transition: 0.3s;
  border-radius: 20px;
}
.slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text-muted);
  transition: 0.3s;
  border-radius: 50%;
}
input:checked + .slider {
  background-color: rgba(0, 255, 0, 0.2);
  border-color: lime;
}
input:checked + .slider:before {
  transform: translateX(16px);
  background-color: lime;
}
input:disabled + .slider {
  opacity: 0.4;
  cursor: not-allowed;
}

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

/* Script Result Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.script-modal {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.script-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-base);
  border-radius: 12px 12px 0 0;
}

.script-modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.script-modal-icon {
  font-size: 20px;
}

.script-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.script-keywords {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.keywords-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.keyword-tag {
  background: rgba(0, 255, 255, 0.15);
  color: var(--accent-cyan);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.script-content {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
}

.script-content pre {
  margin: 0;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.script-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-base);
  border-radius: 0 0 12px 12px;
}

.script-timestamp {
  font-size: 11px;
  color: var(--text-muted);
}

.script-actions {
  display: flex;
  gap: 10px;
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .script-modal,
.modal-leave-to .script-modal {
  transform: scale(0.95) translateY(20px);
}
</style>
