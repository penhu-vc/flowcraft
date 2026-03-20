/**
 * dataDir.ts — 統一資料目錄管理
 * 支援本地 data/ 與 NAS 兩種模式，可在設定頁切換
 */
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs'

// 本地預設目錄（永遠存在）
// dataDir.ts 在 server/src/，所以 ../data = server/data
export const LOCAL_DATA_DIR = join(__dirname, '../data')

// NAS 路徑（自動偵測 Mac / Windows）
const IS_MAC = process.platform === 'darwin'
const DEFAULT_NAS_PATH = IS_MAC
  ? '/Users/yaja/mnt/nas/flowcraft/data'
  : '\\\\192.168.1.108\\penhu_video\\flowcraft\\data'

// config 存在本地（不放 NAS，避免雞生蛋問題）
const CONFIG_FILE = join(LOCAL_DATA_DIR, 'storage-config.json')

export interface StorageConfig {
  mode: 'local' | 'nas'
  nasPath: string
}

let _config: StorageConfig = {
  mode: 'local',
  nasPath: DEFAULT_NAS_PATH,
}

// 模組載入時立刻讀取設定，確保 getDataDir() 在任何 import 後都正確
;(function autoLoad() {
  try {
    mkdirSync(LOCAL_DATA_DIR, { recursive: true })
    if (existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
      _config = { ..._config, ...parsed }
    }
  } catch {
    // ignore – 維持預設 local mode
  }
})()

export function loadStorageConfig() {
  try {
    mkdirSync(LOCAL_DATA_DIR, { recursive: true })
    if (existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
      _config = { ..._config, ...parsed }
    }
  } catch (e) {
    console.warn('[storage] Failed to load storage config, using local mode')
  }
}

export function getStorageConfig(): StorageConfig & { nasAvailable: boolean } {
  const nasAvailable = existsSync(_config.nasPath)
  return { ..._config, nasAvailable }
}

export function setStorageConfig(config: Partial<StorageConfig>) {
  _config = { ..._config, ...config }
  mkdirSync(LOCAL_DATA_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(_config, null, 2))
  console.log(`[storage] mode switched to: ${_config.mode} → ${getDataDir()}`)
}

/**
 * 取得目前生效的資料目錄
 * - NAS 模式但路徑不可用時，自動 fallback 到本地
 */
export function getDataDir(): string {
  if (_config.mode === 'nas') {
    const nasPath = _config.nasPath || DEFAULT_NAS_PATH
    if (existsSync(nasPath)) {
      return nasPath
    }
    console.warn('[storage] NAS not accessible, falling back to local')
  }
  return LOCAL_DATA_DIR
}

/**
 * 確保子目錄存在，回傳完整路徑
 */
export function ensureDir(...parts: string[]): string {
  const fullPath = join(getDataDir(), ...parts)
  mkdirSync(fullPath, { recursive: true })
  return fullPath
}

// 需要同步的設定/憑證檔案清單
const CREDENTIAL_FILES = [
  'gemini-settings.json',
  'gcp-credentials.json',
  'api-keys.json',
  'saved-prompts.json',
  'saved-characters.json',
  'workflows.json',
  'assets-index.json',
]

/**
 * 切換到 NAS 模式時，自動將本地設定檔複製到 NAS
 * 切換回本地時，將 NAS 上的設定檔複製回本地
 * 回傳 { copied: string[], skipped: string[], errors: string[] }
 */
export function syncCredentials(targetMode: 'local' | 'nas'): {
  copied: string[]
  skipped: string[]
  errors: string[]
} {
  const nasPath = _config.nasPath
  const result = { copied: [] as string[], skipped: [] as string[], errors: [] as string[] }

  if (targetMode === 'nas') {
    // 本地 → NAS
    if (!existsSync(nasPath)) {
      result.errors.push('NAS 路徑不存在，無法同步')
      return result
    }
    mkdirSync(nasPath, { recursive: true })

    for (const file of CREDENTIAL_FILES) {
      const src = join(LOCAL_DATA_DIR, file)
      const dst = join(nasPath, file)
      try {
        if (existsSync(src)) {
          copyFileSync(src, dst)
          result.copied.push(file)
          console.log(`[storage] copied local → NAS: ${file}`)
        } else {
          result.skipped.push(file)
        }
      } catch (e: unknown) {
        result.errors.push(`${file}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } else {
    // NAS → 本地
    if (!existsSync(nasPath)) {
      result.errors.push('NAS 路徑不存在，無法同步')
      return result
    }
    mkdirSync(LOCAL_DATA_DIR, { recursive: true })

    for (const file of CREDENTIAL_FILES) {
      const src = join(nasPath, file)
      const dst = join(LOCAL_DATA_DIR, file)
      try {
        if (existsSync(src)) {
          copyFileSync(src, dst)
          result.copied.push(file)
          console.log(`[storage] copied NAS → local: ${file}`)
        } else {
          result.skipped.push(file)
        }
      } catch (e: unknown) {
        result.errors.push(`${file}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  return result
}
