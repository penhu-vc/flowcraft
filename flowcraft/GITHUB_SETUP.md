# 上傳到 GitHub 完整步驟

## 📋 準備工作

### 1. 確認 .gitignore 正確

已自動設定，以下檔案不會上傳：
- `node_modules/`
- `.env` 和 `.env.local`（敏感資訊）
- `server/session.json`（NotebookLM 登入資訊）
- 日誌檔案

### 2. 移除敏感資訊

檢查專案中是否有敏感資訊：
```bash
# 檢查是否有 API keys
grep -r "AIza" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "sk-" . --exclude-dir=node_modules --exclude-dir=.git

# 如果有，移到 .env.local（已在 .gitignore 中）
```

---

## 🚀 上傳步驟

### Step 1: 初始化 Git（已完成）

```bash
cd /Users/yaja/projects/flowcraft
git status  # 確認 Git 已初始化
```

### Step 2: 第一次 Commit

```bash
# 查看將要 commit 的檔案
git status

# 如果有不該上傳的檔案，加到 .gitignore
echo "unwanted-file.txt" >> .gitignore

# 加入所有檔案
git add .

# 第一次 commit
git commit -m "chore: initial commit

- Add FlowCraft workflow engine
- Frontend: Vue 3 + ReactFlow
- Backend: Node.js + TypeScript
- Nodes: segment-mining, skill5, fact-check-95, etc.
- Add collaboration guide (CONTRIBUTING.md)"
```

### Step 3: 在 GitHub 建立 Repository

#### 方式 A：用 GitHub CLI（推薦）

```bash
# 確認已登入（用你的 GH_TOKEN）
export GH_TOKEN=$(grep GH_TOKEN ~/.zshrc | cut -d'"' -f2)
gh auth status

# 建立 public repo
gh repo create flowcraft --public --source=. --remote=origin

# 或建立 private repo
gh repo create flowcraft --private --source=. --remote=origin

# Push
git push -u origin main
```

#### 方式 B：手動在 GitHub 網站建立

1. 到 https://github.com/new
2. Repository name: `flowcraft`
3. 選擇 Public 或 Private
4. **不要** 勾選「Initialize this repository with a README」
5. 點「Create repository」
6. 複製頁面上的指令：

```bash
git remote add origin https://github.com/penhu-vc/flowcraft.git
git branch -M main
git push -u origin main
```

### Step 4: 確認上傳成功

到 https://github.com/penhu-vc/flowcraft 確認檔案都在

---

## 👥 邀請協作者

### 設定協作者權限

1. 到 repo 頁面 → Settings → Collaborators
2. 點「Add people」
3. 輸入協作者的 GitHub 帳號
4. 選擇權限：
   - **Write**：可以 push（推薦）
   - **Maintain**：可以管理設定
   - **Admin**：完全控制

### 告訴協作者如何開始

傳給他們：
```
🎉 你已被邀請協作 FlowCraft！

1. Clone repo：
   git clone https://github.com/penhu-vc/flowcraft.git
   cd flowcraft

2. 安裝依賴：
   npm install
   cd server && npm install

3. 啟動專案：
   npm run dev（前端）
   cd server && npm run dev（後端）

4. 閱讀協作指南：
   https://github.com/penhu-vc/flowcraft/blob/main/CONTRIBUTING.md

5. 建立你的第一個分支：
   git checkout -b feature/node-your-idea
```

---

## 🔄 你的日常工作流程

### 每天開始工作前

```bash
# 同步最新的 main
git checkout main
git pull origin main

# 如果你有正在開發的分支
git checkout feature/your-branch
git merge main  # 或用 rebase
```

### 開發完成後

```bash
# Commit
git add .
git commit -m "feat: add awesome feature"

# Push
git push origin feature/your-branch

# 到 GitHub 建立 Pull Request
```

### 收到協作者的 PR 時

#### 選項 A：在 GitHub 網站上合併（簡單）
1. 到 PR 頁面
2. 檢查「Files changed」
3. 點「Merge pull request」

#### 選項 B：本地審查後合併（嚴謹）
```bash
# 1. Fetch 所有分支
git fetch origin

# 2. 檢出協作者的分支
git checkout -b feature/their-branch origin/feature/their-branch

# 3. 測試程式碼
npm run dev

# 4. 如果 OK，合併到 main
git checkout main
git merge feature/their-branch
git push origin main

# 5. 到 GitHub 關閉該 PR（會自動標記為 merged）
```

---

## ⚠️ 衝突解決實戰

### 情境：你和協作者都修改了 `executor.ts`

```bash
# 1. 同步 main（包含協作者的變更）
git checkout main
git pull origin main

# 2. 切到你的分支並 merge
git checkout feature/your-branch
git merge main

# 3. 出現衝突訊息：
# CONFLICT (content): Merge conflict in server/src/executor.ts

# 4. 打開 executor.ts，找到衝突標記：
# <<<<<<< HEAD
#     case 'your-node':
#         return executeYourNode(config, emit)
# =======
#     case 'their-node':
#         return executeTheirNode(config, emit)
# >>>>>>> main

# 5. 手動合併（保留兩個 case）：
#     case 'your-node':
#         return executeYourNode(config, emit)
#
#     case 'their-node':
#         return executeTheirNode(config, emit)

# 6. 標記為已解決
git add server/src/executor.ts
git commit -m "merge: resolve executor.ts conflict"

# 7. Push
git push origin feature/your-branch
```

---

## 🛡️ 保護 main 分支（建議設定）

### 在 GitHub 設定 Branch Protection Rules

1. 到 repo → Settings → Branches
2. 點「Add rule」
3. Branch name pattern: `main`
4. 勾選：
   - ✅ Require a pull request before merging
   - ✅ Require approvals (至少 1 人)
   - ✅ Dismiss stale pull request approvals when new commits are pushed

這樣可以避免：
- 不小心直接 push 到 main
- 未經審查的程式碼進入 main

---

## 📊 專案管理工具（可選）

### GitHub Projects
- 建立看板追蹤功能開發
- 到 repo → Projects → New project

### GitHub Issues
- 用 Issues 討論功能需求
- 模板範例：

```markdown
## 節點需求：YouTube 字幕抓取

### 功能描述
輸入 YouTube URL，輸出字幕文字

### 輸入
- YouTube URL (string)

### 輸出
- 字幕文字 (string)
- 語言 (string)

### 技術方案
使用 youtube-transcript API

### 預估工時
2-3 小時
```

---

## 🎓 Git 快速參考

```bash
# 查看狀態
git status

# 查看分支
git branch -a

# 切換分支
git checkout branch-name

# 建立新分支
git checkout -b feature/new-node

# 查看 commit 歷史
git log --oneline --graph

# 暫存變更（臨時切分支用）
git stash
git stash pop

# 復原未 commit 的變更
git checkout -- file.ts

# 查看遠端狀態
git remote -v

# 刪除本地分支
git branch -d feature/old-branch

# 刪除遠端分支
git push origin --delete feature/old-branch
```

---

## ✅ 檢查清單

上傳前確認：
- [ ] `.gitignore` 包含 `node_modules`, `.env`, `session.json`
- [ ] 沒有 commit 敏感資訊（API keys, passwords）
- [ ] `README.md` 和 `CONTRIBUTING.md` 已完成
- [ ] 程式碼可以正常執行

邀請協作者前確認：
- [ ] `CONTRIBUTING.md` 已詳細說明協作流程
- [ ] 設定了 Branch Protection Rules（可選）
- [ ] 準備好回答協作者的問題

---

**完成後，你的 FlowCraft 就可以開始協作開發了！** 🎉
