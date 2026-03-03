"use client";

import { useEffect, useMemo, useState } from "react";
import CopyIdButton from "../components/CopyIdButton";
import IntroDetails from "../components/IntroDetails";
import { API_BASE_URL, apiRequest } from "../lib/api";

type Trigger = {
  id: string;
  name: string;
  platform: string;
  event_type: string;
  source_key: string;
  profile_id: string | null;
  pipeline_id: string | null;
  enabled: boolean;
  config_json: Record<string, unknown>;
};

type Profile = {
  id: string;
  name: string;
  pipeline_id: string;
};

type Pipeline = {
  id: string;
  name: string;
};

type TriggerDraft = {
  name: string;
  platform: string;
  event_type: string;
  source_key: string;
  profile_id: string;
  pipeline_id: string;
  enabled: boolean;
  youtube_video_type: "any" | "long" | "shorts";
  config_json_text: string;
};

type QuickAddResult = {
  status: string;
  resolved_source_key: string;
  added_to_trigger: boolean;
  monitored_count: number;
};

type TriggerSourceItem = {
  source_key: string;
  display_name: string;
  platform: string;
  source_id: string | null;
  routing_tag: string | null;
  enabled: boolean | null;
};

type TriggerSourceListResponse = {
  trigger_id: string;
  count: number;
  items: TriggerSourceItem[];
};

const PLATFORM_OPTIONS = ["youtube", "tg", "dc", "line"];
const EVENT_OPTIONS = ["new_video", "message", "callback_query", "*"];
const YOUTUBE_VIDEO_TYPE_OPTIONS: Array<{ value: "any" | "long" | "shorts"; label: string }> = [
  { value: "any", label: "不限" },
  { value: "long", label: "長片" },
  { value: "shorts", label: "Shorts" },
];

function prettyJson(obj: Record<string, unknown> | null | undefined): string {
  try {
    return JSON.stringify(obj || {}, null, 2);
  } catch {
    return "{}";
  }
}

function toDraft(row: Trigger): TriggerDraft {
  const cfg = row.config_json || {};
  const rawType = String((cfg.youtube_video_type as string) || "").toLowerCase();
  const youtubeVideoType: "any" | "long" | "shorts" =
    rawType === "long" ? "long" : rawType === "shorts" || rawType === "short" ? "shorts" : "any";
  return {
    name: row.name,
    platform: row.platform,
    event_type: row.event_type,
    source_key: row.source_key,
    profile_id: row.profile_id || "",
    pipeline_id: row.pipeline_id || "",
    enabled: row.enabled,
    youtube_video_type: youtubeVideoType,
    config_json_text: prettyJson(row.config_json),
  };
}

function parseJsonText(text: string): Record<string, unknown> {
  const raw = text.trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

function splitSourceTokens(raw: string): string[] {
  const normalized = (raw || "").replace(/\n/g, ",").replace(/;/g, ",");
  return normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function TriggersPage() {
  const [rows, setRows] = useState<Trigger[]>([]);
  const [sourceItemsByTrigger, setSourceItemsByTrigger] = useState<Record<string, TriggerSourceItem[]>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TriggerDraft>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [newDraft, setNewDraft] = useState<TriggerDraft>({
    name: "",
    platform: "youtube",
    event_type: "new_video",
    source_key: "",
    profile_id: "",
    pipeline_id: "",
    enabled: true,
    youtube_video_type: "any",
    config_json_text: "{}",
  });
  const [youtubeTriggerId, setYoutubeTriggerId] = useState("");
  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState("");
  const [tgTriggerId, setTgTriggerId] = useState("");
  const [tgChatLink, setTgChatLink] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [triggersRes, profilesRes, pipelinesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/triggers`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/profiles`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/pipelines`, { cache: "no-store" }),
      ]);

      const [triggersJson, profilesJson, pipelinesJson] = (await Promise.all([
        triggersRes.json(),
        profilesRes.json(),
        pipelinesRes.json(),
      ])) as [Trigger[], Profile[], Pipeline[]];

      setRows(triggersJson);
      setProfiles(profilesJson);
      setPipelines(pipelinesJson);

      const nextDrafts: Record<string, TriggerDraft> = {};
      for (const row of triggersJson) {
        nextDrafts[row.id] = toDraft(row);
      }
      setDrafts(nextDrafts);

      const sourceMap: Record<string, TriggerSourceItem[]> = {};
      await Promise.all(
        triggersJson.map(async (trigger) => {
          try {
            const res = await fetch(`${API_BASE_URL}/api/triggers/${trigger.id}/sources`, { cache: "no-store" });
            if (res.ok) {
              const payload = (await res.json()) as TriggerSourceListResponse;
              sourceMap[trigger.id] = payload.items || [];
              return;
            }
          } catch {
            // noop, fallback below
          }
          sourceMap[trigger.id] = splitSourceTokens(trigger.source_key).map((sourceKey) => ({
            source_key: sourceKey,
            display_name: sourceKey,
            platform: trigger.platform,
            source_id: null,
            routing_tag: null,
            enabled: null,
          }));
        }),
      );
      setSourceItemsByTrigger(sourceMap);
      setMessage("");
    } catch (err) {
      setMessage(`載入失敗：${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const profileNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of profiles) {
      map.set(row.id, row.name);
    }
    return map;
  }, [profiles]);

  const pipelineNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of pipelines) {
      map.set(row.id, row.name);
    }
    return map;
  }, [pipelines]);

  const youtubeTriggers = useMemo(() => rows.filter((r) => r.platform === "youtube"), [rows]);
  const tgTriggers = useMemo(() => rows.filter((r) => r.platform === "tg"), [rows]);

  useEffect(() => {
    if (!youtubeTriggerId && youtubeTriggers.length > 0) {
      setYoutubeTriggerId(youtubeTriggers[0].id);
    }
  }, [youtubeTriggers, youtubeTriggerId]);

  useEffect(() => {
    if (!tgTriggerId && tgTriggers.length > 0) {
      setTgTriggerId(tgTriggers[0].id);
    }
  }, [tgTriggers, tgTriggerId]);

  async function createTrigger() {
    try {
      const configJson = parseJsonText(newDraft.config_json_text);
      if (newDraft.platform === "youtube") {
        configJson.youtube_video_type = newDraft.youtube_video_type;
      } else {
        delete configJson.youtube_video_type;
      }
      await apiRequest("/api/triggers", {
        method: "POST",
        body: JSON.stringify({
          name: newDraft.name,
          platform: newDraft.platform,
          event_type: newDraft.event_type,
          source_key: newDraft.source_key,
          profile_id: newDraft.profile_id || null,
          pipeline_id: newDraft.pipeline_id || null,
          enabled: newDraft.enabled,
          config_json: configJson,
        }),
      });

      setNewDraft({
        name: "",
        platform: "youtube",
        event_type: "new_video",
        source_key: "",
        profile_id: "",
        pipeline_id: "",
        enabled: true,
        youtube_video_type: "any",
        config_json_text: "{}",
      });
      await loadData();
      setMessage("觸發器已新增");
    } catch (err) {
      setMessage(`新增失敗：${String(err)}`);
    }
  }

  async function saveRow(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }

    try {
      const configJson = parseJsonText(draft.config_json_text);
      if (draft.platform === "youtube") {
        configJson.youtube_video_type = draft.youtube_video_type;
      } else {
        delete configJson.youtube_video_type;
      }
      await apiRequest(`/api/triggers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name,
          platform: draft.platform,
          event_type: draft.event_type,
          source_key: draft.source_key,
          profile_id: draft.profile_id || null,
          pipeline_id: draft.pipeline_id || null,
          enabled: draft.enabled,
          config_json: configJson,
        }),
      });
      await loadData();
      setMessage(`已儲存：${draft.name}`);
    } catch (err) {
      setMessage(`儲存失敗：${String(err)}`);
    }
  }

  async function removeRow(id: string) {
    try {
      await apiRequest(`/api/triggers/${id}`, { method: "DELETE" });
      await loadData();
      setMessage("已刪除觸發器");
    } catch (err) {
      setMessage(`刪除失敗：${String(err)}`);
    }
  }

  async function removeSourceKey(triggerId: string, sourceKey: string) {
    try {
      await apiRequest(`/api/triggers/${triggerId}/remove-source`, {
        method: "POST",
        body: JSON.stringify({ source_key: sourceKey }),
      });
      await loadData();
      setMessage(`已移除來源：${sourceKey}`);
    } catch (err) {
      setMessage(`移除來源失敗：${String(err)}`);
    }
  }

  async function quickAddYoutube() {
    if (!youtubeTriggerId || !youtubeVideoUrl.trim()) {
      setMessage("請先選 YouTube trigger 並貼上影片連結");
      return;
    }
    try {
      const result = await apiRequest<QuickAddResult>(`/api/triggers/${youtubeTriggerId}/quick-add/youtube`, {
        method: "POST",
        body: JSON.stringify({ video_url: youtubeVideoUrl.trim() }),
      });
      setYoutubeVideoUrl("");
      await loadData();
      setMessage(
        `已加入 YouTube 來源：${result.resolved_source_key}（${result.added_to_trigger ? "新增" : "已存在"}，目前共 ${result.monitored_count} 個）`,
      );
    } catch (err) {
      setMessage(`加入 YouTube 失敗：${String(err)}`);
    }
  }

  async function quickAddTg() {
    if (!tgTriggerId || !tgChatLink.trim()) {
      setMessage("請先選 TG trigger 並貼上聊天連結");
      return;
    }
    try {
      const result = await apiRequest<QuickAddResult>(`/api/triggers/${tgTriggerId}/quick-add/tg`, {
        method: "POST",
        body: JSON.stringify({ chat_link: tgChatLink.trim() }),
      });
      setTgChatLink("");
      await loadData();
      setMessage(
        `已加入 TG 來源：${result.resolved_source_key}（${result.added_to_trigger ? "新增" : "已存在"}，目前共 ${result.monitored_count} 個）`,
      );
    } catch (err) {
      setMessage(`加入 TG 失敗：${String(err)}`);
    }
  }

  return (
    <section className="card">
      <h2>觸發器（Triggers）</h2>
      <p className="muted">在這裡定義「什麼來源事件會啟動哪條流程」。</p>

      <IntroDetails title="這頁是做什麼？（點我展開）">
        <p>1. 一筆 Trigger = 一條監聽規則（平台 + 事件類型 + source_key）。</p>
        <p>2. 你可以把 Trigger 綁到 profile_id 或 pipeline_id，決定事件進哪條流程。</p>
        <p>3. 快速模式：貼 YouTube 影片連結或 TG 聊天連結，就能自動加入來源。</p>
        <p>4. 進階模式仍可直接編輯 source_key（精準值或前綴星號）。</p>
        <p>5. YouTube Trigger 可選影片類型：長片 / Shorts / 不限。</p>
        <p>6. source_key 設 <code>tg:*</code> 或 <code>*</code> 代表全域匹配。</p>
      </IntroDetails>

      <h3>快速加入監控來源</h3>
      <div className="help-box">
        <p><strong>YouTube</strong>：貼任意影片連結，系統會解析出頻道並加到選定 Trigger。</p>
        <div className="form-grid">
          <select value={youtubeTriggerId} onChange={(e) => setYoutubeTriggerId(e.target.value)}>
            <option value="">選擇 YouTube Trigger</option>
            {youtubeTriggers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <input
            value={youtubeVideoUrl}
            onChange={(e) => setYoutubeVideoUrl(e.target.value)}
            placeholder="貼上 YouTube 影片連結（watch / shorts / youtu.be 都可）"
          />
          <button onClick={() => void quickAddYoutube()} disabled={!youtubeTriggerId || !youtubeVideoUrl.trim()}>
            加入 YouTube 頻道
          </button>
        </div>
      </div>

      <div className="help-box">
        <p><strong>Telegram</strong>：貼聊天連結，系統會解析聊天室並加到選定 Trigger。</p>
        <div className="form-grid">
          <select value={tgTriggerId} onChange={(e) => setTgTriggerId(e.target.value)}>
            <option value="">選擇 TG Trigger</option>
            {tgTriggers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <input
            value={tgChatLink}
            onChange={(e) => setTgChatLink(e.target.value)}
            placeholder="貼上 TG 聊天連結（t.me/c/... 或 t.me/username/...）"
          />
          <button onClick={() => void quickAddTg()} disabled={!tgTriggerId || !tgChatLink.trim()}>
            加入 TG 聊天室
          </button>
        </div>
      </div>

      <h3>新增 Trigger</h3>
      <div className="form-grid">
        <input
          value={newDraft.name}
          onChange={(e) => setNewDraft((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="名稱，例如 YouTube 科技頻道監聽"
        />
        <select value={newDraft.platform} onChange={(e) => setNewDraft((prev) => ({ ...prev, platform: e.target.value }))}>
          {PLATFORM_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select value={newDraft.event_type} onChange={(e) => setNewDraft((prev) => ({ ...prev, event_type: e.target.value }))}>
          {EVENT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          value={newDraft.source_key}
          onChange={(e) => setNewDraft((prev) => ({ ...prev, source_key: e.target.value }))}
          placeholder="來源鍵（進階模式）例如 yt:channel:UCxxxx 或 tg:-100xxxx"
        />
      </div>
      <div className="form-grid">
        <select value={newDraft.profile_id} onChange={(e) => setNewDraft((prev) => ({ ...prev, profile_id: e.target.value }))}>
          <option value="">不指定 profile（走預設）</option>
          {profiles.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          value={newDraft.youtube_video_type}
          onChange={(e) =>
            setNewDraft((prev) => ({
              ...prev,
              youtube_video_type: e.target.value as "any" | "long" | "shorts",
            }))
          }
          disabled={newDraft.platform !== "youtube"}
        >
          {YOUTUBE_VIDEO_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              YouTube 類型：{option.label}
            </option>
          ))}
        </select>
        <select value={newDraft.pipeline_id} onChange={(e) => setNewDraft((prev) => ({ ...prev, pipeline_id: e.target.value }))}>
          <option value="">不指定 pipeline（依 profile 或預設）</option>
          {pipelines.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select value={newDraft.enabled ? "true" : "false"} onChange={(e) => setNewDraft((prev) => ({ ...prev, enabled: e.target.value === "true" }))}>
          <option value="true">啟用</option>
          <option value="false">停用</option>
        </select>
        <button onClick={() => void createTrigger()} disabled={!newDraft.name.trim() || !newDraft.source_key.trim()}>
          新增
        </button>
      </div>

      <textarea
        rows={4}
        value={newDraft.config_json_text}
        onChange={(e) => setNewDraft((prev) => ({ ...prev, config_json_text: e.target.value }))}
        placeholder='config_json，例如 {"chat_types":["group","supergroup"]}'
      />

      {message ? <p className="muted">{message}</p> : null}

      {loading ? <div className="help-box">載入中...</div> : null}
      {!loading && rows.length === 0 ? <div className="help-box">目前沒有 trigger。</div> : null}

      <div className="trigger-list">
        {rows.map((row) => {
          const draft = drafts[row.id] || toDraft(row);
          const sourceItems =
            sourceItemsByTrigger[row.id] ||
            splitSourceTokens(draft.source_key).map((sourceKey) => ({
              source_key: sourceKey,
              display_name: sourceKey,
              platform: draft.platform,
              source_id: null,
              routing_tag: null,
              enabled: null,
            }));
          return (
            <article key={row.id} className="trigger-card">
              <div className="trigger-head">
                <div>
                  <div className="field-label">名稱</div>
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...draft, name: e.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <div className="field-label">ID</div>
                  <div className="trigger-id-line">
                    <code>{row.id.slice(0, 8)}...</code>
                    <CopyIdButton value={row.id} />
                  </div>
                </div>
                <div className="trigger-actions">
                  <button onClick={() => void saveRow(row.id)} disabled={!draft.name.trim() || !draft.source_key.trim()}>
                    儲存
                  </button>
                  <button className="btn-danger" onClick={() => void removeRow(row.id)}>
                    刪除
                  </button>
                </div>
              </div>

              <div className="trigger-body-grid">
                <div className="trigger-panel">
                  <div className="field-label">觸發條件</div>
                  <div className="form-grid compact">
                    <select
                      value={draft.platform}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, platform: e.target.value },
                        }))
                      }
                    >
                      {PLATFORM_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          平台：{option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={draft.event_type}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, event_type: e.target.value },
                        }))
                      }
                    >
                      {EVENT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          事件：{option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={draft.enabled ? "true" : "false"}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, enabled: e.target.value === "true" },
                        }))
                      }
                    >
                      <option value="true">狀態：啟用</option>
                      <option value="false">狀態：停用</option>
                    </select>
                    {draft.platform === "youtube" ? (
                      <select
                        value={draft.youtube_video_type}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...draft,
                              youtube_video_type: e.target.value as "any" | "long" | "shorts",
                            },
                          }))
                        }
                      >
                        {YOUTUBE_VIDEO_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            YouTube 類型：{option.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>

                <div className="trigger-panel">
                  <div className="field-label">綁定流程</div>
                  <div className="form-grid compact">
                    <select
                      value={draft.profile_id}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, profile_id: e.target.value },
                        }))
                      }
                    >
                      <option value="">不指定 profile</option>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={draft.pipeline_id}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, pipeline_id: e.target.value },
                        }))
                      }
                    >
                      <option value="">不指定 pipeline</option>
                      {pipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="muted" style={{ margin: "8px 0 0" }}>
                    {draft.profile_id ? `Profile：${profileNameMap.get(draft.profile_id) || draft.profile_id}` : "Profile：預設"}
                    <br />
                    {draft.pipeline_id ? `Pipeline：${pipelineNameMap.get(draft.pipeline_id) || draft.pipeline_id}` : "Pipeline：預設"}
                  </p>
                </div>
              </div>

              <div className="trigger-panel">
                <div className="field-label">監控來源</div>
                <div className="source-list">
                  {sourceItems.length === 0 ? (
                    <span className="muted">尚未設定來源</span>
                  ) : (
                    sourceItems.map((item) => (
                      <div key={`${row.id}-${item.source_key}`} className="source-item">
                        <div>
                          <div className="source-title">{item.display_name}</div>
                          <div className="source-meta">
                            <code>{item.source_key}</code> · {item.platform}
                          </div>
                        </div>
                        <button
                          className="btn-inline danger"
                          onClick={() => void removeSourceKey(row.id, item.source_key)}
                          disabled={sourceItems.length <= 1}
                          title={sourceItems.length <= 1 ? "至少要保留一個來源" : "移除此來源"}
                        >
                          移除
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <details className="trigger-advanced">
                <summary>進階設定（手動 source_key / config_json）</summary>
                <div className="trigger-advanced-grid">
                  <div>
                    <div className="field-label">source_key</div>
                    <textarea
                      rows={3}
                      value={draft.source_key}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, source_key: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <div className="field-label">config_json</div>
                    <textarea
                      rows={4}
                      value={draft.config_json_text}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, config_json_text: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
