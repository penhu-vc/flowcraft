# 給協作者的 Claude 指令

把這段指令貼給你的協作者，他可以直接複製給 Claude Code 使用：

---

## 📋 給 Claude Code 的完整指令

```
你好！我要協助開發 FlowCraft 專案。

專案位置：https://github.com/penhu-vc/flowcraft
這是一個自動化工作流引擎，使用 Vue 3 + Node.js。

請幫我：

1. Clone 專案到本機：
   git clone https://github.com/penhu-vc/flowcraft.git
   cd flowcraft

2. 閱讀以下檔案理解專案結構：
   - CONTRIBUTING.md（協作指南 - 必讀！）
   - README.md（專案說明）
   - server/src/executor.ts（後端節點路由）
   - src/nodes/registry.ts（前端節點註冊）

3. 安裝依賴並啟動專案：
   npm install
   cd server && npm install && cd ..

   # 啟動前端（開新終端）
   npm run dev

   # 啟動後端（開新終端）
   cd server && npm run dev

4. 理解節點開發流程：
   - 每個節點由 4 個部分組成：
     A. 後端 executor（server/src/executors/節點名.ts）
     B. 前端註冊（src/nodes/registry.ts 的 NODE_REGISTRY 陣列）
     C. 後端路由（server/src/executor.ts 的 switch case）
     D. 自定義配置組件（可選，src/components/節點名Config.vue）

5. 重要規則：
   - 新增節點前先建立分支：git checkout -b feature/node-節點名
   - 每天開始前同步 main：git pull origin main
   - 開發完成後提 Pull Request
   - 避免直接修改 main 分支

6. 高衝突區域（多人同時修改會衝突）：
   ⚠️ server/src/executor.ts（switch case）
   ⚠️ src/nodes/registry.ts（NODE_REGISTRY 陣列）
   ⚠️ src/views/Editor.vue（CUSTOM_CONFIG_MAP）

   低衝突區域（各自獨立開發）：
   ✅ server/src/executors/*.ts（各節點獨立檔案）
   ✅ src/components/*Config.vue（各節點配置組件）

現在請告訴我：你想開發什麼節點？我會引導你完成整個流程。
```

---

## 🎯 協作者開始開發前的檢查清單

協作者收到指令後，確認以下事項：

### Step 1: 確認環境
- [ ] 已安裝 Node.js 18+
- [ ] 已安裝 Git
- [ ] 有 GitHub 帳號並被邀請為協作者

### Step 2: Clone 並啟動專案
```bash
git clone https://github.com/penhu-vc/flowcraft.git
cd flowcraft

# 安裝依賴
npm install
cd server && npm install && cd ..

# 測試啟動（開兩個終端）
# 終端 1：前端
npm run dev

# 終端 2：後端
cd server && npm run dev

# 確認可以訪問 http://localhost:5173
```

### Step 3: 閱讀文件
- [ ] 已閱讀 `CONTRIBUTING.md`（**必讀！**）
- [ ] 已閱讀 `README.md`
- [ ] 理解高/低衝突區域的概念

### Step 4: 準備開發
```bash
# 同步最新的 main
git checkout main
git pull origin main

# 建立你的功能分支
git checkout -b feature/node-youtube-summary
```

---

## 💬 給協作者的簡短版指令（Discord/Telegram 用）

如果你只想給一段簡短的訊息：

```
🎉 邀請你協作 FlowCraft！

專案：https://github.com/penhu-vc/flowcraft

快速開始：
1. Clone：git clone https://github.com/penhu-vc/flowcraft.git
2. 安裝：npm install && cd server && npm install
3. 啟動：npm run dev（前端）+ cd server && npm run dev（後端）
4. 閱讀：CONTRIBUTING.md（必讀！）
5. 開發：git checkout -b feature/node-xxx

有問題隨時問我！
```

---

## 🤖 協作者可以問 Claude 的問題範例

引導協作者這樣使用 Claude Code：

### 範例 1：新增一個簡單節點
```
我想新增一個「文字轉大寫」節點，輸入一段文字，輸出轉成大寫的文字。
請幫我：
1. 建立 executor 檔案
2. 註冊到 registry
3. 加到 executor.ts 的 switch case
4. 測試是否可以運行
```

### 範例 2：新增一個 API 節點
```
我想新增一個「OpenAI GPT」節點，使用 OpenAI API。
需要：
- 輸入：prompt（文字框）、apiKey（密碼框）、model（下拉選單）
- 輸出：response（字串）

請幫我完成整個節點開發流程。
```

### 範例 3：解決衝突
```
我在合併 main 時出現 executor.ts 衝突，錯誤訊息是：
CONFLICT (content): Merge conflict in server/src/executor.ts

請幫我理解如何解決這個衝突。
```

---

## ⚠️ 提醒協作者的注意事項

### ❌ 不要做的事
1. 不要直接 push 到 main
2. 不要 commit `.env` 或 `session.json`
3. 不要一次修改太多檔案（容易衝突）
4. 不要跳過閱讀 CONTRIBUTING.md

### ✅ 建議做的事
1. 每天開始前 `git pull origin main`
2. 開發前先溝通「我要加 XXX 節點」
3. 功能完成就提 PR，不要累積
4. 遇到衝突先問，不要亂合併

---

## 📞 如何邀請協作者

### GitHub 邀請步驟
1. 到 https://github.com/penhu-vc/flowcraft/settings/access
2. 點「Add people」
3. 輸入協作者的 GitHub 帳號
4. 選擇權限：**Write**（推薦）
5. 發送邀請

### 給協作者的完整訊息模板
```
🎉 你已被邀請協作 FlowCraft！

專案：https://github.com/penhu-vc/flowcraft
協作指南：https://github.com/penhu-vc/flowcraft/blob/main/FOR_COLLABORATOR.md

快速開始：
1. 接受 GitHub 邀請（收件匣會有通知）
2. Clone 專案並安裝依賴
3. 閱讀 CONTRIBUTING.md（重要！）
4. 把「給 Claude Code 的完整指令」貼給 Claude
5. 開始開發你的第一個節點！

有任何問題隨時問我，祝開發順利！
```

---

這份文件已準備好，可以直接轉發給協作者 ✅
