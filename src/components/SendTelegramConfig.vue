<template>
  <div class="tg-config">

    <!-- ① Bot List -->
    <div class="section-header">
      🤖 Bot 帳號
      <button class="btn btn-sm btn-ghost" @click="addBot" style="margin-left:auto;">＋ 新增</button>
    </div>

    <div class="item-list" v-if="bots.length > 0">
      <div v-for="(bot, i) in bots" :key="i" class="item-row" :class="{ active: selectedBotIdx === i }">
        <div class="item-info" @click="selectedBotIdx = i">
          <div class="item-name">{{ bot.name }}</div>
          <div class="item-sub">{{ maskToken(bot.token) }}</div>
        </div>
        <button class="btn btn-ghost btn-sm btn-icon" @click="editBot(i)" title="編輯">✎</button>
        <button class="btn btn-danger btn-sm btn-icon" @click="deleteBot(i)" title="刪除">✕</button>
      </div>
    </div>
    <div v-else class="empty-state" style="padding:8px 0;">
      <span style="font-size:11px;color:var(--text-muted);">尚未設定 Bot</span>
    </div>

    <!-- Bot editor -->
    <div v-if="editingBot" class="item-editor">
      <!-- 快速貼上 BotFather 訊息 -->
      <div style="margin-bottom:8px;">
        <textarea
          class="form-input"
          v-model="botFatherMessage"
          rows="3"
          placeholder="貼上 BotFather 的完整訊息，自動提取 Token 和名稱..."
          @input="parseBotFatherMessage"
          style="font-size:11px;font-family:monospace;"
        />
        <div v-if="botParseResult" class="form-hint" :style="{ color: botParseResult.ok ? 'var(--accent-cyan)' : 'var(--orange)' }">
          {{ botParseResult.msg }}
        </div>
      </div>

      <div class="divider" style="margin:8px 0;" />

      <!-- 手動編輯 -->
      <input class="form-input" v-model="editingBot.name" placeholder="Bot 名稱（例：我的通知機器人）" style="margin-bottom:5px;" />
      <input class="form-input" v-model="editingBot.token" type="password" placeholder="Bot Token (從 BotFather 取得)" />
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="btn btn-primary btn-sm" style="flex:1" @click="saveBot">✓ 儲存</button>
        <button class="btn btn-ghost btn-sm" @click="cancelBotEdit">取消</button>
      </div>
    </div>

    <div class="divider" />

    <!-- ② Chat ID List -->
    <div class="section-header">
      💬 Chat 目標
      <button class="btn btn-sm btn-ghost" @click="addChat" style="margin-left:auto;">＋ 新增</button>
    </div>

    <div class="item-list" v-if="chats.length > 0">
      <div v-for="(chat, i) in chats" :key="i" class="item-row" :class="{ active: selectedChatIdx === i }">
        <div class="item-info" @click="selectedChatIdx = i">
          <div class="item-name">
            {{ chat.name }}
            <span v-if="chat.type === 'supergroup'" class="tag tag-super">超級群組</span>
            <span v-if="chat.thread_id" class="tag tag-topic">Topic #{{ chat.thread_id }}</span>
          </div>
          <div class="item-sub">{{ chat.chat_id }}</div>
        </div>
        <button class="btn btn-ghost btn-sm btn-icon" @click="editChat(i)" title="編輯">✎</button>
        <button class="btn btn-danger btn-sm btn-icon" @click="deleteChat(i)" title="刪除">✕</button>
      </div>
    </div>
    <div v-else class="empty-state" style="padding:8px 0;">
      <span style="font-size:11px;color:var(--text-muted);">尚未設定 Chat</span>
    </div>

    <!-- Chat editor -->
    <div v-if="editingChat" class="item-editor">
      <div class="type-toggle" style="margin-bottom:8px;">
        <button
          class="btn btn-sm"
          :class="editingChat.type === 'normal' ? 'btn-primary' : 'btn-ghost'"
          @click="editingChat.type = 'normal'"
        >一般群組 / 頻道</button>
        <button
          class="btn btn-sm"
          :class="editingChat.type === 'supergroup' ? 'btn-primary' : 'btn-ghost'"
          @click="editingChat.type = 'supergroup'"
        >超級群組 + Topic</button>
      </div>

      <template v-if="editingChat.type === 'normal'">
        <input class="form-input" v-model="editingChat.name" placeholder="名稱（例：產品通知群）" style="margin-bottom:5px;" />
        <input class="form-input" v-model="editingChat.chat_id" placeholder="Chat ID（例：-1001234567890）" />
      </template>

      <template v-else>
        <!-- Supergroup URL paste -->
        <div style="margin-bottom:5px;">
          <textarea
            class="form-input"
            v-model="subergroupUrl"
            rows="2"
            placeholder="貼上 t.me 連結（例：https://t.me/c/1234567890/456）"
            @input="parseSupergroup"
            @paste="onPasteSupergroup"
            style="font-size:11px;font-family:monospace;"
          />
          <div v-if="parseResult" class="form-hint" :style="{ color: parseResult.ok ? 'var(--accent-cyan)' : 'var(--red)' }">
            {{ parseResult.msg }}
          </div>
        </div>

        <div class="divider" style="margin:8px 0;" />

        <div style="margin-bottom:5px;">
          <div class="form-label" style="font-size:10px;">群組/頻道名稱</div>
          <input class="form-input" v-model="editingChat.name" placeholder="例：產品通知群" />
        </div>
        <div style="display:flex;gap:5px;">
          <div style="flex:1">
            <div class="form-label" style="font-size:10px;">Chat ID</div>
            <input class="form-input" v-model="editingChat.chat_id" placeholder="-1001234567890" />
          </div>
          <div style="width:90px;">
            <div class="form-label" style="font-size:10px;">Thread ID</div>
            <input class="form-input" v-model="editingChat.thread_id" placeholder="456" />
          </div>
        </div>
      </template>

      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="btn btn-primary btn-sm" style="flex:1" @click="saveChat">✓ 儲存</button>
        <button class="btn btn-ghost btn-sm" @click="editingChat=null;subergroupUrl='';parseResult=null">取消</button>
      </div>
    </div>

    <!-- ③ Message template -->
    <div class="divider" />
    <div class="form-group">
      <label class="form-label">📨 訊息模板</label>
      <textarea
        class="form-input"
        v-model="localMessage"
        rows="3"
        placeholder="{{result}} 或直接輸入訊息內容..."
      />
      <div class="form-hint">可使用 <code v-pre>{{變數名}}</code> 引用上游節點的輸出</div>
    </div>

    <div class="divider" />

    <!-- ④ Tags Management -->
    <div class="section-header">
      🏷️ 互動標籤
      <button class="btn btn-sm btn-ghost" @click="addTag" style="margin-left:auto;">＋ 新增標籤</button>
    </div>

    <div class="item-list" v-if="tags.length > 0">
      <div v-for="(tag, i) in tags" :key="i" class="item-row tag-item">
        <input
          type="checkbox"
          :checked="selectedTags.includes(tag.name)"
          @change="toggleTag(tag.name)"
          class="tag-checkbox"
        />
        <div class="item-info" style="flex:1;">
          <div class="item-name">{{ tag.name }}</div>
          <div class="item-sub">{{ tag.code }}</div>
          <div class="item-sub" style="margin-top:2px;color:var(--accent-cyan);">
            回應: {{ tag.responseMessage || '(未設定)' }}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm btn-icon" @click="editTag(i)" title="編輯">✎</button>
        <button class="btn btn-danger btn-sm btn-icon" @click="deleteTag(i)" title="刪除">✕</button>
      </div>
    </div>
    <div v-else class="empty-state" style="padding:8px 0;">
      <span style="font-size:11px;color:var(--text-muted);">尚未建立標籤</span>
    </div>

    <!-- Tag editor -->
    <div v-if="editingTag" class="item-editor">
      <input class="form-input" v-model="editingTag.name" placeholder="標籤名稱（例：已讀、重要）" style="margin-bottom:5px;" />
      <div style="margin-bottom:5px;">
        <div class="form-label" style="font-size:10px;margin-bottom:2px;">標籤代碼</div>
        <input
          class="form-input"
          v-model="editingTag.code"
          readonly
          style="font-family:monospace;font-size:10px;background:var(--bg-base);color:var(--text-muted);cursor:not-allowed;"
        />
      </div>
      <input
        class="form-input"
        v-model="editingTag.responseMessage"
        placeholder="點擊回應訊息（例：你已標記為已讀：）"
      />
      <div class="form-hint" style="font-size:10px;margin-top:4px;">
        用戶點擊此標籤後會先收到這則訊息，然後收到標籤代碼
      </div>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="btn btn-primary btn-sm" style="flex:1" @click="saveTag">✓ 儲存</button>
        <button class="btn btn-ghost btn-sm" @click="editingTag=null">取消</button>
      </div>
    </div>

    <div v-if="selectedTags.length > 0" class="tag-preview">
      <div class="form-label" style="font-size:10px;margin-bottom:4px;">已選標籤預覽：</div>
      <div class="tag-pills">
        <span v-for="tagName in selectedTags" :key="tagName" class="tag-pill">
          {{ tagName }}
        </span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">記錄資料集 ID</label>
      <select
        v-if="collectionStore.collections.length > 0"
        class="form-input"
        v-model="recordCollectionId"
      >
        <option value="">-- 不記錄 --</option>
        <option v-for="col in collectionStore.collections" :key="col.id" :value="col.id">
          {{ col.name }}
        </option>
        <option value="_custom">✏️ 手動輸入...</option>
      </select>
      <input
        v-if="collectionStore.collections.length === 0 || recordCollectionId === '_custom'"
        type="text"
        class="form-input"
        v-model="customCollectionId"
        placeholder="輸入資料集 ID（如：yt_thumbnails）"
        style="margin-top: 8px;"
      />
      <div class="form-hint">
        選填。有填寫時，按鈕點擊會記錄到資料集
      </div>
    </div>

    <div class="divider" />

    <!-- ⑤ Port Visibility -->
    <PortVisibilityEditor
      :inputs="portableInputs"
      :outputs="outputs"
      :hiddenPorts="hiddenPortsList"
      :inputOrder="inputOrderList"
      :outputOrder="outputOrderList"
      portColor="var(--accent-cyan)"
      @update="onHiddenPortsUpdate"
      @update-input-order="onInputOrderUpdate"
      @update-order="onOutputOrderUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import PortVisibilityEditor from './PortVisibilityEditor.vue'
import { useCollectionStore } from '../stores/collection'

interface Bot  { name: string; token: string }
interface Chat { name: string; chat_id: string; type: 'normal' | 'supergroup'; thread_id?: string }
interface Tag  { name: string; code: string; responseMessage: string }

const props = defineProps<{
  config: Record<string, any>
  inputs: { key: string; label: string; type: string }[]
  outputs: { key: string; label: string; type: string }[]
}>()
const emit = defineEmits<{ (e: 'update', config: Record<string, any>): void }>()

const collectionStore = useCollectionStore()

const portableInputs = computed(() =>
  props.inputs.filter(f => ['string', 'url', 'number', 'textarea', 'object'].includes(f.type))
)

// ── State ─────────────────────────────────────────────────────────
const parse = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(props.config[key] ?? 'null') ?? fallback } catch { return fallback }
}

// Cross-workflow shared Bots & Chats via localStorage
const STORAGE_KEY_BOTS = 'flowcraft_shared_bots'
const STORAGE_KEY_CHATS = 'flowcraft_shared_chats'

function loadSharedBots(): Bot[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_BOTS)
    if (stored) return JSON.parse(stored)
  } catch {}
  return parse('bots', [])
}

function loadSharedChats(): Chat[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CHATS)
    if (stored) return JSON.parse(stored)
  } catch {}
  return parse('chats', [])
}

function saveSharedBots(bots: Bot[]) {
  try {
    localStorage.setItem(STORAGE_KEY_BOTS, JSON.stringify(bots))
  } catch (e) {
    console.error('Failed to save bots to localStorage', e)
  }
}

function saveSharedChats(chats: Chat[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CHATS, JSON.stringify(chats))
  } catch (e) {
    console.error('Failed to save chats to localStorage', e)
  }
}

const bots  = ref<Bot[]>(loadSharedBots())
const chats = ref<Chat[]>(loadSharedChats())
const selectedBotIdx  = ref<number>(parse('selectedBotIdx', 0))
const selectedChatIdx = ref<number>(parse('selectedChatIdx', 0))
const localMessage    = ref<string>(props.config.message ?? '{{result}}')
const hiddenPortsList = ref<string[]>(parse('hiddenPorts', []))
const inputOrderList  = ref<string[]>(parse('inputOrder', []))
const outputOrderList = ref<string[]>(parse('outputOrder', []))

// Tags
const tags = ref<Tag[]>(parse('tags', []))
const selectedTags = ref<string[]>(parse('selectedTags', []))
const recordCollectionId = ref<string>(props.config.recordCollectionId ?? '')
const customCollectionId = ref<string>('')

// 如果 recordCollectionId 不在 collections 中，表示是自訂的
if (recordCollectionId.value && !collectionStore.collections.find(c => c.id === recordCollectionId.value)) {
  customCollectionId.value = recordCollectionId.value
  recordCollectionId.value = '_custom'
}

const editingBot  = ref<Bot | null>(null)
const editingBotIdx = ref(-1)
const editingChat = ref<Chat | null>(null)
const editingChatIdx = ref(-1)
const subergroupUrl = ref('')
const parseResult = ref<{ ok: boolean; msg: string } | null>(null)
const botFatherMessage = ref('')
const botParseResult = ref<{ ok: boolean; msg: string } | null>(null)

const editingTag = ref<Tag | null>(null)
const editingTagIdx = ref(-1)

// Collection name for display
const recordCollectionName = computed(() => {
  const col = collectionStore.collections.find(c => c.id === recordCollectionId.value)
  return col?.name ?? '資料集'
})

// ── Bot management ─────────────────────────────────────────────────
function maskToken(t: string) { return t.length > 8 ? t.slice(0, 6) + '...' + t.slice(-4) : '••••••' }
function addBot()  { editingBot.value = { name: '', token: '' }; editingBotIdx.value = -1; botFatherMessage.value = ''; botParseResult.value = null }
function editBot(i: number) { editingBot.value = { ...bots.value[i] }; editingBotIdx.value = i; botFatherMessage.value = ''; botParseResult.value = null }
function deleteBot(i: number) {
  bots.value.splice(i, 1)
  if (selectedBotIdx.value >= bots.value.length) selectedBotIdx.value = 0
  saveSharedBots(bots.value)
}
function saveBot() {
  if (!editingBot.value) return
  if (editingBotIdx.value === -1) { bots.value.push({ ...editingBot.value }); selectedBotIdx.value = bots.value.length - 1 }
  else bots.value[editingBotIdx.value] = { ...editingBot.value }
  saveSharedBots(bots.value)
  cancelBotEdit()
}
function cancelBotEdit() {
  editingBot.value = null
  botFatherMessage.value = ''
  botParseResult.value = null
}

// ── BotFather message parser ───────────────────────────────────────
function parseBotFatherMessage() {
  const text = botFatherMessage.value.trim()
  if (!text || !editingBot.value) { botParseResult.value = null; return }

  // 提取 Bot URL: t.me/bot_username
  const botUrlMatch = text.match(/t\.me\/(\w+)/)
  // 提取 Token: 數字:英數字_-
  const tokenMatch = text.match(/(\d+:[A-Za-z0-9_-]+)/)

  if (tokenMatch) {
    editingBot.value.token = tokenMatch[1]
    if (botUrlMatch) {
      editingBot.value.name = botUrlMatch[1]
      botParseResult.value = { ok: true, msg: `✓ 已提取 Bot: ${botUrlMatch[1]}` }
    } else {
      botParseResult.value = { ok: true, msg: '✓ 已提取 Token（請手動輸入名稱）' }
    }
  } else {
    botParseResult.value = { ok: false, msg: '未找到有效的 Token，請確認訊息格式' }
  }
}

// ── Chat management ────────────────────────────────────────────────
function addChat()  { editingChat.value = { name: '', chat_id: '', type: 'normal' }; editingChatIdx.value = -1 }
function editChat(i: number) { editingChat.value = { ...chats.value[i] }; editingChatIdx.value = i; subergroupUrl.value = ''; parseResult.value = null }
function deleteChat(i: number) {
  chats.value.splice(i, 1)
  if (selectedChatIdx.value >= chats.value.length) selectedChatIdx.value = 0
  saveSharedChats(chats.value)
}
function saveChat() {
  if (!editingChat.value) return
  if (editingChatIdx.value === -1) { chats.value.push({ ...editingChat.value }); selectedChatIdx.value = chats.value.length - 1 }
  else chats.value[editingChatIdx.value] = { ...editingChat.value }
  saveSharedChats(chats.value)
  editingChat.value = null; subergroupUrl.value = ''; parseResult.value = null
}

// ── Supergroup URL parser ──────────────────────────────────────────
function onPasteSupergroup(e: ClipboardEvent) {
  // 延遲執行，確保 v-model 已更新
  setTimeout(() => parseSupergroup(), 0)
}

function parseSupergroup() {
  const url = subergroupUrl.value.trim()
  if (!url || !editingChat.value) { parseResult.value = null; return }

  // t.me/c/NUMERIC_ID/THREAD_ID  (private supergroup)
  const privateMatch = url.match(/t\.me\/c\/(\d+)(?:\/(\d+))?/)
  if (privateMatch) {
    const chatId = `-100${privateMatch[1]}`
    const threadId = privateMatch[2] ?? ''

    editingChat.value.chat_id = chatId
    editingChat.value.thread_id = threadId

    // 自動建議名稱（如果還沒填）
    if (!editingChat.value.name) {
      editingChat.value.name = threadId
        ? `私人群組 (Topic ${threadId})`
        : `私人群組 ${chatId.slice(-6)}`
    }

    parseResult.value = {
      ok: true,
      msg: `✓ Chat ID: ${chatId}${threadId ? ` | Thread: ${threadId}` : ''} | 請手動輸入群組名稱`
    }
    return
  }

  // t.me/USERNAME/THREAD_ID  (public group)
  const publicMatch = url.match(/t\.me\/([\w]+)(?:\/(\d+))?/)
  if (publicMatch) {
    const username = publicMatch[1]
    const threadId = publicMatch[2] ?? ''

    editingChat.value.chat_id = `@${username}`
    editingChat.value.thread_id = threadId

    // 自動填入名稱
    if (!editingChat.value.name) {
      editingChat.value.name = threadId
        ? `${username} (Topic ${threadId})`
        : username
    }

    parseResult.value = {
      ok: true,
      msg: `✓ 公開群組: @${username}${threadId ? ` | Thread: ${threadId}` : ''}`
    }
    return
  }

  parseResult.value = { ok: false, msg: '無法識別連結格式，請確認是 t.me/... 的連結' }
}

// ── Tag management ─────────────────────────────────────────────────
function generateTagCode(): string {
  // 生成 yaja_ + base16 代碼
  const randomBytes = new Uint8Array(8)
  crypto.getRandomValues(randomBytes)
  const hex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `yaja_${hex}`
}

function addTag() {
  editingTag.value = { name: '', code: generateTagCode(), responseMessage: '你點擊了標籤：' }
  editingTagIdx.value = -1
}

function editTag(i: number) {
  editingTag.value = { ...tags.value[i] }
  editingTagIdx.value = i
}

function deleteTag(i: number) {
  const tagName = tags.value[i].name
  tags.value.splice(i, 1)
  // 從選中列表移除
  selectedTags.value = selectedTags.value.filter(t => t !== tagName)
}

function saveTag() {
  if (!editingTag.value || !editingTag.value.name.trim()) return

  if (editingTagIdx.value === -1) {
    // 新增
    tags.value.push({ ...editingTag.value })
  } else {
    // 編輯
    const oldName = tags.value[editingTagIdx.value].name
    tags.value[editingTagIdx.value] = { ...editingTag.value }

    // 更新選中列表中的名稱
    const idx = selectedTags.value.indexOf(oldName)
    if (idx !== -1) {
      selectedTags.value[idx] = editingTag.value.name
    }
  }

  editingTag.value = null
}

function toggleTag(tagName: string) {
  const idx = selectedTags.value.indexOf(tagName)
  if (idx === -1) {
    selectedTags.value.push(tagName)
  } else {
    selectedTags.value.splice(idx, 1)
  }
}

// ── Port visibility ────────────────────────────────────────────────
function onHiddenPortsUpdate(hp: string[]) { hiddenPortsList.value = hp }
function onInputOrderUpdate(order: string[]) { inputOrderList.value = order }
function onOutputOrderUpdate(order: string[]) { outputOrderList.value = order }

// ── Emit ──────────────────────────────────────────────────────────
function emitUpdate() {
  // 如果選擇「手動輸入」，使用 customCollectionId；否則使用 recordCollectionId
  const finalCollectionId = recordCollectionId.value === '_custom'
    ? customCollectionId.value
    : recordCollectionId.value

  emit('update', {
    bots: JSON.stringify(bots.value),
    chats: JSON.stringify(chats.value),
    selectedBotIdx: selectedBotIdx.value,
    selectedChatIdx: selectedChatIdx.value,
    message: localMessage.value,
    hiddenPorts: JSON.stringify(hiddenPortsList.value),
    inputOrder: JSON.stringify(inputOrderList.value),
    outputOrder: JSON.stringify(outputOrderList.value),
    tags: JSON.stringify(tags.value),
    selectedTags: JSON.stringify(selectedTags.value),
    recordCollectionId: finalCollectionId,
  })
}
watch([bots, chats, selectedBotIdx, selectedChatIdx, localMessage, hiddenPortsList, inputOrderList, outputOrderList, tags, selectedTags, recordCollectionId, customCollectionId], emitUpdate, { deep: true })
</script>

<style scoped>
.tg-config { display: flex; flex-direction: column; }
.section-header {
  display: flex; align-items: center;
  font-size: 11px; font-weight: 600; color: var(--text-secondary);
  margin-bottom: 8px;
}
.item-list { display: flex; flex-direction: column; gap: 3px; margin-bottom: 4px; }
.item-row {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px;
  background: var(--bg-base); border: 1px solid var(--border);
  border-radius: var(--radius-sm); transition: var(--transition);
  cursor: pointer;
}
.item-row:hover { border-color: var(--border-hover); }
.item-row.active { border-color: var(--accent-cyan); background: var(--accent-cyan)0d; }
.item-info { flex: 1; min-width: 0; }
.item-name { font-size: 11px; font-weight: 500; color: var(--text-primary); display:flex;align-items:center;gap:4px;flex-wrap:wrap; }
.item-sub  { font-size: 9px; color: var(--text-muted); font-family: monospace; }
.tag { font-size: 9px; padding: 1px 5px; border-radius: 8px; font-weight: 600; }
.tag-super { background: var(--accent-purple)22; color: var(--accent-purple); }
.tag-topic { background: var(--accent-cyan)22; color: var(--accent-cyan); }
.item-editor {
  background: var(--bg-base); border: 1px solid var(--border-hover);
  border-radius: var(--radius-md); padding: 10px; margin-bottom: 6px;
}
.type-toggle { display: flex; gap: 5px; }
.tag-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tag-checkbox {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.tag-preview {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-base);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.tag-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tag-pill {
  display: inline-block;
  padding: 4px 10px;
  background: var(--accent-cyan)22;
  color: var(--accent-cyan);
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}
</style>
