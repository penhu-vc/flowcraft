/**
 * YouTube Monitor Executor
 * 監控 YouTube 頻道，返回最新影片
 */

import { getRecentVideos, extractChannelId } from '../utils/youtube-utils'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'

interface Channel {
    id: string
    name: string
    handle: string
    thumbnail?: string
    addedAt: string
}

type EmitFn = (event: string, data: unknown) => void

// State 檔案路徑（記住已處理的影片）
// 使用 __dirname 確保路徑正確：從 src/executors/ 往上兩層到 server/，再進入 data/
const STATE_FILE = join(__dirname, '..', '..', 'data', 'youtube-monitor-state.json')
const LOCK_FILE = join(__dirname, '..', '..', 'data', 'youtube-monitor-state.lock')

// 檔案鎖：嘗試獲取鎖（最多重試 10 次，每次等待 100ms）
async function acquireLock(emit: EmitFn): Promise<boolean> {
    const maxRetries = 10
    for (let i = 0; i < maxRetries; i++) {
        try {
            // 嘗試建立鎖檔案（exclusive flag 確保原子性）
            writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' })
            return true
        } catch (error) {
            // 鎖檔案已存在，等待後重試
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 100))
            } else {
                emit('node:log', { message: '⚠️ 無法獲取檔案鎖（可能有其他執行中的監控）' })
                return false
            }
        }
    }
    return false
}

// 釋放鎖
function releaseLock(): void {
    try {
        if (existsSync(LOCK_FILE)) {
            unlinkSync(LOCK_FILE)
        }
    } catch (error) {
        // 忽略釋放鎖失敗的錯誤
    }
}

// 讀取上次處理的影片 ID
function getLastProcessedVideoId(): string | null {
    try {
        if (existsSync(STATE_FILE)) {
            const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
            return state.lastVideoId || null
        }
    } catch (error) {
        // ignore
    }
    return null
}

// 儲存已處理的影片 ID
function saveLastProcessedVideoId(videoId: string, emit: EmitFn): void {
    try {
        // 確保 data 目錄存在
        const dataDir = dirname(STATE_FILE)
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true })
        }

        writeFileSync(STATE_FILE, JSON.stringify({ lastVideoId: videoId, updatedAt: new Date().toISOString() }))
        emit('node:log', { message: `💾 已儲存 state: ${videoId} (${STATE_FILE})` })
    } catch (error) {
        emit('node:log', { message: `⚠️ 儲存 state 失敗: ${error}` })
    }
}

export async function executeYouTubeMonitor(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<unknown> {
    emit('node:log', { message: '🎬 YouTube Monitor 啟動' })

    // 獲取檔案鎖
    const hasLock = await acquireLock(emit)
    if (!hasLock) {
        throw new Error('無法獲取檔案鎖，請稍後重試')
    }

    try {
        // 讀取上次處理的影片 ID
        const lastProcessedVideoId = getLastProcessedVideoId()
        if (lastProcessedVideoId) {
            emit('node:log', { message: `📌 上次處理: ${lastProcessedVideoId}` })
        }

    // 解析頻道列表
    const channelsJson = config.channels as string || '[]'
    let channels: Channel[] = []

    try {
        channels = JSON.parse(channelsJson)
    } catch (error) {
        emit('node:log', { message: '❌ 解析頻道列表失敗' })
        throw new Error('頻道列表格式錯誤')
    }

    if (channels.length === 0) {
        emit('node:log', { message: '⚠️ 沒有設定監控頻道' })
        return {
            video: null,
            channel_name: null,
            title: null,
            url: null,
            thumbnail: null,
            duration: null,
            subscribers: null
        }
    }

    emit('node:log', { message: `📡 監控 ${channels.length} 個頻道` })

    // 監控類型
    const monitorType = config.monitorType as string || 'new_video'
    emit('node:log', { message: `監控類型: ${monitorType}` })

    // 檢查每個頻道的最新影片
    const allVideos: Array<{
        video: any
        channelName: string
        channelId: string
    }> = []

    for (const channel of channels) {
        try {
            emit('node:log', { message: `檢查頻道: ${channel.name}` })

            let channelId = channel.id

            // 如果是 @handle 格式，需要轉換成 channel ID
            if (channelId.startsWith('@')) {
                emit('node:log', { message: `⚙️ 轉換 handle: ${channelId}` })

                // 從 thumbnail URL 提取 video ID，再獲取 channel ID
                if (channel.thumbnail) {
                    const videoIdMatch = channel.thumbnail.match(/\/vi\/([^\/]+)\//)
                    if (videoIdMatch) {
                        const videoUrl = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`
                        const extractedChannelId = await extractChannelId(videoUrl)
                        if (extractedChannelId) {
                            channelId = extractedChannelId
                            emit('node:log', { message: `✅ 轉換成功: ${channelId}` })
                        } else {
                            emit('node:log', { message: `⚠️ 無法轉換 handle，跳過此頻道` })
                            continue
                        }
                    }
                } else {
                    emit('node:log', { message: `⚠️ 缺少 thumbnail，無法轉換 handle` })
                    continue
                }
            }

            const videos = await getRecentVideos(channelId)

            if (videos.length > 0) {
                const latestVideo = videos[0]
                allVideos.push({
                    video: latestVideo,
                    channelName: channel.name,
                    channelId: channelId
                })
                emit('node:log', { message: `✅ ${channel.name}: ${latestVideo.title}` })
            } else {
                emit('node:log', { message: `⚪ ${channel.name}: 沒有影片` })
            }
        } catch (error: any) {
            emit('node:log', { message: `⚠️ ${channel.name}: ${error.message}` })
        }
    }

    if (allVideos.length === 0) {
        emit('node:log', { message: '⚠️ 所有頻道都沒有找到影片' })
        return {
            video: null,
            channel_name: null,
            title: null,
            url: null,
            thumbnail: null,
            duration: null,
            subscribers: null
        }
    }

    // 返回最新的影片（按發布時間排序）
    allVideos.sort((a, b) => {
        const timeA = new Date(a.video.publishedAt).getTime()
        const timeB = new Date(b.video.publishedAt).getTime()
        return timeB - timeA
    })

    const latest = allVideos[0]
    const video = latest.video

    emit('node:log', { message: `🎯 最新影片: ${video.title}` })

    // 檢查是否是新影片
    if (video.videoId === lastProcessedVideoId) {
        emit('node:log', { message: '⏸️ 此影片已處理過，沒有新影片' })
        return {
            video: null,
            channel_name: null,
            title: null,
            url: null,
            thumbnail: null,
            duration: null,      // 修正：改為 null，讓 hasTriggerContent() 正確判斷為空
            subscribers: null    // 修正：改為 null
        }
    }

    // 儲存新影片 ID
    emit('node:log', { message: `✨ 發現新影片！ID: ${video.videoId}` })
    saveLastProcessedVideoId(video.videoId, emit)

    // 獲取縮圖 URL
    const thumbnailUrl = `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`

        return {
            video: {
                videoId: video.videoId,
                title: video.title,
                url: video.url,
                publishedAt: video.publishedAt,
                channelName: latest.channelName,
                channelId: latest.channelId
            },
            channel_name: latest.channelName,
            title: video.title,
            url: video.url,
            thumbnail: thumbnailUrl,
            duration: 0,  // RSS feed 不提供時長
            subscribers: 0  // RSS feed 不提供訂閱數
        }
    } finally {
        // 釋放檔案鎖
        releaseLock()
    }
}
