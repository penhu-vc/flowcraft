/**
 * FlowCraft Backend API
 * Calls the backend server (localhost:3001) to execute nodes.
 */

const BACKEND_URL = 'http://localhost:3001'

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
        const res = await fetch(`${BACKEND_URL}/api/execute`, {
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
        const res = await fetch(`${BACKEND_URL}/api/health`)
        const data = await res.json()
        return data.status === 'ok'
    } catch {
        return false
    }
}

/** Trigger first-time NotebookLM Google auth */
export async function triggerNotebookLMAuth(): Promise<ExecuteResult> {
    try {
        const res = await fetch(`${BACKEND_URL}/api/auth/notebooklm`, { method: 'POST' })
        return await res.json()
    } catch (err) {
        return { ok: false, error: String(err) }
    }
}
