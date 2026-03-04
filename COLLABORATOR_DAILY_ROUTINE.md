# 協作者的每日開發流程

## 📅 每天開始開發前（3 分鐘）

### ✅ 同步最新的 main 分支

```bash
cd flowcraft

# 1. 切到 main 分支
git checkout main

# 2. 拉取最新變更（包含維護者和其他協作者的更新）
git pull origin main

# 3. 查看最新的變更（了解其他人加了什麼）
git log --oneline -5
```

**為什麼要做**：確保你基於最新的程式碼開發，減少衝突

---

## 🔧 開始開發新功能

### Step 1: 切換到你的分支並同步

```bash
# 如果是新功能，建立新分支
git checkout -b feature/node-youtube-summary

# 如果是繼續昨天的工作，切到已有的分支
git checkout feature/node-youtube-summary

# 🔥 重要：合併最新的 main 到你的分支
git merge main
```

**如果出現衝突**：參考下方「處理衝突」章節

### Step 2: 開發你的節點

假設你要加「YouTube 摘要」節點：

#### A. 創建 executor
```bash
# 請 Claude 幫你創建：
touch server/src/executors/youtube-summary.ts
```

給 Claude 的指令：
```
請幫我創建 server/src/executors/youtube-summary.ts

功能：輸入 YouTube URL，輸出影片摘要
需要的欄位：
- youtubeUrl (string, required)
- apiKey (password)
- model (select: gpt-4o, gpt-4o-mini)

參考 segment-mining.ts 的結構。
```

#### B. 註冊節點到 registry
```
請幫我在 src/nodes/registry.ts 的 NODE_REGISTRY 陣列中加入：

{
    id: 'youtube-summary',
    name: 'YouTube 摘要',
    category: 'ai',
    icon: '🎬',
    description: '從 YouTube 影片生成摘要',
    version: '1.0.0',
    inputs: [
        { key: 'youtubeUrl', label: 'YouTube URL', type: 'string', required: true },
        { key: 'apiKey', label: 'OpenAI API Key', type: 'password' },
        { key: 'model', label: '模型', type: 'select', default: 'gpt-4o-mini', options: [
            { label: 'GPT-4o', value: 'gpt-4o' },
            { label: 'GPT-4o Mini', value: 'gpt-4o-mini' }
        ]}
    ],
    outputs: [
        { key: 'summary', label: '摘要', type: 'string' }
    ]
}

⚠️ 注意：加在陣列最後，逗號要正確
```

#### C. 加到 executor 路由
```
請幫我在 server/src/executor.ts 的 switch 語句中加入：

case 'youtube-summary':
    return executeYouTubeSummary(config, emit)

⚠️ 注意：加在其他 case 後面，記得 import
```

### Step 3: 測試

```bash
# 啟動前端（新終端）
npm run dev

# 啟動後端（新終端）
cd server && npm run dev

# 測試：
# 1. 到 http://localhost:5173
# 2. 拖入你的新節點
# 3. 執行工作流
# 4. 確認沒有錯誤
```

---

## ✅ 完成開發，提交 Pull Request

### Step 1: Commit 你的變更

```bash
# 查看修改了哪些檔案
git status

# 加入變更
git add .

# Commit（使用規範的訊息格式）
git commit -m "feat: add youtube-summary node

- Add youtube-summary executor
- Update registry with new node definition
- Add switch case to executor
- Support GPT-4o and GPT-4o-mini models"
```

**Commit message 格式**：
- `feat:` - 新功能
- `fix:` - 修 bug
- `docs:` - 文件
- `refactor:` - 重構

### Step 2: Push 到你的分支

```bash
# Push 到遠端
git push origin feature/node-youtube-summary
```

**第一次 push 會顯示**：
```
remote: Create a pull request for 'feature/node-youtube-summary' on GitHub by visiting:
remote:   https://github.com/penhu-vc/flowcraft/pull/new/feature/node-youtube-summary
```

### Step 3: 在 GitHub 建立 Pull Request

1. 複製上面的連結，在瀏覽器打開
2. 或直接到 https://github.com/penhu-vc/flowcraft/pulls 點「New Pull Request」
3. 填寫 PR 描述：

```markdown
## 新增節點：YouTube 摘要

### 功能描述
從 YouTube 影片 URL 生成摘要，支援 GPT-4o 和 GPT-4o-mini 模型

### 變更檔案
- [x] `server/src/executors/youtube-summary.ts` - executor 實作
- [x] `server/src/executor.ts` - 新增 switch case
- [x] `src/nodes/registry.ts` - 註冊節點

### 測試步驟
1. 啟動前後端
2. 拖入「YouTube 摘要」節點
3. 輸入 YouTube URL 和 API key
4. 執行工作流
5. 確認摘要正常輸出

### Screenshots
（貼上節點的截圖）
```

4. 點「Create Pull Request」

### Step 4: 等待審查

- 維護者會審查你的程式碼
- 可能會留言要求修改
- 如果有修改，直接在同一個分支 commit 並 push，PR 會自動更新

---

## 🔥 處理衝突（最常見的情況）

### 情境：你在 `git merge main` 時出現衝突

```bash
# 錯誤訊息：
# CONFLICT (content): Merge conflict in server/src/executor.ts
# Automatic merge failed; fix conflicts and then commit the result.
```

### Step 1: 查看哪些檔案衝突

```bash
git status

# 會顯示：
# Unmerged paths:
#   both modified:   server/src/executor.ts
#   both modified:   src/nodes/registry.ts
```

### Step 2: 打開衝突檔案

#### executor.ts 衝突範例：

```typescript
case 'segment-mining':
    return executeSegmentMining(config, emit)

<<<<<<< HEAD  // 你的版本
case 'youtube-summary':
    return executeYouTubeSummary(config, emit)
=======
case 'text-to-speech':  // main 的新版本（其他協作者加的）
    return executeTextToSpeech(config, emit)
>>>>>>> main

default:
    throw new Error(`No executor found for node type: ${nodeType}`)
```

### Step 3: 手動合併（保留雙方的程式碼）

```typescript
case 'segment-mining':
    return executeSegmentMining(config, emit)

case 'youtube-summary':      // 你的
    return executeYouTubeSummary(config, emit)

case 'text-to-speech':       // 別人的
    return executeTextToSpeech(config, emit)

default:
    throw new Error(`No executor found for node type: ${nodeType}`)
```

**刪除衝突標記**：
- 刪除 `<<<<<<< HEAD`
- 刪除 `=======`
- 刪除 `>>>>>>> main`
- 保留雙方的程式碼（兩個 case 都要）

### Step 4: 標記為已解決

```bash
# 加入解決後的檔案
git add server/src/executor.ts

# 如果還有其他衝突，重複 Step 2-3

# 完成合併
git commit -m "merge: resolve conflicts with main"
```

### Step 5: 繼續開發或 Push

```bash
# 如果還要繼續開發，就繼續
# 如果已完成，就 push
git push origin feature/node-youtube-summary
```

---

## 📋 每日檢查清單（複製貼上即可）

### 早上開始前

```bash
cd flowcraft
git checkout main
git pull origin main
git checkout feature/your-branch
git merge main
```

### 開發完成後

```bash
git status
git add .
git commit -m "feat: add awesome feature"
git push origin feature/your-branch
# 然後到 GitHub 建立 Pull Request
```

---

## 💡 常用指令速查

```bash
# 查看當前分支
git branch

# 查看修改了哪些檔案
git status

# 查看程式碼差異
git diff

# 暫存變更（臨時切分支用）
git stash         # 暫存
git stash pop     # 恢復

# 撤銷未 commit 的變更
git checkout -- file.ts

# 查看 commit 歷史
git log --oneline -10
```

---

## 🆘 遇到問題時

### 常見問題

**Q: `git pull` 說有本地變更會被覆蓋？**
```bash
# 先 commit 或 stash 你的變更
git stash
git pull origin main
git stash pop
```

**Q: 不小心 commit 錯了？**
```bash
# 撤銷最後一次 commit（保留變更）
git reset --soft HEAD~1

# 重新 commit
git commit -m "正確的訊息"
```

**Q: Push 被拒絕（rejected）？**
```bash
# 先 pull 再 push
git pull origin feature/your-branch
git push origin feature/your-branch
```

**Q: 衝突太複雜，想放棄合併？**
```bash
# 放棄當前的 merge
git merge --abort

# 回到 merge 前的狀態
```

### 問 Claude

把完整的錯誤訊息貼給 Claude：
```
我在執行 [指令] 時出現以下錯誤：

[完整錯誤訊息]

我的狀況是：
- 當前分支：[分支名]
- 正在做：[你在做什麼]

請幫我解決。
```

---

## 🎯 關鍵提醒

### ✅ 每天一定要做
1. 早上第一件事：`git pull origin main`
2. 切到你的分支：`git merge main`
3. 開發完就 push：不要累積

### ⚠️ 不要做
1. 不要直接修改 main 分支
2. 不要 commit `.env` 或包含密碼的檔案
3. 不要一次改太多檔案（容易衝突）
4. 不要看到衝突就慌，慢慢處理

### 💬 有問題就問
- Git 不會用？問 Claude
- 程式碼不會寫？問 Claude
- 衝突不會解？問 Claude
- 真的卡住了？問維護者

---

**照著這份指南做，協作開發會很順利！** 🎉
