<template>
  <Transition name="ai-panel-slide">
    <div v-if="show" class="ai-chat-panel">
      <!-- Header -->
      <div class="ai-panel-header">
        <div class="ai-panel-title">
          <span class="ai-panel-icon">🤖</span>
          <span>AI 助理</span>
          <span class="ai-panel-badge">Beta</span>
        </div>
        <button class="ai-close-btn" @click="$emit('close')" title="關閉">✕</button>
      </div>

      <!-- Messages -->
      <div class="ai-messages" ref="messagesRef">
        <!-- Welcome message -->
        <div v-if="messages.length === 0" class="ai-welcome">
          <div class="ai-welcome-icon">🤖</div>
          <div class="ai-welcome-title">AI 工作流助理</div>
          <div class="ai-welcome-desc">描述你想要的工作流，我來幫你建立！</div>
          <div class="ai-welcome-examples">
            <div
              v-for="example in welcomeExamples"
              :key="example"
              class="ai-welcome-example"
              @click="fillInput(example)"
            >{{ example }}</div>
          </div>
        </div>

        <!-- Message list -->
        <template v-for="msg in messages" :key="msg.id">
          <!-- User message -->
          <div v-if="msg.type === 'user'" class="ai-msg ai-msg-user">
            <div class="ai-bubble ai-bubble-user">{{ msg.content }}</div>
          </div>

          <!-- AI message -->
          <div v-else-if="msg.type === 'ai'" class="ai-msg ai-msg-ai">
            <div class="ai-avatar">🤖</div>
            <div class="ai-msg-content">
              <div v-if="msg.content" class="ai-bubble ai-bubble-ai">{{ msg.content }}</div>

              <!-- Action preview card -->
              <div v-if="msg.action" class="ai-action-card">
                <div class="ai-action-header">
                  <span class="ai-action-icon">⚡</span>
                  <span class="ai-action-title">{{ msg.action.title }}</span>
                </div>
                <div class="ai-action-preview">
                  <div v-if="msg.action.nodes?.length" class="ai-action-section">
                    <div class="ai-action-label">新增節點</div>
                    <div class="ai-action-items">
                      <span
                        v-for="node in msg.action.nodes"
                        :key="node.id"
                        class="ai-action-chip"
                      >{{ node.icon || '▸' }} {{ node.label }}</span>
                    </div>
                  </div>
                  <div v-if="msg.action.edges?.length" class="ai-action-section">
                    <div class="ai-action-label">建立連線</div>
                    <div class="ai-action-items">
                      <span class="ai-action-chip">🔗 {{ msg.action.edges.length }} 條連線</span>
                    </div>
                  </div>
                </div>
                <div v-if="!msg.action.applied" class="ai-action-buttons">
                  <button class="ai-action-btn ai-action-confirm" @click="applyAction(msg)">✅ 執行</button>
                  <button class="ai-action-btn ai-action-cancel" @click="cancelAction(msg)">❌ 取消</button>
                </div>
                <div v-else class="ai-action-applied">
                  <span>✅ 已套用</span>
                </div>
              </div>
            </div>
          </div>

          <!-- System message -->
          <div v-else-if="msg.type === 'system'" class="ai-msg ai-msg-system">
            <span class="ai-system-dot"></span>
            {{ msg.content }}
          </div>
        </template>

        <!-- Typing indicator -->
        <div v-if="isTyping" class="ai-msg ai-msg-ai">
          <div class="ai-avatar">🤖</div>
          <div class="ai-bubble ai-bubble-ai ai-typing">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="ai-quick-actions">
        <button
          v-for="action in quickActions"
          :key="action.id"
          class="ai-quick-chip"
          :disabled="isTyping"
          @click="runQuickAction(action)"
        >{{ action.label }}</button>
      </div>

      <!-- Input area -->
      <div class="ai-input-area">
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="ai-input"
          placeholder="描述工作流，或問我任何問題..."
          rows="1"
          @keydown="onInputKeydown"
          @input="autoResize"
        ></textarea>
        <button
          class="ai-send-btn"
          :disabled="!inputText.trim() || isTyping"
          @click="sendMessage"
          title="送出 (Enter)"
        >
          <span v-if="!isTyping">↑</span>
          <span v-else class="ai-sending-spinner"></span>
        </button>
      </div>
      <div class="ai-input-hint">Enter 送出 · Shift+Enter 換行</div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { Node, Edge } from '@vue-flow/core'

// ── Props & Emits ────────────────────────────────────────────
const props = defineProps<{
  show: boolean
  nodes: Node[]
  edges: Edge[]
}>()

const emit = defineEmits<{
  'close': []
  'apply-action': [action: AIAction]
}>()

// ── Types ────────────────────────────────────────────────────
interface AIAction {
  title: string
  nodes?: Array<{ id: string; type: string; label: string; icon?: string; position?: { x: number; y: number } }>
  edges?: Array<{ source: string; target: string }>
  applied?: boolean
}

interface ChatMessage {
  id: string
  type: 'user' | 'ai' | 'system'
  content: string
  action?: AIAction
  timestamp: number
}

// ── State ────────────────────────────────────────────────────
const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const isTyping = ref(false)
const messagesRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

const welcomeExamples = [
  '建立一個 YouTube 影片下載後自動上傳的流程',
  '幫我設計一個每天定時執行的 AI 摘要工作流',
  '建立條件分支，根據結果走不同路徑',
]

const quickActions = [
  { id: 'suggest', label: '📋 建議下一步' },
  { id: 'auto-connect', label: '🔧 自動連線' },
  { id: 'analyze', label: '📊 分析工作流' },
]

// ── Helpers ──────────────────────────────────────────────────
function genId(): string {
  return Math.random().toString(36).slice(2, 9)
}

function addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
  const full: ChatMessage = { ...msg, id: genId(), timestamp: Date.now() }
  messages.value.push(full)
  scrollToBottom()
  return full
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

function fillInput(text: string) {
  inputText.value = text
  nextTick(() => inputRef.value?.focus())
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
}

function resetInputHeight() {
  if (inputRef.value) {
    inputRef.value.style.height = 'auto'
  }
}

// ── Keyboard ─────────────────────────────────────────────────
function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// ── API Calls ────────────────────────────────────────────────
async function callAI(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`/api/workflow-api/ai/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`AI API error: ${res.status}`)
  return res.json()
}

// ── Send Message ─────────────────────────────────────────────
async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isTyping.value) return

  inputText.value = ''
  resetInputHeight()

  addMessage({ type: 'user', content: text })
  isTyping.value = true

  try {
    // Decide endpoint based on content
    let endpoint = 'parse'
    const lower = text.toLowerCase()
    if (lower.includes('建立') || lower.includes('建') || lower.includes('create') || lower.includes('build')) {
      endpoint = 'build'
    } else if (lower.includes('建議') || lower.includes('suggest') || lower.includes('下一步')) {
      endpoint = 'suggest'
    }

    const payload: Record<string, unknown> = {
      prompt: text,
      currentNodes: props.nodes.map(n => ({ id: n.id, type: n.data?.nodeType, label: n.data?.label })),
      currentEdges: props.edges.map(e => ({ source: e.source, target: e.target })),
    }

    const data = await callAI(endpoint, payload) as Record<string, unknown>

    // Build response message
    const aiMsg = addMessage({
      type: 'ai',
      content: (data.explanation as string) || (data.message as string) || '',
      action: data.action ? (data.action as AIAction) : undefined,
    })

    // If the response has nodes/edges to add, attach them
    if (data.nodes || data.edges) {
      const existingMsg = messages.value.find(m => m.id === aiMsg.id)
      if (existingMsg) {
        existingMsg.action = {
          title: '建議的工作流變更',
          nodes: (data.nodes as AIAction['nodes']) || [],
          edges: (data.edges as AIAction['edges']) || [],
        }
      }
    }
  } catch (err) {
    addMessage({
      type: 'ai',
      content: `抱歉，目前無法連接 AI 服務。請確認後端服務是否正在運行。\n\n錯誤：${err instanceof Error ? err.message : String(err)}`,
    })
  } finally {
    isTyping.value = false
    scrollToBottom()
  }
}

// ── Quick Actions ────────────────────────────────────────────
async function runQuickAction(action: { id: string; label: string }) {
  if (isTyping.value) return

  isTyping.value = true

  if (action.id === 'auto-connect') {
    // Local operation — no API call
    handleAutoConnect()
    isTyping.value = false
    return
  }

  const messages_map: Record<string, string> = {
    suggest: '請建議我的工作流下一步應該加什麼節點',
    analyze: '請分析並描述目前的工作流做了什麼事',
  }

  const userText = messages_map[action.id] || action.label
  addMessage({ type: 'user', content: userText })

  try {
    const endpoint = action.id === 'suggest' ? 'suggest' : 'parse'
    const data = await callAI(endpoint, {
      prompt: userText,
      currentNodes: props.nodes.map(n => ({ id: n.id, type: n.data?.nodeType, label: n.data?.label })),
      currentEdges: props.edges.map(e => ({ source: e.source, target: e.target })),
    }) as Record<string, unknown>

    addMessage({
      type: 'ai',
      content: (data.explanation as string) || (data.message as string) || '已完成分析。',
      action: data.action ? (data.action as AIAction) : undefined,
    })
  } catch {
    addMessage({
      type: 'ai',
      content: '無法取得 AI 回應，請確認後端服務正在運行。',
    })
  } finally {
    isTyping.value = false
    scrollToBottom()
  }
}

function handleAutoConnect() {
  const nodeIds = props.nodes.map(n => n.id)
  const connectedIds = new Set([
    ...props.edges.map(e => e.source),
    ...props.edges.map(e => e.target),
  ])
  const unconnected = nodeIds.filter(id => !connectedIds.has(id))

  if (unconnected.length < 2) {
    addMessage({ type: 'system', content: '所有節點已連線，無需自動連線。' })
    return
  }

  // Emit an action to connect unlinked nodes sequentially
  const newEdges = []
  for (let i = 0; i < unconnected.length - 1; i++) {
    newEdges.push({ source: unconnected[i], target: unconnected[i + 1] })
  }

  const action: AIAction = {
    title: `自動連線 ${unconnected.length} 個未連接節點`,
    nodes: [],
    edges: newEdges,
  }

  addMessage({
    type: 'ai',
    content: `發現 ${unconnected.length} 個未連接的節點，建議按順序連線：`,
    action,
  })
}

// ── Apply / Cancel Actions ───────────────────────────────────
function applyAction(msg: ChatMessage) {
  if (!msg.action) return
  msg.action.applied = true
  emit('apply-action', msg.action)
  addMessage({ type: 'system', content: `✅ 已套用：${msg.action.title}` })
}

function cancelAction(msg: ChatMessage) {
  if (!msg.action) return
  msg.action.applied = true // mark so buttons hide
  addMessage({ type: 'system', content: '已取消操作。' })
}

// ── Auto-scroll when panel opens ─────────────────────────────
watch(() => props.show, (val) => {
  if (val) {
    nextTick(() => {
      scrollToBottom()
      inputRef.value?.focus()
    })
  }
})
</script>

<style scoped>
/* ── Panel Shell ────────────────────────────────────────────── */
.ai-chat-panel {
  position: fixed;
  top: 56px; /* below toolbar */
  right: 0;
  width: 380px;
  height: calc(100vh - 56px);
  background: rgba(19, 19, 31, 0.96);
  backdrop-filter: blur(16px);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  z-index: 200;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
}

/* ── Slide animation ────────────────────────────────────────── */
.ai-panel-slide-enter-active,
.ai-panel-slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.28s ease;
}
.ai-panel-slide-enter-from,
.ai-panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* ── Header ─────────────────────────────────────────────────── */
.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  background: rgba(22, 27, 46, 0.8);
}
.ai-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.ai-panel-icon { font-size: 18px; }
.ai-panel-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 99px;
  background: rgba(124, 58, 237, 0.25);
  color: #a78bfa;
  border: 1px solid rgba(124, 58, 237, 0.4);
  font-weight: 500;
  letter-spacing: 0.5px;
}
.ai-close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
  line-height: 1;
}
.ai-close-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

/* ── Messages area ──────────────────────────────────────────── */
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scroll-behavior: smooth;
}

/* ── Welcome screen ─────────────────────────────────────────── */
.ai-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
}
.ai-welcome-icon { font-size: 36px; margin-bottom: 4px; }
.ai-welcome-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.ai-welcome-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.ai-welcome-examples {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  margin-top: 4px;
}
.ai-welcome-example {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.ai-welcome-example:hover {
  background: rgba(124, 58, 237, 0.12);
  border-color: rgba(124, 58, 237, 0.35);
  color: var(--text-primary);
}

/* ── Message rows ───────────────────────────────────────────── */
.ai-msg {
  display: flex;
  gap: 8px;
  max-width: 100%;
  animation: ai-msg-in 0.2s ease;
}
@keyframes ai-msg-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}
.ai-msg-user {
  justify-content: flex-end;
}
.ai-msg-ai {
  justify-content: flex-start;
  align-items: flex-start;
}
.ai-msg-system {
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-muted);
  padding: 2px 0;
}
.ai-system-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

/* ── Avatar ─────────────────────────────────────────────────── */
.ai-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(124, 58, 237, 0.2);
  border: 1px solid rgba(124, 58, 237, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 2px;
}

/* ── Bubbles ────────────────────────────────────────────────── */
.ai-bubble {
  border-radius: 12px;
  padding: 9px 13px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-bubble-user {
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff;
  border-radius: 12px 4px 12px 12px;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
  max-width: calc(100% - 16px);
}
.ai-bubble-ai {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  border-radius: 4px 12px 12px 12px;
}

/* ── AI message content (bubble + action card stacked) ───────── */
.ai-msg-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

/* ── Typing indicator ───────────────────────────────────────── */
.ai-typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 14px;
}
.ai-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  display: inline-block;
  animation: ai-dot-bounce 1.2s ease-in-out infinite;
}
.ai-typing span:nth-child(1) { animation-delay: 0s; }
.ai-typing span:nth-child(2) { animation-delay: 0.2s; }
.ai-typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes ai-dot-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30%           { transform: translateY(-6px); opacity: 1; }
}

/* ── Action preview card ────────────────────────────────────── */
.ai-action-card {
  background: rgba(124, 58, 237, 0.08);
  border: 1px solid rgba(124, 58, 237, 0.25);
  border-radius: 10px;
  overflow: hidden;
  font-size: 12.5px;
}
.ai-action-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(124, 58, 237, 0.15);
  border-bottom: 1px solid rgba(124, 58, 237, 0.2);
  font-weight: 600;
  color: #c4b5fd;
}
.ai-action-icon { font-size: 13px; }
.ai-action-title { font-size: 12.5px; }
.ai-action-preview {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ai-action-section { display: flex; flex-direction: column; gap: 4px; }
.ai-action-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}
.ai-action-items {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.ai-action-chip {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11.5px;
  color: var(--text-secondary);
}
.ai-action-buttons {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid rgba(124, 58, 237, 0.15);
}
.ai-action-btn {
  flex: 1;
  padding: 6px 0;
  border-radius: 6px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
}
.ai-action-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
.ai-action-confirm {
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
}
.ai-action-cancel {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}
.ai-action-applied {
  padding: 6px 12px;
  border-top: 1px solid rgba(16, 185, 129, 0.15);
  font-size: 12px;
  color: #34d399;
  text-align: center;
}

/* ── Quick Actions ──────────────────────────────────────────── */
.ai-quick-actions {
  padding: 8px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.ai-quick-chip {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 99px;
  padding: 5px 11px;
  font-size: 11.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}
.ai-quick-chip:hover:not(:disabled) {
  background: rgba(124, 58, 237, 0.15);
  border-color: rgba(124, 58, 237, 0.4);
  color: var(--text-primary);
}
.ai-quick-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Input area ─────────────────────────────────────────────── */
.ai-input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}
.ai-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  padding: 9px 12px;
  outline: none;
  resize: none;
  line-height: 1.5;
  max-height: 140px;
  overflow-y: auto;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ai-input::placeholder { color: var(--text-muted); }
.ai-input:focus {
  border-color: rgba(124, 58, 237, 0.5);
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
}
.ai-send-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: white;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: filter 0.15s, transform 0.1s;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.35);
}
.ai-send-btn:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
.ai-send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

/* Sending spinner */
.ai-sending-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Hint ───────────────────────────────────────────────────── */
.ai-input-hint {
  font-size: 10.5px;
  color: var(--text-muted);
  text-align: center;
  padding: 0 12px 8px;
  flex-shrink: 0;
}

/* ── Responsive: small screens → full width overlay ─────────── */
@media (max-width: 600px) {
  .ai-chat-panel {
    width: 100%;
    left: 0;
  }
}
</style>
