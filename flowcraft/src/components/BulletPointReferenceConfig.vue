<template>
  <div class="bullet-point-config">
    <!-- 貼上區域 -->
    <div class="paste-section">
      <label class="label">貼上列點資料（貼上後自動解析）</label>
      <textarea
        v-model="pasteInput"
        class="textarea"
        placeholder="貼上帶有列點的資料，支援：&#10;- 列點一&#10;• 列點二&#10;* 列點三&#10;1. 列點四&#10;&#10;貼上後會自動解析並加入下方列表"
        rows="6"
        @paste="onPaste"
      ></textarea>
      <div class="hint-text">💡 貼上後會自動解析，也可手動點擊按鈕</div>
      <button @click="parseAndAdd" class="btn-secondary-outline">🔄 重新解析</button>
    </div>

    <!-- 已加入的列點列表 -->
    <div class="items-section">
      <div class="section-header">
        <label class="label">已加入列點（{{ bulletPoints.length }} 項）</label>
        <button v-if="bulletPoints.length > 0" @click="copyAll" class="btn-copy">
          📋 一鍵複製
        </button>
      </div>

      <div v-if="bulletPoints.length === 0" class="empty-state">
        尚未加入任何列點
      </div>

      <div v-else class="items-list">
        <div
          v-for="(item, index) in bulletPoints"
          :key="item.id"
          class="item-row"
        >
          <span class="item-number">{{ index + 1 }}.</span>
          <input
            v-model="item.text"
            class="item-input"
            @input="updateItems"
          />
          <button @click="deleteItem(item.id)" class="btn-delete">🗑️</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

interface BulletPoint {
  id: string
  text: string
  order: number
}

const props = defineProps<{
  config: Record<string, any>
  inputs: { key: string; label: string; type: string }[]
  outputs: { key: string; label: string; type: string }[]
}>()

const emit = defineEmits<{
  (e: 'update', config: Record<string, any>): void
}>()

const pasteInput = ref('')
const bulletPoints = ref<BulletPoint[]>([])

// 從 config 載入已存在的列點
onMounted(() => {
  if (props.config.items) {
    try {
      const parsed = JSON.parse(props.config.items as string)
      if (Array.isArray(parsed)) {
        bulletPoints.value = parsed
      }
    } catch (e) {
      // 如果解析失敗，保持空陣列
    }
  }
})

// 貼上時自動解析
function onPaste(event: ClipboardEvent) {
  // 延遲一點讓 v-model 更新
  setTimeout(() => {
    if (pasteInput.value.trim()) {
      parseAndAdd()
    }
  }, 50)
}

// 解析列點的正則表達式
function parseBulletPoints(text: string): string[] {
  const lines = text.split('\n')
  const points: string[] = []

  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    // 匹配各種列點格式：- • * 1. 2) 等
    const match = line.match(/^(?:[-•*]|\d+[.)])\s*(.+)/)
    if (match) {
      points.push(match[1].trim())
    } else if (line) {
      // 如果不是列點格式，也當作一個項目
      points.push(line)
    }
  }

  return points
}

// 解析並加入
function parseAndAdd() {
  if (!pasteInput.value.trim()) return

  const newPoints = parseBulletPoints(pasteInput.value)
  const currentMaxOrder = bulletPoints.value.length > 0
    ? Math.max(...bulletPoints.value.map(p => p.order))
    : 0

  newPoints.forEach((text, index) => {
    bulletPoints.value.push({
      id: `bp-${Date.now()}-${index}`,
      text,
      order: currentMaxOrder + index + 1
    })
  })

  // 清空貼上區域
  pasteInput.value = ''
  updateItems()
}

// 刪除項目
function deleteItem(id: string) {
  bulletPoints.value = bulletPoints.value.filter(item => item.id !== id)
  // 重新排序
  bulletPoints.value.forEach((item, index) => {
    item.order = index + 1
  })
  updateItems()
}

// 更新到 config
function updateItems() {
  emit('update', {
    items: JSON.stringify(bulletPoints.value)
  })
}

// 一鍵複製
async function copyAll() {
  const formatted = bulletPoints.value
    .map((item, index) => `${index + 1}. ${item.text}`)
    .join('\n')

  try {
    await navigator.clipboard.writeText(formatted)
    alert('已複製到剪貼簿！')
  } catch (err) {
    console.error('複製失敗', err)
  }
}
</script>

<style scoped>
.bullet-point-config {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.paste-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.items-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  display: block;
}

.textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-family: 'Courier New', monospace;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: #8b5cf6;
  ring: 2px;
  ring-color: #8b5cf6;
  ring-opacity: 0.2;
}

.btn-primary {
  align-self: flex-start;
  padding: 0.5rem 1rem;
  background-color: #8b5cf6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: #7c3aed;
}

.btn-secondary-outline {
  padding: 0.5rem 1rem;
  background-color: transparent;
  color: #6b7280;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary-outline:hover {
  background-color: #f3f4f6;
  border-color: #9ca3af;
  color: #374151;
}

.hint-text {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
  margin-bottom: 0.5rem;
}

.btn-copy {
  padding: 0.375rem 0.75rem;
  background-color: #10b981;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-copy:hover {
  background-color: #059669;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #9ca3af;
  font-size: 0.875rem;
  border: 1px dashed #d1d5db;
  border-radius: 0.375rem;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
  padding: 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background-color: #f9fafb;
  border-radius: 0.375rem;
  transition: background-color 0.2s;
}

.item-row:hover {
  background-color: #f3f4f6;
}

.item-number {
  font-weight: 600;
  color: #6b7280;
  min-width: 2rem;
  font-size: 0.875rem;
}

.item-input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.item-input:focus {
  outline: none;
  border-color: #8b5cf6;
}

.btn-delete {
  padding: 0.25rem 0.5rem;
  background-color: transparent;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.btn-delete:hover {
  opacity: 1;
}
</style>
