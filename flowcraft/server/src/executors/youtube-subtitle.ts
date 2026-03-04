/**
 * YouTube Subtitle Extractor
 * 使用多重 fallback 機制提取 YouTube 字幕（含自動生成）
 * 輸出：純文字字幕（無時間戳）
 */

type EmitFn = (event: string, data: unknown) => void

export interface YouTubeSubtitleConfig {
    url: string
    language?: string  // 語言代碼，預設 'en'
}

/**
 * 超時包裝器：如果 Promise 超過指定時間，自動 reject
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
        )
    ])
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
 * 方法 1: youtube-transcript-plus
 */
async function tryMethod1(videoId: string, language: string, emit: EmitFn): Promise<string | null> {
    try {
        emit('node:log', { message: '🔍 嘗試方法 1: youtube-transcript-plus' })
        const { fetchTranscript } = await import('youtube-transcript-plus')

        const subtitles = await withTimeout(
            fetchTranscript(videoId, { lang: language }),
            20000,  // 20 秒超時
            '方法 1 超時'
        )

        if (subtitles && subtitles.length > 0) {
            const transcript = subtitles.map((s: any) => s.text).join(' ')
            emit('node:log', { message: `✅ 方法 1 成功！字幕長度: ${transcript.length} 字元` })
            return transcript
        }

        return null
    } catch (error) {
        emit('node:log', { message: `❌ 方法 1 失敗: ${error instanceof Error ? error.message : String(error)}` })
        return null
    }
}

/**
 * 方法 2: @playzone/youtube-transcript
 */
async function tryMethod2(videoId: string, language: string, emit: EmitFn): Promise<string | null> {
    try {
        emit('node:log', { message: '🔍 嘗試方法 2: @playzone/youtube-transcript' })
        const { YoutubeTranscript } = await import('@playzone/youtube-transcript')

        const result = await withTimeout(
            YoutubeTranscript.fetchTranscript(videoId, { lang: language }),
            20000,  // 20 秒超時
            '方法 2 超時'
        )

        if (result && result.length > 0) {
            const transcript = result.map((s: any) => s.text).join(' ')
            emit('node:log', { message: `✅ 方法 2 成功！字幕長度: ${transcript.length} 字元` })
            return transcript
        }

        return null
    } catch (error) {
        emit('node:log', { message: `❌ 方法 2 失敗: ${error instanceof Error ? error.message : String(error)}` })
        return null
    }
}

/**
 * 方法 3: youtube-transcript
 */
async function tryMethod3(videoId: string, language: string, emit: EmitFn): Promise<string | null> {
    try {
        emit('node:log', { message: '🔍 嘗試方法 3: youtube-transcript' })
        const { YoutubeTranscript } = await import('youtube-transcript')

        const result = await withTimeout(
            YoutubeTranscript.fetchTranscript(videoId, { lang: language }),
            20000,  // 20 秒超時
            '方法 3 超時'
        )

        if (result && result.length > 0) {
            const transcript = result.map((s: any) => s.text).join(' ')
            emit('node:log', { message: `✅ 方法 3 成功！字幕長度: ${transcript.length} 字元` })
            return transcript
        }

        return null
    } catch (error) {
        emit('node:log', { message: `❌ 方法 3 失敗: ${error instanceof Error ? error.message : String(error)}` })
        return null
    }
}

export async function executeYouTubeSubtitle(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{
    success: boolean;
    transcript?: string;
    url: string;
    method?: string;
    language?: string;
    onSuccess: string | null;  // 直接輸出字幕文本（字串）
    onFailure: string | null;  // 直接輸出網址（字串）
}> {
    const { url, language = 'auto' } = config as unknown as YouTubeSubtitleConfig

    if (!url) {
        throw new Error('YouTube Subtitle: url is required')
    }

    emit('node:log', { message: '📺 YouTube 字幕提取器（純文字，多重 fallback）' })
    emit('node:log', { message: `URL: ${url}` })

    // 提取影片 ID
    const videoId = extractVideoId(url)
    if (!videoId) {
        emit('node:log', { message: '❌ 無法從 URL 提取影片 ID' })
        return {
            success: false,
            url,
            onSuccess: null,
            onFailure: url  // 直接輸出網址（字串）
        }
    }

    emit('node:log', { message: `✓ 影片 ID: ${videoId}` })

    // 定義嘗試方法（只使用可靠的 youtube-transcript-plus）
    const methods = [
        { name: 'youtube-transcript-plus', fn: tryMethod1 }
    ]

    // 定義嘗試語言（如果是 auto 或空字串，自動嘗試多種語言）
    const languagesToTry = (language === 'auto' || language === '')
        ? ['en', 'zh-TW', 'zh-CN']
        : [language]

    emit('node:log', { message: `語言策略: ${language === 'auto' || language === '' ? '自動嘗試 (en → zh-TW → zh-CN)' : `指定語言 (${language})`}` })

    // 雙層循環：外層語言，內層方法
    for (const lang of languagesToTry) {
        emit('node:log', { message: `🌐 嘗試語言: ${lang}` })

        for (const method of methods) {
            const transcript = await method.fn(videoId, lang, emit)

            if (transcript) {
                emit('node:log', { message: `🎉 成功提取字幕！語言: ${lang}, 方法: ${method.name}` })
                emit('node:log', { message: `字幕長度: ${transcript.length} 字元` })

                return {
                    success: true,
                    transcript,
                    url,
                    method: method.name,
                    language: lang,
                    onSuccess: transcript,  // 直接輸出字幕文本（字串）
                    onFailure: null
                }
            }
        }
    }

    // 全部語言和方法都失敗
    emit('node:log', { message: '❌ 所有語言和方法都失敗，無法提取字幕' })
    emit('node:log', { message: '💡 建議：將 URL 傳給 NotebookLM 處理' })

    return {
        success: false,
        url,
        onSuccess: null,
        onFailure: url  // 直接輸出網址（字串）
    }
}
