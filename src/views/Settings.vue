<template>
  <div class="topbar">
    <span class="topbar-title">⚙️ 設定</span>
  </div>

  <div class="page-content fade-in">
    <!-- GCP 設定 -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">☁️ Google Cloud Platform (GCP) 設定</span>
      </div>
      <div class="card-body">
        <p style="color: var(--text-muted); margin-bottom: 16px;">
          上傳你的 GCP 服務帳號憑證 JSON 檔案，用於 Gemini API 等功能。
        </p>

        <!-- 目前狀態 -->
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
          <button class="btn btn-secondary" @click="checkStatus">
            🔄 檢查狀態
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

    <!-- 其他設定區塊（未來擴充） -->
    <div class="card" style="margin-top: 16px;">
      <div class="card-header">
        <span class="card-title">🔗 API 金鑰</span>
      </div>
      <div class="card-body">
        <p style="color: var(--text-muted); margin-bottom: 16px;">
          設定各種 API 金鑰（選用）
        </p>

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

async function checkStatus() {
  try {
    const res = await fetch('http://localhost:3001/api/settings/gcp/status')
    const data = await res.json()

    if (data.ok && data.connected) {
      gcpStatus.value = {
        connected: true,
        message: 'GCP 憑證已設定',
        info: data.info
      }
    } else {
      gcpStatus.value = {
        connected: false,
        message: data.message || '尚未設定 GCP 憑證',
        info: null
      }
    }
  } catch (err) {
    gcpStatus.value = {
      connected: false,
      message: '無法連接後端伺服器',
      info: null
    }
  }
}

async function onImportCredentials(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const content = await file.text()
    const json = JSON.parse(content)

    // 驗證是否為有效的 GCP 憑證
    if (!json.project_id || !json.client_email || !json.private_key) {
      showMessage('無效的 GCP 憑證檔案', 'error')
      return
    }

    // 上傳到後端
    const res = await fetch('http://localhost:3001/api/settings/gcp/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: json })
    })

    const data = await res.json()
    if (data.ok) {
      showMessage('GCP 憑證已儲存！')
      await checkStatus()
    } else {
      showMessage(data.error || '儲存失敗', 'error')
    }
  } catch (err) {
    showMessage('檔案格式錯誤', 'error')
  }

  input.value = ''
}

async function removeCredentials() {
  if (!confirm('確定要移除 GCP 憑證嗎？')) return

  try {
    const res = await fetch('http://localhost:3001/api/settings/gcp/credentials', {
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
    const res = await fetch('http://localhost:3001/api/settings/api-keys', {
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
    const res = await fetch('http://localhost:3001/api/settings/api-keys')
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
  checkStatus()
  loadApiKeys()
})
</script>

<style scoped>
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
