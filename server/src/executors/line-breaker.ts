/**
 * Line Breaker Executor
 * 分行處理器：按標點符號和字數限制自動分行
 */

type EmitFn = (event: string, data: unknown) => void

export interface LineBreakerConfig {
    text: string            // 輸入文字
    punctuations?: string   // 分行標點符號（預設：。！？，）
    separator?: string      // 分行符號（預設：|）
    minCharsBeforeBreak?: number  // 中英文交界前最少字數（預設 5）
}

export async function executeLineBreaker(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ result: string }> {
    const {
        text,
        punctuations = '。！？，',
        separator = '\n',  // 預設真的換行
        minCharsBeforeBreak = 5
    } = config as unknown as LineBreakerConfig

    if (!text) throw new Error('Line Breaker executor: text is required')

    emit('node:log', { message: '✂️ 分行處理器啟動' })

    // Step 1: 按標點符號分段
    const punctuationRegex = new RegExp(`[${punctuations}]`, 'g')
    const segments = text.split(punctuationRegex).filter(s => s.trim())

    emit('node:log', { message: `按標點分段: ${segments.length} 段` })

    // Step 2: 處理每一段，在中英文交界處分行
    const processedSegments = segments.map(segment => {
        return processSegment(segment.trim(), separator, minCharsBeforeBreak)
    })

    const result = processedSegments.join(separator)

    emit('node:log', { message: `✅ 分行完成，共 ${result.split(separator).length} 行` })

    return { result }
}

/**
 * 處理單一段落：在中英文交界處分行
 */
function processSegment(segment: string, separator: string, minCharsBeforeBreak: number): string {
    const lines: string[] = []
    let currentLine = ''
    let i = 0

    while (i < segment.length) {
        const char = segment[i]
        const nextChar = segment[i + 1]

        currentLine += char

        // 檢查是否是中英文交界（中文→英文/數字）
        if (nextChar && isChinese(char) && isAlphanumeric(nextChar)) {
            // 確保當前行有足夠字數才分行
            if (currentLine.length >= minCharsBeforeBreak) {
                lines.push(currentLine)
                currentLine = ''
            }
        }

        i++
    }

    // 加入剩餘內容
    if (currentLine) {
        lines.push(currentLine)
    }

    return lines.join(separator)
}

/**
 * 判斷是否是中文字元
 */
function isChinese(char: string): boolean {
    const code = char.charCodeAt(0)
    return code >= 0x4E00 && code <= 0x9FFF
}

/**
 * 判斷是否是英數字
 */
function isAlphanumeric(char: string): boolean {
    return /[a-zA-Z0-9]/.test(char)
}
