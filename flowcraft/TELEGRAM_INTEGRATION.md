# Telegram 整合指南

## 概述
Flowcraft 支援透過 Telegram Bot 發送訊息並接收按鈕點擊回應。本文件說明如何正確配置和除錯 Telegram 整合功能。

## 架構

### 訊息發送流程
```
Flowcraft (本機) → Telegram Bot API → 用戶的 Telegram
```

### 按鈕回應流程
```
用戶點擊按鈕 → Telegram → Webhook (Cloud Run) → 回應訊息
```

**關鍵點**：按鈕點擊不會回到本機 Flowcraft，而是由 Cloud Run 上的 webhook 服務處理。

## 配置要求

### 1. Telegram Bot Token
- 位置：Flowcraft 節點配置中
- 格式：`數字:英數字串`（例如：`8299044370:AAGSx2Hkgf_VOTIfB9tNAlQ8W1RddFrStRw`）
- 取得方式：透過 [@BotFather](https://t.me/botfather) 創建機器人

### 2. Webhook 服務
- **專案**：`telegram-webhook`（位於 `/Users/yaja/projects/telegram-webhook`）
- **部署位置**：Google Cloud Run
  - Region: `asia-east1`（推薦，延遲較低）
  - Service URL: `https://telegram-webhook-163638167671.asia-east1.run.app`
- **必要環境變數**：
  - `TELEGRAM_BOT_TOKEN`：你的 Bot Token
  - `GOOGLE_CLOUD_PROJECT`：GCP 專案 ID（自動設定）

### 3. Webhook URL 設定
```bash
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://telegram-webhook-163638167671.asia-east1.run.app/webhook"
```

⚠️ **重要**：確認 webhook URL 正確設定：
```bash
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo" | jq '.result.url'
```

## 常見問題與解決方案

### 問題 1：按鈕點擊沒有反應

**症狀**：用戶點擊 Telegram 訊息中的按鈕，但沒有收到任何回應。

**可能原因與解決方法**：

#### 1.1 Webhook URL 未設定或錯誤
```bash
# 檢查當前 webhook
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"

# 如果 url 是 null 或指向錯誤的服務，重新設定
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://telegram-webhook-163638167671.asia-east1.run.app/webhook"
```

#### 1.2 Cloud Run 環境變數缺失
```bash
# 檢查環境變數
gcloud run services describe telegram-webhook --region=asia-east1 --format="value(spec.template.spec.containers[0].env)"

# 如果缺少 TELEGRAM_BOT_TOKEN，設定它
gcloud run services update telegram-webhook \
  --region=asia-east1 \
  --update-env-vars TELEGRAM_BOT_TOKEN=<你的token>
```

#### 1.3 Markdown 解析錯誤
**已修復**：`send-telegram.ts` 現在會自動在 Markdown 解析失敗時重試（使用純文字）。

舊版本的錯誤訊息：
```
Bad Request: can't parse entities: Can't find end of the entity starting at byte offset XX
```

如果仍遇到此問題，確認 `send-telegram.ts` 包含以下邏輯：
```typescript
if (!result.ok) {
  if (result.description?.includes("parse entities") && typedConfig.parse_mode) {
    // 自動重試，不使用 parse_mode
  }
}
```

### 問題 2：Webhook 一直被重置

**症狀**：設定 webhook URL 後，過一段時間又變回 null 或舊的 URL。

**可能原因**：
- 有其他服務或腳本在設定同一個 bot 的 webhook
- 定時任務或 CI/CD 流程中有 webhook 設定步驟

**除錯步驟**：
1. 搜尋所有專案中使用該 bot token 的地方：
   ```bash
   grep -r "<BOT_TOKEN前幾位數字>" ~/projects --exclude-dir=node_modules
   ```

2. 檢查是否有其他 Cloud Run 服務使用同一個 bot：
   ```bash
   gcloud run services list --platform=managed | grep telegram
   ```

3. 暫時解法：在觸發工作流前立即重設 webhook

### 問題 3：Cache 設定無法取消勾選

**已修復**：`Editor.vue` 中 `onNodeClick` 的 spread operator 順序已修正。

確認以下程式碼順序正確：
```typescript
// ✅ 正確：config 覆蓋 defaults
nodeData.value = { ...defaults, ...node.data.config }

// ❌ 錯誤：defaults 覆蓋 config
nodeData.value = { ...node.data.config, ...defaults }
```

## 部署 Webhook 服務

### 初次部署
```bash
cd /Users/yaja/projects/telegram-webhook
~/projects/gcp-deploy/deploy.sh telegram-webhook

# 設定環境變數
gcloud run services update telegram-webhook \
  --region=asia-east1 \
  --update-env-vars TELEGRAM_BOT_TOKEN=<你的token>

# 設定 webhook URL
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://telegram-webhook-163638167671.asia-east1.run.app/webhook"
```

### 更新部署
修改 `telegram-webhook/src/index.ts` 後：
```bash
cd /Users/yaja/projects/telegram-webhook
~/projects/gcp-deploy/deploy.sh telegram-webhook
```

⚠️ 更新後不需要重新設定 webhook URL（除非 service URL 改變）。

## 測試流程

### 1. 測試訊息發送
在 Flowcraft 中建立簡單工作流：
- 節點：Send Telegram
- 配置：Bot Token、Chat ID、訊息內容
- 執行工作流，確認訊息送達

### 2. 測試按鈕回應
1. 在 Send Telegram 節點中設定標籤按鈕
2. 執行工作流，訊息送達後
3. 點擊按鈕
4. 應該收到包含標籤資訊的回應訊息

### 3. 監控 Webhook 日誌
```bash
# 即時日誌
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=telegram-webhook AND resource.labels.location=asia-east1"

# 最近的日誌
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=telegram-webhook AND timestamp>=\"$(date -u -v-10M '+%Y-%m-%dT%H:%M:%SZ')\"" --limit=50
```

## 開發注意事項

### Send Telegram Executor (`server/src/executors/send-telegram.ts`)

#### 關鍵功能
1. **自動重試機制**：Markdown 解析失敗時自動使用純文字重試
2. **支援本地檔案上傳**：可以發送本地圖片（使用 FormData）
3. **按鈕構建**：支援標籤按鈕和 URL 按鈕（如 YouTube 連結）

#### 修改建議
- **不要移除** parse_mode 自動重試邏輯
- **測試時注意** FormData 和 JSON 兩種發送方式都要測試
- **新增按鈕類型** 時，確保 `reply_markup` 格式正確

### Webhook Handler (`telegram-webhook/src/index.ts`)

#### 關鍵功能
1. **接收 callback_query**：處理按鈕點擊事件
2. **發送回應訊息**：顯示標籤資訊
3. **回應 callback query**：移除載入動畫

#### 修改建議
- **不要使用** `parse_mode: "Markdown"`（容易出錯）
- **處理錯誤** 時記得 log，方便除錯
- **測試時** 確認 `answerCallbackQuery` 有正確呼叫

## 安全性

### 敏感資訊處理
- ❌ **不要** 將 Bot Token 寫死在程式碼中
- ✅ **使用** 環境變數或配置檔
- ✅ **Cloud Run** 使用 Secret Manager 或環境變數

### Webhook 安全
- 建議設定 `secret_token`（選填，但建議使用）
- 驗證來源 IP（Telegram 有固定的 IP 範圍）

## 參考資源

- [Telegram Bot API 文件](https://core.telegram.org/bots/api)
- [Google Cloud Run 文件](https://cloud.google.com/run/docs)
- [Flowcraft GitHub Repo](https://github.com/penhu-vc/flowcraft)

## 聯絡與支援

遇到問題時：
1. 檢查本文件的「常見問題」章節
2. 查看 Cloud Run 日誌
3. 在 GitHub 提 Issue

---

最後更新：2026-03-04
