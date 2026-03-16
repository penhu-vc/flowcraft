/**
 * Veo Prompt Optimizer (Two-Step)
 * Step 1: Gemini analyzes user prompt → picks relevant guide sections
 * Step 2: Load those sections → Gemini optimizes with targeted knowledge
 */

import { executeGemini } from './executors/gemini'
import { readFileSync } from 'fs'
import { join } from 'path'

const noop = () => {}

// ── Section Index ──────────────────────────────────────────
// Each section has a key, label, and line range in the guide
interface Section {
    key: string
    label: string
    startLine: number
    endLine: number
}

const SECTIONS: Section[] = [
    { key: 'audio',           label: '🎤 音訊與對話整合',          startLine: 159, endLine: 328 },
    { key: 'dialogue',        label: '💬 對話技巧（防字幕）',      startLine: 230, endLine: 328 },
    { key: 'sequence',        label: '🎬 進階序列 Prompting',      startLine: 329, endLine: 364 },
    { key: 'physics',         label: '⚙️ 進階物理模擬',            startLine: 365, endLine: 408 },
    { key: 'character',       label: '👤 角色一致性',              startLine: 409, endLine: 447 },
    { key: 'structure',       label: '🎯 8 組件專業架構',          startLine: 448, endLine: 528 },
    { key: 'cinematography',  label: '📹 專業攝影技法',            startLine: 537, endLine: 560 },
    { key: 'style',           label: '🎨 風格與類型',              startLine: 561, endLine: 582 },
    { key: 'narrative',       label: '💫 敘事與情感',              startLine: 595, endLine: 635 },
    { key: 'negative',        label: '❌ 負面 Prompt 技巧',        startLine: 636, endLine: 647 },
    { key: 'camera_movement', label: '📷 攝影機運動庫',            startLine: 648, endLine: 774 },
    { key: 'camera_position', label: '🔥 關鍵攝影機定位',          startLine: 750, endLine: 774 },
    { key: 'composition',     label: '🖼️ 進階構圖',               startLine: 775, endLine: 900 },
    { key: 'lighting',        label: '💡 專業打光',                startLine: 901, endLine: 958 },
    { key: 'selfie',          label: '🤳 自拍影片',                startLine: 959, endLine: 999 },
    { key: 'movement',        label: '🎮 動作品質控制',            startLine: 1000, endLine: 1043 },
    { key: 'templates',       label: '📋 範例模板庫',              startLine: 1044, endLine: 1180 },
    { key: 'audio_advanced',  label: '🎵 進階音訊分類',            startLine: 1186, endLine: 1282 },
    { key: 'platform',        label: '📱 平台適配（直式影片等）',    startLine: 1287, endLine: 1377 },
    { key: 'troubleshooting', label: '🛠️ 疑難排解',               startLine: 1419, endLine: 1596 },
    { key: 'meta_prompt',     label: '🤖 Meta Prompt 引擎',       startLine: 1897, endLine: 2506 },
]

const GUIDE_PATH = join(__dirname, 'veo-prompting-guide.md')
let guideLines: string[] | null = null

function loadGuide(): string[] {
    if (!guideLines) {
        guideLines = readFileSync(GUIDE_PATH, 'utf8').split('\n')
    }
    return guideLines
}

function getSectionContent(keys: string[]): string {
    const lines = loadGuide()
    const parts: string[] = []

    for (const key of keys) {
        const section = SECTIONS.find(s => s.key === key)
        if (!section) continue
        const start = Math.max(0, section.startLine - 1)
        const end = Math.min(lines.length, section.endLine)
        parts.push(`\n--- ${section.label} ---\n`)
        parts.push(lines.slice(start, end).join('\n'))
    }

    return parts.join('\n')
}

// ── Step 1: Route ──────────────────────────────────────────
const ROUTER_SYSTEM = `You are a classifier. Given a user's video description, pick which sections of the Veo 3 Prompting Guide are relevant for optimizing their prompt.

Available sections:
${SECTIONS.map(s => `- ${s.key}: ${s.label}`).join('\n')}

Rules:
- ALWAYS include "structure" (the 8-component framework is always needed)
- Pick 2-5 additional sections that are most relevant
- If the user mentions dialogue/speaking → include "dialogue"
- If the user mentions selfie/vlog → include "selfie"
- If the user mentions camera angles/movements → include "camera_movement" and/or "camera_position"
- If the user mentions lighting/mood → include "lighting"
- If the user mentions style (noir, documentary, etc.) → include "style"
- If the user mentions music/sound → include "audio" or "audio_advanced"

Output ONLY a JSON array of section keys, nothing else.
Example: ["structure", "dialogue", "lighting", "cinematography"]`

async function routeSections(userPrompt: string): Promise<string[]> {
    const { result } = await executeGemini(
        {
            prompt: userPrompt,
            systemPrompt: ROUTER_SYSTEM,
            model: 'gemini-2.5-flash',
            temperature: 0,
            maxTokens: 256
        },
        noop
    )

    try {
        // 清理可能的 markdown code block
        const cleaned = result.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
        const keys = JSON.parse(cleaned) as string[]
        // 確保 structure 在
        if (!keys.includes('structure')) keys.unshift('structure')
        return keys.filter(k => SECTIONS.some(s => s.key === k))
    } catch {
        // fallback
        return ['structure', 'cinematography', 'lighting', 'camera_position']
    }
}

// ── Step 2: Optimize ───────────────────────────────────────
const OPTIMIZER_SYSTEM = `You are a Veo 3 prompt optimization expert. Transform the user's basic description into a professional, broadcast-quality Veo 3 prompt.

Use the reference material below as your knowledge base. Apply the techniques described in it.

Critical rules you MUST follow:
1. Camera positioning: ALWAYS add "(thats where the camera is)" when specifying camera location
2. Dialogue: Use colon syntax → Character says: "dialogue" (prevents subtitles)
3. Dialogue length: Max 8 seconds of natural speech
4. Audio: ALWAYS specify expected background audio to prevent hallucinated sounds
5. Write everything in English (Veo 3 works best in English)
6. Anti-cropping: In the composition component, ALWAYS ensure the main subject is scaled to fit comfortably within the frame with generous padding on all sides. If the subject rotates, moves, or transforms, explicitly state that no part of the subject should extend beyond the frame boundaries at any point. Use phrases like "occupying no more than 60% of the frame", "with ample empty space around the subject", "ensuring no clipping or cropping during motion".
7. Negative prompt: ALWAYS include "no cropping, no clipping, no cut off edges" in the negativePrompt

You MUST output valid JSON with this exact structure:
{
  "components": {
    "subject": "detailed subject description",
    "context": "scene environment description",
    "action": "what is happening",
    "style": "visual aesthetic",
    "camera": "shot type and movement",
    "composition": "framing and visual structure",
    "ambiance": "lighting, mood, atmosphere",
    "audio": "sound design, dialogue, music"
  },
  "fullPrompt": "The complete optimized prompt as a single flowing paragraph combining all components above, ready to paste into Veo 3.",
  "negativePrompt": "no subtitles, no watermarks, ..."
}

Output ONLY the JSON, no markdown fences, no explanation.

REFERENCE MATERIAL:
`

export interface VeoOptimizeResult {
    components: {
        subject: string
        context: string
        action: string
        style: string
        camera: string
        composition: string
        ambiance: string
        audio: string
    }
    fullPrompt: string
    negativePrompt: string
    sections: string[]
    sectionLabels: string[]
}

// Mode-specific prompt hints
const MODE_HINTS: Record<string, string> = {
    text: 'This prompt will be used for TEXT-TO-VIDEO generation. Write a complete, self-contained description.',
    image: 'This prompt will be used for IMAGE-TO-VIDEO generation. The user will provide a start image. Focus on describing the MOTION, CAMERA MOVEMENT, and TRANSFORMATION that should happen to the image. Do NOT over-describe the visual appearance (the image already provides that).',
    frames: 'This prompt will be used for FIRST/LAST FRAME generation. The user will provide start and end frame images. Focus on describing the TRANSITION, MOVEMENT, and TIMING between the two frames.',
    references: 'This prompt will be used with REFERENCE IMAGES. The user will provide reference images for style/asset guidance. Write a prompt that describes the desired scene while noting that visual style will be guided by reference images.',
    extend: 'This prompt will be used to EXTEND an existing video. Focus on describing what should happen NEXT — the continuation of action, camera movement, and scene progression.',
}

export async function optimizeVeoPrompt(userPrompt: string, mode: string = 'text'): Promise<VeoOptimizeResult> {
    // Step 1: 決定要查哪些分類
    const sectionKeys = await routeSections(userPrompt)
    const sectionLabels = sectionKeys
        .map(k => SECTIONS.find(s => s.key === k)?.label)
        .filter(Boolean) as string[]

    // Step 2: 載入對應段落，讓 Gemini 優化
    const reference = getSectionContent(sectionKeys)
    const modeHint = MODE_HINTS[mode] || MODE_HINTS.text
    const systemPrompt = OPTIMIZER_SYSTEM + reference

    const { result } = await executeGemini(
        {
            prompt: `Generation mode: ${mode.toUpperCase()}\n${modeHint}\n\nOptimize this video description into a professional Veo 3 prompt:\n\n${userPrompt}`,
            systemPrompt,
            model: 'gemini-2.5-flash',
            temperature: 0.7,
            maxTokens: 3000
        },
        noop
    )

    try {
        const cleaned = result.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        return {
            components: parsed.components,
            fullPrompt: parsed.fullPrompt,
            negativePrompt: parsed.negativePrompt || '',
            sections: sectionKeys,
            sectionLabels
        }
    } catch {
        // Fallback: 如果 JSON 解析失敗，把整段當 fullPrompt
        return {
            components: {
                subject: '', context: '', action: '', style: '',
                camera: '', composition: '', ambiance: '', audio: ''
            },
            fullPrompt: result.trim(),
            negativePrompt: '',
            sections: sectionKeys,
            sectionLabels
        }
    }
}
