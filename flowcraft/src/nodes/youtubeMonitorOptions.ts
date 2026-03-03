// YouTube Monitor — monitor type definitions

export const MONITOR_OPTIONS = [
    {
        value: 'new_video',
        icon: '🎬',
        label: '頻道新影片',
        description: '頻道上傳新影片時觸發（via RSS Feed，不需 API Key）',
        outputs: ['video', 'channel_name', 'title', 'url', 'thumbnail'],
    },
    {
        value: 'live_start',
        icon: '🔴',
        label: '直播開始',
        description: '頻道開始直播時觸發（via YouTube Data API v3）',
        outputs: ['video', 'channel_name', 'title', 'url', 'live_viewers'],
    },
    {
        value: 'live_end',
        icon: '⏹',
        label: '直播結束',
        description: '直播結束或轉為錄影時觸發',
        outputs: ['video', 'channel_name', 'title', 'url', 'duration'],
    },
    {
        value: 'premiere',
        icon: '🎟',
        label: '首播 / 預告影片',
        description: '頻道設定 Premiere（影片首播）時提前通知',
        outputs: ['video', 'channel_name', 'title', 'url', 'premiere_at'],
    },
    {
        value: 'playlist_update',
        icon: '📋',
        label: '播放清單更新',
        description: '指定播放清單新增影片時觸發',
        outputs: ['video', 'playlist_name', 'title', 'url', 'thumbnail'],
    },
    {
        value: 'channel_stats',
        icon: '📊',
        label: '頻道統計變化',
        description: '訂閱數、觀看數或影片數產生變化時觸發',
        outputs: ['channel_name', 'subscribers', 'views', 'video_count', 'delta'],
    },
    {
        value: 'keyword_video',
        icon: '🔍',
        label: '關鍵字新影片',
        description: '頻道中有符合關鍵字的新影片時觸發',
        outputs: ['video', 'channel_name', 'title', 'url', 'matched_keyword'],
    },
]
