import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Node, Edge } from '@vue-flow/core'

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
        await fetch('http://localhost:3001/api/workflows/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflows })
        })
        console.log('[Workflow] Synced to backend')
    } catch (err) {
        console.warn('[Workflow] Failed to sync to backend:', err)
    }
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
    }
})
