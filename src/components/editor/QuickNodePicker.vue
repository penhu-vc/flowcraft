<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="quick-node-picker"
      :style="{ left: `${x}px`, top: `${y}px` }"
      ref="pickerRef"
      @keydown.esc.stop="close"
      @keydown.enter.prevent="confirmSelection"
      @keydown.arrow-down.prevent="moveDown"
      @keydown.arrow-up.prevent="moveUp"
    >
      <input
        ref="inputRef"
        class="picker-search"
        v-model="query"
        placeholder="搜尋節點..."
        @blur="onBlur"
      />
      <div class="picker-list" ref="listRef">
        <template v-for="(nodes, cat) in filteredByCategory" :key="cat">
          <div v-if="nodes.length > 0" class="picker-category-label">
            <span
              class="cat-dot"
              :style="{ background: CATEGORY_COLORS[cat] }"
            ></span>
            {{ CATEGORY_LABELS[cat] }}
          </div>
          <div
            v-for="node in nodes"
            :key="node.id"
            class="picker-item"
            :class="{ 'picker-item--active': flatList.indexOf(node) === activeIndex }"
            @mousedown.prevent="selectNode(node)"
            @mousemove="activeIndex = flatList.indexOf(node)"
          >
            <span class="picker-icon">{{ node.icon }}</span>
            <span class="picker-name">{{ node.name }}</span>
            <span class="picker-desc">{{ node.description }}</span>
          </div>
        </template>
        <div v-if="flatList.length === 0" class="picker-empty">無符合的節點</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { NODE_REGISTRY, CATEGORY_COLORS, CATEGORY_LABELS } from '../../nodes/registry'
import type { NodeDef } from '../../nodes/registry'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
}>()

const emit = defineEmits<{
  (e: 'select', node: NodeDef): void
  (e: 'close'): void
}>()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const pickerRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const CATEGORIES = ['trigger', 'action', 'ai', 'data', 'media', 'logic']

const filteredByCategory = computed(() => {
  const q = query.value.toLowerCase()
  const result: Record<string, NodeDef[]> = {}
  for (const cat of CATEGORIES) {
    result[cat] = NODE_REGISTRY.filter(
      (n) =>
        n.category === cat &&
        (!q ||
          n.name.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q))
    )
  }
  return result
})

const flatList = computed<NodeDef[]>(() => {
  const list: NodeDef[] = []
  for (const cat of CATEGORIES) {
    list.push(...(filteredByCategory.value[cat] || []))
  }
  return list
})

// Reset and focus when picker opens
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      query.value = ''
      activeIndex.value = 0
      await nextTick()
      inputRef.value?.focus()
    }
  }
)

// Keep activeIndex in bounds when list changes
watch(flatList, () => {
  if (activeIndex.value >= flatList.value.length) {
    activeIndex.value = Math.max(0, flatList.value.length - 1)
  }
})

// Scroll active item into view
watch(activeIndex, async () => {
  await nextTick()
  const list = listRef.value
  if (!list) return
  const active = list.querySelector('.picker-item--active') as HTMLElement | null
  if (active) {
    active.scrollIntoView({ block: 'nearest' })
  }
})

function close() {
  emit('close')
}

function selectNode(node: NodeDef) {
  emit('select', node)
}

function confirmSelection() {
  const node = flatList.value[activeIndex.value]
  if (node) selectNode(node)
}

function moveDown() {
  if (flatList.value.length === 0) return
  activeIndex.value = (activeIndex.value + 1) % flatList.value.length
}

function moveUp() {
  if (flatList.value.length === 0) return
  activeIndex.value =
    (activeIndex.value - 1 + flatList.value.length) % flatList.value.length
}

// Close when focus leaves picker entirely
function onBlur(e: FocusEvent) {
  const related = e.relatedTarget as HTMLElement | null
  if (related && pickerRef.value?.contains(related)) return
  // Small delay so mousedown on list items fires first
  setTimeout(() => {
    if (!pickerRef.value?.contains(document.activeElement)) {
      close()
    }
  }, 120)
}
</script>

<style scoped>
.quick-node-picker {
  position: fixed;
  z-index: 9999;
  width: 320px;
  background: #1e1f36;
  border: 1px solid #2d2e4a;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.picker-search {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-bottom: 1px solid #2d2e4a;
  color: #e2e8f0;
  font-size: 13px;
  outline: none;
}

.picker-search::placeholder {
  color: #64748b;
}

.picker-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
}

.picker-list::-webkit-scrollbar {
  width: 4px;
}

.picker-list::-webkit-scrollbar-track {
  background: transparent;
}

.picker-list::-webkit-scrollbar-thumb {
  background: #2d2e4a;
  border-radius: 4px;
}

.picker-category-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 3px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.cat-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.1s;
  border-radius: 0;
}

.picker-item:hover,
.picker-item--active {
  background: rgba(139, 92, 246, 0.18);
}

.picker-icon {
  font-size: 15px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.picker-name {
  font-size: 13px;
  color: #e2e8f0;
  flex-shrink: 0;
  min-width: 90px;
}

.picker-desc {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-empty {
  padding: 20px 14px;
  font-size: 13px;
  color: #64748b;
  text-align: center;
}
</style>
