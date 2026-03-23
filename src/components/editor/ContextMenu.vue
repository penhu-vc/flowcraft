<template>
  <Teleport to="body">
    <Transition name="ctx-menu">
      <div
        v-if="visible"
        class="context-menu"
        :style="{ left: x + 'px', top: y + 'px' }"
        @mousedown.stop
        @contextmenu.prevent
      >
        <!-- Node context menu -->
        <template v-if="type === 'node'">
          <button class="ctx-item" @click="emit('copy')">
            <span class="ctx-icon">📋</span> 複製
          </button>
          <button class="ctx-item ctx-item--danger" @click="emit('delete-node')">
            <span class="ctx-icon">🗑️</span> 刪除
          </button>
          <div class="ctx-divider" />
          <button class="ctx-item" @click="emit('toggle-disable')">
            <span class="ctx-icon">{{ nodeDisabled ? '✅' : '🚫' }}</span>
            {{ nodeDisabled ? '啟用' : '停用' }}
          </button>
          <button class="ctx-item" @click="emit('clear-cache')" :class="{ 'ctx-item--muted': !nodeHasCache }">
            <span class="ctx-icon">🧹</span> 清除快取
            <span v-if="nodeHasCache" class="ctx-badge">有快取</span>
          </button>
          <div class="ctx-divider" />
          <button class="ctx-item ctx-item--accent" @click="emit('run-from-here')">
            <span class="ctx-icon">▶️</span> 設為起點執行
          </button>
        </template>

        <!-- Canvas context menu -->
        <template v-else-if="type === 'canvas'">
          <button class="ctx-item" @click="emit('paste')" :class="{ 'ctx-item--muted': !hasCopied }">
            <span class="ctx-icon">📌</span> 貼上節點
          </button>
          <button class="ctx-item" @click="emit('auto-layout')">
            <span class="ctx-icon">✨</span> 自動排版
          </button>
          <div class="ctx-divider" />
          <button class="ctx-item" @click="emit('select-all')">
            <span class="ctx-icon">⬜</span> 全選
          </button>
          <div class="ctx-divider" />
          <button class="ctx-item ctx-item--accent" @click="emit('add-node')">
            <span class="ctx-icon">➕</span> 新增節點...
          </button>
        </template>

        <!-- Edge context menu -->
        <template v-else-if="type === 'edge'">
          <button class="ctx-item ctx-item--danger" @click="emit('delete-edge')">
            <span class="ctx-icon">✂️</span> 刪除連線
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
  x: number
  y: number
  type: 'node' | 'canvas' | 'edge' | null
  nodeDisabled?: boolean
  nodeHasCache?: boolean
  hasCopied?: boolean
}>()

const emit = defineEmits<{
  copy: []
  paste: []
  'delete-node': []
  'delete-edge': []
  'toggle-disable': []
  'clear-cache': []
  'run-from-here': []
  'auto-layout': []
  'select-all': []
  'add-node': []
}>()
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  background: #1e1f36;
  border: 1px solid #2d2e4a;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
  user-select: none;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
  white-space: nowrap;
}

.ctx-item:hover {
  background: #2a2b45;
  color: #fff;
}

.ctx-item:active {
  background: #32334f;
}

.ctx-item--danger {
  color: rgba(239, 68, 68, 0.9);
}

.ctx-item--danger:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.ctx-item--accent {
  color: rgba(99, 179, 255, 0.9);
}

.ctx-item--accent:hover {
  background: rgba(99, 179, 255, 0.1);
  color: #63b3ff;
}

.ctx-item--muted {
  opacity: 0.45;
  cursor: default;
}

.ctx-item--muted:hover {
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
}

.ctx-icon {
  font-size: 13px;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.ctx-badge {
  margin-left: auto;
  font-size: 10px;
  padding: 1px 6px;
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border-radius: 10px;
  font-weight: 600;
}

.ctx-divider {
  height: 1px;
  background: #2d2e4a;
  margin: 3px 0;
}

/* Transition */
.ctx-menu-enter-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.ctx-menu-leave-active {
  transition: opacity 0.08s ease;
}
.ctx-menu-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
.ctx-menu-leave-to {
  opacity: 0;
}
</style>
