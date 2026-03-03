<template>
  <div class="custom-node" :class="{ selected }">

    <!-- ── INPUT handles (left side, one per visible input port) ── -->
    <Handle
      v-for="(port, i) in visibleInputPorts"
      :key="`in-${port.key}`"
      :id="`in-${port.key}`"
      type="target"
      :position="Position.Left"
      :style="inputHandleStyle(i)"
      class="port-handle port-handle-in"
    />

    <!-- ── Node card ── -->
    <div class="node-card" :style="{ borderColor: color }">
      <!-- Header -->
      <div class="node-header" :style="{ background: color + '18', borderBottom: '1px solid ' + color + '33' }">
        <span class="node-icon" :style="{ background: color + '2a', color }">{{ data.icon }}</span>
        <div class="node-header-text">
          <div class="node-name">{{ data.label }}</div>
          <div class="node-cat" :style="{ color }">{{ categoryLabel }}</div>
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
      :key="`out-${port.key}`"
      :id="`out-${port.key}`"
      type="source"
      :position="Position.Right"
      :style="outputHandleStyle(i)"
      class="port-handle port-handle-out"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { CATEGORY_COLORS, CATEGORY_LABELS, getNodeDef } from '../nodes/registry'
import { MONITOR_OPTIONS } from '../nodes/youtubeMonitorOptions'

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
}>()

const color = computed(() => CATEGORY_COLORS[props.data.category] || '#6b7280')
const def = computed(() => getNodeDef(props.data.nodeType))
const categoryLabel = computed(() => {
  const label = CATEGORY_LABELS[props.data.category] || props.data.category
  return label.replace(/^.+?\s/, '')
})

// Hidden ports set by user in config panel
const hiddenPorts = computed<string[]>(() => {
  try { return JSON.parse(props.data.config?.hiddenPorts || '[]') } catch { return [] }
})

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
  return (def.value?.inputs || []).filter(p => {
    // Skip ports that are purely config-type (select, password, number, textarea without 'port')
    if (['password', 'select'].includes(p.type)) return false
    // Check hidden
    if (hiddenPorts.value.includes(`in-${p.key}`)) return false
    // Only show input ports that are explicitly marked as port:true, OR type string/url/number/textarea
    return ['string', 'url', 'number', 'textarea', 'object'].includes(p.type)
  })
})

const visibleOutputPorts = computed(() =>
  (def.value?.outputs || []).filter(p => {
    if (hiddenPorts.value.includes(p.key)) return false
    if (relevantPortKeys.value === null) return true
    return relevantPortKeys.value.includes(p.key)
  })
)

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
}
.custom-node.selected .node-card {
  box-shadow: 0 0 0 2px v-bind(color), 0 4px 24px rgba(0,0,0,0.4);
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
  width: 11px; height: 11px;
  border: 2px solid var(--bg-base);
  border-radius: 50%;
}
:deep(.port-handle-out) { background: v-bind(color); }
:deep(.port-handle-in)  { background: var(--accent-cyan); }
</style>
