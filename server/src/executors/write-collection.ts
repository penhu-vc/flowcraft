/**
 * Write to Collection Executor
 * 寫入資料集
 */

type EmitFn = (event: string, data: unknown) => void

export interface WriteCollectionConfig {
    collectionId: string
    data: any
}

export async function executeWriteCollection(
    config: Record<string, unknown>,
    emit: EmitFn
): Promise<{ success: boolean; collectionId: string; data: any; _writeToCollection: boolean }> {
    const { collectionId, data } = config as unknown as WriteCollectionConfig

    if (!collectionId) {
        throw new Error('Write Collection executor: collectionId is required')
    }

    emit('node:log', { message: '📚 寫入資料集節點' })
    emit('node:log', { message: `目標資料集 ID: ${collectionId}` })

    // 解析資料（可能是 JSON 字串）
    let parsedData = data
    if (typeof data === 'string') {
        try {
            parsedData = JSON.parse(data)
        } catch (e) {
            // 如果不是 JSON，就當作純文字
            parsedData = data
        }
    }

    emit('node:log', { message: '準備寫入資料...' })
    emit('node:log', { message: `資料預覽: ${JSON.stringify(parsedData).substring(0, 100)}...` })

    // 返回特殊標記，讓前端知道要寫入資料集
    return {
        success: true,
        collectionId,
        data: parsedData,
        _writeToCollection: true  // 特殊標記
    }
}
