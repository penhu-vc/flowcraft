<template>
  <div class="topbar">
    <span class="topbar-title">🧩 節點目錄</span>
    <div class="topbar-actions">
      <span style="font-size:12px;color:var(--text-muted);">{{ NODE_REGISTRY.length }} 個節點</span>
    </div>
  </div>

  <div class="page-content fade-in">
    <!-- Filter tabs -->
    <div class="cat-tabs">
      <button
        v-for="(label, cat) in allCats"
        :key="cat"
        :class="['cat-tab', { active: selectedCat === cat }]"
        @click="selectedCat = cat"
      >
        {{ label }}
        <span class="tab-count">{{ countByCategory(cat) }}</span>
      </button>
    </div>

    <!-- Search -->
    <div style="margin-bottom:20px;">
      <input class="form-input" v-model="search" placeholder="🔍 搜尋節點名稱或描述..." style="max-width:400px;" />
    </div>

    <!-- Node cards -->
    <div class="grid-auto">
      <div
        v-for="node in filtered"
        :key="node.id"
        class="card node-card"
      >
        <div class="card-header" :style="{ borderBottom: '1px solid ' + CATEGORY_COLORS[node.category] + '33' }">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="node-card-icon" :style="{ background: CATEGORY_COLORS[node.category] + '22', color: CATEGORY_COLORS[node.category] }">
              {{ node.icon }}
            </span>
            <div>
              <div class="card-title">{{ node.name }}</div>
              <span :class="['badge', `badge-${node.category}`]" style="margin-top:2px;">
                {{ CATEGORY_LABELS[node.category].replace(/^.+?\s/, '') }}
              </span>
            </div>
          </div>
          <span style="font-size:10px;color:var(--text-muted);font-family:monospace;">v{{ node.version }}</span>
        </div>
        <div class="card-body">
          <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">{{ node.description }}</p>

          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600;">INPUT 參數</div>
          <div class="input-list">
            <div v-for="f in node.inputs" :key="f.key" class="input-item">
              <span :class="['input-badge', f.required ? 'required' : 'optional']">
                {{ f.required ? '必填' : '選填' }}
              </span>
              <span style="font-size:12px;color:var(--text-primary);">{{ f.label }}</span>
              <span style="font-size:11px;color:var(--text-muted);margin-left:auto;">{{ f.type }}</span>
            </div>
          </div>

          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600;margin-top:10px;">OUTPUT 輸出</div>
          <div class="output-list">
            <div v-for="o in node.outputs" :key="o.key" class="output-item">
              <span style="color:var(--accent-cyan);font-size:11px;">◆</span>
              <span style="font-size:12px;color:var(--text-secondary);">{{ o.label }}</span>
              <span style="font-size:11px;color:var(--text-muted);margin-left:auto;">{{ o.type }}</span>
            </div>
          </div>

          <div v-if="node.triggerType" class="divider" />
          <div v-if="node.triggerType" style="font-size:11px;color:var(--text-muted);">
            触發方式：<span style="color:var(--accent-cyan);">{{ node.triggerType }}</span>
            <span v-if="node.defaultCron"> · <code style="font-size:10px;background:var(--bg-hover);padding:1px 5px;border-radius:4px;">{{ node.defaultCron }}</code></span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="filtered.length===0" class="empty-state">
      <div class="empty-state-icon">🔍</div>
      <div class="empty-state-title">找不到節點</div>
      <div class="empty-state-desc">試試其他關鍵字</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NODE_REGISTRY, CATEGORY_COLORS, CATEGORY_LABELS } from '../nodes/registry'

const search = ref('')
const selectedCat = ref('all')

const allCats = {
  all: '全部',
  ...CATEGORY_LABELS,
}

function countByCategory(cat: string) {
  if (cat === 'all') return NODE_REGISTRY.length
  return NODE_REGISTRY.filter(n => n.category === cat).length
}

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return NODE_REGISTRY.filter(n => {
    const matchCat = selectedCat.value === 'all' || n.category === selectedCat.value
    const matchQ = !q || n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q)
    return matchCat && matchQ
  })
})
</script>

<style scoped>
.cat-tabs { display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px; }
.cat-tab {
  display:flex;align-items:center;gap:6px;
  padding:6px 14px;border-radius:99px;font-size:12px;font-weight:500;
  background:var(--bg-card);border:1px solid var(--border);
  color:var(--text-secondary);cursor:pointer;transition:var(--transition);
}
.cat-tab:hover { border-color:var(--border-hover);color:var(--text-primary); }
.cat-tab.active { background:rgba(124,58,237,0.15);border-color:var(--accent-purple);color:var(--text-primary); }
.tab-count { background:var(--bg-hover);padding:1px 6px;border-radius:99px;font-size:10px; }

.node-card { transition:var(--transition); }
.node-card:hover { transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.2); }
.node-card-icon { width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0; }

.input-list,.output-list { display:flex;flex-direction:column;gap:3px; }
.input-item,.output-item { display:flex;align-items:center;gap:6px;padding:3px 0; }
.input-badge { font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;flex-shrink:0; }
.input-badge.required { background:rgba(239,68,68,0.15);color:var(--red); }
.input-badge.optional { background:var(--bg-hover);color:var(--text-muted); }
</style>
