/**
 * Nano Banana Pro Prompt Optimizer (Two-Step)
 * Step 1: Gemini analyzes user prompt → picks relevant optimization areas
 * Step 2: Gemini optimizes with targeted image-generation knowledge
 */

import { executeGemini } from './executors/gemini'

const noop = () => {}

// ── Image-specific optimization areas ──
interface ImageSection {
  key: string
  label: string
  knowledge: string
}

const IMAGE_SECTIONS: ImageSection[] = [
  {
    key: 'subject',
    label: '👤 主體描述',
    knowledge: `
- Be specific about the subject: age, expression, posture, clothing, accessories
- For people: describe ethnicity, hair, body type, facial features
- For objects: describe material, texture, color, condition, scale
- Use concrete nouns over abstract ones: "a weathered oak desk" > "a desk"
- Include spatial relationships: "standing in front of", "partially obscured by"
`,
  },
  {
    key: 'composition',
    label: '🖼️ 構圖與取景',
    knowledge: `
- Specify shot type: extreme close-up, close-up, medium shot, full body, wide shot, aerial view
- Mention perspective: eye-level, low angle (hero shot), high angle (bird's eye), Dutch angle
- Describe framing: rule of thirds, centered, symmetrical, leading lines, frame within frame
- Depth: foreground/middleground/background elements, depth of field (shallow DoF, deep focus)
- Lens: 85mm portrait, 35mm street, 200mm telephoto compression, fisheye distortion, tilt-shift
`,
  },
  {
    key: 'lighting',
    label: '💡 光線與打光',
    knowledge: `
- Natural: golden hour, blue hour, overcast soft light, harsh midday sun, dappled light through trees
- Studio: Rembrandt lighting, butterfly/paramount lighting, split lighting, rim/backlight, three-point lighting
- Dramatic: chiaroscuro, silhouette, high-key (bright, minimal shadows), low-key (dark, deep shadows)
- Color temperature: warm tungsten, cool daylight, neon glow, candlelight, moonlight
- Quality: soft diffused, hard direct, volumetric (god rays), caustics
`,
  },
  {
    key: 'style',
    label: '🎨 藝術風格',
    knowledge: `
- Photography styles: editorial, fashion, documentary, street, fine art, product, food
- Art movements: impressionism, art nouveau, pop art, surrealism, minimalism, brutalism
- Medium: oil painting, watercolor, pencil sketch, digital art, 3D render, vector illustration
- Reference artists/photographers for style guidance (e.g., "in the style of Annie Leibovitz")
- Film stock: Kodak Portra 400 (warm skin tones), Fuji Velvia (saturated), Ilford HP5 (B&W grain)
`,
  },
  {
    key: 'color',
    label: '🎨 色彩與調性',
    knowledge: `
- Color palette: monochromatic, complementary, analogous, triadic, pastel, muted, vibrant, desaturated
- Mood through color: warm tones for comfort, cool tones for calm/melancholy, high saturation for energy
- Specific color mentions: "teal and orange color grade", "dusty rose and sage green"
- Color processing: cross-processed, bleach bypass, vintage faded, HDR, film noir
`,
  },
  {
    key: 'context',
    label: '🌍 場景與環境',
    knowledge: `
- Setting: interior/exterior, urban/rural, era/time period, weather, season
- Atmosphere: foggy, rainy, dusty, smoky, steamy, hazy, clear
- Time of day affects everything: dawn, morning, noon, afternoon, dusk, night
- Environmental details: reflections, puddles, falling leaves, snow, particles in air
- Architecture/landscape specifics: "Tokyo neon alley", "Tuscan hillside", "brutalist concrete"
`,
  },
  {
    key: 'details',
    label: '🔍 細節與質感',
    knowledge: `
- Texture: smooth, rough, glossy, matte, metallic, organic, crystalline, fabric weave
- Surface details: water droplets, dust particles, scratches, patina, reflections
- Material: silk, leather, marble, wood grain, glass, ceramic, concrete
- Resolution keywords: highly detailed, intricate, sharp focus, 8K UHD, photorealistic
- Imperfections for realism: film grain, lens flare, chromatic aberration, bokeh
`,
  },
  {
    key: 'mood',
    label: '✨ 情緒與氛圍',
    knowledge: `
- Emotional tone: serene, dramatic, mysterious, whimsical, melancholic, euphoric, eerie
- Narrative hint: suggest a story or moment ("the instant before the storm breaks")
- Sensory: evoke temperature, sound, smell through visual cues
- Cultural references: "Wes Anderson aesthetic", "Studio Ghibli atmosphere", "cyberpunk noir"
`,
  },
  {
    key: 'text_render',
    label: '📝 圖片內文字',
    knowledge: `
- Nano Banana Pro excels at text rendering in images
- Wrap text in quotes: 'A sign that reads "OPEN 24 HOURS"'
- Specify font style: handwritten, serif, sans-serif, neon, chalk, graffiti
- Specify placement: "text centered at the top", "small text in bottom right corner"
- For multilingual text, specify the language explicitly
- Keep text short (1-5 words) for best accuracy
`,
  },
]

// ── Step 1: Route ──
const ROUTER_SYSTEM = `You are a classifier. Given a user's image description, pick which optimization areas are relevant.

Available areas:
${IMAGE_SECTIONS.map((s) => `- ${s.key}: ${s.label}`).join('\n')}

Rules:
- ALWAYS include "subject" (the main subject always needs optimization)
- Pick 2-5 additional areas that are most relevant
- If the user mentions people/portraits → include "subject", "lighting", "composition"
- If the user mentions a specific look/aesthetic → include "style"
- If the user mentions colors → include "color"
- If the user mentions text in the image → include "text_render"
- If the user mentions environment/location → include "context"
- If the user mentions mood/feeling → include "mood"

Output ONLY a JSON array of section keys, nothing else.
Example: ["subject", "composition", "lighting", "style"]`

async function routeSections(userPrompt: string): Promise<string[]> {
  const { result } = await executeGemini(
    {
      prompt: userPrompt,
      systemPrompt: ROUTER_SYSTEM,
      model: 'gemini-2.5-flash',
      temperature: 0,
      maxTokens: 256,
    },
    noop
  )

  try {
    const cleaned = (result || '').replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    const keys = JSON.parse(cleaned) as string[]
    if (!keys.includes('subject')) keys.unshift('subject')
    return keys.filter((k) => IMAGE_SECTIONS.some((s) => s.key === k))
  } catch {
    return ['subject', 'composition', 'lighting', 'style']
  }
}

// ── Step 2: Optimize ──
const OPTIMIZER_SYSTEM = `You are a Nano Banana Pro (Gemini Image) prompt optimization expert. Transform the user's basic description into a professional, high-quality image generation prompt.

Use the reference material below as your knowledge base. Apply the techniques described in it.

Critical rules:
1. Write everything in English (Gemini image gen works best in English)
2. Be specific and concrete — avoid vague descriptions
3. Front-load the most important details (subject first, then style/mood)
4. Include technical photography terms when appropriate
5. For text in images, wrap in double quotes
6. Do NOT describe motion or animation — this is for STILL images only
7. Do NOT mention camera movement — only static camera properties (lens, angle)
8. Negative instructions should be woven into the prompt naturally (e.g., "without watermarks, no text overlays")

You MUST output valid JSON with this exact structure:
{
  "components": {
    "subject": "detailed subject description",
    "context": "scene/environment description",
    "style": "visual aesthetic / art style / medium",
    "composition": "framing, perspective, lens",
    "lighting": "light sources, quality, color temperature",
    "color": "color palette, tonal range",
    "details": "textures, materials, fine details",
    "mood": "emotional tone, atmosphere"
  },
  "fullPrompt": "The complete optimized prompt as a single flowing paragraph combining all relevant components, ready to use with Nano Banana Pro.",
  "negativeHints": "things to avoid, woven into the prompt or noted separately"
}

Output ONLY the JSON, no markdown fences, no explanation.

REFERENCE MATERIAL:
`

const MODE_HINTS: Record<string, string> = {
  text: 'This prompt is for TEXT-TO-IMAGE generation. Write a complete, vivid description of the desired image.',
  edit: 'This prompt is for IMAGE EDITING. The user has uploaded an image and wants to modify it. Focus on describing the specific CHANGES to make, not the entire image. Be precise about what to add, remove, or change.',
  reference:
    'This prompt is used with REFERENCE IMAGES. The user has provided AI-described aspects from reference photos (e.g. facial features, hairstyle, skin tone, body type, clothing, pose, background, lighting, composition, color). Merge all described aspects into a single cohesive prompt that captures the subject and scene faithfully. The visual style and composition should be influenced by the reference images. Preserve specific physical details (facial features, hair, skin tone, body type) exactly as described.',
}

export interface NanoOptimizeResult {
  components: {
    subject: string
    context: string
    style: string
    composition: string
    lighting: string
    color: string
    details: string
    mood: string
  }
  fullPrompt: string
  negativeHints: string
  sections: string[]
  sectionLabels: string[]
}

export async function optimizeNanoPrompt(userPrompt: string, mode: string = 'text'): Promise<NanoOptimizeResult> {
  // Step 1: route
  const sectionKeys = await routeSections(userPrompt)
  const sectionLabels = sectionKeys
    .map((k) => IMAGE_SECTIONS.find((s) => s.key === k)?.label)
    .filter(Boolean) as string[]

  // Step 2: build reference from matched sections
  const reference = sectionKeys
    .map((key) => {
      const section = IMAGE_SECTIONS.find((s) => s.key === key)
      if (!section) return ''
      return `\n--- ${section.label} ---\n${section.knowledge}`
    })
    .join('\n')

  const modeHint = MODE_HINTS[mode] || MODE_HINTS.text
  const systemPrompt = OPTIMIZER_SYSTEM + reference

  const { result } = await executeGemini(
    {
      prompt: `Generation mode: ${mode.toUpperCase()}\n${modeHint}\n\nOptimize this image description into a professional Nano Banana Pro prompt:\n\n${userPrompt}`,
      systemPrompt,
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxTokens: 3000,
    },
    noop
  )

  const parseJson = (raw: string | undefined) => {
    if (!raw) return null
    // Try cleaning markdown fences
    let cleaned = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    try { return JSON.parse(cleaned) } catch {}
    // Try extracting first { ... } block
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) } catch {}
    }
    return null
  }

  const parsed = parseJson(result)
  if (parsed?.fullPrompt) {
    return {
      components: parsed.components || {},
      fullPrompt: parsed.fullPrompt,
      negativeHints: parsed.negativeHints || '',
      sections: sectionKeys,
      sectionLabels,
    }
  }

  return {
    components: {
      subject: '',
      context: '',
      style: '',
      composition: '',
      lighting: '',
      color: '',
      details: '',
      mood: '',
    },
    fullPrompt: (result || '').trim(),
    negativeHints: '',
    sections: sectionKeys,
    sectionLabels,
  }
}
