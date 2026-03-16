<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div class="sidebar-logo">
      <template v-if="!collapsed">
        <div class="logo-text">⚡ FlowCraft</div>
        <div class="logo-sub">節點工作流工具</div>
      </template>
      <div v-else class="logo-text logo-mini">⚡</div>
    </div>

    <nav class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: route.path.startsWith(item.path) }"
        :title="collapsed ? item.label : ''"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <template v-if="!collapsed">
          {{ item.label }}
          <span v-if="item.badge" class="badge badge-active" style="margin-left:auto;font-size:10px;">
            {{ item.badge }}
          </span>
        </template>
      </router-link>
    </nav>

    <div class="sidebar-footer">
      <div class="divider" style="margin:0" />
      <button class="collapse-btn" :title="collapsed ? '展開側邊欄' : '收合側邊欄'" @click="toggle">
        <span class="collapse-icon" :class="{ flipped: collapsed }">‹</span>
        <span v-if="!collapsed" class="collapse-label">收合</span>
      </button>
      <div v-if="!collapsed" style="padding:4px 16px 12px;">
        <div style="font-size:11px;color:var(--text-muted);">FlowCraft v1.0</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
          {{ store.activeWorkflows.length }} 個工作流執行中
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkflowStore } from '../stores/workflow'

const route = useRoute()
const store = useWorkflowStore()

const emit = defineEmits<{ (e: 'update:collapsed', val: boolean): void }>()

const collapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true')
// Emit initial state
emit('update:collapsed', collapsed.value)

function toggle() {
  collapsed.value = !collapsed.value
  localStorage.setItem('sidebar-collapsed', String(collapsed.value))
  emit('update:collapsed', collapsed.value)
}

const navItems = [
  { path: '/dashboard', icon: '🏠', label: '工作流' },
  { path: '/veo', icon: '🎬', label: 'AI Studio', badge: 'NEW' },
  { path: '/collections', icon: '📚', label: '資料庫' },
  { path: '/monitor',   icon: '📡', label: '監控面板' },
  { path: '/nodes',     icon: '🧩', label: '節點目錄' },
  { path: '/settings',  icon: '⚙️', label: '設定' },
]
</script>

<style scoped>
.sidebar { height: 100vh; transition: width 0.25s ease; }
.sidebar.collapsed { width: 60px; }
.sidebar-footer { margin-top: auto; }

.logo-mini {
  text-align: center;
  font-size: 22px;
}

.sidebar.collapsed .sidebar-logo {
  padding: 16px 8px;
  text-align: center;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 9px 0;
}

.sidebar.collapsed .nav-icon {
  margin: 0;
}

.collapse-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s;
}
.collapse-btn:hover { color: var(--text-primary); }

.sidebar.collapsed .collapse-btn {
  justify-content: center;
  padding: 8px 0;
}

.collapse-icon {
  display: inline-block;
  font-size: 16px;
  font-weight: 700;
  transition: transform 0.25s ease;
  line-height: 1;
}
.collapse-icon.flipped {
  transform: rotate(180deg);
}
</style>
