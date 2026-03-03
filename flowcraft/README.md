# FlowCraft

自動化工作流引擎，支援 AI 節點、資料處理、社群發布等功能。

## 🚀 快速開始

### 前置需求
- Node.js 18+
- npm 或 yarn

### 安裝與執行

```bash
# 1. 安裝前端依賴
npm install

# 2. 安裝後端依賴
cd server
npm install

# 3. 啟動前端（新終端）
npm run dev

# 4. 啟動後端（新終端）
cd server
npm run dev
```

訪問：http://localhost:5173

## 📦 專案結構

```
flowcraft/
├── src/                          # 前端（Vue 3 + Vite）
│   ├── components/               # 自定義節點配置組件
│   ├── nodes/                    # 節點註冊中心
│   │   └── registry.ts          # ⚠️ 高衝突區：所有節點定義
│   └── views/
│       └── Editor.vue           # ⚠️ 高衝突區：自定義組件註冊
│
├── server/                       # 後端（Node.js + TypeScript）
│   └── src/
│       ├── executor.ts          # ⚠️ 高衝突區：節點執行路由
│       └── executors/           # ✅ 低衝突區：各節點獨立檔案
│           ├── segment-mining.ts
│           ├── skill5.ts
│           └── ...
│
└── CONTRIBUTING.md              # 協作指南（必讀！）
```

## 🎯 新增節點

想加新節點？請先閱讀 [CONTRIBUTING.md](./CONTRIBUTING.md)

**快速流程**：
1. 建立分支：`git checkout -b feature/node-xxx`
2. 創建 executor：`server/src/executors/xxx.ts`
3. 註冊節點：修改 `executor.ts` 和 `registry.ts`
4. 測試通過
5. 提 Pull Request

## 🤝 協作流程

### 避免衝突的關鍵

**高衝突區域**（多人同時修改會衝突）：
- `server/src/executor.ts` - switch case
- `src/nodes/registry.ts` - 節點註冊
- `src/views/Editor.vue` - 自定義組件

**低衝突區域**（各自獨立開發）：
- `server/src/executors/*.ts` - 各節點 executor
- `src/components/*Config.vue` - 各節點配置組件

### 最佳實踐
1. **每天同步 main**：`git pull origin main`
2. **小步快跑**：功能完成就提 PR
3. **提前溝通**：開始前說一聲「我要加 XXX 節點」

詳細說明請見 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 🔧 已實現的節點

### AI 工具
- **分段採礦器** - 立場型素材挖礦（爆裂版 v4）
- **Script Pipeline Producer** - 腳本生成 Pipeline
- **Fact Check 95** - 事實查核改寫

### 資料
- **Google Sheets** - 讀寫試算表

### 觸發器
- **YouTube Monitor** - 監控 YouTube 頻道新影片

### 動作
- **Send Telegram** - 發送 Telegram 訊息

## 📝 環境變數

複製 `.env.example` 為 `.env.local`（不要上傳到 Git）

## 🐛 常見問題

### 1. 後端啟動失敗
確認 port 3001 沒有被佔用：
```bash
lsof -ti:3001 | xargs kill -9
```

### 2. 前端連不到後端
確認後端已啟動，並檢查 CORS 設定（預設允許 localhost:5173）

### 3. Git 衝突不會解
參考 [CONTRIBUTING.md](./CONTRIBUTING.md) 的衝突處理章節

## 📄 授權

MIT License

---

**開始協作**：閱讀 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解完整的協作流程
