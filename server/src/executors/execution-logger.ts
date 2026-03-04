/**
 * Execution Logger Executor v3.0
 * 執行記錄器：使用嵌套結構保留節點來源資訊 + 快速索引
 */

type EmitFn = (event: string, data: unknown) => void

export interface ExecutionLoggerConfig {
    collectionId: string
    data?: any  // 嵌套的資料物件（包含 _index 和各節點輸出）
}

export async function executeExecutionLogger(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ success: boolean; collectionId: string; data: any; record: any; _writeToCollection: boolean }> {
    const { collectionId, data } = config as unknown as ExecutionLoggerConfig

    if (!collectionId) {
        throw new Error('Execution Logger: collectionId is required')
    }

    emit('node:log', { message: '📝 執行記錄器 v3.0 (嵌套結構 + 索引)' })
    emit('node:log', { message: `目標資料集: ${collectionId}` })

    // 直接使用嵌套資料，保留完整節點來源資訊
    const recordData: Record<string, any> = {
        timestamp: new Date().toISOString()
    }

    if (data && typeof data === 'object') {
        // 合併傳入的嵌套資料（包含 _index 和各節點的 outputs）
        Object.assign(recordData, data)

        const nodeCount = Object.keys(data).filter(k => k !== '_index').length
        const indexCount = data._index ? Object.keys(data._index).length : 0

        emit('node:log', { message: `✅ 記錄 ${nodeCount} 個節點的輸出` })
        emit('node:log', { message: `✅ 建立 ${indexCount} 個快速索引欄位` })

        if (data._index) {
            emit('node:log', { message: `📇 索引欄位: ${Object.keys(data._index).join(', ')}` })
        }
    } else {
        emit('node:log', { message: '⚠️ 未接收到資料或格式不正確' })
    }

    const preview = JSON.stringify(recordData, null, 2)
    const maxPreviewLength = 800
    if (preview.length > maxPreviewLength) {
        emit('node:log', { message: `預覽:\n${preview.substring(0, maxPreviewLength)}...\n(共 ${preview.length} 字元)` })
    } else {
        emit('node:log', { message: `預覽:\n${preview}` })
    }

    return {
        success: true,
        collectionId,
        data: recordData,
        record: recordData,
        _writeToCollection: true
    }
}
