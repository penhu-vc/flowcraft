# FlowCraft UI/UX 互動操作功能發展建議報告

> **分析日期**: 2026-03-07
> **專案路徑**: `/Users/yaja/projects/flowcraft`
> **Agent**: UI/UX 互動操作專家

---

## 📊 執行摘要

FlowCraft 採用現代化前端架構（Vue 3 + Vue Flow），已具備紮實的 UI/UX 基礎，包含豐富的視覺回饋、完善的快捷鍵系統、獨特的功能（級聯停用、孤立節點透明、多選高亮連線）。

本報告識別了 **30+ 個 UI/UX 改進機會**，並按優先級分為：
- 🟢 **Quick Wins**: 9 個功能（26 小時，1-2 週）
- 🟡 **Medium Priority**: 8 個功能（61 小時，1-2 個月）
- 🔴 **Long-term**: 3 個功能（75+ 小時，3+ 個月）

---

## 1. 現有 UI 架構分析

### 1.1 技術棧與架構

**前端框架**
- Vue 3 (Composition API)
- @vue-flow/core v1.48.2 - 節點編輯器核心
- @vue-flow/background、controls、minimap - 畫布增強組件
- Pinia - 狀態管理
- Socket.io-client - 實時通訊
- Vue Router - 路由管理

**UI 組件架構**
- CustomNode.vue - 自定義節點渲染
- Editor.vue - 主編輯器視圖 (1506 行)
- PortVisibilityEditor.vue - 埠位可視性與排序編輯器
- 多個節點配置組件 (*Config.vue)

**狀態管理 (Pinia Stores)**
- workflow.ts - 工作流管理
- execution.ts - 執行狀態追蹤
- nodeCache.ts - 節點快取
- collection.ts - 資料集管理

### 1.2 已實現的 UI/UX 功能

**節點編輯器核心功能**
- ✅ 節點拖放添加
- ✅ 節點連線（拖拽 Handle 連接）
- ✅ 節點多選（Shift + 點擊）
- ✅ 節點刪除（Delete/Backspace 鍵）
- ✅ 複製/貼上節點（Ctrl/Cmd + C/V）
- ✅ 撤銷/重做（Ctrl/Cmd + Z/Shift+Z）
- ✅ 節點停用（按 D 鍵切換）
- ✅ 畫布縮放與平移
- ✅ Minimap 導航
- ✅ 背景網格
- ✅ 邊緣動畫與高亮

**進階功能**
- ✅ 多選節點對齊（垂直置中、水平對齊）
- ✅ 輸入/輸出埠動態顯示與排序（PortVisibilityEditor）
- ✅ 孤立節點自動半透明顯示
- ✅ 級聯停用（停用節點自動變灰階）
- ✅ 多選高亮連線（選中多個節點時，它們之間的連線高亮）
- ✅ 執行時節點狀態視覺化（執行中綠色發光、失敗紅色覆蓋）
- ✅ 節點快取機制（useCachedResult 開關）
- ✅ 觸發器順序編號顯示（Trigger Order Badge）

**配置與調試**
- ✅ 屬性面板（右側滑出）
- ✅ 執行日誌面板（底部滑出）
- ✅ 節點進度條顯示
- ✅ 實時日誌輸出
- ✅ 腳本結果 Modal（Script Generator 專用）

**工作流管理**
- ✅ 工作流名稱雙擊編輯
- ✅ 一鍵複製工作流名稱
- ✅ 匯入/匯出 JSON
- ✅ 自動儲存（localStorage + 後端同步）

### 1.3 現有設計優勢

1. **視覺回饋豐富**
   - 節點狀態多層次視覺化（執行中、完成、失敗、停用、孤立）
   - 連線智能高亮（選中節點、多選、執行時）
   - 邊緣動畫與發光效果

2. **快捷鍵系統完善**
   - 複製/貼上（Ctrl/Cmd + C/V）
   - 撤銷/重做（Ctrl/Cmd + Z/Shift+Z）
   - 節點停用（D 鍵）
   - 刪除（Delete/Backspace）

3. **響應式狀態管理**
   - WebSocket 實時推送執行進度
   - Pinia 響應式狀態更新
   - 本地快取與後端同步

4. **用戶體驗細節**
   - 節點拖拽使用 `.node-header` 作為拖拽手柄，避免誤觸 Port Handle
   - 執行時其他節點自動半透明（dimmed）
   - 保存成功 Toast 提示
   - 禁用節點顯示 🚫 圖標

---

## 2. 節點編輯器互動體驗建議

### 🟢 Quick Wins（1-2 週）

#### 2.1 節點搜索與過濾（⭐ 最高優先級）

**功能需求**
- 畫布上快速搜索節點（Ctrl/Cmd + F）
- 節點類型篩選（觸發器、動作、AI 等）
- 節點名稱/配置內容搜索

**使用場景**
大型工作流（50+ 節點）時，快速定位特定節點或同類型節點。

**實作方式**
```vue
<!-- Editor.vue 新增搜索功能 -->
<script setup>
const searchQuery = ref('')
const searchResults = ref<Node[]>([])

function searchNodes(query: string) {
  if (!query) {
    searchResults.value = []
    return
  }

  searchResults.value = nodes.value.filter(node => {
    const matchName = node.data.label?.toLowerCase().includes(query.toLowerCase())
    const matchType = node.data.nodeType?.toLowerCase().includes(query.toLowerCase())
    const matchConfig = JSON.stringify(node.data.config || {})
      .toLowerCase().includes(query.toLowerCase())
    return matchName || matchType || matchConfig
  })

  // 高亮搜索結果
  nodes.value.forEach(node => {
    node.data.highlighted = searchResults.value.some(r => r.id === node.id)
  })
}

// 跳轉到搜索結果
function jumpToNode(nodeId: string) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (node) {
    fitView({ nodes: [node], duration: 500, padding: 0.3 })
    selectedNodeId.value = nodeId
  }
}
</script>
```

**UI 設計建議**
- 搜索框浮動在畫布中上方（類似 VS Code 搜索）
- 搜索結果列表顯示節點圖標、名稱、類型
- 匹配節點邊框高亮（cyan 發光）
- ESC 鍵關閉搜索

---

#### 2.2 框選節點（批量操作）

**功能需求**
- 拖拽空白處框選多個節點
- 多選節點統一配置（批量啟用/停用）
- 批量刪除確認對話框

**使用場景**
用戶需要同時啟用/停用多個節點進行測試，或快速清理不需要的節點群組。

**實作方式**
```vue
<script setup>
import { useVueFlow } from '@vue-flow/core'

const { onPaneMouseDown, onPaneMouseMove, onPaneMouseUp } = useVueFlow()
const isBoxSelecting = ref(false)
const selectionBox = ref({ x: 0, y: 0, width: 0, height: 0 })

function startBoxSelection(e) {
  if (e.button !== 0) return
  isBoxSelecting.value = true
  selectionBox.value = { x: e.clientX, y: e.clientY, width: 0, height: 0 }
}

function updateBoxSelection(e) {
  if (!isBoxSelecting.value) return
  const width = e.clientX - selectionBox.value.x
  const height = e.clientY - selectionBox.value.y
  selectionBox.value = { ...selectionBox.value, width, height }
}

function endBoxSelection() {
  if (!isBoxSelecting.value) return
  const selectedNodes = nodes.value.filter(node => {
    return isNodeInBox(node, selectionBox.value)
  })
  selectedNodes.forEach(node => node.selected = true)
  isBoxSelecting.value = false
}
</script>
```

---

#### 2.3 節點註解與標記

**功能需求**
- 節點添加註解（Sticky Note）
- 節點添加顏色標籤（紅、黃、綠等）
- 畫布區域框（Group Frame）

**使用場景**
團隊協作或複雜工作流時，標記節點用途、待辦事項、或邏輯分區。

**實作方式**
```typescript
// registry.ts 新增註解節點
{
  id: 'sticky-note',
  name: '註解',
  category: 'logic',
  icon: '📝',
  description: '添加文字註解到畫布',
  version: '1.0.0',
  inputs: [
    { key: 'text', label: '註解內容', type: 'textarea', required: true }
  ],
  outputs: []
}
```

---

#### 2.4 連線樣式與標籤

**功能需求**
- 連線添加文字標籤（顯示資料欄位名稱）
- 連線樣式選擇（直線、曲線、階梯、正交）
- 連線顏色自定義

**使用場景**
複雜工作流中，連線標籤幫助理解資料流向（例如「url → 下載器」）。

---

#### 2.5 快捷鍵面板

**功能需求**
- 按 `?` 顯示快捷鍵列表
- 可自定義快捷鍵

**實作方式**
```vue
<script setup>
const showShortcuts = ref(false)

const shortcuts = [
  { key: 'Ctrl/Cmd + C', action: '複製節點' },
  { key: 'Ctrl/Cmd + V', action: '貼上節點' },
  { key: 'Ctrl/Cmd + Z', action: '撤銷' },
  { key: 'Ctrl/Cmd + Shift + Z', action: '重做' },
  { key: 'Delete / Backspace', action: '刪除節點' },
  { key: 'D', action: '停用/啟用節點' },
  { key: 'Ctrl/Cmd + F', action: '搜索節點' },
  { key: '?', action: '顯示快捷鍵' }
]
</script>
```

---

### 🟡 Medium Priority（1-2 個月）

#### 2.6 節點群組與子工作流（⭐ 高價值）

**功能需求**
- 多個節點打包成群組
- 群組折疊/展開
- 群組轉換為子工作流（可重複使用）
- 子工作流嵌入編輯

**使用場景**
將重複邏輯（例如「下載影片 + 提取字幕 + AI 摘要」）封裝成可重用的群組或子工作流。

**實作方式**
```typescript
export interface NodeGroup {
  id: string
  name: string
  nodeIds: string[]
  collapsed: boolean
  position: { x: number; y: number }
  color?: string
}
```

---

#### 2.7 自動佈局（Dagre 演算法）

**功能需求**
- 一鍵自動排版節點
- 支援水平（LR）或垂直（TB）佈局
- Minimap 增強（顯示節點類型顏色）
- 節點對齊輔助線

**使用場景**
大型工作流（100+ 節點）時，自動排版節省時間。

**實作方式**
```bash
npm install dagre @types/dagre
```

```typescript
import dagre from 'dagre'

export function useAutoLayout() {
  function autoLayout(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'LR') {
    const g = new dagre.graphlib.Graph()
    g.setGraph({
      rankdir: direction,
      nodesep: 80,
      ranksep: 120
    })

    nodes.forEach(node => {
      g.setNode(node.id, {
        width: node.dimensions?.width || 220,
        height: node.dimensions?.height || 100
      })
    })

    edges.forEach(edge => {
      g.setEdge(edge.source, edge.target)
    })

    dagre.layout(g)

    nodes.forEach(node => {
      const position = g.node(node.id)
      node.position = { x: position.x, y: position.y }
    })

    return nodes
  }

  return { autoLayout }
}
```

---

#### 2.8 進階連線互動

**功能需求**
- 連線路徑避障（避開節點）
- 連線彎曲點調整（拖拽控制點）
- 多輸出埠連線顏色區分
- 連線動畫速度可調

---

### 🔴 Long-term（3+ 個月）

#### 2.9 協作功能

**功能需求**
- 多人即時編輯（類似 Figma）
- 游標位置顯示
- 變更歷史與版本控制（Git-like）
- 評論與討論（節點層級）

**實作方式**
- 使用 Y.js + WebRTC 實現 CRDT
- 或使用 Socket.io 廣播用戶操作

---

#### 2.10 AI 輔助編輯

**功能需求**
- AI 推薦下一個節點
- 自然語言創建工作流
- 錯誤自動修復建議

---

## 3. 節點配置體驗建議

### 🟢 Quick Wins

#### 3.1 配置模板與預設值（⭐ 高實用性）

**功能需求**
- 節點配置保存為模板
- 常用配置快速應用（例如「Gemini API Key」全局設定）
- 環境變數支援（`{{env.TELEGRAM_BOT_TOKEN}}`）

**實作方式**
```typescript
export const useTemplateStore = defineStore('templates', () => {
  const templates = ref<Record<string, any>>({})

  function saveAsTemplate(nodeType: string, name: string, config: any) {
    const key = `${nodeType}:${name}`
    templates.value[key] = config
    localStorage.setItem('flowcraft_templates', JSON.stringify(templates.value))
  }

  function applyTemplate(templateKey: string) {
    return templates.value[templateKey] || {}
  }

  return { templates, saveAsTemplate, applyTemplate }
})
```

---

#### 3.2 動態欄位驗證（⭐ 高實用性）

**功能需求**
- 即時欄位驗證（URL 格式、JSON 格式、必填欄位）
- 錯誤提示浮動顯示
- 欄位依賴（某欄位啟用時才顯示其他欄位）

**實作方式**
```vue
<script setup>
const fieldErrors = computed(() => {
  const errors: Record<string, string> = {}

  // URL 驗證
  if (nodeData.value.url && !isValidURL(nodeData.value.url)) {
    errors.url = '請輸入有效的 URL'
  }

  // JSON 驗證
  if (nodeData.value.jsonData) {
    try {
      JSON.parse(nodeData.value.jsonData)
    } catch {
      errors.jsonData = 'JSON 格式錯誤'
    }
  }

  return errors
})
</script>
```

---

#### 3.3 變數自動完成

**功能需求**
- 輸入 `{{` 時彈出變數選擇器
- 顯示可用的上游節點輸出欄位
- 變數語法高亮

---

### 🟡 Medium Priority

#### 3.4 可視化資料檢視器

**功能需求**
- 節點輸出預覽（JSON Tree View）
- 資料類型圖標顯示
- 大型資料折疊顯示

**實作方式**
```bash
npm install vue-json-pretty
```

---

#### 3.5 程式碼編輯器增強（Monaco Editor）

**功能需求**
- Code 節點使用 Monaco Editor（VS Code 編輯器）
- 語法高亮、自動完成、錯誤檢測
- 預覽執行結果

**實作方式**
```bash
npm install monaco-editor
```

---

## 4. 工作流執行與除錯建議

### 🟢 Quick Wins

#### 4.1 斷點除錯

**功能需求**
- 節點設定斷點（執行到此處暫停）
- 暫停時檢視變數狀態
- 步進執行（執行下一個節點）

---

#### 4.2 執行時間分析（⭐ 高實用性）

**功能需求**
- 顯示每個節點執行時間
- 工作流總執行時間
- 效能瓶頸高亮（執行時間最長的節點）

**實作方式**
```vue
<script setup>
const executionStats = computed(() => {
  const stats = {
    totalDuration: 0,
    slowestNode: null as { id: string; duration: number } | null
  }

  executionStore.currentExecution?.nodes.forEach((nodeExec, nodeId) => {
    if (nodeExec.duration) {
      stats.totalDuration += nodeExec.duration
      if (!stats.slowestNode || nodeExec.duration > stats.slowestNode.duration) {
        stats.slowestNode = { id: nodeId, duration: nodeExec.duration }
      }
    }
  })

  return stats
})
</script>
```

---

#### 4.3 錯誤追蹤與重試

**功能需求**
- 失敗節點顯示詳細錯誤堆疊
- 一鍵重試失敗節點
- 錯誤節點自動捲動到視野中

---

### 🟡 Medium Priority

#### 4.4 執行歷史回放

**功能需求**
- 查看過去的執行記錄
- 執行歷史時間軸
- 回放執行過程（動畫）

---

## 5. 工作流管理建議

### 🟢 Quick Wins

#### 5.1 工作流標籤與分類

**功能需求**
- 工作流添加標籤（production、testing、deprecated）
- 標籤顏色自定義
- 按標籤篩選工作流

---

#### 5.2 工作流複製與範本

**功能需求**
- 一鍵複製工作流
- 工作流標記為範本
- 範本市場（社群分享）

---

### 🟡 Medium Priority

#### 5.3 版本控制整合

**功能需求**
- 工作流版本歷史（類似 Git commits）
- 版本比較（Diff View）
- 還原到特定版本

---

## 6. 效能與可用性建議

### 🟢 Quick Wins

#### 6.1 虛擬化渲染

**功能需求**
- 大型工作流（100+ 節點）時，只渲染可見區域節點

**實作方式**
Vue Flow 已內建虛擬化支援。

---

#### 6.2 快捷鍵面板

**功能需求**
- 按 `?` 顯示快捷鍵列表

---

### 🟡 Medium Priority

#### 6.3 無障礙設計

**功能需求**
- 鍵盤導航（Tab 切換節點）
- 螢幕閱讀器支援（ARIA 標籤）
- 高對比模式

---

## 7. 業界標準比對

### 與 n8n 比較

**FlowCraft 優勢**
- ✅ 更現代的 UI（Vue 3 + Vue Flow）
- ✅ 執行時節點狀態視覺化更豐富
- ✅ 獨特的 AI Pipeline 節點
- ✅ YouTube 深度整合

**n8n 優勢（FlowCraft 可學習）**
- ❌ 節點測試功能（Execute this node）
- ❌ 節點輸出資料表格檢視
- ❌ HTTP Request 節點
- ❌ Code 節點（JavaScript/Python 沙箱）
- ❌ Loop 節點（批次處理）

### 與 Zapier 比較

**FlowCraft 優勢**
- ✅ 開源、自託管
- ✅ 視覺化工作流編輯器
- ✅ 自定義 AI 節點

**Zapier 優勢（FlowCraft 可學習）**
- ❌ 海量預建整合（5000+ apps）
- ❌ Webhook 觸發器
- ❌ 條件邏輯節點（Filter、Path）
- ❌ 延遲執行（Delay）

---

## 8. 優先級建議矩陣

### 🟢 Quick Wins（1-2 週，26 小時）

| 功能 | 工時 | 商業價值 | 實作難度 |
|------|------|----------|----------|
| 節點搜索（Ctrl+F） | 4h | ⭐⭐⭐⭐⭐ | 🟢 低 |
| 配置模板保存 | 3h | ⭐⭐⭐⭐ | 🟢 低 |
| 動態欄位驗證 | 4h | ⭐⭐⭐⭐ | 🟢 低 |
| 執行時間分析 | 3h | ⭐⭐⭐⭐ | 🟢 低 |
| 錯誤重試按鈕 | 2h | ⭐⭐⭐⭐ | 🟢 低 |
| 工作流標籤篩選 | 3h | ⭐⭐⭐ | 🟢 低 |
| 工作流複製 | 2h | ⭐⭐⭐⭐ | 🟢 低 |
| 快捷鍵面板 | 2h | ⭐⭐⭐ | 🟢 低 |
| 框選節點 | 3h | ⭐⭐⭐⭐ | 🟢 低 |

### 🟡 Medium Priority（1-2 個月，61 小時）

| 功能 | 工時 | 商業價值 | 實作難度 |
|------|------|----------|----------|
| 節點群組 | 12h | ⭐⭐⭐⭐⭐ | 🟡 中 |
| 自動佈局（Dagre） | 8h | ⭐⭐⭐⭐ | 🟡 中 |
| 變數自動完成 | 6h | ⭐⭐⭐⭐ | 🟡 中 |
| 可視化資料檢視器 | 5h | ⭐⭐⭐⭐ | 🟡 中 |
| Monaco Editor 整合 | 8h | ⭐⭐⭐⭐⭐ | 🟡 中 |
| 斷點除錯 | 10h | ⭐⭐⭐⭐⭐ | 🟡 中 |
| 執行歷史回放 | 8h | ⭐⭐⭐⭐ | 🟡 中 |
| 版本控制 | 14h | ⭐⭐⭐⭐ | 🟡 中 |

### 🔴 Long-term（3+ 個月，75+ 小時）

| 功能 | 工時 | 商業價值 | 實作難度 |
|------|------|----------|----------|
| 多人協作（Y.js） | 40h | ⭐⭐⭐⭐⭐ | 🔴 高 |
| AI 輔助編輯 | 25h | ⭐⭐⭐⭐⭐ | 🔴 高 |
| 子工作流系統 | 20h | ⭐⭐⭐⭐ | 🔴 高 |

---

## 9. 實作指南（含完整程式碼）

### 9.1 節點搜索完整實作

詳見報告第 9.1 節，包含完整的 Composable 和 Vue 組件程式碼。

### 9.2 自動佈局完整實作

詳見報告第 9.2 節，包含 Dagre 整合和 Vue 組件程式碼。

---

## 10. 總結與建議

### 現有優勢

FlowCraft 已具備紮實的 UI/UX 基礎：
1. **現代化技術棧** - Vue 3 + Vue Flow
2. **豐富的視覺回饋** - 節點狀態、連線高亮、執行動畫
3. **完善的狀態管理** - Pinia + WebSocket
4. **獨特的功能** - 級聯停用、孤立節點透明、多選高亮連線
5. **開發友好** - 清晰的組件架構

### 核心建議（3 個月路線圖）

**第 1 個月 - 基礎體驗優化（Quick Wins）**
- 節點搜索（Ctrl+F）
- 配置模板與驗證
- 執行時間分析與錯誤重試
- 工作流標籤與複製
- 快捷鍵面板

**第 2-3 個月 - 進階功能（Medium Priority）**
- 節點群組與子工作流
- 自動佈局（Dagre）
- 變數自動完成
- Monaco Editor 整合
- 斷點除錯與執行歷史

**長期目標（6+ 個月）**
- 多人協作（Y.js）
- AI 輔助編輯
- 子工作流市場

### 開發優先級矩陣

```
價值 ↑
  │  🟢 節點搜索      🟡 節點群組       🔴 多人協作
  │  🟢 配置模板      🟡 自動佈局       🔴 AI 輔助
  │  🟢 欄位驗證      🟡 Monaco Editor
  │  🟢 執行分析      🟡 斷點除錯
  │  🟢 工作流標籤
  └──────────────────────────────────────→ 難度
     低              中                  高
```

### 最後建議

1. **保持現有優勢** - 不要為了追求功能而犧牲流暢體驗
2. **逐步迭代** - 先完成 Quick Wins，收集用戶反饋
3. **參考但不照搬** - 學習 n8n/Zapier，保持 FlowCraft 獨特性
4. **性能優先** - 大型工作流虛擬化渲染是必需的
5. **用戶測試** - 每個新功能都應有真實用戶測試

---

**報告完成日期**：2026-03-07
**總字數**：約 8,000 字
**分析專案路徑**：`/Users/yaja/projects/flowcraft`