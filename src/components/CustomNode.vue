<template>
  <!-- ── COMMENT node: special lightweight annotation rendering ── -->
  <div
    v-if="data.nodeType === 'comment'"
    class="comment-node"
    :class="{ selected }"
    :style="commentStyle"
  >
    <div class="comment-color-bar" :style="{ background: commentAccentColor }"></div>
    <textarea
      class="comment-textarea"
      :value="data.config?.text || ''"
      placeholder="在此輸入備註..."
      @input="onCommentInput"
      @mousedown.stop
      @pointerdown.stop
    ></textarea>
    <div class="comment-color-picker">
      <button
        v-for="c in commentColors"
        :key="c.value"
        class="comment-color-btn"
        :class="{ active: (data.config?.bgColor || 'yellow') === c.value }"
        :style="{ background: c.bg }"
        :title="c.label"
        @click.stop="onCommentColorChange(c.value)"
        @mousedown.stop
        @pointerdown.stop
      ></button>
    </div>
  </div>

  <div v-else class="custom-node" :class="{ selected, disabled: data.disabled, orphan: isOrphan, executing: isExecuting, error: hasError, dimmed: isDimmed, slowest: isSlowestNode }" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">

    <!-- ── INPUT handles (left side, one per visible input port) ── -->
    <Handle
      v-for="(port, i) in visibleInputPorts"
      :key="`in-${port.key}-${i}`"
      :id="`in-${port.key}`"
      type="target"
      :position="Position.Left"
      :style="inputHandleStyle(i)"
      :class="['port-handle', 'port-handle-in', inputHandleClass(`in-${port.key}`)]"
    />

    <!-- Trigger Order Badge (outside node-card to avoid overflow:hidden) -->
    <div v-if="isTrigger && data.triggerOrder" class="trigger-order-badge">
      {{ data.triggerOrder }}
    </div>

    <!-- Retry Button (for failed nodes) -->
    <button v-if="hasError" class="retry-button" @click="retryNode" title="重試此節點">
      🔄
    </button>

    <!-- ── Node card ── -->
    <div class="node-card" :style="{ borderColor: color }">
      <!-- Header -->
      <div class="node-header" :style="{ background: color + '18', borderBottom: '1px solid ' + color + '33' }">
        <span class="node-icon" :style="{ background: color + '2a', color }">{{ data.icon }}</span>
        <div class="node-header-text">
          <div class="node-name">{{ data.label }}</div>
          <div class="node-cat" :style="{ color }">{{ categoryLabel }}</div>
        </div>
        <!-- Execution time badge -->
        <div v-if="nodeDuration !== undefined" class="duration-badge" :class="{ slowest: isSlowestNode }">
          <span class="duration-icon">⏱️</span>
          <span class="duration-text">{{ formatDuration(nodeDuration) }}</span>
        </div>
      </div>

      <!-- Port area: inputs (left) + outputs (right) in same rows -->
      <div class="node-ports-area" v-if="visibleInputPorts.length > 0 || visibleOutputPorts.length > 0">
        <div class="node-ports-left">
          <div
            v-for="port in visibleInputPorts"
            :key="port.key"
            class="node-port-row node-port-row-in"
          >
            <span class="port-dot-in" :style="{ background: 'var(--accent-cyan)' }"></span>
            <span class="port-label">{{ port.label }}</span>
            <span class="port-type">{{ port.type }}</span>
          </div>
        </div>
        <div class="node-ports-right">
          <div
            v-for="port in visibleOutputPorts"
            :key="port.key"
            class="node-port-row node-port-row-out"
          >
            <span class="port-label">{{ port.label }}</span>
            <span class="port-type">{{ port.type }}</span>
            <span class="port-dot" :style="{ background: color }"></span>
          </div>
        </div>
      </div>

      <!-- if only outputs (trigger nodes) -->
      <div class="node-ports-col" v-else-if="visibleOutputPorts.length > 0">
        <div
          v-for="port in visibleOutputPorts"
          :key="port.key"
          class="node-port-row"
        >
          <span class="port-label">{{ port.label }}</span>
          <span class="port-type">{{ port.type }}</span>
          <span class="port-dot" :style="{ background: color }"></span>
        </div>
      </div>
    </div>

    <!-- ── OUTPUT handles (right side, one per visible output port) ── -->
    <Handle
      v-for="(port, i) in visibleOutputPorts"
      :key="`out-${port.key}-${i}`"
      :id="`out-${port.key}`"
      type="source"
      :position="Position.Right"
      :style="outputHandleStyle(i)"
      :class="['port-handle', 'port-handle-out', outputHandleClass(`out-${port.key}`)]"
    />

    <!-- ── Cache Tooltip ── -->
    <Teleport to="body">
      <div
        v-if="tooltipVisible"
        class="node-cache-tooltip"
        :style="tooltipStyle"
      >
        <div class="cache-tooltip-header">
          <span class="cache-tooltip-icon">💾</span>
          <span class="cache-tooltip-title">快取結果</span>
          <span v-if="cacheAge" class="cache-tooltip-age">{{ cacheAge }}</span>
        </div>
        <div v-if="cachePreviewText" class="cache-tooltip-body">{{ cachePreviewText }}</div>
        <div v-else class="cache-tooltip-empty">尚未有快取結果</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { CATEGORY_COLORS, CATEGORY_LABELS, getNodeDef } from '../nodes/registry'
import { MONITOR_OPTIONS } from '../nodes/youtubeMonitorOptions'
import { useExecutionStore } from '../stores/execution'
import { useNodeCacheStore } from '../stores/nodeCache'

// Core ports always shown for YouTube Monitor regardless of monitorType
const YT_CORE_PORTS = ['channel_name', 'title', 'thumbnail', 'url']

const props = defineProps<{
  id: string
  data: {
    nodeType: string
    label: string
    icon: string
    category: string
    config: Record<string, any>
  }
  selected: boolean
  // Connection validation props passed from Editor
  connectingFromNodeId?: string | null
  connectingFromHandleId?: string | null
  existingEdges?: import('@vue-flow/core').Edge[]
}>()

const emit = defineEmits<{
  retryNode: [nodeId: string]
}>()

const executionStore = useExecutionStore()
const nodeCacheStore = useNodeCacheStore()

// ── Cache tooltip ──
const nodeEl = ref<HTMLElement | null>(null)
const tooltipVisible = ref(false)
const tooltipTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const tooltipStyle = ref<Record<string, string>>({})

const cachedEntry = computed(() => nodeCacheStore.getCacheResult(props.id))
const cacheAge = computed(() => nodeCacheStore.getCacheAge(props.id))

const cachePreviewText = computed(() => {
  const entry = cachedEntry.value
  if (!entry) return null
  try {
    const raw = typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result, null, 2)
    return raw.length > 200 ? raw.slice(0, 200) + '…' : raw
  } catch {
    return String(entry.result).slice(0, 200)
  }
})

function computeTooltipStyle() {
  const el = nodeEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const tooltipWidth = 300
  const gap = 8

  // Prefer above; if not enough space, show below
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom

  let top: number
  if (spaceAbove >= 120 || spaceAbove >= spaceBelow) {
    // Position above
    top = rect.top - gap
    tooltipStyle.value = {
      position: 'fixed',
      top: `${top}px`,
      transform: 'translateY(-100%)',
      left: `${Math.max(8, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 8))}px`,
      width: `${tooltipWidth}px`,
    }
  } else {
    // Position below
    top = rect.bottom + gap
    tooltipStyle.value = {
      position: 'fixed',
      top: `${top}px`,
      left: `${Math.max(8, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 8))}px`,
      width: `${tooltipWidth}px`,
    }
  }
}

function onMouseEnter(e: MouseEvent) {
  nodeEl.value = (e.currentTarget as HTMLElement)
  tooltipTimer.value = setTimeout(() => {
    computeTooltipStyle()
    tooltipVisible.value = true
  }, 500)
}

function onMouseLeave() {
  if (tooltipTimer.value) {
    clearTimeout(tooltipTimer.value)
    tooltipTimer.value = null
  }
  tooltipVisible.value = false
}

const nodeStatus = computed(() => executionStore.getNodeExecution(props.id)?.status)
const isExecuting = computed(() => nodeStatus.value === 'running')
const hasError = computed(() => nodeStatus.value === 'failed')

// Dimmed when execution is running but this node is not executing
const isDimmed = computed(() => {
  const runningNodeId = executionStore.runningNodeId
  return runningNodeId && runningNodeId !== props.id && !isExecuting.value
})

// Execution time
const nodeDuration = computed(() => executionStore.getNodeExecution(props.id)?.duration)
const isSlowestNode = computed(() => executionStore.isSlowestNode(props.id))

// Format duration in ms to readable format
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

// Retry failed node
function retryNode() {
  emit('retryNode', props.id)
}

const color = computed(() => CATEGORY_COLORS[props.data.category] || '#6b7280')
const def = computed(() => getNodeDef(props.data.nodeType))
const categoryLabel = computed(() => {
  const label = CATEGORY_LABELS[props.data.category] || props.data.category
  return label.replace(/^.+?\s/, '')
})
const isTrigger = computed(() => props.data.category === 'trigger')

// Hidden ports set by user in config panel
const hiddenPorts = computed<string[]>(() => {
  try { return JSON.parse(props.data.config?.hiddenPorts || '[]') } catch { return [] }
})

// Input port order set by user in config panel
const inputOrder = computed<string[]>(() => {
  try {
    return JSON.parse(props.data.config?.inputOrder || '[]')
  } catch { return [] }
})

// Output port order set by user in config panel
const outputOrder = computed<string[]>(() => {
  try {
    return JSON.parse(props.data.config?.outputOrder || '[]')
  } catch { return [] }
})

// Update node internals when port order changes
const { updateNodeInternals, edges, updateNode } = useVueFlow()

// 孤立節點：輸入和輸出都沒有連線，視同停用
const isOrphan = computed(() => {
  return !edges.value.some(e => e.source === props.id || e.target === props.id)
})
watch([inputOrder, outputOrder], () => {
  // Use setTimeout to ensure DOM has updated
  setTimeout(() => {
    updateNodeInternals([props.id])
  }, 0)
}, { deep: true })

// For YouTube Monitor: determine which ports are relevant for the current monitorType
const relevantPortKeys = computed<string[] | null>(() => {
  if (props.data.nodeType !== 'youtube-monitor') return null
  const monitorType = props.data.config?.monitorType || 'new_video'
  const opt = MONITOR_OPTIONS.find(o => o.value === monitorType)
  if (!opt) return null
  return [...new Set([...opt.outputs, ...YT_CORE_PORTS])]
})

// ── Visible input ports (skip config-only, show only those with visible=true by default) ──
// For trigger nodes: no input ports shown
const visibleInputPorts = computed(() => {
  if (def.value?.category === 'trigger') return []

  const filtered = (def.value?.inputs || []).filter(p => {
    // Skip ports that are purely config-type (select, password, number, textarea without 'port')
    if (['password', 'select'].includes(p.type)) return false
    // Check hidden
    if (hiddenPorts.value.includes(`in-${p.key}`)) return false
    // Only show input ports that are explicitly marked as port:true, OR type string/url/number/textarea
    return ['string', 'url', 'number', 'textarea', 'object'].includes(p.type)
  })

  // 如果有自訂順序，根據順序排序
  if (inputOrder.value.length > 0) {
    return [...filtered].sort((a, b) => {
      const indexA = inputOrder.value.indexOf(a.key)
      const indexB = inputOrder.value.indexOf(b.key)

      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      return 0
    })
  }

  return filtered
})

const visibleOutputPorts = computed(() => {
  const filtered = (def.value?.outputs || []).filter(p => {
    if (hiddenPorts.value.includes(p.key)) return false
    if (relevantPortKeys.value === null) return true
    return relevantPortKeys.value.includes(p.key)
  })

  // 如果有自訂順序，根據順序排序
  if (outputOrder.value.length > 0) {
    return [...filtered].sort((a, b) => {
      const indexA = outputOrder.value.indexOf(a.key)
      const indexB = outputOrder.value.indexOf(b.key)

      // 如果都在順序列表中，按順序排
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      // 如果只有 A 在列表中，A 排前面
      if (indexA !== -1) return -1
      // 如果只有 B 在列表中，B 排前面
      if (indexB !== -1) return 1
      // 都不在列表中，維持原順序
      return 0
    })
  }

  return filtered
})

// ── Connection validation handle classes ──
function inputHandleClass(handleId: string): string {
  const fromNodeId = props.connectingFromNodeId
  if (!fromNodeId) return ''
  // Self-connection: this IS the source node — all its input handles are invalid
  if (fromNodeId === props.id) return 'invalid-target'
  // Otherwise mark as valid target
  return 'valid-target'
}

function outputHandleClass(handleId: string): string {
  const fromNodeId = props.connectingFromNodeId
  const fromHandleId = props.connectingFromHandleId
  if (!fromNodeId) return ''
  if (fromNodeId === props.id && fromHandleId === handleId) return 'connecting-source'
  return ''
}

// Layout constants
const HEADER_H = 52
const ROW_H = 24

function inputHandleStyle(i: number) {
  return {
    position: 'absolute' as const,
    top: `${HEADER_H + i * ROW_H + ROW_H / 2}px`,
    left: '-6px',
    transform: 'none',
  }
}
function outputHandleStyle(i: number) {
  return {
    position: 'absolute' as const,
    top: `${HEADER_H + i * ROW_H + ROW_H / 2}px`,
    right: '-6px',
    transform: 'none',
  }
}

// ── Comment node ──
const commentColors = [
  { value: 'yellow', label: '黃色', bg: '#ffd54f', border: '#f9a825', text: '#5d4037' },
  { value: 'blue',   label: '藍色', bg: '#90caf9', border: '#1565c0', text: '#0d47a1' },
  { value: 'green',  label: '綠色', bg: '#a5d6a7', border: '#2e7d32', text: '#1b5e20' },
  { value: 'pink',   label: '粉色', bg: '#f48fb1', border: '#880e4f', text: '#880e4f' },
]

const commentBgColor = computed(() => {
  const map: Record<string, string> = {
    yellow: 'rgba(255, 213, 79, 0.25)',
    blue:   'rgba(144, 202, 249, 0.25)',
    green:  'rgba(165, 214, 167, 0.25)',
    pink:   'rgba(244, 143, 177, 0.25)',
  }
  return map[props.data.config?.bgColor || 'yellow'] || map.yellow
})

const commentAccentColor = computed(() => {
  const c = commentColors.find(x => x.value === (props.data.config?.bgColor || 'yellow'))
  return c?.bg || '#ffd54f'
})

const commentTextColor = computed(() => {
  const c = commentColors.find(x => x.value === (props.data.config?.bgColor || 'yellow'))
  return c?.text || '#5d4037'
})

const commentBorderColor = computed(() => {
  const c = commentColors.find(x => x.value === (props.data.config?.bgColor || 'yellow'))
  return c?.border || '#f9a825'
})

const commentStyle = computed(() => ({
  background: commentBgColor.value,
  border: `1.5px solid ${commentBorderColor.value}`,
  color: commentTextColor.value,
  minWidth: '200px',
  minHeight: '100px',
}))

function onCommentInput(e: Event) {
  const text = (e.target as HTMLTextAreaElement).value
  updateNode(props.id, node => ({
    ...node,
    data: { ...node.data, config: { ...node.data.config, text } }
  }))
}

function onCommentColorChange(color: string) {
  updateNode(props.id, node => ({
    ...node,
    data: { ...node.data, config: { ...node.data.config, bgColor: color } }
  }))
}
</script>

<style scoped>
.custom-node { position: relative; }

.node-card {
  min-width: 220px;
  max-width: 300px;
  background: var(--bg-card);
  border: 1.5px solid;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  position: relative;
}
.custom-node.selected .node-card {
  box-shadow: 0 0 0 2px v-bind(color), 0 4px 24px rgba(0,0,0,0.4);
}

/* Trigger Order Badge */
.trigger-order-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  background: v-bind(color);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  z-index: 10;
  border: 2px solid var(--bg-primary);
}

/* Retry Button */
.retry-button {
  position: absolute;
  top: -8px;
  left: -8px;
  width: 28px;
  height: 28px;
  background: #ff6b6b;
  color: white;
  border: 2px solid var(--bg-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(255, 0, 0, 0.4);
  z-index: 10;
  transition: all 0.2s ease;
}

.retry-button:hover {
  background: #ff5252;
  transform: scale(1.1) rotate(180deg);
  box-shadow: 0 4px 12px rgba(255, 0, 0, 0.6);
}

.retry-button:active {
  transform: scale(0.95) rotate(180deg);
}

/* Execution Duration Badge */
.duration-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: rgba(100, 100, 100, 0.3);
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  margin-left: auto;
  transition: all 0.3s ease;
}

.duration-badge .duration-icon {
  font-size: 9px;
}

.duration-badge.slowest {
  background: rgba(255, 165, 0, 0.3);
  color: orange;
  animation: pulse-duration 2s ease-in-out infinite;
}

@keyframes pulse-duration {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 165, 0, 0.4);
  }
  50% {
    box-shadow: 0 0 0 3px rgba(255, 165, 0, 0.1);
  }
}

/* Slowest node border highlight */
.custom-node.slowest .node-card {
  border-color: orange !important;
}

/* Disabled state - grayscale */
.custom-node.disabled .node-card {
  opacity: 0.5;
  filter: grayscale(1);
}

/* Orphan state - 孤立節點（無任何連線），半透明但不灰階 */
.custom-node.orphan .node-card {
  opacity: 0.5;
}
.custom-node.disabled .node-header::before {
  content: '🚫';
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 16px;
  filter: grayscale(0);
  z-index: 10;
}

/* Executing state - green glow */
.custom-node.executing .node-card {
  box-shadow: 0 0 0 3px lime, 0 4px 12px rgba(0, 255, 0, 0.3);
  animation: pulse-node 1.5s ease-in-out infinite;
}

@keyframes pulse-node {
  0%, 100% {
    box-shadow: 0 0 0 3px lime, 0 4px 12px rgba(0, 255, 0, 0.3);
  }
  50% {
    box-shadow: 0 0 0 3px lime, 0 4px 20px rgba(0, 255, 0, 0.5);
  }
}

/* Error state - red overlay */
.custom-node.error .node-card {
  position: relative;
}
.custom-node.error .node-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 0, 0, 0.2);
  border-radius: inherit;
  pointer-events: none;
  z-index: 5;
}

/* Dimmed state - reduced opacity when other nodes are executing */
.custom-node.dimmed {
  opacity: 0.3;
  transition: opacity 0.3s ease;
}

.node-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; height: 52px;
}
.node-icon {
  width: 28px; height: 28px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.node-header-text { flex: 1; min-width: 0; }
.node-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.node-cat  { font-size: 10px; font-weight: 500; }

/* Two-column port area */
.node-ports-area {
  display: flex;
}
.node-ports-left  { flex: 1; display: flex; flex-direction: column; }
.node-ports-right { flex: 1; display: flex; flex-direction: column; }

/* General port row */
.node-ports-col { display: flex; flex-direction: column; }
.node-port-row {
  display: flex; align-items: center; gap: 5px;
  height: 24px;
  border-top: 1px solid rgba(255,255,255,0.04);
}

/* Input row (left-aligned) */
.node-port-row-in  { padding: 0 6px 0 10px; }
/* Output row (right-aligned) */
.node-port-row-out { padding: 0 10px 0 6px; flex-direction: row-reverse; }
/* Generic row (output only) */
.node-port-row:not(.node-port-row-in):not(.node-port-row-out) { padding: 0 10px 0 12px; }

.port-label { font-size: 10px; color: var(--text-secondary); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.port-type  { font-size: 9px; color: var(--text-muted); }
.port-dot   { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-left: 4px; }
.port-dot-in { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-right: 4px; }

/* Handles */
:deep(.port-handle) {
  width: 14px; height: 14px;
  border: 2px solid var(--bg-base);
  border-radius: 50%;
  cursor: crosshair;
  z-index: 20;
  pointer-events: all !important;
}
:deep(.port-handle-out) { background: v-bind(color); }
:deep(.port-handle-in)  { background: var(--accent-cyan); }

/* ── Connection validation handle states ── */

/* Valid target: green glow + grow */
:deep(.port-handle.valid-target) {
  background: #10b981 !important;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.35), 0 0 10px rgba(16, 185, 129, 0.55) !important;
  animation: pulse-valid-handle 1s ease-in-out infinite;
  transform: scale(1.45) !important;
  z-index: 30;
}

/* Invalid target: dim and red tint */
:deep(.port-handle.invalid-target) {
  background: #ef4444 !important;
  opacity: 0.4 !important;
  box-shadow: none !important;
  transform: scale(0.8) !important;
  cursor: not-allowed;
}

/* Source handle being dragged from */
:deep(.port-handle.connecting-source) {
  opacity: 0.55;
  transform: scale(0.88) !important;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.15) !important;
}

@keyframes pulse-valid-handle {
  0%, 100% { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.35), 0 0 10px rgba(16, 185, 129, 0.55); }
  50%       { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.15), 0 0 18px rgba(16, 185, 129, 0.75); }
}

/* ── Comment Node ── */
.comment-node {
  position: relative;
  border-radius: 8px;
  padding: 8px 10px 32px 10px;
  display: flex;
  flex-direction: column;
  gap: 0;
  box-shadow: 0 3px 12px rgba(0,0,0,0.2);
  cursor: default;
  min-width: 200px;
  min-height: 100px;
}
.comment-node.selected {
  box-shadow: 0 0 0 2px v-bind(commentAccentColor), 0 3px 12px rgba(0,0,0,0.3);
}
.comment-color-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 8px 8px 0 0;
}
.comment-textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  font-size: 13px;
  line-height: 1.5;
  color: inherit;
  font-family: inherit;
  width: 100%;
  min-height: 70px;
}
.comment-textarea::placeholder {
  opacity: 0.5;
}
.comment-color-picker {
  position: absolute;
  bottom: 6px;
  right: 8px;
  display: flex;
  gap: 4px;
}
.comment-color-btn {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid rgba(0,0,0,0.2);
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s ease;
}
.comment-color-btn:hover {
  transform: scale(1.25);
}
.comment-color-btn.active {
  border: 2px solid rgba(0,0,0,0.5);
  transform: scale(1.2);
}
</style>

<style>
/* Cache tooltip — non-scoped so Teleport to body works */
.node-cache-tooltip {
  z-index: 9999;
  max-width: 300px;
  background: #1a1b2eee;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 10px 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  pointer-events: none;
  font-family: inherit;
  animation: tooltip-fade-in 0.15s ease;
}

@keyframes tooltip-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cache-tooltip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.cache-tooltip-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.cache-tooltip-title {
  font-size: 11px;
  font-weight: 600;
  color: #a0a8d0;
  flex: 1;
  letter-spacing: 0.03em;
}

.cache-tooltip-age {
  font-size: 10px;
  color: #6b7aaa;
  white-space: nowrap;
}

.cache-tooltip-body {
  font-size: 11px;
  line-height: 1.5;
  color: #cdd5f0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow: hidden;
}

.cache-tooltip-empty {
  font-size: 11px;
  color: #6b7aaa;
  font-style: italic;
}
</style>
