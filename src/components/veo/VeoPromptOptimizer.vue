<template>
  <section class="card optimizer-card">
    <div class="card-header">
      <span class="card-title">✨ Gemini Prompt 優化器</span>
      <span class="badge badge-ai">RAG · 2-Step</span>
    </div>
    <div class="card-body">
      <div class="optimizer-mode-strip">
        <button
          v-for="item in sourceModes"
          :key="item.value"
          class="opt-mode-pill"
          :class="{ active: optimizerMode === item.value }"
          @click="optimizerMode = item.value"
        >
          <span>{{ item.icon }}</span>
          {{ item.label }}
        </button>
      </div>

      <div class="optimizer-input-row">
        <textarea
          v-model="optimizerInput"
          class="form-textarea optimizer-textarea"
          :placeholder="modePlaceholder"
        />
        <button
          class="btn btn-primary optimizer-btn"
          :disabled="optimizing || !optimizerInput.trim()"
          @click="runOptimizer"
        >
          {{ optimizing ? '分析中...' : '優化' }}
        </button>
      </div>

      <div v-if="optimizing" class="optimizer-status">
        <div class="optimizer-step" :class="{ active: optimizeStep === 1 }">
          <span class="step-dot" />
          Step 1: 分析內容，決定參考哪些 Guide 分類...
        </div>
        <div class="optimizer-step" :class="{ active: optimizeStep === 2 }">
          <span class="step-dot" />
          Step 2: 載入對應段落，Gemini 優化 Prompt...
        </div>
      </div>

      <div v-if="optimizeResult" class="optimizer-result">
        <div class="optimizer-sections">
          <span class="optimizer-sections-label">參考分類：</span>
          <span v-for="label in optimizeResult.sectionLabels" :key="label" class="section-tag">{{ label }}</span>
        </div>

        <table class="optimizer-table">
          <thead>
            <tr>
              <th>組件</th>
              <th>內容</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="comp in componentRows" :key="comp.key">
              <td class="comp-label">{{ comp.icon }} {{ comp.label }}</td>
              <td class="comp-value">{{ comp.value || '—' }}</td>
            </tr>
            <tr class="neg-row">
              <td class="comp-label">🚫 Negative</td>
              <td class="comp-value">{{ optimizeResult.negativePrompt || '—' }}</td>
            </tr>
          </tbody>
        </table>

        <div class="optimizer-full-prompt">
          <div class="full-prompt-header">
            <span class="form-label">完整 Prompt</span>
            <div class="full-prompt-actions">
              <button class="btn btn-secondary btn-sm" @click="copyFullPrompt">
                {{ copied ? '已複製' : '複製' }}
              </button>
              <button class="btn btn-primary btn-sm" @click="useOptimizedPrompt">
                套用到生成
              </button>
            </div>
          </div>
          <div class="full-prompt-text">{{ optimizeResult.fullPrompt }}</div>
        </div>
      </div>

      <p v-if="optimizeError" class="error-text">{{ optimizeError }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { API_ENDPOINTS } from '../../api/config'
import type { VeoSourceMode } from '../../api/veo'

interface SourceModeItem {
  value: VeoSourceMode
  label: string
  icon: string
}

interface OptimizeComponents {
  subject: string
  context: string
  action: string
  style: string
  camera: string
  composition: string
  ambiance: string
  audio: string
}

interface OptimizeResult {
  components: OptimizeComponents
  fullPrompt: string
  negativePrompt: string
  sections: string[]
  sectionLabels: string[]
}

const props = defineProps<{
  sourceModes: readonly SourceModeItem[]
}>()

const emit = defineEmits<{
  (e: 'apply-prompt', prompt: string, negativePrompt: string, sourceMode: VeoSourceMode): void
}>()

const optimizerInput = ref('')
const optimizerMode = ref<VeoSourceMode>('text')

const modePlaceholder = computed(() => {
  const map: Record<string, string> = {
    text: '文字生成：用文字描述想要的影片畫面，AI 會根據描述生成影片。例如：一個女生在咖啡廳看書，陽光灑進來，慢動作翻頁',
    image: '圖片生成：上傳一張圖片作為起始畫面，AI 會讓畫面動起來。描述你希望的動態效果',
    first_last: '首尾幀：提供第一幀和最後一幀的畫面描述或圖片，AI 會自動生成中間的過渡動畫',
    reference: '參考圖：上傳參考圖片，AI 會模仿其風格、色調或構圖來生成影片',
    extend: '延長影片：上傳已有的影片，AI 會自然延續內容，生成後續畫面',
  }
  return map[optimizerMode.value] || '描述你想生成的內容'
})
const optimizing = ref(false)
const optimizeStep = ref(0)
const optimizeResult = ref<OptimizeResult | null>(null)
const optimizeError = ref('')
const copied = ref(false)

const componentRows = computed(() => {
  if (!optimizeResult.value) return []
  const c = optimizeResult.value.components
  return [
    { key: 'subject', icon: '👤', label: 'Subject', value: c.subject },
    { key: 'context', icon: '🏗️', label: 'Context', value: c.context },
    { key: 'action', icon: '🎬', label: 'Action', value: c.action },
    { key: 'style', icon: '🎨', label: 'Style', value: c.style },
    { key: 'camera', icon: '📹', label: 'Camera', value: c.camera },
    { key: 'composition', icon: '🖼️', label: 'Composition', value: c.composition },
    { key: 'ambiance', icon: '💡', label: 'Ambiance', value: c.ambiance },
    { key: 'audio', icon: '🎵', label: 'Audio', value: c.audio },
  ]
})

async function runOptimizer() {
  if (!optimizerInput.value.trim()) return
  optimizing.value = true
  optimizeStep.value = 1
  optimizeError.value = ''
  optimizeResult.value = null
  copied.value = false

  try {
    const stepTimer = setTimeout(() => { optimizeStep.value = 2 }, 2000)

    const res = await fetch(API_ENDPOINTS.veoOptimizePrompt, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: optimizerInput.value.trim(), mode: optimizerMode.value })
    })

    clearTimeout(stepTimer)
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '優化失敗')

    // ── Bulletproof parsing: handle ANY format Gemini returns ──
    let comps: Record<string, string> = {}
    let fp = ''
    let neg = data.negativePrompt || ''

    // Helper: try to extract components from any string that might be JSON
    function extractFromJson(raw: string): Record<string, string> | null {
      // Strip markdown fences: ```json ... ``` or ``` ... ```
      let s = raw.replace(/^[\s\S]*?```(?:json)?\s*/i, '').replace(/```[\s\S]*$/, '')
      // If still no leading {, try finding first { to last }
      if (!s.trim().startsWith('{')) {
        const i = s.indexOf('{')
        const j = s.lastIndexOf('}')
        if (i >= 0 && j > i) s = s.slice(i, j + 1)
      }
      if (!s.trim().startsWith('{')) return null
      try {
        const parsed = JSON.parse(s)
        return parsed.components || parsed
      } catch { return null }
    }

    // Source 1: data.components from backend
    const backendComps = data.components || {}
    const backendCompsHasValues = Object.values(backendComps).some((v: unknown) => typeof v === 'string' && v.length > 0)

    // Source 2: try to parse data.fullPrompt as JSON
    const rawFp = data.fullPrompt || ''
    const fpParsed = extractFromJson(rawFp)

    // Source 3: try to parse raw result text as JSON
    const rawResult = data.rawResult || ''
    const resultParsed = rawResult ? extractFromJson(rawResult) : null

    // Pick the best components source (prefer one with actual values)
    if (backendCompsHasValues) {
      comps = backendComps
    } else if (fpParsed) {
      comps = fpParsed
      // Also extract negative prompt if present
      if ((fpParsed as any).negative) neg = (fpParsed as any).negative
    } else if (resultParsed) {
      comps = resultParsed
      if ((resultParsed as any).negative) neg = (resultParsed as any).negative
    } else {
      comps = backendComps // fallback to whatever backend gave us
    }

    // Build fullPrompt as plain text from components (ALWAYS rebuild, never trust raw JSON)
    const compKeys = ['subject', 'context', 'action', 'style', 'camera', 'composition', 'ambiance', 'audio']
    const parts = compKeys.map(k => comps[k]).filter(Boolean)
    if (parts.length > 0) {
      fp = parts.join(' ')
    } else {
      // No components found - use raw fullPrompt but strip JSON formatting
      fp = rawFp.replace(/^[\s\S]*?```(?:json)?\s*/i, '').replace(/```[\s\S]*$/, '').trim()
      if (fp.startsWith('{')) {
        // Still JSON, just show a plain version
        try {
          const p = JSON.parse(fp)
          const allVals = Object.values(p.components || p).filter((v): v is string => typeof v === 'string')
          fp = allVals.join(' ')
        } catch { /* keep as-is */ }
      }
    }

    optimizeResult.value = {
      components: comps,
      fullPrompt: fp,
      negativePrompt: neg || data.negativePrompt,
      sections: data.sections,
      sectionLabels: data.sectionLabels
    }
  } catch (err) {
    optimizeError.value = err instanceof Error ? err.message : String(err)
  } finally {
    optimizing.value = false
    optimizeStep.value = 0
  }
}

function copyFullPrompt() {
  if (!optimizeResult.value) return
  const text = optimizeResult.value.fullPrompt
    + (optimizeResult.value.negativePrompt ? `\n\nNegative prompt: ${optimizeResult.value.negativePrompt}` : '')
  navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function useOptimizedPrompt() {
  if (!optimizeResult.value) return
  emit('apply-prompt', optimizeResult.value.fullPrompt, optimizeResult.value.negativePrompt || '', optimizerMode.value)
}

// Expose for parent to call (ref optimizer from outside)
function setOptimizerState(mode: VeoSourceMode, input: string, result: OptimizeResult | null) {
  optimizerMode.value = mode
  optimizerInput.value = input
  optimizeResult.value = result
}

function triggerRefOptimizer(combined: string) {
  optimizerMode.value = 'references'
  optimizerInput.value = combined
  runOptimizer()
}

defineExpose({
  optimizerMode,
  optimizerInput,
  optimizeResult,
  optimizing,
  setOptimizerState,
  triggerRefOptimizer,
  runOptimizer,
})
</script>

<style scoped>
.optimizer-card {
  background:
    radial-gradient(circle at top right, rgba(124, 58, 237, 0.12), transparent 40%),
    var(--bg-card);
}

.optimizer-mode-strip {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.opt-mode-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.2s;
}
.opt-mode-pill:hover {
  border-color: var(--accent-purple);
  color: var(--text-primary);
}
.opt-mode-pill.active {
  background: rgba(124,58,237,0.2);
  border-color: var(--accent-purple);
  color: var(--text-primary);
}

.optimizer-input-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.optimizer-textarea {
  flex: 1;
  min-height: 64px;
  max-height: 120px;
  resize: vertical;
}

.optimizer-btn {
  white-space: nowrap;
  min-width: 80px;
  align-self: stretch;
}

.optimizer-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.03);
}

.optimizer-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.4;
  transition: opacity 0.3s;
}

.optimizer-step.active {
  opacity: 1;
  color: var(--accent-cyan);
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-secondary);
  flex-shrink: 0;
}

.optimizer-step.active .step-dot {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.optimizer-result {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.optimizer-sections {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.optimizer-sections-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-right: 4px;
}

.section-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.15);
  color: var(--accent-purple);
  border: 1px solid rgba(124, 58, 237, 0.25);
}

.optimizer-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.optimizer-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.02);
}

.optimizer-table td {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  vertical-align: top;
}

.comp-label {
  white-space: nowrap;
  font-weight: 500;
  color: var(--text-secondary);
  width: 120px;
}

.comp-value {
  color: var(--text-primary);
  line-height: 1.5;
}

.neg-row .comp-label {
  color: #fda4af;
}

.neg-row .comp-value {
  color: #fda4af;
  opacity: 0.8;
}

.optimizer-full-prompt {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  padding: 12px;
}

.full-prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.full-prompt-actions {
  display: flex;
  gap: 6px;
}

.full-prompt-text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.error-text {
  color: #fda4af;
  font-size: 12px;
  line-height: 1.5;
}
</style>
