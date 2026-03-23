<template>
  <!-- Toolbar -->
  <EditorToolbar
    :workflowName="wf?.name || ''"
    :isActive="!!wf?.active"
    :hasMultiSelection="hasMultiSelection"
    :isRunning="executionStore.isRunning"
    :currentExecutionId="executionStore.currentExecution?.id || null"
    :showMiniMap="showMiniMap"
    :snapGrid="snapGrid"
    @go-back="router.back()"
    @align-center="alignCenter"
    @align-horizontal="alignHorizontal"
    @auto-layout="applyAutoLayout"
    @toggle-minimap="showMiniMap = !showMiniMap"
    @toggle-snap-grid="toggleSnapGrid"
    @save="onSave"
    @export="store.exportWorkflow(wfId)"
    @execute="onExecute"
    @toggle-active="store.toggleActive(wfId)"
    @update-name="onUpdateName"
  />

  <div class="editor-layout">
    <!-- Node Palette -->
    <NodePalette
      :triggerMode="triggerMode"
      :sortedTriggers="sortedTriggers"
      :search="search"
      :filteredByCategory="filteredByCategory"
      @update:search="search = $event"
      @update-trigger-mode="onTriggerModeUpdate"
      @update-trigger-order="updateTriggerOrder"
      @drag-start="draggedNodeType = $event"
    />

    <!-- Canvas -->
    <div class="canvas-area" :class="{ 'snap-grid-active': snapGrid }" ref="canvasRef" @dragover.prevent @drop="onDrop">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-edge-options="{ animated: true, selectable: true, deletable: true, interactionWidth: 20 }"
        :snap-to-grid="snapGrid"
        :snap-grid="[20, 20]"
        :connection-line-style="{ stroke: '#22d3ee', strokeWidth: 2, strokeDasharray: '6 4', opacity: 0.9 }"
        @node-click="onNodeClick"
        @edge-click="onEdgeClick"
        @edge-mouse-enter="(_event: MouseEvent, edge: any) => onEdgeMouseEnter(edge)"
        @edge-mouse-leave="() => onEdgeMouseLeave()"
        @pane-click="onPaneClick"
        @connect="onConnect"
        @nodes-change="onNodesChange"
        @edges-change="onEdgesChange"
        @connect-start="onConnectStart"
        @connect-end="onConnectEnd"
        :is-valid-connection="isValidConnection"
        :class="{ 'is-connecting': connectingState.active }"
        nodes-connectable
        edges-deletable
        nodes-deletable
        :delete-key-code="['Delete', 'Backspace']"
        :selection-key-code="'Shift'"
        :multi-selection-key-code="'Shift'"
        :min-zoom="0.2"
        :max-zoom="2"
        fit-view-on-init
      >
        <Background pattern-color="rgba(255,255,255,0.05)" :gap="24" />
        <Controls />
        <MiniMap
          v-if="showMiniMap"
          :node-color="nodeColor"
          position="bottom-left"
          :width="180"
          :height="120"
          mask-color="rgba(15, 16, 36, 0.6)"
        />

        <template #node-custom="props">
          <CustomNode
            v-bind="props"
            :connecting-from-node-id="connectingState.nodeId"
            :connecting-from-handle-id="connectingState.handleId"
            :existing-edges="edges"
            @retryNode="handleRetryNode"
          />
        </template>
      </VueFlow>

      <!-- Save toast -->
      <Transition name="toast">
        <div v-if="savedToast" class="save-toast">✅ 已儲存</div>
      </Transition>

      <!-- Node Search Panel -->
      <NodeSearchPanel
        :show="showSearch"
        :query="searchQuery"
        :results="searchResults"
        :selectedIndex="selectedResultIndex"
        @update:query="searchQuery = $event"
        @close="closeSearch"
        @select="(id: string) => { jumpToNode(id); closeSearch() }"
      />

      <!-- Execution Stats Panel -->
      <ExecutionStatsPanel
        :executionStats="executionStore.executionStats"
        @jump-to-node="jumpToNode"
      />

      <!-- Execution Log Panel -->
      <ExecutionLogPanel
        :currentExecution="executionStore.currentExecution"
        @clear-execution="executionStore.clearExecution()"
      />
    </div>

    <!-- Properties Panel -->
    <NodePropertiesPanel
      ref="propsPanelRef"
      :selectedNodeId="selectedNodeId"
      :nodes="nodes"
      :edges="edges"
      :hasCache="nodeCacheStore.hasCache(selectedNodeId || '')"
      :cacheAge="nodeCacheStore.getCacheAge(selectedNodeId || '')"
      @close="selectedNodeId = null"
      @update-config="onPropsUpdateConfig"
      @custom-config-update="onCustomConfigUpdate"
    />
  </div>

  <!-- Script Result Modal -->
  <ScriptResultModal
    :scriptResultModal="executionStore.scriptResultModal"
    @close="executionStore.closeScriptResult()"
  />
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow, addEdge } from '@vue-flow/core'
import type { Connection, ConnectStartParams } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge } from '@vue-flow/core'
import { useWorkflowStore } from '../stores/workflow'
import { NODE_REGISTRY, CATEGORY_COLORS, getNodeDef } from '../nodes/registry'
import CustomNode from '../components/CustomNode.vue'
import { useWorkflowExecution } from '../composables/useWorkflowExecution'
import { useHistory } from '../composables/useHistory'
import { useExecutionStore } from '../stores/execution'
import { useNodeCacheStore } from '../stores/nodeCache'
import type { Workflow } from '../api/workflow'
import { useNodeSearch } from '../composables/useNodeSearch'
import { useAutoLayout } from '../composables/useAutoLayout'
import { useEditorKeyboard } from '../composables/useEditorKeyboard'
import { useEdgeStyles } from '../composables/useEdgeStyles'

// Sub-components
import EditorToolbar from '../components/editor/EditorToolbar.vue'
import NodePalette from '../components/editor/NodePalette.vue'
import NodeSearchPanel from '../components/editor/NodeSearchPanel.vue'
import ExecutionStatsPanel from '../components/editor/ExecutionStatsPanel.vue'
import ExecutionLogPanel from '../components/editor/ExecutionLogPanel.vue'
import NodePropertiesPanel from '../components/editor/NodePropertiesPanel.vue'
import ScriptResultModal from '../components/editor/ScriptResultModal.vue'

const route = useRoute()
const router = useRouter()
const store = useWorkflowStore()
const { executeWorkflow } = useWorkflowExecution()
const executionStore = useExecutionStore()
const nodeCacheStore = useNodeCacheStore()

const wfId = route.params.id as string
const wf = computed(() => store.getWorkflow(wfId))

const nodes = ref<Node[]>(wf.value?.nodes || [])
const edges = ref<Edge[]>(wf.value?.edges || [])

// Undo/Redo history
const { canUndo, canRedo, recordHistory, initHistory, undo, redo } = useHistory(nodes, edges)

// Node search
const {
  searchQuery, showSearch, searchResults, selectedResultIndex,
  openSearch, closeSearch, jumpToNode, selectNextResult, selectPrevResult
} = useNodeSearch(nodes)

// Auto layout
const { autoLayout } = useAutoLayout()

// Properties panel
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const propsPanelRef = ref<InstanceType<typeof NodePropertiesPanel> | null>(null)

// VueFlow utilities
const canvasRef = ref<HTMLElement>()
const showMiniMap = ref(true)
// Snap to grid
const snapGrid = ref(localStorage.getItem('flowcraft_snap_grid') === 'true')
function toggleSnapGrid() {
  snapGrid.value = !snapGrid.value
  localStorage.setItem('flowcraft_snap_grid', String(snapGrid.value))
}

const { project, updateNode, getSelectedNodes, fitView } = useVueFlow()
const selectedNodes = computed(() => getSelectedNodes.value)
const hasMultiSelection = computed(() => selectedNodes.value.length >= 2)

// Connection validation state
const connectingState = reactive({
  active: false,
  nodeId: null as string | null,
  handleId: null as string | null,
  handleType: null as string | null,
})

function onConnectStart(params: ConnectStartParams) {
  connectingState.active = true
  connectingState.nodeId = params.nodeId ?? null
  connectingState.handleId = params.handleId ?? null
  connectingState.handleType = params.handleType ?? null
}

function onConnectEnd() {
  connectingState.active = false
  connectingState.nodeId = null
  connectingState.handleId = null
  connectingState.handleType = null
}

function isValidConnection(connection: Connection): boolean {
  const { source, target, sourceHandle, targetHandle } = connection
  // Prevent self-connections
  if (source === target) return false
  // Prevent duplicate connections (same source handle → same target handle)
  const duplicate = edges.value.some(
    e => e.source === source &&
         e.sourceHandle === (sourceHandle ?? null) &&
         e.target === target &&
         e.targetHandle === (targetHandle ?? null)
  )
  return !duplicate
}

// Edge styling
const runningNodeIdRef = computed(() => executionStore.runningNodeId)
const { onEdgeMouseEnter, onEdgeMouseLeave } = useEdgeStyles(nodes, edges, selectedNodeId, selectedEdgeId, selectedNodes, runningNodeIdRef)

// Keyboard shortcuts
const { showUndoRedoToast, setupKeyboard, teardownKeyboard } = useEditorKeyboard({
  nodes, selectedNodeId, showSearch, searchResults, selectedResultIndex,
  canUndo, canRedo,
  openSearch, closeSearch, selectNextResult, selectPrevResult, jumpToNode,
  undo, redo, recordHistory
})

// Trigger settings
const triggerMode = ref<'fallback' | 'sequential'>(wf.value?.triggerMode || 'fallback')
const triggerNodes = computed(() => {
  const triggerTypes = ['manual-trigger', 'youtube-monitor', 'youtube-recent-videos']
  return nodes.value.filter(node => {
    const nodeType = node.data?.nodeType || node.type
    const nodeDef = getNodeDef(nodeType)
    return nodeDef?.category === 'trigger' || triggerTypes.includes(nodeType)
  })
})
const sortedTriggers = computed(() => {
  return [...triggerNodes.value].sort((a, b) =>
    (a.data.triggerOrder || 999) - (b.data.triggerOrder || 999)
  )
})

// Sync nodes/edges when workflow changes
watch(wf, (newWf) => {
  if (newWf && newWf.nodes && newWf.edges) {
    if (!selectedNodeId.value) {
      nodes.value = newWf.nodes
      edges.value = newWf.edges
    }
  }
})

watch(() => wf.value, (v) => {
  if (v) {
    nodes.value = v.nodes.map(n => ({ ...n, dragHandle: '.node-header' }))
    edges.value = v.edges
  }
}, { immediate: true })

// Trigger settings functions
function onTriggerModeUpdate(mode: 'fallback' | 'sequential') {
  triggerMode.value = mode
  if (!wf.value) return
  store.updateWorkflow(wfId, { ...wf.value, triggerMode: mode })
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

function onUpdateName(newName: string) {
  if (!wf.value) return
  store.updateWorkflow(wfId, { ...wf.value, name: newName })
}

// Palette
const search = ref('')

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
      !hiddenNodes.has(n.id) &&
      (!q || n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q))
    )
  }
  return result
})

// Drag & Drop
const draggedNodeType = ref('')

function onDrop(e: DragEvent) {
  if (!draggedNodeType.value) return
  const bounds = canvasRef.value!.getBoundingClientRect()
  const position = project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
  const def = getNodeDef(draggedNodeType.value)
  if (!def) return
  const isComment = def.id === 'comment'
  const newNode: Node = {
    id: `${def.id}-${Date.now()}`,
    type: 'custom',
    position,
    dragHandle: isComment ? '.comment-node' : '.node-header',
    style: isComment ? { width: '200px', height: '100px' } : undefined,
    data: {
      nodeType: def.id,
      label: def.name,
      icon: def.icon,
      category: def.category,
      config: isComment ? { text: '', bgColor: 'yellow' } : {},
    },
  }
  nodes.value.push(newNode)
  draggedNodeType.value = ''
  recordHistory()
}

// Alignment
function alignCenter() {
  const selected = selectedNodes.value
  if (selected.length < 2) return
  const anchor = selected[0]
  const anchorCenterX = anchor.position.x + ((anchor.dimensions?.width || 220) / 2)
  for (let i = 1; i < selected.length; i++) {
    const node = selected[i]
    const nodeWidth = node.dimensions?.width || 220
    node.position = { ...node.position, x: anchorCenterX - (nodeWidth / 2) }
  }
  recordHistory()
}

function alignHorizontal() {
  const selected = selectedNodes.value
  if (selected.length < 2) return
  const anchorY = selected[0].position.y
  for (let i = 1; i < selected.length; i++) {
    selected[i].position = { ...selected[i].position, y: anchorY }
  }
  recordHistory()
}

function applyAutoLayout() {
  const layoutedNodes = autoLayout(nodes.value, edges.value, 'LR')
  nodes.value = layoutedNodes
  recordHistory()
  setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
  showUndoRedoToast('✨ 自動排版完成')
}

// Retry failed node
function handleRetryNode(nodeId: string) {
  const nodeExec = executionStore.getNodeExecution(nodeId)
  if (!nodeExec) return
  executionStore.updateNodeStatus(nodeId, 'pending', {
    error: undefined, completedAt: undefined, duration: undefined
  })
  showUndoRedoToast(`🔄 ${nodeId} 已重置，請重新執行工作流`)
}

// Connection & change handlers
function onConnect(connection: Connection) {
  edges.value = addEdge({ ...connection, animated: true }, edges.value)
  recordHistory()
}

function onEdgesChange(changes: any[]) {
  let hasChanges = false
  changes.forEach(change => {
    if (change.type === 'remove') {
      edges.value = edges.value.filter(e => e.id !== change.id)
      hasChanges = true
    }
  })
  if (hasChanges) recordHistory()
}

function onNodesChange(changes: any[]) {
  let hasRemoval = false
  changes.forEach(change => {
    if (change.type === 'remove') {
      hasRemoval = true
      edges.value = edges.value.filter(e => e.source !== change.id && e.target !== change.id)
    }
  })
  if (hasRemoval) recordHistory()
}

// Selection handlers
function onNodeClick({ node }: { node: Node; event: MouseEvent }) {
  selectedNodeId.value = node.id
  selectedEdgeId.value = null
  const def = getNodeDef(node.data.nodeType)
  const defaults: Record<string, any> = {}
  def?.inputs?.forEach(f => { defaults[f.key] = node.data.config?.[f.key] ?? f.default ?? '' })
  const data = { ...defaults, ...node.data.config }

  if (data.useCachedResult && !nodeCacheStore.hasCache(node.id)) {
    console.log(`[Cache] 節點 ${node.id} 沒有快取，自動取消「使用快取結果」`)
    data.useCachedResult = false
    setTimeout(() => { onPropsUpdateConfig(node.id, data) }, 0)
  }

  propsPanelRef.value?.setNodeData(data)
}

function onEdgeClick({ edge }: { edge: Edge }) {
  selectedEdgeId.value = edge.id
  selectedNodeId.value = null
}

function onPaneClick() {
  selectedNodeId.value = null
  selectedEdgeId.value = null
}

function onCustomConfigUpdate(newConfig: Record<string, any>) {
  const node = nodes.value.find(n => n.id === selectedNodeId.value)
  if (node) node.data = { ...node.data, config: { ...newConfig } }
  setTimeout(() => { store.saveWorkflow(wfId, nodes.value, edges.value) }, 100)
}

function onPropsUpdateConfig(nodeId: string, config: Record<string, any>) {
  updateNode(nodeId, (node) => ({ ...node, data: { ...node.data, config: { ...config } } }))
  setTimeout(() => { store.saveWorkflow(wfId, nodes.value, edges.value) }, 100)
}

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
    store.saveWorkflow(wfId, nodes.value, edges.value)

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

    const workflow: Workflow = {
      id: wfId,
      name: wf.value?.name || 'Untitled',
      nodes: nodes.value.map(n => ({
        id: n.id, type: n.data.nodeType, position: n.position,
        data: { ...(n.data.config || {}), disabled: n.data.disabled, useCachedResult: n.data.config?.useCachedResult }
      })),
      edges: edges.value.map(e => ({
        id: e.id, source: e.source, sourceHandle: e.sourceHandle || '',
        target: e.target, targetHandle: e.targetHandle || ''
      }))
    }

    await executeWorkflow(workflow, nodeCache)
  } catch (error) {
    console.error('Failed to execute workflow:', error)
    alert('執行失敗: ' + (error instanceof Error ? error.message : String(error)))
  }
}

function nodeColor(node: Node) {
  const nodeExec = executionStore.getNodeExecution(node.id)
  if (nodeExec) {
    switch (nodeExec.status) {
      case 'running': return '#3b82f6'
      case 'completed': return '#10b981'
      case 'failed': return '#ef4444'
      default: return '#6b7280'
    }
  }
  return CATEGORY_COLORS[node.data?.category] || '#6b7280'
}

// Lifecycle
onMounted(() => {
  setupKeyboard()
  setTimeout(() => initHistory(), 100)
})

onUnmounted(() => {
  teardownKeyboard()
})
</script>

<style scoped>
.editor-layout { display: flex; flex: 1; overflow: hidden; height: calc(100vh - 56px); }
.canvas-area { flex: 1; position: relative; }

.save-toast {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--bg-card); border: 1px solid rgba(16,185,129,0.4);
  color: #10B981; padding: 8px 20px; border-radius: 99px; font-size: 13px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}

.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(10px); }

/* Edge highlighting styles */
:deep(.vue-flow__edge.edge-highlighted path) {
  stroke: var(--accent-cyan) !important;
  stroke-width: 2.5px !important;
  filter: drop-shadow(0 0 4px var(--accent-cyan));
}

/* Animated data flow: flowing dashes from source to target during execution */
:deep(.vue-flow__edge.edge-executing path) {
  stroke: #4ade80 !important;
  stroke-width: 3px !important;
  filter: drop-shadow(0 0 6px #4ade80);
}

:deep(.vue-flow__edge.edge-flow-animated path) {
  stroke-dasharray: 8 5;
  stroke-dashoffset: 0;
  animation: flow-dash 0.6s linear infinite, pulse-edge 1.5s ease-in-out infinite;
}

@keyframes flow-dash {
  to { stroke-dashoffset: -26; }
}

@keyframes pulse-edge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

:deep(.vue-flow__edge.edge-dimmed path) {
  stroke: rgba(148, 163, 184, 0.25) !important;
  stroke-width: 1.5px !important;
}

:deep(.vue-flow__edge.edge-dimmed .vue-flow__edge-text) {
  opacity: 0.3;
}

/* Edge hover highlight: thicker and brighter */
:deep(.vue-flow__edge.edge-hovered path) {
  stroke: #67e8f9 !important;
  stroke-width: 3px !important;
  filter: drop-shadow(0 0 6px #22d3ee) drop-shadow(0 0 12px rgba(34,211,238,0.4));
  transition: stroke-width 0.15s ease, filter 0.15s ease;
}

/* Magnetic handle snap glow: applied to handles when connecting is active */
:deep(.is-connecting .vue-flow__handle.connectable) {
  box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.3), 0 0 12px rgba(34, 211, 238, 0.5);
  transition: box-shadow 0.15s ease;
}

:deep(.is-connecting .vue-flow__handle.connectable:hover),
:deep(.is-connecting .vue-flow__handle.valid) {
  box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.6), 0 0 20px rgba(34, 211, 238, 0.8);
  transform: scale(1.4);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

/* Styled connection line while dragging (dashed cyan — visual reinforcement of connectionLineStyle prop) */
:deep(.vue-flow__connection-path) {
  stroke: #22d3ee !important;
  stroke-width: 2px !important;
  stroke-dasharray: 6 4 !important;
  opacity: 0.9;
  filter: drop-shadow(0 0 4px rgba(34,211,238,0.6));
}

@keyframes toast-in {
  from { transform: translateY(-20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* ── Connection validation handle states ── */

/* Valid target: green glow pulse */
:deep(.vue-flow__handle.valid-target) {
  background: #10b981 !important;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.4), 0 0 10px rgba(16, 185, 129, 0.6) !important;
  animation: pulse-valid 1s ease-in-out infinite;
  transform: scale(1.4) !important;
  z-index: 10;
}

/* Invalid target: dim red */
:deep(.vue-flow__handle.invalid-target) {
  background: #ef4444 !important;
  opacity: 0.45;
  box-shadow: none !important;
  transform: scale(0.85) !important;
  cursor: not-allowed;
}

/* Source node being dragged from: dim its own handles slightly */
:deep(.vue-flow__handle.connecting-source) {
  opacity: 0.6;
  transform: scale(0.9) !important;
}

@keyframes pulse-valid {
  0%, 100% { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.4), 0 0 10px rgba(16, 185, 129, 0.6); }
  50%       { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.2), 0 0 18px rgba(16, 185, 129, 0.8); }
}

/* Connection line color tints green while connecting (complement to is-connecting .vue-flow__handle styles above) */
:deep(.is-connecting .vue-flow__connection-path) {
  stroke: #10b981 !important;
}
/* Snap-to-grid dot pattern */
.snap-grid-active :deep(.vue-flow__pane) {
  background-image: radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px);
  background-size: 20px 20px;
}

</style>
