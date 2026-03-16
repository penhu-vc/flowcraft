import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Node, Edge } from '@vue-flow/core'
import { API_ENDPOINTS } from '../api/config'

export type TriggerMode = 'fallback' | 'sequential'

export interface WorkflowMeta {
    id: string
    name: string
    description: string
    active: boolean
    createdAt: string
    updatedAt: string
    nodes: Node[]
    edges: Edge[]
    triggerMode?: TriggerMode  // 觸發器運行模式
}

const STORAGE_KEY = 'flowcraft_workflows'

function loadFromStorage(): WorkflowMeta[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

async function syncToBackend(workflows: WorkflowMeta[]) {
    try {
        await fetch(API_ENDPOINTS.workflowsSync, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflows })
        })
        console.log('[Workflow] Synced to backend')
    } catch (err) {
        console.warn('[Workflow] Failed to sync to backend:', err)
    }
}

async function loadFromBackend(): Promise<WorkflowMeta[]> {
    try {
        const response = await fetch(`${API_ENDPOINTS.workflowsSync.replace('/sync', '')}`)
        const data = await response.json()
        if (data.ok && Array.isArray(data.workflows)) {
            console.log('[Workflow] Loaded from backend:', data.workflows.length)
            return data.workflows
        }
    } catch (err) {
        console.warn('[Workflow] Failed to load from backend:', err)
    }
    return []
}

function saveToStorage(workflows: WorkflowMeta[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows))
    // 自動同步到後端
    syncToBackend(workflows)
}

export const useWorkflowStore = defineStore('workflow', () => {
    const workflows = ref<WorkflowMeta[]>(loadFromStorage())
    const currentWorkflow = ref<WorkflowMeta | null>(null)

    const activeWorkflows = computed(() => workflows.value.filter(w => w.active))

    function createWorkflow(name: string, description = '') {
        const wf: WorkflowMeta = {
            id: `wf-${Date.now()}`,
            name,
            description,
            active: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            nodes: [],
            edges: [],
        }
        workflows.value.unshift(wf)
        saveToStorage(workflows.value)
        return wf
    }

    function saveWorkflow(id: string, nodes: Node[], edges: Edge[]) {
        const wf = workflows.value.find(w => w.id === id)
        if (wf) {
            wf.nodes = nodes
            wf.edges = edges
            wf.updatedAt = new Date().toISOString()
            saveToStorage(workflows.value)
        }
    }

    function toggleActive(id: string) {
        const wf = workflows.value.find(w => w.id === id)
        if (wf) {
            wf.active = !wf.active
            saveToStorage(workflows.value)
        }
    }

    function deleteWorkflow(id: string) {
        workflows.value = workflows.value.filter(w => w.id !== id)
        saveToStorage(workflows.value)
    }

    function getWorkflow(id: string) {
        return workflows.value.find(w => w.id === id) || null
    }

    function exportWorkflow(id: string) {
        const wf = getWorkflow(id)
        if (!wf) return
        const blob = new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${wf.name.replace(/\s+/g, '_')}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    function importWorkflow(json: string) {
        try {
            const wf: WorkflowMeta = JSON.parse(json)
            wf.id = `wf-${Date.now()}`
            wf.createdAt = new Date().toISOString()
            wf.updatedAt = new Date().toISOString()
            workflows.value.unshift(wf)
            saveToStorage(workflows.value)
            return wf
        } catch {
            return null
        }
    }

    function duplicateWorkflow(id: string) {
        const original = getWorkflow(id)
        if (!original) return null

        const duplicate: WorkflowMeta = {
            id: `wf-${Date.now()}`,
            name: `${original.name} - 副本`,
            description: original.description,
            active: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            nodes: JSON.parse(JSON.stringify(original.nodes)), // Deep copy
            edges: JSON.parse(JSON.stringify(original.edges)), // Deep copy
            triggerMode: original.triggerMode
        }

        workflows.value.unshift(duplicate)
        saveToStorage(workflows.value)
        return duplicate
    }

    async function syncFromBackend() {
        const backendWorkflows = await loadFromBackend()
        if (backendWorkflows.length > 0) {
            workflows.value = backendWorkflows
            saveToStorage(workflows.value)
            console.log('[Workflow] Synced from backend')
        }
    }

    return {
        workflows,
        currentWorkflow,
        activeWorkflows,
        createWorkflow,
        saveWorkflow,
        toggleActive,
        deleteWorkflow,
        getWorkflow,
        exportWorkflow,
        importWorkflow,
        duplicateWorkflow,
        syncFromBackend,
    }
})
