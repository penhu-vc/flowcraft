// 測試可用的套件
const videoId = 'jNQXAC9IVRw'  // YouTube 第一支影片

async function testYoutubeTranscriptPlus() {
    console.log('\n=== 測試 youtube-transcript-plus ===')
    try {
        const { fetchTranscript } = require('youtube-transcript-plus')
        const result = await fetchTranscript(videoId)
        console.log('✅ 成功！字幕數量:', result?.length || 0)
        if (result && result.length > 0) {
            const text = result.map(s => s.text).join(' ')
            console.log('字幕內容（前 150 字）:', text.substring(0, 150))
            return text
        }
    } catch (error) {
        console.log('❌ 失敗:', error.message)
    }
    return null
}

async function testYoutubeCaptionExtractor() {
    console.log('\n=== 測試 youtube-caption-extractor ===')
    try {
        const { getSubtitles } = require('youtube-caption-extractor')
        const result = await getSubtitles({ videoID: videoId, lang: 'en' })
        console.log('✅ 成功！字幕數量:', result?.length || 0)
        if (result && result.length > 0) {
            const text = result.map(s => s.text).join(' ')
            console.log('字幕內容（前 150 字）:', text.substring(0, 150))
            return text
        }
    } catch (error) {
        console.log('❌ 失敗:', error.message)
    }
    return null
}

async function runTests() {
    await testYoutubeTranscriptPlus()
    await testYoutubeCaptionExtractor()
}

runTests().catch(console.error)
