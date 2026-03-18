/**
 * YouTube Skills Cache
 * 記錄每個 YouTube 影片被不同 skills 處理的結果
 */

import fs from 'fs'

const CACHE_PATH = 'sessions/youtube-skills-history.json'

export interface SkillResult {
    skillName: string
    result: Record<string, unknown>
    timestamp: string
    executionTime?: number  // 毫秒
}

export interface YouTubeCache {
    [youtubeUrl: string]: {
        videoTitle?: string
        addedAt: string
        lastUsed: string
        skills: {
            [skillName: string]: SkillResult[]  // 陣列：記錄多個版本
        }
    }
}

// 提取 YouTube URL（標準化）
export function normalizeYouTubeUrl(url: string): string | null {
    if (!url || typeof url !== 'string') return null
    // 支援各種 YouTube URL 格式
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
    ]

    for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match) {
            return `https://www.youtube.com/watch?v=${match[1]}`
        }
    }

    return null
}

// 讀取 cache
export function loadCache(): YouTubeCache {
    if (!fs.existsSync(CACHE_PATH)) {
        return {}
    }
    try {
        return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
    } catch {
        return {}
    }
}

// 儲存 cache
export function saveCache(cache: YouTubeCache): void {
    // 確保目錄存在
    const dir = path.dirname(CACHE_PATH)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
}

// 記錄 skill 結果
export function recordSkillResult(
    youtubeUrl: string,
    skillName: string,
    result: Record<string, unknown>,
    executionTime?: number,
    videoTitle?: string
): void {
    const cache = loadCache()
    const normalizedUrl = normalizeYouTubeUrl(youtubeUrl)

    if (!normalizedUrl) {
        // 不是有效的 YouTube URL，不記錄
        return
    }

    // 初始化該影片的記錄
    if (!cache[normalizedUrl]) {
        cache[normalizedUrl] = {
            addedAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
            skills: {}
        }
    }

    // 更新 video title（如果有提供）
    if (videoTitle) {
        cache[normalizedUrl].videoTitle = videoTitle
    }

    // 記錄 skill 結果（append 新版本，不覆蓋）
    if (!cache[normalizedUrl].skills[skillName]) {
        cache[normalizedUrl].skills[skillName] = []
    }

    cache[normalizedUrl].skills[skillName].push({
        skillName,
        result,
        timestamp: new Date().toISOString(),
        executionTime
    })

    cache[normalizedUrl].lastUsed = new Date().toISOString()

    saveCache(cache)
}

// 取得 skill 所有版本（如果存在）
export function getSkillResults(
    youtubeUrl: string,
    skillName: string
): SkillResult[] | null {
    const cache = loadCache()
    const normalizedUrl = normalizeYouTubeUrl(youtubeUrl)

    if (!normalizedUrl) {
        return null
    }

    return cache[normalizedUrl]?.skills?.[skillName] || null
}

// 取得 skill 最新一個版本
export function getLatestSkillResult(
    youtubeUrl: string,
    skillName: string
): SkillResult | null {
    const results = getSkillResults(youtubeUrl, skillName)
    return results && results.length > 0 ? results[results.length - 1] : null
}

// 取得某影片的所有 skill 記錄
export function getAllSkillResults(youtubeUrl: string): Record<string, SkillResult[]> | null {
    const cache = loadCache()
    const normalizedUrl = normalizeYouTubeUrl(youtubeUrl)

    if (!normalizedUrl) {
        return null
    }

    return cache[normalizedUrl]?.skills || null
}

// 列出所有已處理的影片
export function listAllVideos(): Array<{
    url: string
    videoTitle?: string
    addedAt: string
    lastUsed: string
    skillCount: number
    skills: string[]
    totalVersions: number  // 所有 skills 的版本總數
}> {
    const cache = loadCache()

    return Object.entries(cache).map(([url, data]) => {
        const totalVersions = Object.values(data.skills).reduce(
            (sum, versions) => sum + versions.length,
            0
        )
        return {
            url,
            videoTitle: data.videoTitle,
            addedAt: data.addedAt,
            lastUsed: data.lastUsed,
            skillCount: Object.keys(data.skills).length,
            skills: Object.keys(data.skills),
            totalVersions
        }
    })
}
