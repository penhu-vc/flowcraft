# 節點工作流工具 — 系統設計文件

> 最後更新：2026-03-01

---

## ✅ 使用者需求（已確認）

| # | 需求 | 說明 |
|---|------|------|
| 1 | 工作流編輯 | 新建、儲存、製作、下載 node workflow |
| 2 | 自動執行 | 設有觸發器的工作流，條件成立時自動運作 |
| 3 | 監控面板 | 查看觸發器狀態、執行紀錄、錯誤日誌 |
| 4 | YouTube 觸發器 | 監控頻道是否有新影片 |
| 5 | Telegram 觸發器 | 收到 Telegram 訊息時觸發 |
| 6 | Discord 觸發器 | 收到 Discord 訊息時觸發 |
| 7 | NotebookLM 工具 | 送入內容取得 AI 摘要/分析 |
| 8 | Reels 封面工具 | 自動合成 Reels 封面圖 |
| 9 | Data 節點 | 連接 Google 試算表，讀取/寫入資料 |
| 10 | 節點規範 | 統一的新增節點開發標準 |
| 11 | 擴充性 | 設計要好擴充，未來方便加新節點 |

---

## 🏁 技術決策（已確認）

- **不使用 React**，改用 **Vue 3 + Vue Flow**
- 節點編輯器：`@vue-flow/core`
- 後端：Node.js + Express（觸發器排程 + 工作流執行）
- 排程：`node-cron`
- 資料庫：SQLite（開發）→ PostgreSQL（生產）
- 即時監控：WebSocket（Socket.io）

---

## 一、技術選型建議

### 節點編輯器：Vue Flow（推薦）
> 基於 `@vue-flow/core`，是 React Flow 的 Vue 版本，成熟度高、生態完整

| 面向 | 選擇 | 理由 |
|------|------|------|
| 框架 | **Vue 3 + Vite** | 不用 React，Vue Flow 是最完整的替代 |
| 節點編輯器 | **@vue-flow/core** | 功能強大、支援自訂節點、邊線、面板 |
| 後端 | **Node.js + Express** | 負責工作流執行、觸發器排程 |
| 排程器 | **node-cron** | 定時觸發器（例如每 5 分鐘查 YouTube）|
| 資料庫 | **SQLite（開發）/ PostgreSQL（生產）** | 儲存工作流定義、執行紀錄 |
| 即時更新 | **WebSocket (Socket.io)** | 監控面板即時推送執行狀態 |

---

## 二、整體網站架構

```
├── 前端 (Vue 3 + Vue Flow)
│   ├── 工作流編輯器 (Editor)
│   ├── 工作流列表 (Dashboard)
│   ├── 監控面板 (Monitor)
│   └── 節點面板 (Node Palette)
│
└── 後端 (Node.js)
    ├── API Server (CRUD 工作流)
    ├── Workflow Engine (執行節點邏輯)
    ├── Trigger Manager (管理觸發器排程)
    └── WebSocket Server (推送狀態給前端)
```

### 頁面結構

| 頁面 | 路由 | 功能 |
|------|------|------|
| 工作流列表 | `/` | 新建、刪除、匯入/匯出工作流 |
| 編輯器 | `/editor/:id` | 拖拉節點、連線、設定參數 |
| 監控面板 | `/monitor` | 查看所有觸發器狀態、執行紀錄、錯誤日誌 |
| 節點市集 | `/nodes` | 瀏覽可用節點（未來擴充）|

---

## 三、節點目錄（完整版）

### 🔴 觸發器 Triggers（被動啟動工作流）

| 節點名稱 | 說明 | 觸發方式 |
|---------|------|---------|
| **YouTube Monitor** | 監控頻道有無新影片 | 定時輪詢 RSS |
| **Telegram Message** | 收到 Telegram 訊息時觸發 | Webhook |
| **Discord Message** | 收到 Discord 訊息時觸發 | Webhook |
| **Schedule** | 設定 Cron 表達式，定時觸發 | Cron |
| **Webhook** | 接收外部 HTTP 請求時觸發 | HTTP POST |
| **RSS Feed** | 監控任意 RSS/Atom Feed | 定時輪詢 |
| **Gmail** | 收到指定條件的 Email | 定時輪詢 IMAP |
| **Google Forms** | 收到表單提交時觸發 | Webhook |
| **Twitter/X** | 監控關鍵字 Tweet 或帳號更新 | 定時輪詢 |
| **File Watch** | 監控資料夾檔案變動 | 本地監控 |

---

### ⚡ 動作節點 Actions（主動執行操作）

**📣 訊息發送**
| 節點 | 說明 |
|------|------|
| **Send Telegram** | 傳送訊息/圖片到 Telegram |
| **Send Discord** | 發送訊息/Embed 到 Discord 頻道 |
| **Send Email** | 透過 SMTP 發信 |
| **Send LINE** | 傳送 LINE 訊息（LINE Notify）|
| **Send Slack** | 傳送 Slack 訊息 |

**📊 Google 生態**
| 節點 | 說明 |
|------|------|
| **Google Sheets (Data)** | 讀取/寫入/更新 Google 試算表 |
| **Google Drive** | 上傳/下載/移動檔案 |
| **Google Calendar** | 新增/查詢日曆事件 |
| **Google Docs** | 建立/更新 Google 文件 |
| **YouTube Upload** | 上傳影片到頻道 |

**🤖 AI 工具**
| 節點 | 說明 |
|------|------|
| **NotebookLM** | 送入內容，取得 AI 摘要/分析 |
| **GPT / Gemini** | 呼叫 LLM API，文字生成 |
| **Whisper** | 影音轉文字 |
| **Image Generate** | 透過 DALL-E / Stable Diffusion 生圖 |
| **Text Summarize** | 長文自動摘要 |
| **Translate** | 多語言翻譯節點 |

**🎨 媒體工具**
| 節點 | 說明 |
|------|------|
| **Reels Cover** | 自動合成 Reels 封面圖（標題、背景、Logo）|
| **Thumbnail Generator** | YouTube 縮圖生成 |
| **Video Download** | 下載 YouTube / IG 影片（yt-dlp）|
| **Image Resize/Crop** | 圖片裁切縮放處理 |
| **PDF Generate** | HTML 轉 PDF |

**🔧 邏輯/工具節點**
| 節點 | 說明 |
|------|------|
| **Filter** | 根據條件過濾資料 |
| **Transform** | 資料格式轉換（JSON / CSV / Text）|
| **Merge** | 合併多個上游資料 |
| **Split** | 將陣列分割逐筆處理 |
| **Delay** | 工作流暫停 N 秒/分鐘 |
| **HTTP Request** | 呼叫任意外部 API |
| **Code** | 自訂 JS/Python 片段 |
| **Set Variable** | 設定工作流變數 |
| **Switch** | 多條件分支路由 |

---

## 四、Data 節點規格（Google Sheets 連接器）

```
輸入端：
  - action: "read" | "append" | "update" | "delete"
  - spreadsheet_id: string
  - sheet_name: string
  - range: string（例如 A1:D10）
  - data: any（寫入時用）

輸出端：
  - rows: Array<Object>  ← 讀取結果
  - status: "success" | "error"
```

---

## 五、節點開發規範

每個節點都應遵守以下結構：

```javascript
// nodes/YouTubeMonitor/index.js
export default {
  // 基本資訊
  meta: {
    id: 'youtube-monitor',          // 唯一 ID
    name: 'YouTube Monitor',
    category: 'trigger',            // trigger | action | logic | data | ai | media
    icon: '▶️',
    color: '#FF0000',
    description: '監控 YouTube 頻道新影片',
    version: '1.0.0',
  },

  // 輸入參數定義（顯示在節點設定面板）
  inputs: [
    { key: 'channel_id', label: '頻道 ID', type: 'string', required: true },
    { key: 'interval', label: '檢查間隔(分)', type: 'number', default: 30 },
  ],

  // 輸出埠定義
  outputs: [
    { key: 'video', label: '新影片', type: 'object' },
    { key: 'error', label: '錯誤', type: 'string' },
  ],

  // 執行邏輯（後端呼叫）
  async execute(inputs, context) {
    // ... 實作邏輯
    return { video: { title, url, thumbnail } };
  },

  // 觸發器設定（若為 trigger 類別）
  trigger: {
    type: 'cron',
    defaultInterval: '*/30 * * * *',
  },
}
```

### 🗂️ 節點分類標準

| 類別 | 說明 | 顏色建議 |
|------|------|---------|
| `trigger` | 啟動工作流的事件源 | 🔴 紅色 |
| `action` | 執行外部操作 | 🔵 藍色 |
| `logic` | 流程控制、條件判斷 | ⚪ 灰色 |
| `data` | 資料存取（試算表、資料庫）| 🟢 綠色 |
| `ai` | AI 模型相關工具 | 🟣 紫色 |
| `media` | 圖片、影片、PDF 處理 | 🟠 橘色 |

---

## 六、工作流資料格式（JSON Schema）

```json
{
  "id": "uuid",
  "name": "我的工作流",
  "description": "",
  "active": true,
  "nodes": [
    {
      "id": "node-1",
      "type": "youtube-monitor",
      "position": { "x": 100, "y": 200 },
      "data": { "channel_id": "UCxxxxx", "interval": 15 }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "sourceHandle": "video",
      "target": "node-2",
      "targetHandle": "input"
    }
  ],
  "createdAt": "2026-03-01T00:00:00Z",
  "updatedAt": "2026-03-01T00:00:00Z"
}
```

---

## 七、監控面板規格

| 區塊 | 內容 |
|------|------|
| 觸發器狀態 | 每個觸發器的最後檢查時間、狀態（正常/錯誤）|
| 執行歷史 | 工作流執行紀錄、每個節點的輸出 |
| 錯誤日誌 | 失敗的執行，顯示錯誤原因 |
| 即時更新 | WebSocket 推送，不需手動重整 |

---

## 八、未來擴充方向

- **節點版本管理**：節點升級時保持向後相容
- **共享節點市集**：用戶可發布自訂節點
- **團隊協作**：多人共編工作流（CRDT 或 lock 機制）
- **工作流模板**：預設常用模板（YouTube → Telegram 通知）
- **執行環境隔離**：每個工作流在沙箱中執行
- **API 金鑰管理**：統一管理各服務的憑證
- **條件重試**：節點失敗時自動重試 N 次
