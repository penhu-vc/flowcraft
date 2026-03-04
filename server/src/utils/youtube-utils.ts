/**
 * YouTube 工具函數
 * 處理頻道 ID 提取和 RSS feed 解析
 */

interface Video {
    videoId: string
    title: string
    url: string
    publishedAt: string
}

/**
 * 從影片 URL 提取影片 ID
 */
function extractVideoId(url: string): string | null {
    if (!url || typeof url !== 'string') return null
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
 * 從影片頁面 HTML 提取 channel ID（備用方案）
 */
async function getChannelIdFromVideo(videoId: string): Promise<string | null> {
    try {
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`)
        const html = await response.text()

        // 從 HTML 中提取 channel ID
        const match = html.match(/"channelId":"([^"]+)"/)
        if (match) return match[1]

        return null
    } catch {
        return null
    }
}

/**
 * 從各種 URL 格式提取 channel ID
 */
export async function extractChannelId(url: string): Promise<string | null> {
    if (!url || typeof url !== 'string') return null
    // 1. Channel ID 格式：youtube.com/channel/UCxxxxxx
    const channelIdMatch = url.match(/youtube\.com\/channel\/([^\/\?&]+)/)
    if (channelIdMatch) return channelIdMatch[1]

    // 2. Handle 格式：youtube.com/@username
    const handleMatch = url.match(/youtube\.com\/@([^\/\?&]+)/)
    if (handleMatch) {
        // 需要透過影片或頁面抓取實際的 channel ID
        // 這裡先嘗試獲取該頻道的 RSS，看是否直接可用
        const handle = handleMatch[1]
        // RSS feed 不支援 @handle，需要轉換成 channel ID
        // 暫時返回 null，讓後續邏輯處理
        return null
    }

    // 3. 自訂 URL 格式：youtube.com/c/customname 或 youtube.com/user/username
    const customMatch = url.match(/youtube\.com\/(?:c|user)\/([^\/\?&]+)/)
    if (customMatch) {
        // 需要從頁面抓取 channel ID
        return null
    }

    // 4. 影片 URL：從影片提取 channel ID
    const videoId = extractVideoId(url)
    if (videoId) {
        return await getChannelIdFromVideo(videoId)
    }

    return null
}

/**
 * 從 RSS Feed 獲取頻道最近影片
 */
export async function getRecentVideos(channelId: string): Promise<Video[]> {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`

    const response = await fetch(rssUrl)
    if (!response.ok) {
        throw new Error(`無法獲取 RSS feed: ${response.status} ${response.statusText}`)
    }

    const xmlText = await response.text()

    // 簡單的 XML 解析（不使用外部套件）
    const videos: Video[] = []
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
    const entries = xmlText.match(entryRegex) || []

    for (const entry of entries.slice(0, 5)) {
        const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)
        const titleMatch = entry.match(/<title>([^<]+)<\/title>/)
        const publishedMatch = entry.match(/<published>([^<]+)<\/published>/)

        if (videoIdMatch && titleMatch && publishedMatch) {
            videos.push({
                videoId: videoIdMatch[1],
                title: titleMatch[1],
                url: `https://www.youtube.com/watch?v=${videoIdMatch[1]}`,
                publishedAt: publishedMatch[1]
            })
        }
    }

    return videos
}

/**
 * 從任意 YouTube URL 獲取頻道最近影片
 */
export async function getVideosFromUrl(url: string): Promise<Video[]> {
    if (!url || typeof url !== 'string') return []
    // 先嘗試直接用 URL 作為 channel ID（處理已知的 channel ID）
    const directChannelMatch = url.match(/(?:channel_id=|\/channel\/)([^\/\?&]+)/)
    if (directChannelMatch) {
        return await getRecentVideos(directChannelMatch[1])
    }

    // 提取 channel ID
    const channelId = await extractChannelId(url)
    if (!channelId) {
        throw new Error('無法從 URL 提取頻道 ID（請使用頻道 URL，例如 youtube.com/channel/UCxxxxxx）')
    }

    return await getRecentVideos(channelId)
}
