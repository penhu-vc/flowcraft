<template>
  <div class="app-layout">
    <Sidebar />
    <div class="app-main">
      <router-view />
    </div>
    <AssetPanel />
  </div>
</template>

<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import AssetPanel from './components/AssetPanel.vue'
</script>
