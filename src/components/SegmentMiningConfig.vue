<template>
  <div class="segment-mining-config">
    <!-- 複製完整指令按鈕 -->
    <div class="section-header">
      📋 完整指令
      <button
        class="btn btn-sm btn-primary"
        @click="copyPrompts"
        :disabled="loading"
        style="margin-left: auto;"
      >
        {{ copyButtonText }}
      </button>
    </div>

    <div class="form-hint" style="margin-bottom: 12px;">
      點擊按鈕複製完整的系統指令和 prompt template
    </div>

    <div class="divider" />

    <!-- 標準欄位 -->
    <div class="form-group">
      <label class="form-label">來源素材</label>
      <textarea
        class="form-input"
        v-model="localConfig.source"
        rows="6"
        placeholder="貼上文章、筆記、逐字稿、新聞、研究摘要、品牌資料、產品說明、訪談內容、社群貼文、報告摘要"
      />
    </div>

    <div class="form-group">
      <label class="form-label">AI 供應商</label>
      <select class="form-input" v-model="localConfig.aiProvider">
        <option value="gemini">Gemini（已接好）</option>
        <option value="openai">OpenAI（接口）</option>
        <option value="anthropic">Anthropic（接口）</option>
        <option value="custom">Custom（接口）</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">模型名稱</label>
      <select class="form-input" v-model="localConfig.model">
        <option value="gemini-2.0-flash">Gemini 2.0 Flash（推薦）</option>
        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
        <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">創意度</label>
      <input
        type="number"
        class="form-input"
        v-model.number="localConfig.temperature"
        step="0.1"
        min="0"
        max="2"
        placeholder="推薦 0.3（精準提取）"
      />
    </div>

    <div class="form-group">
      <label class="form-label">AI API Key（接口預留）</label>
      <input
        type="password"
        class="form-input"
        v-model="localConfig.aiApiKey"
        placeholder="Provider API key（非 Gemini 可先留空）"
      />
    </div>

    <div class="form-group">
      <label class="form-label">AI Base URL（接口預留）</label>
      <input
        type="text"
        class="form-input"
        v-model="localConfig.aiBaseUrl"
        placeholder="例如：https://api.openai.com/v1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { API_ENDPOINTS } from '../api/config'

const props = defineProps<{
  config: Record<string, any>
  inputs: { key: string; label: string; type: string }[]
  outputs: { key: string; label: string; type: string }[]
}>()

const emit = defineEmits<{
  (e: 'update', config: Record<string, any>): void
}>()

const localConfig = ref({
  source: props.config.source || '',
  aiProvider: props.config.aiProvider || 'gemini',
  model: props.config.model || 'gemini-2.0-flash',
  temperature: props.config.temperature || 0.3,
  aiApiKey: props.config.aiApiKey || '',
  aiBaseUrl: props.config.aiBaseUrl || ''
})

const loading = ref(false)
const copyButtonText = ref('📋 複製完整指令')

// 監聽變化並發送更新
watch(localConfig, (newConfig) => {
  emit('update', newConfig)
}, { deep: true })

// 複製 prompts
async function copyPrompts() {
  loading.value = true
  copyButtonText.value = '載入中...'

  try {
    const response = await fetch(API_ENDPOINTS.promptsSegmentMining)
    const data = await response.json()

    if (data.ok) {
      await navigator.clipboard.writeText(data.combined)
      copyButtonText.value = '✅ 已複製'
      setTimeout(() => {
        copyButtonText.value = '📋 複製完整指令'
      }, 2000)
    } else {
      throw new Error(data.error || '無法取得 prompts')
    }
  } catch (error) {
    console.error('Failed to copy prompts:', error)
    copyButtonText.value = '❌ 複製失敗'
    setTimeout(() => {
      copyButtonText.value = '📋 複製完整指令'
    }, 2000)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.segment-mining-config {
  padding: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.divider {
  height: 1px;
  background: var(--border);
  margin: 12px 0;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.form-input {
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
}

.form-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.btn {
  padding: 4px 12px;
  font-size: 11px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 11px;
}

.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
