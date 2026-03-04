/**
 * YouTube Monitor Executor
 * 監控 YouTube 頻道，返回最新影片
 */

import { getRecentVideos, extractChannelId } from '../utils/youtube-utils'

interface Channel {
    id: string
    name: string
    handle: string
    thumbnail?: string
    addedAt: string
}

type EmitFn = (event: string, data: unknown) => void

export async function executeYouTubeMonitor(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<unknown> {
    emit('node:log', { message: '🎬 YouTube Monitor 啟動' })

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
            channel_name: '',
            title: '',
            url: '',
            thumbnail: ''
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
            channel_name: '',
            title: '',
            url: '',
            thumbnail: ''
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
}
