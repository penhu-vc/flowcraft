<template>
  <div class="topbar">
    <span class="topbar-title">⚙️ 設定</span>
  </div>

  <div class="page-content fade-in">
    <!-- Gemini 設定 -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">🤖 Gemini AI 設定</span>
      </div>
      <div class="card-body">
        <!-- 模式選擇 -->
        <div class="mode-selector">
          <button
            class="mode-btn"
            :class="{ active: geminiMode === 'apiKey' }"
            @click="geminiMode = 'apiKey'"
          >
            🔑 API Key（簡單）
          </button>
          <button
            class="mode-btn"
            :class="{ active: geminiMode === 'gcp' }"
            @click="geminiMode = 'gcp'"
          >
            ☁️ GCP JSON（進階）
          </button>
        </div>

        <!-- API Key 模式 -->
        <div v-if="geminiMode === 'apiKey'" class="mode-content">
          <p style="color: var(--text-muted); margin-bottom: 16px;">
            使用 Google AI Studio 的 API Key，最簡單的方式。
            <a href="https://aistudio.google.com/apikey" target="_blank" style="color: var(--primary);">
              取得 API Key →
            </a>
          </p>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">
            此設定會同時供 Gemini 節點與 Veo Studio 頁面共用。
          </p>

          <!-- 狀態 -->
          <div class="status-box" :class="geminiStatus.connected ? 'status-connected' : 'status-disconnected'">
            <span class="status-icon">{{ geminiStatus.connected ? '✅' : '❌' }}</span>
            <span>{{ geminiStatus.message }}</span>
          </div>

          <!-- API Key 輸入 -->
          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">Gemini API Key</label>
            <div style="display: flex; gap: 8px;">
              <input
                :type="showApiKey ? 'text' : 'password'"
                class="form-control"
                v-model="geminiApiKey"
                placeholder="輸入你的 Gemini API Key"
              />
              <button class="btn btn-secondary" @click="showApiKey = !showApiKey">
                {{ showApiKey ? '🙈' : '👁️' }}
              </button>
              <button class="btn btn-primary" @click="saveGeminiApiKey">💾 儲存</button>
            </div>
          </div>
        </div>

        <!-- GCP JSON 模式 -->
        <div v-else class="mode-content">
          <p style="color: var(--text-muted); margin-bottom: 16px;">
            使用 GCP 服務帳號憑證，透過 Vertex AI 呼叫 Gemini。適合企業或需要更多控制的場景。
          </p>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">
            若 Veo 要走 Vertex AI，也會沿用這組憑證。
          </p>

          <!-- 狀態 -->
          <div class="status-box" :class="gcpStatus.connected ? 'status-connected' : 'status-disconnected'">
            <span class="status-icon">{{ gcpStatus.connected ? '✅' : '❌' }}</span>
            <span>{{ gcpStatus.message }}</span>
          </div>

          <!-- 匯入按鈕 -->
          <div style="margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap;">
            <label class="btn btn-primary" style="cursor: pointer;">
              📤 匯入憑證 JSON
              <input
                type="file"
                accept=".json"
                style="display: none"
                @change="onImportCredentials"
              />
            </label>
            <button
              v-if="gcpStatus.connected"
              class="btn btn-secondary"
              @click="removeCredentials"
            >
              🗑️ 移除憑證
            </button>
          </div>

          <!-- 憑證資訊 -->
          <div v-if="gcpStatus.connected && gcpStatus.info" class="credentials-info">
            <div class="info-row">
              <span class="info-label">專案 ID:</span>
              <span class="info-value">{{ gcpStatus.info.projectId }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">服務帳號:</span>
              <span class="info-value">{{ gcpStatus.info.clientEmail }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 其他 API 設定 -->
    <div class="card" style="margin-top: 16px;">
      <div class="card-header">
        <span class="card-title">🔗 其他 API 金鑰</span>
      </div>
      <div class="card-body">
        <!-- Telegram Bot -->
        <div class="form-group">
          <label class="form-label">Telegram Bot Token</label>
          <div style="display: flex; gap: 8px;">
            <input
              type="password"
              class="form-control"
              v-model="apiKeys.telegramBotToken"
              placeholder="輸入你的 Bot Token"
            />
            <button class="btn btn-secondary" @click="saveApiKeys">💾 儲存</button>
          </div>
        </div>

        <!-- Telegram Chat ID -->
        <div class="form-group" style="margin-top: 12px;">
          <label class="form-label">Telegram Chat ID</label>
          <input
            type="text"
            class="form-control"
            v-model="apiKeys.telegramChatId"
            placeholder="輸入你的 Chat ID"
          />
        </div>
      </div>
    </div>

    <!-- 訊息提示 -->
    <div v-if="message" class="toast" :class="messageType">
      {{ message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { API_ENDPOINTS } from '../api/config'

const geminiMode = ref<'apiKey' | 'gcp'>('apiKey')
const geminiApiKey = ref('')
const showApiKey = ref(false)

const geminiStatus = ref({
  connected: false,
  message: '尚未設定 API Key'
})

const gcpStatus = ref({
  connected: false,
  message: '尚未設定 GCP 憑證',
  info: null as { projectId: string; clientEmail: string } | null
})

const apiKeys = ref({
  telegramBotToken: '',
  telegramChatId: ''
})

const message = ref('')
const messageType = ref('toast-success')

function showMessage(msg: string, type: 'success' | 'error' = 'success') {
  message.value = msg
  messageType.value = type === 'success' ? 'toast-success' : 'toast-error'
  setTimeout(() => { message.value = '' }, 3000)
}

async function checkGeminiStatus() {
  try {
    const res = await fetch(API_ENDPOINTS.settingsGeminiStatus)
    const data = await res.json()

    if (data.ok) {
      geminiMode.value = data.mode || 'apiKey'

      if (data.mode === 'apiKey' && data.hasApiKey) {
        geminiStatus.value = {
          connected: true,
          message: 'API Key 已設定'
        }
        geminiApiKey.value = data.maskedKey || ''
      } else if (data.mode === 'gcp' && data.hasGcp) {
        gcpStatus.value = {
          connected: true,
          message: 'GCP 憑證已設定',
          info: data.gcpInfo
        }
      } else {
        geminiStatus.value = {
          connected: false,
          message: '尚未設定 API Key'
        }
        gcpStatus.value = {
          connected: false,
          message: '尚未設定 GCP 憑證',
          info: null
        }
      }
    }
  } catch (err) {
    geminiStatus.value = {
      connected: false,
      message: '無法連接後端伺服器'
    }
  }
}

async function saveGeminiApiKey() {
  if (!geminiApiKey.value || geminiApiKey.value.startsWith('****')) {
    showMessage('請輸入有效的 API Key', 'error')
    return
  }

  try {
    const res = await fetch(API_ENDPOINTS.settingsGeminiApiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: geminiApiKey.value })
    })

    const data = await res.json()
    if (data.ok) {
      showMessage('Gemini API Key 已儲存！')
      await checkGeminiStatus()
    } else {
      showMessage(data.error || '儲存失敗', 'error')
    }
  } catch (err) {
    showMessage('儲存失敗', 'error')
  }
}

async function onImportCredentials(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const content = await file.text()

    // 移除 BOM 字元（某些編輯器會加入）
    const cleanContent = content.replace(/^\uFEFF/, '')

    let json: any
    try {
      json = JSON.parse(cleanContent)
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr)
      showMessage('JSON 格式錯誤，請確認檔案是有效的 JSON', 'error')
      input.value = ''
      return
    }

    // 檢查必要欄位
    const missingFields: string[] = []
    if (!json.project_id) missingFields.push('project_id')
    if (!json.client_email) missingFields.push('client_email')
    if (!json.private_key) missingFields.push('private_key')

    if (missingFields.length > 0) {
      showMessage(`缺少必要欄位: ${missingFields.join(', ')}`, 'error')
      input.value = ''
      return
    }

    const res = await fetch(API_ENDPOINTS.settingsGcpCredentials, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: json })
    })

    const data = await res.json()
    if (data.ok) {
      showMessage('GCP 憑證已儲存！')
      await checkGeminiStatus()
    } else {
      showMessage(data.error || '儲存失敗', 'error')
    }
  } catch (err) {
    console.error('Import error:', err)
    showMessage('匯入失敗: ' + (err instanceof Error ? err.message : String(err)), 'error')
  }

  input.value = ''
}

async function removeCredentials() {
  if (!confirm('確定要移除 GCP 憑證嗎？')) return

  try {
    const res = await fetch(API_ENDPOINTS.settingsGcpCredentials, {
      method: 'DELETE'
    })
    const data = await res.json()

    if (data.ok) {
      showMessage('GCP 憑證已移除')
      gcpStatus.value = {
        connected: false,
        message: '尚未設定 GCP 憑證',
        info: null
      }
    }
  } catch (err) {
    showMessage('移除失敗', 'error')
  }
}

async function saveApiKeys() {
  try {
    const res = await fetch(API_ENDPOINTS.settingsApiKeys, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiKeys.value)
    })
    const data = await res.json()

    if (data.ok) {
      showMessage('API 金鑰已儲存！')
    } else {
      showMessage(data.error || '儲存失敗', 'error')
    }
  } catch (err) {
    showMessage('儲存失敗', 'error')
  }
}

async function loadApiKeys() {
  try {
    const res = await fetch(API_ENDPOINTS.settingsApiKeys)
    const data = await res.json()
    if (data.ok) {
      apiKeys.value = {
        telegramBotToken: data.telegramBotToken || '',
        telegramChatId: data.telegramChatId || ''
      }
    }
  } catch (err) {
    // 忽略錯誤
  }
}

onMounted(() => {
  checkGeminiStatus()
  loadApiKeys()
})
</script>

<style scoped>
.mode-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.mode-btn {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  border-color: var(--primary);
  color: var(--text-primary);
}

.mode-btn.active {
  border-color: var(--primary);
  background: rgba(59, 130, 246, 0.1);
  color: var(--primary);
}

.mode-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.status-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
}

.status-connected {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.status-disconnected {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.status-icon {
  font-size: 16px;
}

.credentials-info {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.info-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 4px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  color: var(--text-muted);
  min-width: 80px;
}

.info-value {
  color: var(--text-primary);
  word-break: break-all;
}

.form-group {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.form-control {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
}

.form-control:focus {
  outline: none;
  border-color: var(--primary);
}

.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 1000;
  animation: slideIn 0.3s ease;
}

.toast-success {
  background: #22c55e;
  color: white;
}

.toast-error {
  background: #ef4444;
  color: white;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
