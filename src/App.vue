<template>
  <div class="app-layout">
    <Sidebar />
    <div class="app-main">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
</script>
