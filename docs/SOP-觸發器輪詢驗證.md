# SOP：觸發器輪詢機制驗證

**版本**：1.0
**最後更新**：2026-03-04
**目的**：驗證 Workflow 觸發器輪詢機制（Fallback 和 Sequential 模式）運作正常

---

## 前置條件

### 1. 環境檢查

```bash
# 進入專案目錄
cd /Users/yaja/projects/flowcraft/server

# 檢查 backend 是否運行
lsof -ti:3001 && echo "✅ Backend 運行中" || echo "❌ Backend 未運行"

# 檢查前端是否運行
lsof -ti:5173 && echo "✅ Frontend 運行中" || echo "❌ Frontend 未運行"
```

### 2. 測試工作流

- **Workflow ID**: `wf-1772470073926`
- **Workflow 名稱**: 123
- **觸發器數量**: 2 個
  - 觸發器 1 (order=1): YouTube Monitor
  - 觸發器 2 (order=2): YouTube 最近影片

### 3. 檢查 triggerMode 設定

```bash
cat data/workflows.json | jq '.[] | select(.id == "wf-1772470073926") | .triggerMode'
# 預期輸出: "fallback" 或 "sequential"
```

---

## 測試場景 1：首次執行（無 state，應該成功）

### 步驟 1.1：清除 state

```bash
rm -f data/youtube-monitor-state.json
echo "✅ 已清除 state 檔案"
```

### 步驟 1.2：清空日誌（可選）

```bash
> /tmp/flowcraft-server.log
echo "✅ 已清空日誌"
```

### 步驟 1.3：執行 workflow

**方式 A：使用前端**
1. 打開瀏覽器：http://localhost:5173/#/editor/wf-1772470073926
2. 點擊「▶ 執行」按鈕
3. 觀察執行面板的日誌輸出

**方式 B：使用 API**
```bash
node -e "
const http = require('http');
const fs = require('fs');

const workflows = JSON.parse(fs.readFileSync('data/workflows.json', 'utf8'));
const wf = workflows.find(w => w.id === 'wf-1772470073926');

const data = JSON.stringify({ workflow: wf });

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/workflow/run',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
};

const req = http.request(options, (res) => {
  res.on('data', (d) => console.log('Response:', d.toString()));
});

req.write(data);
req.end();
console.log('✅ 執行請求已送出');
"
```

### 步驟 1.4：等待執行完成

```bash
sleep 8
```

### 步驟 1.5：驗證日誌

```bash
# 提取關鍵日誌
grep "execution:start" /tmp/flowcraft-server.log | tail -1 | grep -oP 'exec-\d+' > /tmp/last-exec-id.txt
EXEC_ID=$(cat /tmp/last-exec-id.txt)

echo "=== 驗證：觸發器輪詢日誌 ==="
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep "message:" | grep -E "觸發器模式|嘗試觸發器|發現新影片|已處理|停止嘗試"
```

### 步驟 1.6：檢查點

- [ ] 日誌顯示「🔄 觸發器模式：Fallback（共 2 個觸發器）」
- [ ] 日誌顯示「🎯 嘗試觸發器 1/2：youtube-monitor」
- [ ] 日誌顯示「✨ 發現新影片！ID: [videoId]」
- [ ] 日誌顯示「💾 已儲存 state: [videoId]」
- [ ] 日誌顯示「✅ 觸發器 1 成功，停止嘗試其他觸發器」
- [ ] **不應該**看到「嘗試觸發器 2」
- [ ] state 檔案已生成：`ls data/youtube-monitor-state.json`

---

## 測試場景 2：重複執行（有 state，應該 fallback）

### 步驟 2.1：確認 state 存在

```bash
cat data/youtube-monitor-state.json
# 預期輸出: {"lastVideoId":"xxx","updatedAt":"2026-03-04T..."}
```

### 步驟 2.2：再次執行 workflow

使用與測試場景 1 相同的方式（前端或 API）

### 步驟 2.3：驗證日誌

```bash
# 提取最新的 executionId
EXEC_ID=$(grep "execution:start" /tmp/flowcraft-server.log | tail -1 | grep -oP 'exec-\d+')

echo "=== 驗證：Fallback 機制 ==="
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep "message:" | grep -E "觸發器模式|嘗試觸發器|已處理過|嘗試下一個"
```

### 步驟 2.4：檢查點

- [ ] 日誌顯示「🔄 觸發器模式：Fallback（共 2 個觸發器）」
- [ ] 日誌顯示「🎯 嘗試觸發器 1/2：youtube-monitor」
- [ ] 日誌顯示「📌 上次處理: [videoId]」
- [ ] 日誌顯示「⏸️ 此影片已處理過，沒有新影片」
- [ ] 日誌顯示「⏭️ 觸發器 1 暫無內容，嘗試下一個」
- [ ] 日誌顯示「🎯 嘗試觸發器 2/2：youtube-recent-videos」
- [ ] 觸發器 2 開始執行（如果有影片應該顯示成功）

---

## 測試場景 3：Sequential 模式（可選）

### 步驟 3.1：切換模式

```bash
node -e "
const fs = require('fs');
const workflows = JSON.parse(fs.readFileSync('data/workflows.json', 'utf8'));
const wf = workflows.find(w => w.id === 'wf-1772470073926');
wf.triggerMode = 'sequential';
fs.writeFileSync('data/workflows.json', JSON.stringify(workflows, null, 2));
console.log('✅ triggerMode 已切換為 sequential');
"
```

### 步驟 3.2：執行並驗證

```bash
# 清除 state
rm -f data/youtube-monitor-state.json

# 執行 workflow（使用前面的方法）

# 驗證日誌
EXEC_ID=$(grep "execution:start" /tmp/flowcraft-server.log | tail -1 | grep -oP 'exec-\d+')
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep "message:" | grep -E "Sequential|嘗試觸發器"
```

### 步驟 3.3：檢查點

- [ ] 日誌顯示「🔄 觸發器模式：Sequential（共 2 個觸發器）」
- [ ] 日誌顯示「🎯 執行觸發器 1/2」
- [ ] 日誌顯示「🎯 執行觸發器 2/2」
- [ ] **兩個觸發器都執行**，不管第一個是否成功

### 步驟 3.4：還原模式

```bash
node -e "
const fs = require('fs');
const workflows = JSON.parse(fs.readFileSync('data/workflows.json', 'utf8'));
const wf = workflows.find(w => w.id === 'wf-1772470073926');
wf.triggerMode = 'fallback';
fs.writeFileSync('data/workflows.json', JSON.stringify(workflows, null, 2));
console.log('✅ triggerMode 已還原為 fallback');
"
```

---

## 故障排除

### 問題 1：看不到「觸發器模式」日誌

**可能原因**：
- triggerMode 是 null
- WorkflowEngine 沒有正確載入修正後的程式碼

**解法**：
```bash
# 檢查 triggerMode
cat data/workflows.json | jq '.[] | select(.id == "wf-1772470073926") | .triggerMode'

# 如果是 null，手動設定
node -e "
const fs = require('fs');
const workflows = JSON.parse(fs.readFileSync('data/workflows.json', 'utf8'));
const wf = workflows.find(w => w.id === 'wf-1772470073926');
wf.triggerMode = 'fallback';
fs.writeFileSync('data/workflows.json', JSON.stringify(workflows, null, 2));
"

# 重啟 backend
pkill -9 -f "flowcraft.*server" && sleep 2 && npm run dev > /tmp/flowcraft-server.log 2>&1 &
```

### 問題 2：日誌顯示「共 3 個觸發器」

**可能原因**：
- sortTriggers() 沒有先過濾觸發器

**解法**：
```bash
# 檢查 WorkflowEngine.ts:61 是否有這行
grep -A2 "區分觸發器和一般起始節點" server/src/execution/WorkflowEngine.ts

# 應該看到：
# const allTriggers = startNodes.filter(node => this.isTriggerNode(node))
# const triggers = this.sortTriggers(allTriggers)
```

### 問題 3：state 檔案沒有生成

**可能原因**：
- 路徑權限問題
- saveLastProcessedVideoId() 寫入失敗

**解法**：
```bash
# 檢查 data 目錄權限
ls -la data/

# 手動測試寫入
echo '{"test":true}' > data/youtube-monitor-state.json && echo "✅ 寫入成功" || echo "❌ 寫入失敗"

# 檢查日誌是否有「儲存 state 失敗」訊息
grep "儲存 state" /tmp/flowcraft-server.log
```

### 問題 4：觸發器 1 沒有 fallback 到觸發器 2

**可能原因**：
- hasTriggerContent() 判斷邏輯錯誤
- YouTube Monitor 返回的空物件格式不對

**解法**：
```bash
# 檢查 YouTube Monitor 的輸出
EXEC_ID=$(grep "execution:start" /tmp/flowcraft-server.log | tail -1 | grep -oP 'exec-\d+')
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep "node:done" | grep "youtube-monitor" -A20

# 檢查是否返回 {video: null, channel_name: null, ...}
```

---

## 快速驗證腳本

完整的自動化驗證腳本：

```bash
#!/bin/bash
# 檔案：test-trigger-polling.sh

cd /Users/yaja/projects/flowcraft/server

echo "🧪 觸發器輪詢機制驗證"
echo ""

# 測試 1：首次執行
echo "=== 測試 1：首次執行（無 state）==="
rm -f data/youtube-monitor-state.json
echo "✅ 已清除 state"

node -e "
const http = require('http');
const fs = require('fs');
const workflows = JSON.parse(fs.readFileSync('data/workflows.json', 'utf8'));
const wf = workflows.find(w => w.id === 'wf-1772470073926');
const data = JSON.stringify({ workflow: wf });
const options = {
  hostname: 'localhost', port: 3001, path: '/api/workflow/run', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
};
const req = http.request(options, (res) => {});
req.write(data);
req.end();
console.log('📤 執行請求已送出');
" && sleep 6

EXEC_ID=$(grep "execution:start" /tmp/flowcraft-server.log | tail -1 | grep -oP 'exec-\d+')
echo ""
echo "--- 關鍵日誌 ---"
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep "message:" | grep -E "觸發器模式|嘗試觸發器|發現新影片|停止嘗試" | sed 's/.*message: //' | tr -d "'"

echo ""
echo "--- 檢查點 ---"
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep -q "共 2 個觸發器" && echo "✅ 觸發器數量正確" || echo "❌ 觸發器數量錯誤"
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep -q "發現新影片" && echo "✅ 發現新影片" || echo "❌ 未發現新影片"
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep -q "停止嘗試其他觸發器" && echo "✅ 正確停止" || echo "❌ 未停止"
[ -f data/youtube-monitor-state.json ] && echo "✅ state 檔案已生成" || echo "⚠️ state 檔案未生成"

# 測試 2：重複執行（fallback）
echo ""
echo "=== 測試 2：重複執行（有 state，應該 fallback）==="
sleep 2

node -e "
const http = require('http');
const fs = require('fs');
const workflows = JSON.parse(fs.readFileSync('data/workflows.json', 'utf8'));
const wf = workflows.find(w => w.id === 'wf-1772470073926');
const data = JSON.stringify({ workflow: wf });
const options = {
  hostname: 'localhost', port: 3001, path: '/api/workflow/run', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
};
const req = http.request(options, (res) => {});
req.write(data);
req.end();
console.log('📤 執行請求已送出');
" && sleep 6

EXEC_ID=$(grep "execution:start" /tmp/flowcraft-server.log | tail -1 | grep -oP 'exec-\d+')
echo ""
echo "--- 關鍵日誌 ---"
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep "message:" | grep -E "觸發器模式|嘗試觸發器|已處理過|嘗試下一個" | sed 's/.*message: //' | tr -d "'"

echo ""
echo "--- 檢查點 ---"
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep -q "已處理過" && echo "✅ 偵測到已處理" || echo "❌ 未偵測已處理"
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep -q "嘗試下一個" && echo "✅ 嘗試第二個觸發器" || echo "❌ 未嘗試第二個"
grep "$EXEC_ID" /tmp/flowcraft-server.log | grep -q "嘗試觸發器 2" && echo "✅ 執行觸發器 2" || echo "❌ 未執行觸發器 2"

echo ""
echo "🎉 驗證完成"
```

---

## 總結

完成以上所有測試場景後，應該確認：

1. ✅ 觸發器過濾邏輯正確（只識別真正的觸發器）
2. ✅ Fallback 模式運作正常（第一個失敗才嘗試第二個）
3. ✅ Sequential 模式運作正常（所有觸發器都執行）
4. ✅ YouTube Monitor 去重機制正常（記住已處理的影片）
5. ✅ state 檔案正確生成和讀取

若任何檢查點失敗，請參考「故障排除」章節。
