<template>
  <Transition name="slide-right">
    <div v-if="selectedNodeId" class="props-panel">
      <div class="props-header">
        <div>
          <div style="font-size:11px;color:var(--text-muted);">設定節點</div>
          <div class="props-title">{{ selectedDef?.icon }} {{ selectedDef?.name }}</div>
        </div>
        <button class="btn btn-icon btn-secondary" @click="$emit('close')">✕</button>
      </div>
      <div class="props-body">
        <div v-if="!selectedDef" style="color:var(--text-muted);font-size:13px;">未知節點類型</div>
        <template v-else>
          <!-- Custom config component (e.g. YouTubeMonitorConfig) -->
          <component
            v-if="customConfigComponent"
            :is="customConfigComponent"
            :config="nodeData"
            :inputs="selectedDef.inputs"
            :outputs="selectedDef.outputs"
            :nodeId="selectedNodeId"
            :nodes="nodes"
            :edges="edges"
            @update="onCustomConfigUpdate"
          />
          <!-- Generic config renderer -->
          <template v-else>
            <div v-if="!selectedDef.inputs || selectedDef.inputs.length === 0" style="padding:12px;color:var(--text-muted);font-size:13px;">
              此節點無需設定參數
            </div>
            <div v-else class="form-group" v-for="field in selectedDef.inputs" :key="field.key" style="margin-bottom:14px;">
              <label class="form-label">
                {{ field.label }} <span v-if="field.required" style="color:var(--red);">*</span>
              </label>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;" v-if="field.description">{{ field.description }}</div>
              <textarea v-if="field.type === 'textarea'" class="form-textarea" v-model="nodeData[field.key]" :placeholder="field.placeholder" @blur="updateNodeConfig" />
              <select v-else-if="field.type === 'select'" class="form-select" v-model="nodeData[field.key]" @change="updateNodeConfig">
                <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <input v-else class="form-input" :type="field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'" v-model="nodeData[field.key]" :placeholder="field.placeholder" @blur="updateNodeConfig" />
            </div>
            <!-- 一鍵複製指令（script-generator 專用） -->
            <div v-if="selectedDef?.id === 'script-generator'" style="margin-bottom:14px;">
              <button class="btn btn-secondary btn-sm" style="width:100%;" @click="copyScriptGeneratorPrompt">
                {{ copyPromptLabel }}
              </button>
            </div>
            <div class="divider" />
            <!-- Port visibility for generic nodes -->
            <PortVisibilityEditor
              :inputs="portableInputs"
              :outputs="selectedDef.outputs"
              :hiddenPorts="hiddenPortsFromConfig"
              :inputOrder="inputOrderFromConfig"
              :outputOrder="outputOrderFromConfig"
              portColor="var(--accent-cyan)"
              @update="onGenericHiddenPortsUpdate"
              @update-input-order="onInputOrderUpdate"
              @update-order="onOutputOrderUpdate"
            />
          </template>

          <!-- 快取開關（所有節點都有） -->
          <div class="divider" />
          <div class="cache-control">
            <div class="cache-header">
              <span>⚡ 使用快取結果</span>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="nodeData.useCachedResult"
                  :disabled="!hasCache"
                  @change="updateNodeConfig"
                />
                <span class="slider"></span>
              </label>
            </div>
            <div class="cache-hint">
              <template v-if="hasCache">
                ✅ 有快取（{{ cacheAge }}）
              </template>
              <template v-else>
                ⚪ 無快取（需先執行一次）
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getNodeDef } from '../../nodes/registry'
import PortVisibilityEditor from '../PortVisibilityEditor.vue'
import YouTubeMonitorConfig from '../YouTubeMonitorConfig.vue'
import YouTubeRecentVideosConfig from '../YouTubeRecentVideosConfig.vue'
import NotebookLMConfig from '../NotebookLMConfig.vue'
import SendTelegramConfig from '../SendTelegramConfig.vue'
import SegmentMiningConfig from '../SegmentMiningConfig.vue'
import BulletPointReferenceConfig from '../BulletPointReferenceConfig.vue'
import WriteCollectionConfig from '../WriteCollectionConfig.vue'
import ExecutionLoggerConfig from '../ExecutionLoggerConfig.vue'
import { API_ENDPOINTS } from '../../api/config'
import type { Node, Edge } from '@vue-flow/core'

// Map of customConfig name -> component
const CUSTOM_CONFIG_MAP: Record<string, any> = {
  YouTubeMonitorConfig,
  YouTubeRecentVideosConfig,
  NotebookLMConfig,
  SendTelegramConfig,
  SegmentMiningConfig,
  BulletPointReferenceConfig,
  WriteCollectionConfig,
  ExecutionLoggerConfig,
}

const props = defineProps<{
  selectedNodeId: string | null
  nodes: Node[]
  edges: Edge[]
  hasCache: boolean
  cacheAge: string
}>()

const emit = defineEmits<{
  'close': []
  'update-config': [nodeId: string, config: Record<string, any>]
  'custom-config-update': [config: Record<string, any>]
}>()

const nodeData = ref<Record<string, any>>({})

const selectedDef = computed(() => {
  const node = props.nodes.find(n => n.id === props.selectedNodeId)
  return node ? getNodeDef(node.data.nodeType) : null
})

const customConfigComponent = computed(() => {
  const name = selectedDef.value?.customConfig
  return name ? CUSTOM_CONFIG_MAP[name] : null
})

// Compute hiddenPorts from generic nodeData for PortVisibilityEditor
const hiddenPortsFromConfig = computed<string[]>(() => {
  try { return JSON.parse(nodeData.value.hiddenPorts ?? '[]') } catch { return [] }
})

// Compute inputOrder from generic nodeData for PortVisibilityEditor
const inputOrderFromConfig = computed<string[]>(() => {
  try { return JSON.parse(nodeData.value.inputOrder ?? '[]') } catch { return [] }
})

// Compute outputOrder from generic nodeData for PortVisibilityEditor
const outputOrderFromConfig = computed<string[]>(() => {
  try { return JSON.parse(nodeData.value.outputOrder ?? '[]') } catch { return [] }
})

// Input ports that can appear as connection handles (no password / select types)
const portableInputs = computed(() =>
  (selectedDef.value?.inputs || []).filter(f =>
    ['string', 'url', 'number', 'textarea', 'object'].includes(f.type)
  )
)

// 一鍵複製指令（script-generator）
const copyPromptLabel = ref('📋 一鍵複製指令')
async function copyScriptGeneratorPrompt() {
  try {
    copyPromptLabel.value = '⏳ 載入中...'
    const res = await fetch(API_ENDPOINTS.promptsScriptGenerator)
    const data = await res.json()
    if (!data.ok) throw new Error(data.error)
    await navigator.clipboard.writeText(data.combined)
    copyPromptLabel.value = '✅ 已複製！'
    setTimeout(() => { copyPromptLabel.value = '📋 一鍵複製指令' }, 2000)
  } catch (err) {
    copyPromptLabel.value = '❌ 複製失敗'
    setTimeout(() => { copyPromptLabel.value = '📋 一鍵複製指令' }, 2000)
  }
}

function onGenericHiddenPortsUpdate(hp: string[]) {
  nodeData.value = { ...nodeData.value, hiddenPorts: JSON.stringify(hp) }
  updateNodeConfig()
}

function onInputOrderUpdate(order: string[]) {
  nodeData.value = { ...nodeData.value, inputOrder: JSON.stringify(order) }
  updateNodeConfig()
}

function onOutputOrderUpdate(order: string[]) {
  nodeData.value = { ...nodeData.value, outputOrder: JSON.stringify(order) }
  updateNodeConfig()
}

function onCustomConfigUpdate(newConfig: Record<string, any>) {
  nodeData.value = newConfig
  emit('custom-config-update', newConfig)
}

function updateNodeConfig() {
  if (!props.selectedNodeId) return
  emit('update-config', props.selectedNodeId, { ...nodeData.value })
}

// Expose method to set nodeData from parent (when node is clicked)
function setNodeData(data: Record<string, any>) {
  nodeData.value = data
}

// Expose nodeData for parent to read
function getNodeData(): Record<string, any> {
  return nodeData.value
}

defineExpose({ setNodeData, getNodeData, nodeData })
</script>

<style scoped>
.props-panel {
  width: 280px; flex-shrink: 0;
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.props-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.props-title { font-size: 14px; font-weight: 600; }
.props-body { flex: 1; overflow-y: auto; padding: 16px; }

.slide-right-enter-active, .slide-right-leave-active { transition: all 0.25s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); opacity: 0; }

/* Cache control */
.cache-control {
  padding: 12px;
  background: var(--bg-elevated);
  border-radius: 6px;
}
.cache-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.cache-hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* Toggle switch */
.switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-card);
  border: 1.5px solid var(--border);
  transition: 0.3s;
  border-radius: 20px;
}
.slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text-muted);
  transition: 0.3s;
  border-radius: 50%;
}
input:checked + .slider {
  background-color: rgba(0, 255, 0, 0.2);
  border-color: lime;
}
input:checked + .slider:before {
  transform: translateX(16px);
  background-color: lime;
}
input:disabled + .slider {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
