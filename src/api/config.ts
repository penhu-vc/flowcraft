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
  settingsSavedPrompts: `${API_BASE_URL}/api/settings/saved-prompts`,
  settingsSavedCharacters: `${API_BASE_URL}/api/settings/saved-characters`,

  // YouTube 相關
  youtubeRecentVideos: `${API_BASE_URL}/api/youtube/recent-videos`,

  // Prompts 相關
  promptsSegmentMining: `${API_BASE_URL}/api/prompts/segment-mining`,
  promptsScriptGenerator: `${API_BASE_URL}/api/prompts/script-generator`,

  // Veo 相關
  veoStatus: `${API_BASE_URL}/api/veo/status`,
  veoGenerate: `${API_BASE_URL}/api/veo/generate`,
  veoJobs: `${API_BASE_URL}/api/veo/jobs`,
  veoOptimizePrompt: `${API_BASE_URL}/api/veo/optimize-prompt`,

  // Nano Banana Pro 相關
  nanoStatus: `${API_BASE_URL}/api/nano/status`,
  nanoGenerate: `${API_BASE_URL}/api/nano/generate`,
  nanoJobs: `${API_BASE_URL}/api/nano/jobs`,
  nanoOptimizePrompt: `${API_BASE_URL}/api/nano/optimize-prompt`,
  nanoAnalyzeSubjects: `${API_BASE_URL}/api/nano/analyze-subjects`,

  // 工作流同步
  workflowsSync: `${API_BASE_URL}/api/workflows/sync`,

  // 資料集合
  settingsCollections: `${API_BASE_URL}/api/settings/collections`,

  // Telegram 共用設定
  settingsTelegramBots: `${API_BASE_URL}/api/settings/telegram-bots`,
  settingsTelegramChats: `${API_BASE_URL}/api/settings/telegram-chats`,

  // Nano 圖片歷史
  settingsNanoHistory: `${API_BASE_URL}/api/settings/nano-history`,

  // Gemini Subject Video
  veoGeminiGenerate: `${API_BASE_URL}/api/veo/gemini-generate`,
  veoGeminiPoll: `${API_BASE_URL}/api/veo/gemini-poll`,
  veoDescribeForVideo: `${API_BASE_URL}/api/veo/describe-for-video`,

  // 儲存模式（本地 / NAS）
  settingsStorage: `${API_BASE_URL}/api/settings/storage`,
}

// WebSocket URL (與 API 同源)
export const WEBSOCKET_URL = API_BASE_URL
