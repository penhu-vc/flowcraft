<template>
  <aside class="sidebar">
    <div class="sidebar-logo">
      <div class="logo-text">⚡ FlowCraft</div>
      <div class="logo-sub">節點工作流工具</div>
    </div>

    <nav class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: route.path.startsWith(item.path) }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        {{ item.label }}
        <span v-if="item.badge" class="badge badge-active" style="margin-left:auto;font-size:10px;">
          {{ item.badge }}
        </span>
      </router-link>
    </nav>

    <div class="sidebar-footer">
      <div class="divider" style="margin:0" />
      <div style="padding:12px 16px;">
        <div style="font-size:11px;color:var(--text-muted);">FlowCraft v1.0</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
          {{ store.activeWorkflows.length }} 個工作流執行中
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useWorkflowStore } from '../stores/workflow'

const route = useRoute()
const store = useWorkflowStore()

const navItems = [
  { path: '/dashboard', icon: '🏠', label: '工作流' },
  { path: '/collections', icon: '📚', label: '資料庫' },
  { path: '/monitor',   icon: '📡', label: '監控面板' },
  { path: '/nodes',     icon: '🧩', label: '節點目錄' },
]
</script>

<style scoped>
.sidebar { height: 100vh; }
.sidebar-footer { margin-top: auto; }
</style>
