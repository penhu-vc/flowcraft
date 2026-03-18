<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="scriptResultModal" class="modal-overlay" @click.self="$emit('close')">
        <div class="script-modal">
          <div class="script-modal-header">
            <div class="script-modal-title">
              <span class="script-modal-icon">🎬</span>
              腳本生成完成
            </div>
            <button class="btn btn-icon btn-sm" @click="$emit('close')">✕</button>
          </div>
          <div class="script-modal-body">
            <div v-if="scriptResultModal.keywords?.length" class="script-keywords">
              <span class="keywords-label">關鍵字：</span>
              <span v-for="(kw, i) in scriptResultModal.keywords" :key="i" class="keyword-tag">
                {{ kw }}
              </span>
            </div>
            <div class="script-content">
              <pre>{{ scriptResultModal.script }}</pre>
            </div>
          </div>
          <div class="script-modal-footer">
            <span class="script-timestamp">
              {{ new Date(scriptResultModal.timestamp).toLocaleString('zh-TW') }}
            </span>
            <div class="script-actions">
              <button class="btn btn-secondary btn-sm" @click="copyScript">
                📋 複製腳本
              </button>
              <button class="btn btn-primary btn-sm" @click="$emit('close')">
                確定
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  scriptResultModal: {
    script: string
    keywords?: string[]
    timestamp: number | string
  } | null
}>()

defineEmits<{
  'close': []
}>()

async function copyScript() {
  const script = props.scriptResultModal?.script
  if (!script) return
  try {
    await navigator.clipboard.writeText(script)
    const toast = document.createElement('div')
    toast.textContent = '✅ 腳本已複製'
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--accent-cyan);color:white;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;animation:toast-in 0.3s ease;'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2000)
  } catch (err) {
    console.error('Failed to copy script:', err)
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.script-modal {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.script-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-base);
  border-radius: 12px 12px 0 0;
}

.script-modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.script-modal-icon {
  font-size: 20px;
}

.script-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.script-keywords {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.keywords-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.keyword-tag {
  background: rgba(0, 255, 255, 0.15);
  color: var(--accent-cyan);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.script-content {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
}

.script-content pre {
  margin: 0;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.script-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-base);
  border-radius: 0 0 12px 12px;
}

.script-timestamp {
  font-size: 11px;
  color: var(--text-muted);
}

.script-actions {
  display: flex;
  gap: 10px;
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .script-modal,
.modal-leave-to .script-modal {
  transform: scale(0.95) translateY(20px);
}

@keyframes toast-in {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
