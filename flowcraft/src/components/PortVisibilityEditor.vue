<template>
  <div class="pve">
    <!-- Input ports -->
    <template v-if="inputs && inputs.length > 0">
      <div class="pve-label">
        🔵 輸入埠顯示設定
        <span class="pve-hint">拖曳排序 / 控制顯示</span>
      </div>
      <div class="pve-list">
        <div
          v-for="(port, index) in sortedInputs"
          :key="`in-${port.key}`"
          class="pve-row"
          draggable="true"
          @dragstart="onInputDragStart(index)"
          @dragover.prevent="onInputDragOver(index)"
          @drop="onInputDrop(index)"
          @dragend="onInputDragEnd"
          :class="{ 'dragging': draggingInputIndex === index }"
        >
          <span class="drag-handle" style="color:var(--accent-cyan)">⋮⋮</span>
          <span style="color:var(--accent-cyan)">◆</span>
          <div class="pve-info">
            <div class="pve-name">{{ port.label }}</div>
            <div class="pve-type">{{ port.type }}</div>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              :checked="!isHidden(`in-${port.key}`)"
              @change="togglePort(`in-${port.key}`)"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </template>

    <!-- Output ports -->
    <template v-if="outputs && outputs.length > 0">
      <div class="pve-label" :style="inputs && inputs.length ? 'margin-top:10px' : ''">
        🔌 輸出埠顯示設定
        <span class="pve-hint">拖曳排序 / 控制顯示</span>
      </div>
      <div class="pve-list">
        <div
          v-for="(port, index) in sortedOutputs"
          :key="port.key"
          class="pve-row"
          draggable="true"
          @dragstart="onDragStart(index)"
          @dragover.prevent="onDragOver(index)"
          @drop="onDrop(index)"
          @dragend="onDragEnd"
          :class="{ 'dragging': draggingIndex === index }"
        >
          <span class="drag-handle" :style="{ color: portColor || 'var(--accent-cyan)' }">⋮⋮</span>
          <span :style="{ color: portColor || 'var(--accent-cyan)' }">◆</span>
          <div class="pve-info">
            <div class="pve-name">{{ port.label }}</div>
            <div class="pve-type">{{ port.type }}</div>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              :checked="!isHidden(port.key)"
              @change="togglePort(port.key)"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  inputs?: { key: string; label: string; type: string }[]
  outputs?: { key: string; label: string; type: string }[]
  hiddenPorts?: string[]
  portColor?: string
  inputOrder?: string[]   // 新增：輸入埠順序
  outputOrder?: string[]  // 新增：輸出埠順序
}>()

const emit = defineEmits<{
  (e: 'update', hiddenPorts: string[]): void
  (e: 'update-input-order', inputOrder: string[]): void   // 新增：輸入埠順序更新事件
  (e: 'update-order', outputOrder: string[]): void  // 新增：輸出埠順序更新事件
}>()

const hidden = ref<string[]>(props.hiddenPorts ?? [])
watch(() => props.hiddenPorts, (v) => { if (v) hidden.value = [...v] })

// 輸入埠順序
const inputOrder = ref<string[]>([])
watch(() => [props.inputOrder, props.inputs], ([order, inputs]) => {
  if (order && order.length > 0) {
    inputOrder.value = [...order]
  } else if (inputs && inputs.length > 0) {
    // 初始化：使用原始順序
    inputOrder.value = inputs.map(p => p.key)
  }
}, { immediate: true, deep: true })

// 輸出埠順序
const outputOrder = ref<string[]>([])
watch(() => [props.outputOrder, props.outputs], ([order, outputs]) => {
  if (order && order.length > 0) {
    outputOrder.value = [...order]
  } else if (outputs && outputs.length > 0) {
    // 初始化：使用原始順序
    outputOrder.value = outputs.map(p => p.key)
  }
}, { immediate: true, deep: true })

// 根據順序排序輸入埠
const sortedInputs = computed(() => {
  if (!props.inputs) return []

  // 如果沒有自訂順序，返回原始順序
  if (inputOrder.value.length === 0) {
    return props.inputs
  }

  // 根據 inputOrder 排序
  const sorted = [...props.inputs].sort((a, b) => {
    const indexA = inputOrder.value.indexOf(a.key)
    const indexB = inputOrder.value.indexOf(b.key)

    if (indexA !== -1 && indexB !== -1) return indexA - indexB
    if (indexA !== -1) return -1
    if (indexB !== -1) return 1
    return 0
  })

  return sorted
})

// 根據順序排序輸出埠
const sortedOutputs = computed(() => {
  if (!props.outputs) return []

  // 如果沒有自訂順序，返回原始順序
  if (outputOrder.value.length === 0) {
    return props.outputs
  }

  // 根據 outputOrder 排序
  const sorted = [...props.outputs].sort((a, b) => {
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

  return sorted
})

// 拖曳相關 - 輸入埠
const draggingInputIndex = ref<number | null>(null)

function onInputDragStart(index: number) {
  draggingInputIndex.value = index
}

function onInputDragOver(index: number) {
  // Visual feedback
}

function onInputDrop(dropIndex: number) {
  if (draggingInputIndex.value === null || draggingInputIndex.value === dropIndex) {
    draggingInputIndex.value = null
    return
  }

  const newOrder = [...inputOrder.value]
  const [movedItem] = newOrder.splice(draggingInputIndex.value, 1)
  newOrder.splice(dropIndex, 0, movedItem)

  inputOrder.value = newOrder
  emit('update-input-order', newOrder)

  draggingInputIndex.value = null
}

function onInputDragEnd() {
  draggingInputIndex.value = null
}

// 拖曳相關 - 輸出埠
const draggingIndex = ref<number | null>(null)

function onDragStart(index: number) {
  draggingIndex.value = index
}

function onDragOver(index: number) {
  // Visual feedback
}

function onDrop(dropIndex: number) {
  if (draggingIndex.value === null || draggingIndex.value === dropIndex) {
    draggingIndex.value = null
    return
  }

  const newOrder = [...outputOrder.value]
  const [movedItem] = newOrder.splice(draggingIndex.value, 1)
  newOrder.splice(dropIndex, 0, movedItem)

  outputOrder.value = newOrder
  emit('update-order', newOrder)

  draggingIndex.value = null
}

function onDragEnd() {
  draggingIndex.value = null
}

function isHidden(key: string) { return hidden.value.includes(key) }
function togglePort(key: string) {
  const i = hidden.value.indexOf(key)
  if (i === -1) hidden.value.push(key)
  else hidden.value.splice(i, 1)
  emit('update', [...hidden.value])
}
</script>

<style scoped>
.pve { display: flex; flex-direction: column; gap: 4px; }
.pve-label {
  font-size: 11px; font-weight: 600; color: var(--text-secondary);
  display: flex; align-items: center; gap: 6px; margin-bottom: 3px;
}
.pve-hint { font-size: 10px; color: var(--text-muted); font-weight: 400; }
.pve-list { display: flex; flex-direction: column; gap: 3px; }
.pve-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px;
  background: var(--bg-base); border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: grab;
  transition: all 0.2s ease;
}
.pve-row:active {
  cursor: grabbing;
}
.pve-row.dragging {
  opacity: 0.5;
  border-color: var(--accent-cyan);
}
.pve-row:hover {
  border-color: var(--border-hover);
}
.drag-handle {
  font-size: 10px;
  opacity: 0.4;
  cursor: grab;
}
.pve-row:hover .drag-handle {
  opacity: 0.8;
}
.pve-info { flex: 1; min-width: 0; }
.pve-name { font-size: 11px; color: var(--text-secondary); }
.pve-type { font-size: 9px; color: var(--text-muted); }
</style>
