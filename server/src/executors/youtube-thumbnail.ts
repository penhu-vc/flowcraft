/**
 * YouTube Thumbnail Downloader
 * 下載 YouTube 封面圖到本地
 */

import fs from 'fs/promises'
import path from 'path'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

type EmitFn = (event: string, data: unknown) => void

export interface YouTubeThumbnailConfig {
    input: string  // YouTube URL 或縮圖 URL
    savePath?: string  // 儲存路徑，預設 /tmp/yt-thumbnails
}

/**
 * 從 URL 提取 YouTube 影片 ID
 */
function extractVideoId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
        /youtube\.com\/embed\/([^&\n?#]+)/,
        /youtube\.com\/v\/([^&\n?#]+)/
    ]

    for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match) return match[1]
    }

    return null
}

/**
 * 判斷是否為 YouTube URL
 */
function isYouTubeUrl(input: string): boolean {
    return input.includes('youtube.com') || input.includes('youtu.be')
}

/**
 * 取得最佳畫質的縮圖 URL
 */
async function getBestThumbnailUrl(videoId: string, emit: EmitFn): Promise<string> {
    // 嘗試順序：maxresdefault > hqdefault > mqdefault > sddefault
    const qualities = [
        { name: 'maxresdefault', label: '最高畫質 (1920x1080)' },
        { name: 'hqdefault', label: '高畫質 (480x360)' },
        { name: 'mqdefault', label: '中畫質 (320x180)' },
        { name: 'sddefault', label: '標準畫質 (640x480)' }
    ]

    for (const quality of qualities) {
        const url = `https://i.ytimg.com/vi/${videoId}/${quality.name}.jpg`

        try {
            const response = await fetch(url, { method: 'HEAD' })
            if (response.ok) {
                emit('node:log', { message: `✓ 使用 ${quality.label}` })
                return url
            }
        } catch {
            continue
        }
    }

    // 降級到預設
    emit('node:log', { message: '⚠️ 無法取得高畫質縮圖，使用預設畫質' })
    return `https://i.ytimg.com/vi/${videoId}/default.jpg`
}

/**
 * 下載圖片到本地
 */
async function downloadImage(url: string, savePath: string, emit: EmitFn): Promise<string> {
    // 確保目錄存在
    await fs.mkdir(path.dirname(savePath), { recursive: true })

    emit('node:log', { message: `開始下載: ${url}` })

    // 加上 30 秒超時
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
        const response = await fetch(url, { signal: controller.signal })
        clearTimeout(timeout)

        if (!response.ok) {
            throw new Error(`下載失敗: ${response.status} ${response.statusText}`)
        }

        if (!response.body) {
            throw new Error('回應無內容')
        }

        // 使用 stream 下載
        const fileStream = createWriteStream(savePath)
        await pipeline(response.body as any, fileStream)

        emit('node:log', { message: `✓ 儲存至: ${savePath}` })

        return savePath
    } catch (error) {
        clearTimeout(timeout)
        if ((error as any).name === 'AbortError') {
            throw new Error('下載超時（30秒）')
        }
        throw error
    }
}

export async function executeYouTubeThumbnail(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ thumbnail: string; downloadPath: string; photo: string; videoId?: string }> {
    const rawInput = config.input
    const savePath = (config.savePath as string) || '/tmp/yt-thumbnails'

    // 如果 input 不是字串（上游可能傳了 null 或物件），直接輸出 null
    if (!rawInput || typeof rawInput !== 'string') {
        emit('node:log', { message: `⏭️ input 無效（${typeof rawInput}），跳過` })
        return {
            thumbnail: '',
            downloadPath: '',
            photo: '',
            videoId: undefined
        }
    }

    const input = rawInput

    emit('node:log', { message: '📸 YouTube 封面下載器' })
    emit('node:log', { message: `輸入: ${input}` })

    let thumbnailUrl: string
    let videoId: string | undefined

    // 判斷輸入類型
    if (isYouTubeUrl(input)) {
        // YouTube URL → 提取 video ID → 構建縮圖 URL
        videoId = extractVideoId(input)
        if (!videoId) {
            throw new Error('無法從 URL 提取影片 ID')
        }

        emit('node:log', { message: `✓ 影片 ID: ${videoId}` })
        thumbnailUrl = await getBestThumbnailUrl(videoId, emit)
    } else {
        // 直接的縮圖 URL
        thumbnailUrl = input
        emit('node:log', { message: '✓ 使用提供的縮圖 URL' })
    }

    emit('node:log', { message: `縮圖 URL: ${thumbnailUrl}` })

    // 產生檔案名稱
    const timestamp = Date.now()
    const filename = videoId ? `${videoId}_${timestamp}.jpg` : `thumbnail_${timestamp}.jpg`
    const fullPath = path.join(savePath as string, filename)

    // 下載圖片
    const downloadPath = await downloadImage(thumbnailUrl, fullPath, emit)

    // 檢查檔案大小
    const stats = await fs.stat(downloadPath)
    const fileSizeKB = (stats.size / 1024).toFixed(2)
    emit('node:log', { message: `✓ 檔案大小: ${fileSizeKB} KB` })

    return {
        thumbnail: thumbnailUrl,  // 縮圖 URL
        downloadPath,             // 本地路徑
        photo: downloadPath,      // 本地路徑（用於 Telegram sendPhoto）
        videoId
    }
}
