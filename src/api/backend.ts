/**
 * FlowCraft Backend API
 * Calls the backend server to execute nodes.
 */

import { API_BASE_URL, API_ENDPOINTS } from './config'

export interface ExecuteResult {
    ok: boolean
    result?: unknown
    error?: string
}

/** Execute a node on the backend server */
export async function executeNode(
    nodeType: string,
    config: Record<string, unknown>,
    socketId?: string
): Promise<ExecuteResult> {
    try {
        const res = await fetch(API_ENDPOINTS.execute, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeType, config, socketId }),
        })
        return await res.json()
    } catch (err) {
        return { ok: false, error: String(err) }
    }
}

/** Check if backend is reachable */
export async function checkBackendHealth(): Promise<boolean> {
    try {
        const res = await fetch(API_ENDPOINTS.health)
        const data = await res.json()
        return data.status === 'ok'
    } catch {
        return false
    }
}

/** Trigger first-time NotebookLM Google auth */
export async function triggerNotebookLMAuth(): Promise<ExecuteResult> {
    try {
        const res = await fetch(API_ENDPOINTS.authNotebooklm, { method: 'POST' })
        return await res.json()
    } catch (err) {
        return { ok: false, error: String(err) }
    }
}
