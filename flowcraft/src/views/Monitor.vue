<template>
  <div class="topbar">
    <span class="topbar-title">📡 監控面板</span>
    <div class="topbar-actions">
      <button class="btn btn-secondary btn-sm" @click="refresh">🔄 重新整理</button>
    </div>
  </div>

  <div class="page-content fade-in">
    <!-- Overview Stats -->
    <div class="grid-3" style="margin-bottom:24px;">
      <div class="card card-body" style="display:flex;align-items:center;gap:16px;">
        <div style="font-size:28px;width:44px;height:44px;border-radius:10px;background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;">✅</div>
        <div>
          <div style="font-size:22px;font-weight:700;color:#10B981;">{{ store.activeWorkflows.length }}</div>
          <div style="font-size:12px;color:var(--text-muted);">工作流運行中</div>
        </div>
      </div>
      <div class="card card-body" style="display:flex;align-items:center;gap:16px;">
        <div style="font-size:28px;width:44px;height:44px;border-radius:10px;background:rgba(124,58,237,0.15);display:flex;align-items:center;justify-content:center;">🔔</div>
        <div>
          <div style="font-size:22px;font-weight:700;">{{ activeTriggers.length }}</div>
          <div style="font-size:12px;color:var(--text-muted);">觸發器啟用中</div>
        </div>
      </div>
      <div class="card card-body" style="display:flex;align-items:center;gap:16px;">
        <div style="font-size:28px;width:44px;height:44px;border-radius:10px;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;">📋</div>
        <div>
          <div style="font-size:22px;font-weight:700;">{{ executionLogs.length }}</div>
          <div style="font-size:12px;color:var(--text-muted);">執行紀錄</div>
        </div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:24px;">
      <!-- Active Triggers -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🔴 觸發器狀態</span>
          <span style="font-size:11px;color:var(--text-muted);">每 30 秒自動更新</span>
        </div>
        <div class="card-body" style="padding:0;">
          <div v-if="activeTriggers.length === 0" class="empty-state" style="padding:30px;">
            <div class="empty-state-icon" style="font-size:24px;">🔕</div>
            <div class="empty-state-desc">沒有啟用的觸發器<br>請先在工作流中加入觸發節點並啟用</div>
          </div>
          <div v-for="trigger in activeTriggers" :key="trigger.id" class="trigger-row">
            <div class="trigger-icon" :style="{ background: trigger.color + '22', color: trigger.color }">
              {{ trigger.icon }}
            </div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:500;">{{ trigger.name }}</div>
              <div style="font-size:11px;color:var(--text-muted);">{{ trigger.wfName }}</div>
            </div>
            <div style="text-align:right;">
              <div class="badge badge-active pulsing">● 監控中</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">{{ trigger.lastCheck }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Execution Log -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">📋 執行紀錄</span>
          <button class="btn btn-secondary btn-sm" @click="executionLogs=[]">清除</button>
        </div>
        <div class="card-body" style="padding:0;max-height:320px;overflow-y:auto;">
          <div v-if="executionLogs.length===0" class="empty-state" style="padding:30px;">
            <div class="empty-state-icon" style="font-size:24px;">📭</div>
            <div class="empty-state-desc">尚無執行紀錄<br>工作流執行後會在這裡顯示</div>
          </div>
          <div v-for="log in executionLogs" :key="log.id" class="log-row">
            <span :class="['log-status', `log-${log.status}`]">
              {{ log.status === 'success' ? '✅' : log.status === 'error' ? '❌' : '⏳' }}
            </span>
            <div style="flex:1;">
              <div style="font-size:12px;font-weight:500;">{{ log.wfName }}</div>
              <div style="font-size:11px;color:var(--text-muted);">{{ log.message }}</div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;">{{ log.time }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- All Workflows Table -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">📊 所有工作流</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="wf-table">
          <thead>
            <tr>
              <th>名稱</th>
              <th>狀態</th>
              <th>節點數</th>
              <th>觸發器類型</th>
              <th>最後更新</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="wf in store.workflows" :key="wf.id">
              <td style="font-weight:500;">{{ wf.name }}</td>
              <td><span :class="['badge', wf.active ? 'badge-active' : 'badge-inactive']">{{ wf.active ? '執行中' : '停用' }}</span></td>
              <td style="color:var(--text-secondary);">{{ wf.nodes.length }}</td>
              <td>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                  <span v-for="t in getTriggers(wf)" :key="t" class="badge badge-trigger" style="font-size:10px;">{{ t }}</span>
                  <span v-if="getTriggers(wf).length===0" style="color:var(--text-muted);font-size:12px;">-</span>
                </div>
              </td>
              <td style="color:var(--text-secondary);font-size:12px;">{{ formatDate(wf.updatedAt) }}</td>
              <td>
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-secondary btn-sm" @click="router.push(`/editor/${wf.id}`)">編輯</button>
                  <button class="btn btn-secondary btn-sm" @click="store.toggleActive(wf.id)">
                    {{ wf.active ? '停用' : '啟用' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="store.workflows.length===0" class="empty-state" style="padding:40px;">
          <div class="empty-state-icon" style="font-size:24px;">📭</div>
          <div class="empty-state-desc">尚無工作流<br>前往<a href="/dashboard" style="color:var(--accent-cyan);">工作流頁面</a>新建</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkflowStore } from '../stores/workflow'
import { CATEGORY_COLORS, getNodeDef } from '../nodes/registry'

const router = useRouter()
const store = useWorkflowStore()

const activeTriggers = computed(() => {
  const result: any[] = []
  for (const wf of store.activeWorkflows) {
    for (const node of wf.nodes) {
      const def = getNodeDef(node.data?.nodeType)
      if (def?.category === 'trigger') {
        result.push({
          id: node.id,
          name: def.name,
          icon: def.icon,
          color: CATEGORY_COLORS.trigger,
          wfName: wf.name,
          lastCheck: '剛才',
        })
      }
    }
  }
  return result
})

const executionLogs = ref<any[]>([])

function refresh() {
  // Placeholder: in real app, fetch from backend
  executionLogs.value.unshift({
    id: Date.now(),
    wfName: store.activeWorkflows[0]?.name || '測試',
    status: 'success',
    message: '檢查完成 — 無新內容',
    time: new Date().toLocaleTimeString('zh-TW'),
  })
}

function getTriggers(wf: any) {
  return wf.nodes
    .map((n: any) => getNodeDef(n.data?.nodeType))
    .filter((d: any) => d?.category === 'trigger')
    .map((d: any) => d.name)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<style scoped>
.trigger-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  transition: var(--transition);
}
.trigger-row:hover { background: var(--bg-hover); }
.trigger-icon { width: 32px; height: 32px; border-radius: 8px; display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0; }

.log-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.log-status { font-size: 14px; }

.wf-table { width: 100%; border-collapse: collapse; }
.wf-table th {
  text-align: left; padding: 10px 16px;
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
}
.wf-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}
.wf-table tr:last-child td { border-bottom: none; }
.wf-table tr:hover td { background: var(--bg-hover); }
</style>
