# 我的每日協作流程（專案維護者）

## 📅 每天開始工作前（5 分鐘）

### ✅ 同步協作者的更新

```bash
cd /Users/yaja/projects/flowcraft

# 1. 同步遠端的所有變更
git fetch origin

# 2. 查看有哪些新的 commits
git log main..origin/main --oneline

# 3. 如果有更新，合併到本地 main
git checkout main
git pull origin main

# 4. 查看協作者加了什麼節點
git log --oneline -5
git diff HEAD~5 --stat
```

**預期結果**：
- 看到協作者的 commit 訊息（例如：`feat: add youtube-summary node`）
- 看到修改的檔案列表

---

## 🔄 處理協作者的 Pull Request

### 方式 A：在 GitHub 網站上審查（推薦）

1. 到 https://github.com/penhu-vc/flowcraft/pulls
2. 點開 PR，查看「Files changed」
3. 確認：
   - [ ] 新增的 executor 檔案正確
   - [ ] registry.ts 有註冊節點
   - [ ] executor.ts 有加 switch case
   - [ ] 沒有 commit 不該上傳的檔案（.env, session.json）
4. 測試程式碼（可選）：
   ```bash
   # Fetch 該分支
   git fetch origin pull/1/head:pr-1
   git checkout pr-1

   # 測試
   npm run dev
   cd server && npm run dev
   ```
5. 如果 OK，回到 GitHub 點「Merge pull request」

### 方式 B：本地合併

```bash
# 1. Fetch PR 分支
git fetch origin pull/1/head:pr-1
git checkout pr-1

# 2. 測試
npm run dev
cd server && npm run dev

# 3. 如果 OK，合併到 main
git checkout main
git merge pr-1
git push origin main

# 4. 刪除本地分支
git branch -d pr-1
```

---

## 🔥 遇到衝突時的處理（10 分鐘）

### 情境：協作者提了 PR，但與你的變更衝突

#### Step 1: 確認衝突位置
```bash
# 在 GitHub PR 頁面會顯示：
# "This branch has conflicts that must be resolved"
```

#### Step 2: 在本地解決衝突
```bash
# 1. 同步最新的 main
git checkout main
git pull origin main

# 2. Fetch 協作者的分支
git fetch origin feature/their-node:their-branch

# 3. 嘗試合併（會顯示衝突）
git checkout their-branch
git merge main

# 4. 打開衝突檔案（通常是 executor.ts 或 registry.ts）
# 會看到：
# <<<<<<< HEAD
# 你的程式碼
# =======
# 協作者的程式碼
# >>>>>>> main
```

#### Step 3: 手動合併

**executor.ts 衝突範例**：
```typescript
// <<<<<<< HEAD (協作者的版本)
case 'youtube-summary':
    return executeYouTubeSummary(config, emit)
// =======
case 'segment-mining':  // (你的版本)
    return executeSegmentMining(config, emit)
// >>>>>>> main

// ✅ 正確合併：保留兩個 case
case 'youtube-summary':
    return executeYouTubeSummary(config, emit)

case 'segment-mining':
    return executeSegmentMining(config, emit)
```

**registry.ts 衝突範例**：
```typescript
// <<<<<<< HEAD
{
    id: 'youtube-summary',
    name: 'YouTube 摘要',
    // ...
},
// =======
{
    id: 'segment-mining',
    name: '分段採礦器',
    // ...
},
// >>>>>>> main

// ✅ 正確合併：保留兩個節點
{
    id: 'youtube-summary',
    name: 'YouTube 摘要',
    // ...
},
{
    id: 'segment-mining',
    name: '分段採礦器',
    // ...
},
```

#### Step 4: 完成合併
```bash
# 1. 標記衝突已解決
git add server/src/executor.ts src/nodes/registry.ts

# 2. 完成 merge commit
git commit -m "merge: resolve conflicts with main"

# 3. Push 回協作者的分支
git push origin their-branch

# 4. 回到 GitHub，現在可以合併 PR 了
```

---

## 📊 每週檢查（15 分鐘）

### ✅ 整理 branches

```bash
# 查看所有遠端分支
git branch -r

# 刪除已合併的遠端分支
git remote prune origin

# 查看本地多餘的分支
git branch --merged main
git branch -d branch-name  # 刪除已合併的本地分支
```

### ✅ 查看專案狀態

```bash
# 查看最近的 commits
git log --oneline --graph --all -20

# 查看哪些檔案被修改最多（可能是衝突熱點）
git log --format=format: --name-only | sort | uniq -c | sort -r | head -10
```

---

## 🚨 緊急情況處理

### 情境 1：協作者不小心 push 到 main

```bash
# 1. 查看錯誤的 commit
git log main -5

# 2. 如果是最新的 commit，可以 revert
git checkout main
git revert HEAD
git push origin main

# 3. 通知協作者下次要用分支開發
```

### 情境 2：協作者 commit 了敏感資訊（API key）

```bash
# ⚠️ 這個比較複雜，建議：
# 1. 立即更換洩漏的 API key
# 2. 聯絡 GitHub Support 要求 purge commit history
# 3. 或使用 git filter-branch / BFG Repo-Cleaner

# 簡單做法（如果是最近的 commit）：
git checkout main
git revert <commit-hash>
git push origin main

# 然後立即更換 API key
```

### 情境 3：想暫時回到之前的版本

```bash
# 查看歷史
git log --oneline

# 暫時切換到某個舊 commit（唯讀）
git checkout <commit-hash>

# 測試完後回到 main
git checkout main
```

---

## 💡 省時小技巧

### 設定 Git alias

在 `~/.gitconfig` 加入：
```ini
[alias]
    st = status
    co = checkout
    br = branch
    cm = commit -m
    lg = log --oneline --graph --all -20
    sync = !git checkout main && git pull origin main
    conflicts = diff --name-only --diff-filter=U
```

之後可以用：
```bash
git sync          # 同步 main
git lg            # 查看圖形化 log
git conflicts     # 查看衝突檔案
```

### 快速同步並切回工作分支

```bash
# 建立一個 shell 函數（加到 ~/.zshrc）
function gsync() {
    current_branch=$(git branch --show-current)
    git checkout main && git pull origin main && git checkout $current_branch && git merge main
}

# 使用：直接輸入 gsync
```

---

## 📋 每日檢查清單（快速版）

```bash
# 早上第一件事（複製貼上即可）
cd /Users/yaja/projects/flowcraft
git checkout main
git pull origin main
git log --oneline -5

# 如果有新的 PR，到 GitHub 審查
# https://github.com/penhu-vc/flowcraft/pulls

# 開始你自己的開發
git checkout feature/your-branch
git merge main  # 同步最新變更
```

---

## 🎓 總結：你需要記住的 3 個指令

99% 的情況下，你只需要這 3 個指令：

```bash
# 1. 每天早上同步協作者的更新
git checkout main && git pull origin main

# 2. 切回你的分支並合併最新變更
git checkout feature/your-branch && git merge main

# 3. 審查 PR（到 GitHub 網站點點點）
open https://github.com/penhu-vc/flowcraft/pulls
```

**就這麼簡單！** 🎉

---

## 🆘 遇到問題時

### 常見錯誤訊息

1. **"fatal: Not a git repository"**
   → 確認你在 flowcraft 目錄：`cd /Users/yaja/projects/flowcraft`

2. **"error: Your local changes would be overwritten"**
   → 先 commit 或 stash 你的變更：`git stash`

3. **"CONFLICT (content): Merge conflict in ..."**
   → 參考上面的「遇到衝突時的處理」章節

### 問 Claude

把錯誤訊息完整貼給 Claude：
```
我在執行 git pull origin main 時出現以下錯誤：
[貼上完整錯誤訊息]

請幫我解決。
```

---

**這份指南已儲存，每天照著做就不會有問題！** ✅
