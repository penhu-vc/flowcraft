<template>
  <div class="palette">
    <!-- Workflow Settings -->
    <div class="workflow-settings">
      <div class="workflow-settings-header">⚙️ 工作流設定</div>
      <div class="workflow-settings-body">
        <div class="form-group-compact">
          <label class="form-label-sm">觸發器運行模式</label>
          <select class="form-select-sm" :value="triggerMode" @change="onTriggerModeChange($event)">
            <option value="fallback">運行失敗時更換</option>
            <option value="sequential">按順序觸發</option>
          </select>
          <div class="form-hint">
            <span v-if="triggerMode === 'fallback'">依序嘗試觸發器，第一個成功就停止</span>
            <span v-else>依序執行所有觸發器，每個都執行完整工作流</span>
          </div>
        </div>

        <div class="form-group-compact" v-if="sortedTriggers.length > 0">
          <label class="form-label-sm">觸發器順序（{{ sortedTriggers.length }} 個）</label>
          <div class="trigger-list">
            <div v-for="trigger in sortedTriggers" :key="trigger.id" class="trigger-item">
              <input
                type="number"
                class="trigger-order-input"
                :value="trigger.data.triggerOrder || 999"
                @input="$emit('update-trigger-order', trigger.id, $event)"
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
      <input class="form-input" :value="search" @input="$emit('update:search', ($event.target as HTMLInputElement).value)" placeholder="🔍 搜尋節點..." />
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
</template>

<script setup lang="ts">
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../nodes/registry'

interface TriggerNode {
  id: string
  type: string
  data: {
    triggerOrder?: number
    icon?: string
    label?: string
    [key: string]: any
  }
}

interface NodeDef {
  id: string
  name: string
  description: string
  category: string
  icon: string
}

defineProps<{
  triggerMode: 'fallback' | 'sequential'
  sortedTriggers: TriggerNode[]
  search: string
  filteredByCategory: Record<string, NodeDef[]>
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update-trigger-mode': [mode: 'fallback' | 'sequential']
  'update-trigger-order': [nodeId: string, event: Event]
  'drag-start': [nodeType: string]
}>()

function onTriggerModeChange(event: Event) {
  const select = event.target as HTMLSelectElement
  emit('update-trigger-mode', select.value as 'fallback' | 'sequential')
}

function onDragStart(e: DragEvent, nodeId: string) {
  emit('drag-start', nodeId)
  e.dataTransfer!.effectAllowed = 'move'
}
</script>

<style scoped>
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
</style>
