// 只測試 youtube-transcript-plus
const videoId = 'jNQXAC9IVRw'  // 換一個知名影片（「Me at the zoo」，YouTube 第一支影片）

async function test() {
    console.log('測試 youtube-transcript-plus...')
    try {
        const { getTranscript } = require('youtube-transcript-plus')
        const result = await getTranscript(videoId)
        console.log('✅ 成功！字幕數量:', result?.length || 0)
        if (result && result.length > 0) {
            console.log('前 5 條:', result.slice(0, 5).map(s => s.text))
            console.log('\n完整字幕（前 200 字）:', result.map(s => s.text).join(' ').substring(0, 200))
        }
    } catch (error) {
        console.log('❌ 失敗:', error.message)
        console.error(error)
    }
}

test()
