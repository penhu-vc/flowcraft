import { Router } from 'express'
import { Server as SocketIO } from 'socket.io'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { executeNode } from '../executor'
import { WorkflowEngine } from '../execution/WorkflowEngine'
import { Workflow } from '../execution/types'

const WORKFLOWS_FILE = join(__dirname, '../../data/workflows.json')

export function createWorkflowRouter(io: SocketIO): Router {
    const router = Router()

    // ── Execute a single node ─────────────────────────────────────────
    router.post('/execute', async (req, res) => {
        const { nodeType, config, socketId } = req.body
        if (!nodeType) return res.status(400).json({ error: 'nodeType required' })

        const emit = (event: string, data: unknown) => {
            if (socketId) io.to(socketId).emit(event, data)
        }

        try {
            emit('node:start', { nodeType })
            const result = await executeNode(nodeType, config, emit)
            emit('node:done', { nodeType, result })
            res.json({ ok: true, result })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            emit('node:error', { nodeType, error: message })
            res.status(500).json({ ok: false, error: message })
        }
    })

    // ── Execute workflow ───────────────────────────────────────────────
    router.post('/workflow/run', async (req, res) => {
        const { workflow, socketId, nodeCache } = req.body

        if (!workflow) {
            return res.status(400).json({ error: 'workflow is required' })
        }

        const executionId = `exec-${Date.now()}`

        const emit = (event: string, data: unknown) => {
            if (socketId) {
                io.to(socketId).emit(event, data)
            }
            console.log(`[${executionId}] ${event}:`, data)
        }

        executeWorkflowAsync(workflow, executionId, emit, nodeCache || {})

        res.json({
            ok: true,
            executionId,
            message: '工作流已開始執行'
        })
    })

    // ── Get segment mining prompts ────────────────────────────────────
    router.get('/prompts/segment-mining', (_req, res) => {
        try {
            const promptsDir = join(__dirname, '..', 'executors', 'prompts')
            const systemPrompt = readFileSync(join(promptsDir, 'segment-mining-system.md'), 'utf-8')
            const template = readFileSync(join(promptsDir, 'segment-mining-template.md'), 'utf-8')

            res.json({
                ok: true,
                systemPrompt,
                template,
                combined: `${systemPrompt}\n\n${'='.repeat(80)}\n\n${template}`
            })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            res.status(500).json({ ok: false, error: message })
        }
    })

    router.get('/prompts/script-generator', (_req, res) => {
        try {
            const promptsDir = join(__dirname, '..', 'executors', 'prompts')
            const systemPrompt = readFileSync(join(promptsDir, 'script-generator-system.md'), 'utf-8')
            const template = readFileSync(join(promptsDir, 'script-generator-template.md'), 'utf-8')

            res.json({
                ok: true,
                systemPrompt,
                template,
                combined: `${systemPrompt}\n\n${'='.repeat(80)}\n\n${template}`
            })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            res.status(500).json({ ok: false, error: message })
        }
    })

    // ── Workflow Sync ─────────────────────────────────────────────────
    router.post('/workflows/sync', (req, res) => {
        try {
            const { workflows } = req.body
            if (!workflows || !Array.isArray(workflows)) {
                return res.status(400).json({ ok: false, error: 'workflows array required' })
            }

            writeFileSync(WORKFLOWS_FILE, JSON.stringify(workflows, null, 2), 'utf-8')
            res.json({ ok: true, message: 'Workflows synced to file', count: workflows.length })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            res.status(500).json({ ok: false, error: message })
        }
    })

    router.get('/workflows', (_req, res) => {
        try {
            if (!existsSync(WORKFLOWS_FILE)) {
                return res.json({ ok: true, workflows: [] })
            }

            const data = readFileSync(WORKFLOWS_FILE, 'utf-8')
            const workflows = JSON.parse(data)
            res.json({ ok: true, workflows })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            res.status(500).json({ ok: false, error: message })
        }
    })

    router.get('/workflows/:id', (req, res) => {
        try {
            if (!existsSync(WORKFLOWS_FILE)) {
                return res.status(404).json({ ok: false, error: 'Workflow not found' })
            }

            const data = readFileSync(WORKFLOWS_FILE, 'utf-8')
            const workflows = JSON.parse(data)
            const workflow = workflows.find((w: any) => w.id === req.params.id)

            if (!workflow) {
                return res.status(404).json({ ok: false, error: 'Workflow not found' })
            }

            res.json({ ok: true, workflow })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            res.status(500).json({ ok: false, error: message })
        }
    })

    return router
}

/**
 * 異步執行工作流（背景執行）
 */
async function executeWorkflowAsync(
    workflow: Workflow,
    executionId: string,
    emit: (event: string, data: unknown) => void,
    nodeCache: Record<string, any> = {}
) {
    try {
        const engine = new WorkflowEngine(workflow, executionId, emit, nodeCache)
        await engine.run()
    } catch (error) {
        console.error(`[${executionId}] Workflow execution failed:`, error)
    }
}
