/**
 * dataDir.ts — 統一資料目錄管理
 * 支援本地 data/ 與 NAS 兩種模式，可在設定頁切換
 */
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

// 本地預設目錄（永遠存在）
export const LOCAL_DATA_DIR = join(__dirname, '../../data')

// NAS UNC 路徑（Windows SMB）
const DEFAULT_NAS_PATH = '\\\\192.168.1.108\\penhu_video\\flowcraft\\data'

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
