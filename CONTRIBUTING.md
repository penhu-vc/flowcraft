# FlowCraft 協作指南

## 🎯 新增節點的協作流程

### 1️⃣ 建立你的分支

```bash
# 1. 先同步最新的 main
git checkout main
git pull origin main

# 2. 建立你的功能分支（命名規則：feature/node-xxx）
git checkout -b feature/node-segment-mining
```

### 2️⃣ 開發新節點

新增節點需要修改的檔案：

#### A. 後端 Executor（各自獨立，不會衝突）
```
/server/src/executors/your-node.ts
```

#### B. 前端組件（如需自定義配置，各自獨立）
```
/src/components/YourNodeConfig.vue  （可選）
```

#### C. **容易衝突的檔案**（需要特別注意）

**⚠️ 高衝突區域**：
1. `/server/src/executor.ts` - 所有人都會修改這個 switch case
2. `/src/nodes/registry.ts` - 所有人都會在這裡註冊節點
3. `/src/views/Editor.vue` - 如果有自定義配置組件

### 3️⃣ 減少衝突的最佳實踐

#### ✅ 做法 A：每天同步 main（推薦）
```bash
# 每天開始工作前
git checkout main
git pull origin main
git checkout feature/node-your-node
git merge main
```

#### ✅ 做法 B：使用 Rebase 保持乾淨歷史
```bash
git checkout feature/node-your-node
git fetch origin
git rebase origin/main
```

#### ✅ 做法 C：開發前先溝通
- 在 GitHub Issues 或 Discord 說「我要加 XXX 節點」
- 避免兩個人同時加節點到同一區域

### 4️⃣ 提交你的 Pull Request

```bash
# 1. 確保程式碼可以運行
npm run dev  # 測試前端
cd server && npm run dev  # 測試後端

# 2. Commit 你的變更
git add .
git commit -m "feat: add segment-mining node

- Add segment-mining executor
- Add SegmentMiningConfig component
- Update registry and executor switch"

# 3. Push 到你的分支
git push origin feature/node-your-node
```

### 5️⃣ 在 GitHub 上建立 Pull Request

1. 到 GitHub repo 頁面
2. 點「New Pull Request」
3. Base: `main` ← Compare: `feature/node-your-node`
4. 填寫 PR 描述（用下方模板）

#### PR 描述模板：
```markdown
## 新增節點：XXX

### 功能描述
簡短說明這個節點做什麼

### 變更檔案
- [ ] `/server/src/executors/xxx.ts` - executor 實作
- [ ] `/server/src/executor.ts` - 新增 case
- [ ] `/src/nodes/registry.ts` - 註冊節點
- [ ] `/src/components/XxxConfig.vue` - 自定義配置（可選）

### 測試步驟
1. 啟動後端 `npm run dev`
2. 啟動前端 `npm run dev`
3. 拖入 XXX 節點到畫布
4. 執行工作流

### Screenshots
（截圖展示節點外觀和執行結果）
```

---

## 🔥 衝突處理

### 情境 1：`executor.ts` 衝突

**原因**：兩個人都在 switch case 加了新 case

**解決步驟**：
```bash
# 1. Pull 最新的 main
git checkout main
git pull origin main

# 2. 切回你的分支並 merge
git checkout feature/node-your-node
git merge main

# 3. 打開 executor.ts，手動合併
# 保留兩邊的 case，確保格式一致

# 4. 標記為已解決
git add server/src/executor.ts
git commit -m "merge: resolve executor.ts conflict"
```

**executor.ts 衝突範例**：
```typescript
// <<<<<<< HEAD (你的版本)
case 'segment-mining':
    return executeSegmentMining(config, emit)
// =======
case 'youtube-summary':  // (main 的新版本)
    return executeYouTubeSummary(config, emit)
// >>>>>>> main

// ✅ 正確合併：保留兩個 case
case 'segment-mining':
    return executeSegmentMining(config, emit)

case 'youtube-summary':
    return executeYouTubeSummary(config, emit)
```

### 情境 2：`registry.ts` 衝突

**原因**：兩個人都在 NODE_REGISTRY 陣列加了新節點

**解決步驟**：
```typescript
// <<<<<<< HEAD
{
    id: 'segment-mining',
    name: '分段採礦器',
    // ...
},
// =======
{
    id: 'youtube-summary',
    name: 'YouTube 摘要',
    // ...
},
// >>>>>>> main

// ✅ 正確合併：保留兩個節點定義
{
    id: 'segment-mining',
    name: '分段採礦器',
    // ...
},
{
    id: 'youtube-summary',
    name: 'YouTube 摘要',
    // ...
},
```

### 情境 3：`Editor.vue` 衝突

**原因**：兩個人都加了自定義配置組件

**解決步驟**：
```typescript
// import 區域合併
import SegmentMiningConfig from '../components/SegmentMiningConfig.vue'
import YouTubeSummaryConfig from '../components/YouTubeSummaryConfig.vue'

// CUSTOM_CONFIG_MAP 合併
const CUSTOM_CONFIG_MAP: Record<string, any> = {
  SegmentMiningConfig,
  YouTubeSummaryConfig,
  // ... 其他
}
```

---

## 📋 Commit Message 規範

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```bash
feat: add segment-mining node          # 新功能
fix: fix executor switch case error    # 修 bug
docs: update README                     # 文件
style: format code                      # 格式調整（不影響功能）
refactor: extract common logic          # 重構
test: add unit tests                    # 測試
chore: update dependencies              # 雜項
```

---

## 🚀 快速開始範例

假設你要加一個「YouTube 摘要」節點：

```bash
# 1. 建立分支
git checkout -b feature/node-youtube-summary

# 2. 創建檔案
touch server/src/executors/youtube-summary.ts
touch src/components/YouTubeSummaryConfig.vue

# 3. 修改共用檔案
# 編輯 server/src/executor.ts
# 編輯 src/nodes/registry.ts
# 編輯 src/views/Editor.vue（如果有自定義配置）

# 4. 測試
npm run dev
cd server && npm run dev

# 5. Commit
git add .
git commit -m "feat: add youtube-summary node"

# 6. Push
git push origin feature/node-youtube-summary

# 7. 到 GitHub 建立 Pull Request
```

---

## 💡 小技巧

### 避免衝突的策略

1. **小步快跑**：功能完成就提 PR，不要累積太多變更
2. **早溝通**：開始前先說一聲「我要加 XXX 節點」
3. **常同步**：每天 `git pull origin main`
4. **模組化**：儘量讓新節點獨立，減少修改共用檔案

### 檢查清單

提 PR 前確認：
- [ ] 前後端都能正常啟動
- [ ] 節點可以正常拖入畫布
- [ ] 節點執行沒有錯誤
- [ ] Commit message 符合規範
- [ ] 沒有 commit 不該上傳的檔案（`.env`, `node_modules` 等）
- [ ] 有寫清楚的 PR 描述

---

## 🆘 求助

遇到問題？

1. **Git 衝突不會解**：先在自己分支備份 `git branch backup`，然後詢問有經驗的協作者
2. **不確定要不要提 PR**：先開 Draft PR，標註「WIP (Work in Progress)」
3. **程式碼審查建議**：認真看待，學習改進，不要防禦性回應

---

## 🎓 學習資源

- [Git 基礎教學](https://git-scm.com/book/zh-tw/v2)
- [GitHub Flow](https://docs.github.com/en/get-started/quickstart/github-flow)
- [如何解決 Git 衝突](https://www.atlassian.com/git/tutorials/using-branches/merge-conflicts)
