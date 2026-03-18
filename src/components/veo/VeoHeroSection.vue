<template>
  <section class="veo-hero card">
    <div class="veo-hero-copy">
      <span class="veo-kicker">Google Veo 直連工作台</span>
      <h1>同一頁完成生成、延長、參考圖控制、輪詢與下載。</h1>
      <p>
        支援 text-to-video、image-to-video、first/last frame、reference images、extend existing video。
      </p>
    </div>
    <div class="veo-hero-stats">
      <div class="veo-stat">
        <strong>{{ totalJobs }}</strong>
        <span>總任務</span>
      </div>
      <div class="veo-stat">
        <strong>{{ activeCount }}</strong>
        <span>進行中</span>
      </div>
      <div class="veo-stat">
        <strong>{{ completedCount }}</strong>
        <span>已完成</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  totalJobs: number
  activeCount: number
  completedCount: number
}>()
</script>

<style scoped>
.veo-hero {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(6, 182, 212, 0.22), transparent 32%),
    radial-gradient(circle at bottom right, rgba(124, 58, 237, 0.26), transparent 30%),
    linear-gradient(135deg, rgba(16, 24, 40, 0.96), rgba(13, 13, 20, 0.98));
}

.veo-hero-copy {
  padding: 28px;
}

.veo-kicker {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-cyan);
  margin-bottom: 12px;
}

.veo-hero-copy h1 {
  font-size: 30px;
  line-height: 1.08;
  max-width: 680px;
  margin-bottom: 12px;
}

.veo-hero-copy p {
  color: var(--text-secondary);
  max-width: 640px;
}

.veo-hero-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-left: 1px solid var(--border);
}

.veo-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 24px;
}

.veo-stat strong {
  font-size: 32px;
}

.veo-stat span {
  color: var(--text-secondary);
  font-size: 12px;
}

@media (max-width: 1100px) {
  .veo-hero {
    grid-template-columns: 1fr;
  }

  .veo-hero-stats {
    border-left: none;
    border-top: 1px solid var(--border);
  }
}

@media (max-width: 720px) {
  .veo-hero-copy {
    padding: 22px;
  }

  .veo-hero-copy h1 {
    font-size: 24px;
  }
}
</style>
