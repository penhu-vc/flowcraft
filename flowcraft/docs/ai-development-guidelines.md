# AI 開發指南

> **適用對象**：AI 助手（Claude、GPT 等）
> **用途**：在協助開發 flowcraft 專案時必須遵守的規則和最佳實踐

---

## 🧪 測試與驗證規則

### 規則 1：先自動化測試，再請用戶測試

**要求**：
當需要用戶執行驗證或測試時，AI **必須先**使用自動化工具測試過確認可行，才能請用戶手動測試。

**自動化測試工具**：
- **Playwright**（推薦）
- **Puppeteer**
- **Chrome DevTools Protocol**
- **curl / HTTP 請求**

**適用場景**：
- ✅ 前端 UI 功能測試（點擊按鈕、表單提交等）
- ✅ API 端點測試
- ✅ 工作流執行測試
- ✅ WebSocket 連線測試
- ✅ 整合測試

**執行流程**：
```
1. AI 完成程式碼修改
2. AI 使用自動化工具驗證功能正常
   ├─ 如果測試失敗 → 修復問題 → 重新測試
   └─ 如果測試成功 → 進行步驟 3
3. AI 向用戶說明測試步驟和預期結果
4. 用戶進行手動測試確認
```

**範例**：

❌ **錯誤做法**：
```
AI: 我修改了執行按鈕的邏輯，請你：
    1. 重新整理頁面
    2. 點擊「執行工作流」按鈕
    3. 看看是否正常執行
```
*（沒有先測試，可能浪費用戶時間）*

✅ **正確做法**：
```
AI: 我修改了執行按鈕的邏輯。

    [使用 Playwright 自動化測試]
    ✅ 測試 1: 按鈕點擊正常
    ✅ 測試 2: API 請求成功
    ✅ 測試 3: WebSocket 事件接收正常

    測試已通過！請你：
    1. 重新整理頁面
    2. 點擊「執行工作流」按鈕
    3. 應該會看到節點變藍色並彈出日誌面板
```
*（先確認功能正常，再請用戶測試）*

---

## ⚡ 快速開始：使用 E2E 測試腳本

**flowcraft 專案已有完整的端到端測試腳本**，AI 在請用戶測試前**必須先執行**。

### 測試腳本位置
```bash
/Users/yaja/projects/flowcraft/tests/e2e-test.mjs
```

### 執行測試
```bash
# 在專案根目錄執行
node tests/e2e-test.mjs
```

### 測試涵蓋範圍
1. ✅ **前端運行檢查** (port 5173)
2. ✅ **後端運行檢查** (port 3001)
3. ✅ **CORS 設定驗證** (確認跨域請求正常)
4. ✅ **WebSocket 連線測試** (Socket.IO 連線)
5. ✅ **工作流執行 API** (POST /api/workflow/run)
6. ✅ **完整工作流執行** (含所有 WebSocket 事件)

### 測試結果範例
```
🧪 flowcraft 端到端測試

==================================================

測試 1: 前端運行...
✅ 前端運行正常 (port 5173)

測試 2: 後端運行...
✅ 後端運行正常 (port 3001)

測試 3: CORS 設定...
✅ CORS 設定正確

測試 4: WebSocket 連線...
✅ WebSocket 連線成功 (socket.id: xxx)

測試 5: 工作流執行 API...
✅ 工作流執行 API 正常 (executionId: exec-xxx)

測試 6: 完整工作流執行...
✅ 完整工作流執行成功（所有 WebSocket 事件正常）

==================================================

📊 測試結果: 6 通過, 0 失敗

🎉 所有測試通過！可以請用戶測試了。
```

### AI 執行流程（強制）
```
1. AI 修改程式碼
2. AI 執行: node tests/e2e-test.mjs
3. 如果測試失敗 → 立即修復 → 重新執行步驟 2
4. 如果測試全部通過 → 才可以請用戶手動測試
```

### 測試失敗處理
- 測試失敗時，腳本會顯示具體錯誤訊息
- AI 必須分析錯誤原因並修復
- 修復後重新執行測試，直到全部通過
- **絕對不能**在測試失敗的情況下請用戶測試

### 前提條件
測試腳本假設前端和後端已經在運行：
- 前端：`http://localhost:5173`
- 後端：`http://localhost:3001`

如果服務未運行，測試會失敗並顯示連線錯誤。

---

## 🔧 自動化測試實作指南

以下是測試腳本的實作範例，供參考或擴充測試案例時使用。

### API 測試（使用 curl）

```bash
# 測試 API 端點
curl -X POST http://localhost:3001/api/workflow/run \
  -H "Content-Type: application/json" \
  -d '{ "workflow": {...}, "socketId": "test" }'

# 檢查回應
# ✅ 預期: {"ok":true,"executionId":"exec-..."}
# ❌ 失敗: 錯誤訊息或 500 狀態碼
```

### 前端功能測試（使用 Playwright）

```javascript
// test-workflow-execution.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // 1. 開啟編輯器
  await page.goto('http://localhost:5173/editor/test-workflow');

  // 2. 等待頁面載入
  await page.waitForSelector('.topbar-actions');

  // 3. 點擊執行按鈕
  await page.click('button:has-text("執行工作流")');

  // 4. 驗證執行日誌面板出現
  await page.waitForSelector('.execution-panel', { timeout: 5000 });

  // 5. 驗證節點狀態變化
  const nodeColor = await page.evaluate(() => {
    const node = document.querySelector('.vue-flow__node');
    return window.getComputedStyle(node).backgroundColor;
  });

  console.log('✅ 測試通過: 執行按鈕正常工作');
  console.log('   - 日誌面板已出現');
  console.log('   - 節點顏色: ' + nodeColor);

  await browser.close();
})();
```

### WebSocket 測試

```javascript
// test-websocket.js
const io = require('socket.io-client');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✅ WebSocket 連線成功');
});

socket.on('execution:start', (data) => {
  console.log('✅ 接收到 execution:start 事件:', data);
});

socket.on('node:start', (data) => {
  console.log('✅ 接收到 node:start 事件:', data);
});

setTimeout(() => {
  socket.disconnect();
  process.exit(0);
}, 5000);
```

---

## 🔄 程式碼重新載入確認（必做！）

**在執行任何測試前，必須確認前後端已載入最新程式碼**

### 為什麼需要這個步驟？
- `ts-node-dev` 有時不會自動偵測檔案變更
- 修改程式碼後未重啟，會導致執行舊版本
- 測試結果與實際程式碼不符，浪費除錯時間

### 確認流程（每次修改後必執行）

#### 1. 檢查後端程式碼是否載入

```bash
# 1. 查看後端進程啟動時間
ps aux | grep "ts-node-dev.*src/index.ts" | grep -v grep

# 2. 查看檔案最後修改時間
stat -f "%Sm" /Users/yaja/projects/flowcraft/server/src/executors/notebooklm.ts

# 3. 對比時間，確認進程啟動時間晚於檔案修改時間
```

#### 2. 如果時間不確定，強制重啟後端

```bash
# 強制重啟後端（確保載入最新程式碼）
pkill -9 -f "ts-node-dev.*src/index.ts"
sleep 2
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 1
cd /Users/yaja/projects/flowcraft/server && npm run dev > /tmp/flowcraft-server.log 2>&1 &
sleep 4
tail -20 /tmp/flowcraft-server.log
```

**確認訊息**：
```
🚀 FlowCraft backend running on http://localhost:3001
```

#### 3. 驗證新程式碼已載入

```bash
# 檢查關鍵字是否存在（以實際修改內容為準）
grep -c "你新加入的關鍵字" /Users/yaja/projects/flowcraft/server/src/executors/notebooklm.ts
```

**範例**：
```bash
# 如果剛加入「穩定計數」邏輯，檢查是否存在
grep -c "穩定計數\|stableCount" /Users/yaja/projects/flowcraft/server/src/executors/notebooklm.ts
# 應該輸出大於 0 的數字
```

#### 4. 前端重新整理

```bash
# 前端通常不需重啟，但確保瀏覽器重新整理
# 提醒用戶按 Cmd+Shift+R (Mac) 或 Ctrl+Shift+R (Windows) 強制重新整理
```

### 快速檢查腳本（推薦）

建立一個快速驗證腳本：
```bash
# /Users/yaja/projects/flowcraft/scripts/verify-reload.sh

#!/bin/bash
echo "🔍 檢查前後端程式碼重新載入狀態..."

# 1. 檢查後端
BACKEND_PID=$(ps aux | grep "ts-node-dev.*src/index.ts" | grep -v grep | awk '{print $2}')
if [ -z "$BACKEND_PID" ]; then
  echo "❌ 後端未運行"
  exit 1
fi

BACKEND_START=$(ps -p $BACKEND_PID -o lstart=)
echo "✅ 後端運行中 (PID: $BACKEND_PID)"
echo "   啟動時間: $BACKEND_START"

# 2. 檢查關鍵檔案修改時間
FILE_TIME=$(stat -f "%Sm" /Users/yaja/projects/flowcraft/server/src/executors/notebooklm.ts)
echo "   檔案修改: $FILE_TIME"

# 3. 提示
echo ""
echo "💡 請手動確認啟動時間晚於檔案修改時間"
echo "   如果不確定，請執行: npm run restart-backend"
```

### 測試前確認清單

在執行 `node tests/e2e-test.mjs` 之前：

- [ ] 後端已重啟（或確認載入最新程式碼）
- [ ] 前端已重新整理（如有修改前端程式碼）
- [ ] 新增的程式碼確實存在於檔案中
- [ ] 後端日誌無啟動錯誤

**只有全部確認後，才能開始測試**

---

## 📋 測試檢查清單

在請用戶測試前，確認以下項目：

### 後端 API
- [ ] 健康檢查端點正常回應
- [ ] 工作流執行 API 返回正確的 executionId
- [ ] WebSocket 連線成功
- [ ] 後端日誌無錯誤訊息

### 前端 UI
- [ ] 頁面正常載入，無 Console 錯誤
- [ ] 執行按鈕可點擊
- [ ] WebSocket 連線成功
- [ ] 執行後日誌面板出現
- [ ] 節點顏色正確變化

### 整合測試
- [ ] 完整工作流可執行
- [ ] 執行進度即時更新
- [ ] 錯誤處理正常
- [ ] 執行完成後狀態正確

---

## 🚫 常見錯誤

### 錯誤 1：未測試就讓用戶測試
**後果**：用戶遇到明顯的錯誤，浪費時間

**預防**：
- 每次修改後必須先自動化測試
- 測試失敗立即修復，不要跳過

### 錯誤 2：測試環境與用戶環境不同
**後果**：AI 測試通過，但用戶執行失敗

**預防**：
- 確認 API URL 正確（localhost:3001, localhost:5173）
- 確認後端和前端都在運行
- 使用與用戶相同的瀏覽器環境

### 錯誤 3：只測試 Happy Path
**後果**：錯誤情況下行為未知

**預防**：
- 測試正常流程（Happy Path）
- 測試錯誤流程（Error Path）
- 測試邊界條件（Edge Cases）

### 錯誤 4：CORS 設定錯誤（實際案例）
**問題**：前端 `failed to fetch`，無法連接後端
**根源**：CORS origin 設定成錯誤的 port
```typescript
// ❌ 錯誤：後端 CORS 設成 5174，但前端在 5173
cors: { origin: 'http://localhost:5174' }

// ✅ 正確：port 必須一致
cors: { origin: 'http://localhost:5173' }
```

**預防**：
- E2E 測試腳本會自動驗證 CORS 設定
- 測試 3 會檢查 `access-control-allow-origin` header 是否正確

**發生日期**：2026-03-02
**影響**：用戶浪費時間測試失敗
**解法**：執行 `node tests/e2e-test.mjs` 立即發現問題

---

## 🎯 測試優先級

### P0（必須測試）
- API 端點基本功能
- 前端核心功能（執行、儲存等）
- WebSocket 連線

### P1（應該測試）
- 錯誤處理
- 邊界條件
- UI 狀態變化

### P2（可選測試）
- 效能測試
- UI 細節
- 非核心功能

---

## 📚 測試工具參考

### Playwright
- **文件**: https://playwright.dev
- **安裝**: `npm install -D playwright`
- **用途**: 前端 UI 自動化測試

### Socket.IO Client
- **文件**: https://socket.io/docs/v4/client-api/
- **安裝**: `npm install socket.io-client`
- **用途**: WebSocket 連線測試

### curl
- **內建工具**，無需安裝
- **用途**: API 端點測試

---

## 🔄 持續改進

### 記錄測試案例
每次發現 bug 後：
1. 記錄問題原因
2. 建立對應的測試案例
3. 確保未來不再發生

### 建立測試腳本庫
在 `/tests` 目錄建立常用測試腳本：
```
tests/
├── api/
│   ├── test-workflow-run.sh
│   └── test-health.sh
├── ui/
│   ├── test-execution.js
│   └── test-node-creation.js
└── integration/
    └── test-full-workflow.js
```

---

## ✅ 總結

**核心原則**：
> 先自動化測試驗證功能正常，再請用戶手動測試確認體驗。

**目標**：
- 減少用戶測試失敗的次數
- 提高開發效率
- 確保程式碼品質

**承諾**：
- AI 保證：每次請用戶測試前，都已經過自動化驗證
- 用戶保證：如果測試失敗，AI 會立即修復並重新測試

**強制執行指令**：
```bash
# 每次請用戶測試前，必須執行此指令並確認全部通過
node tests/e2e-test.mjs
```

**違規後果**：
- 未經測試就請用戶測試 = 浪費用戶時間
- 測試失敗仍請用戶測試 = 嚴重違規
- 連續違規 = 失去用戶信任

---

**最後更新**：2026-03-02
**適用版本**：flowcraft v0.0.0+
