<template>
  <div class="app-layout">
    <Sidebar />
    <div class="app-main">
      <router-view />
    </div>
    <AssetPanel v-if="showAssetPanel" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import AssetPanel from './components/AssetPanel.vue'

const route = useRoute()
const showAssetPanel = computed(() => route.path.startsWith('/veo') || route.path.startsWith('/nano'))
</script>
