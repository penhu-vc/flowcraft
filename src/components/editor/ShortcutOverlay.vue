<template>
  <Teleport to="body">
    <Transition name="shortcut-overlay">
      <div v-if="show" class="shortcut-backdrop" @click.self="$emit('close')">
        <div class="shortcut-modal" role="dialog" aria-label="鍵盤快捷鍵">
          <!-- Header -->
          <div class="shortcut-header">
            <div class="shortcut-header-title">
              <span class="shortcut-icon">⌨</span>
              <span>鍵盤快捷鍵</span>
            </div>
            <button class="shortcut-close" @click="$emit('close')" title="關閉">✕</button>
          </div>

          <!-- Body -->
          <div class="shortcut-body">
            <!-- 編輯 -->
            <div class="shortcut-group">
              <div class="shortcut-group-title">編輯</div>
              <div class="shortcut-grid">
                <div class="shortcut-row">
                  <span class="shortcut-desc">復原</span>
                  <div class="shortcut-keys">
                    <kbd>⌘</kbd><kbd>Z</kbd>
                  </div>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-desc">重做</span>
                  <div class="shortcut-keys">
                    <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Z</kbd>
                  </div>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-desc">複製節點</span>
                  <div class="shortcut-keys">
                    <kbd>⌘</kbd><kbd>C</kbd>
                  </div>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-desc">貼上節點</span>
                  <div class="shortcut-keys">
                    <kbd>⌘</kbd><kbd>V</kbd>
                  </div>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-desc">停用 / 啟用節點</span>
                  <div class="shortcut-keys">
                    <kbd>D</kbd>
                  </div>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-desc">刪除節點 / 邊</span>
                  <div class="shortcut-keys">
                    <kbd>Delete</kbd>
                  </div>
                </div>
              </div>
            </div>

            <!-- 導覽 -->
            <div class="shortcut-group">
              <div class="shortcut-group-title">導覽</div>
              <div class="shortcut-grid">
                <div class="shortcut-row">
                  <span class="shortcut-desc">搜尋節點</span>
                  <div class="shortcut-keys">
                    <kbd>/</kbd>
                  </div>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-desc">搜尋結果 — 上 / 下</span>
                  <div class="shortcut-keys">
                    <kbd>↑</kbd><kbd>↓</kbd>
                  </div>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-desc">跳至節點</span>
                  <div class="shortcut-keys">
                    <kbd>Enter</kbd>
                  </div>
                </div>
                <div class="shortcut-row">
                  <span class="shortcut-desc">關閉面板 / 搜尋</span>
                  <div class="shortcut-keys">
                    <kbd>Esc</kbd>
                  </div>
                </div>
              </div>
            </div>

            <!-- 執行 -->
            <div class="shortcut-group">
              <div class="shortcut-group-title">執行</div>
              <div class="shortcut-grid">
                <div class="shortcut-row">
                  <span class="shortcut-desc">多選節點</span>
                  <div class="shortcut-keys">
                    <kbd>⇧</kbd><span class="shortcut-plus">+</span><span class="shortcut-drag">拖曳</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 說明 -->
            <div class="shortcut-group">
              <div class="shortcut-group-title">說明</div>
              <div class="shortcut-grid">
                <div class="shortcut-row">
                  <span class="shortcut-desc">顯示此視窗</span>
                  <div class="shortcut-keys">
                    <kbd>?</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="shortcut-footer">
            按 <kbd class="shortcut-footer-kbd">Esc</kbd> 或點擊外部關閉
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{ show: boolean }>()
defineEmits<{ close: [] }>()
</script>

<style scoped>
/* Backdrop */
.shortcut-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

/* Modal */
.shortcut-modal {
  background: #1e1f36;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  width: 520px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05);
  overflow: hidden;
}

/* Header */
.shortcut-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.shortcut-header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
}

.shortcut-icon {
  font-size: 18px;
  opacity: 0.9;
}

.shortcut-close {
  background: rgba(255, 255, 255, 0.06);
  border: none;
  color: #94a3b8;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.shortcut-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
}

/* Body */
.shortcut-body {
  padding: 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Group */
.shortcut-group-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 10px;
}

/* Grid of rows */
.shortcut-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: background 0.15s;
}
.shortcut-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.shortcut-desc {
  font-size: 13px;
  color: #cbd5e1;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 4px;
}

.shortcut-plus {
  font-size: 11px;
  color: #64748b;
}

.shortcut-drag {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}

/* kbd */
kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 24px;
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-bottom-width: 2px;
  border-radius: 5px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  color: #e2e8f0;
  line-height: 1;
  white-space: nowrap;
}

/* Footer */
.shortcut-footer {
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.shortcut-footer-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 6px;
  height: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}

/* Transition */
.shortcut-overlay-enter-active,
.shortcut-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.shortcut-overlay-enter-active .shortcut-modal,
.shortcut-overlay-leave-active .shortcut-modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.shortcut-overlay-enter-from,
.shortcut-overlay-leave-to {
  opacity: 0;
}
.shortcut-overlay-enter-from .shortcut-modal,
.shortcut-overlay-leave-to .shortcut-modal {
  transform: scale(0.95) translateY(-8px);
  opacity: 0;
}
</style>
