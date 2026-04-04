<template>
  <div class="app-layout" :class="{ 'mobile-sidebar-open': sidebarOpen }">
    <!-- Mobile top bar (only visible on mobile) -->
    <div class="mobile-topbar">
      <button class="mobile-hamburger" @click="toggleSidebar" aria-label="Toggle menu">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <span class="mobile-topbar-title">FlowCraft</span>
    </div>

    <!-- Overlay backdrop for mobile sidebar -->
    <div class="mobile-overlay" @click="closeSidebar"></div>

    <Sidebar class="app-sidebar" />
    <div class="app-main">
      <router-view />
    </div>
    <AssetPanel v-if="showAssetPanel" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import AssetPanel from './components/AssetPanel.vue'

const route = useRoute()
const showAssetPanel = computed(() => route.path.startsWith('/veo') || route.path.startsWith('/nano'))

const sidebarOpen = ref(false)

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}
</script>
