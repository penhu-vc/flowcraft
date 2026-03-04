/**
 * YouTube Recent Videos Executor
 * 從 YouTube 頻道最近影片中選擇一支
 */

type EmitFn = (event: string, data: unknown) => void

export interface YouTubeRecentVideosConfig {
    channelUrl: string          // 頻道 URL 或影片 URL
    videos?: string             // JSON string of Video[]
    selectedVideoIndex?: number // 選中的影片索引
}

interface Video {
    videoId: string
    title: string
    url: string
    publishedAt: string
}

export async function executeYouTubeRecentVideos(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ url: string; videoId: string; title: string; publishedAt: string }> {
    const { videos, selectedVideoIndex = 0 } = config as unknown as YouTubeRecentVideosConfig

    emit('node:log', { message: '📹 YouTube 最近影片選擇器' })

    if (!videos) {
        throw new Error('未選擇影片（請在節點設定中選擇影片）')
    }

    try {
        const videoList: Video[] = JSON.parse(videos)
        const selectedVideo = videoList[selectedVideoIndex]

        if (!selectedVideo) {
            throw new Error(`未找到選中的影片 (index: ${selectedVideoIndex})`)
        }

        emit('node:log', { message: `✓ 已選擇: ${selectedVideo.title}` })
        emit('node:log', { message: `發布日期: ${new Date(selectedVideo.publishedAt).toLocaleDateString('zh-TW')}` })

        return {
            url: selectedVideo.url,
            videoId: selectedVideo.videoId,
            title: selectedVideo.title,
            publishedAt: selectedVideo.publishedAt
        }
    } catch (err) {
        throw new Error(`解析影片資料失敗: ${err instanceof Error ? err.message : String(err)}`)
    }
}
