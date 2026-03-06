/**
 * API Configuration
 * 統一管理 API 基礎 URL，支援環境變數設定
 */

// 從環境變數讀取，預設為空（使用相對路徑，透過 Gateway）
export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

// API 路徑
export const API_ENDPOINTS = {
  // 執行相關
  execute: `${API_BASE_URL}/api/execute`,
  workflowRun: `${API_BASE_URL}/api/workflow/run`,
  health: `${API_BASE_URL}/api/health`,

  // 認證相關
  authNotebooklm: `${API_BASE_URL}/api/auth/notebooklm`,

  // 設定相關
  settingsGeminiStatus: `${API_BASE_URL}/api/settings/gemini/status`,
  settingsGeminiApiKey: `${API_BASE_URL}/api/settings/gemini/api-key`,
  settingsGcpCredentials: `${API_BASE_URL}/api/settings/gcp/credentials`,
  settingsApiKeys: `${API_BASE_URL}/api/settings/api-keys`,

  // YouTube 相關
  youtubeRecentVideos: `${API_BASE_URL}/api/youtube/recent-videos`,

  // Prompts 相關
  promptsSegmentMining: `${API_BASE_URL}/api/prompts/segment-mining`,
  promptsScriptGenerator: `${API_BASE_URL}/api/prompts/script-generator`,

  // 工作流同步
  workflowsSync: `${API_BASE_URL}/api/workflows/sync`,
}

// WebSocket URL (與 API 同源)
export const WEBSOCKET_URL = API_BASE_URL
