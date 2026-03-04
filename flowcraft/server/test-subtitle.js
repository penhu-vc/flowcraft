// 測試 YouTube 字幕套件
const videoId = 'LONCqCT-0Ls'
const language = 'en'

async function testMethod1() {
    console.log('\n=== 測試方法 1: youtube-caption-extractor ===')
    try {
        const { getSubtitles } = require('youtube-caption-extractor')
        const result = await getSubtitles({ videoID: videoId, lang: language })
        console.log('✅ 成功！字幕數量:', result?.length || 0)
        if (result && result.length > 0) {
            console.log('前 3 條:', result.slice(0, 3))
        }
    } catch (error) {
        console.log('❌ 失敗:', error.message)
    }
}

async function testMethod2() {
    console.log('\n=== 測試方法 2: @playzone/youtube-transcript ===')
    try {
        const { YoutubeTranscript } = require('@playzone/youtube-transcript')
        const result = await YoutubeTranscript.fetchTranscript(videoId, { lang: language })
        console.log('✅ 成功！字幕數量:', result?.length || 0)
        if (result && result.length > 0) {
            console.log('前 3 條:', result.slice(0, 3))
        }
    } catch (error) {
        console.log('❌ 失敗:', error.message)
    }
}

async function testMethod3() {
    console.log('\n=== 測試方法 3: youtube-transcript ===')
    try {
        const { YoutubeTranscript } = require('youtube-transcript')
        const result = await YoutubeTranscript.fetchTranscript(videoId, { lang: language })
        console.log('✅ 成功！字幕數量:', result?.length || 0)
        if (result && result.length > 0) {
            console.log('前 3 條:', result.slice(0, 3))
        }
    } catch (error) {
        console.log('❌ 失敗:', error.message)
    }
}

async function testMethod4() {
    console.log('\n=== 測試方法 4: youtube-transcript-plus ===')
    try {
        const { getTranscript } = require('youtube-transcript-plus')
        const result = await getTranscript(videoId)
        console.log('✅ 成功！字幕數量:', result?.length || 0)
        if (result && result.length > 0) {
            console.log('前 3 條:', result.slice(0, 3))
        }
    } catch (error) {
        console.log('❌ 失敗:', error.message)
    }
}

async function runTests() {
    await testMethod1()
    await testMethod2()
    await testMethod3()
    await testMethod4()
}

runTests().catch(console.error)
