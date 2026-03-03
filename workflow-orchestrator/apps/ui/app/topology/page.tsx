"use client";

import { useEffect, useMemo, useState } from "react";
import CopyIdButton from "../components/CopyIdButton";
import IntroDetails from "../components/IntroDetails";
import { API_BASE_URL, apiRequest } from "../lib/api";

type Pipeline = {
  id: string;
  name: string;
  enabled: boolean;
  version: number;
  graph_json: Record<string, unknown>;
};

type Profile = {
  id: string;
  name: string;
  pipeline_id: string;
  params_json: Record<string, unknown>;
  flags_json: Record<string, unknown>;
};

type Source = {
  id: string;
  platform: string;
  source_key: string;
  routing_tag: string | null;
  default_profile_id: string | null;
  extraction_mode: string;
  enabled: boolean;
};

type Group = {
  id: string;
  platform: string;
  bot_id: string;
  target_key: string;
  name: string;
  routing_tag: string | null;
  enabled: boolean;
};

type Bot = {
  id: string;
  name: string;
  platform: string;
  status: string;
};

type Intent = {
  id: string;
  platform: string;
  intent_key: string;
  step_id: string;
  queue_name: string;
  enabled: boolean;
};

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

type TriggerCreateDraft = {
  name: string;
  platform: string;
  event_type: string;
  source_key: string;
  profile_id: string;
  enabled: boolean;
  youtube_video_type: "any" | "long" | "shorts";
};

type TriggerEditDraft = {
  id: string;
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

type TriggerMutationResponse = {
  status: string;
  trigger?: Trigger;
  monitored_count?: number;
  resolved_source_key?: string;
};

const TRIGGER_PLATFORM_OPTIONS = ["youtube", "tg", "dc", "line"];
const TRIGGER_EVENT_OPTIONS = ["new_video", "message", "callback_query", "*"];
const YOUTUBE_VIDEO_TYPE_OPTIONS: Array<{ value: "any" | "long" | "shorts"; label: string }> = [
  { value: "any", label: "不限" },
  { value: "long", label: "長片" },
  { value: "shorts", label: "Shorts" },
];

function tagLabel(tag: string | null | undefined): string {
  return tag && tag.trim() ? tag : "(未設定 / 全域)";
}

function getYoutubeTypeFromConfig(config: Record<string, unknown> | null | undefined): "any" | "long" | "shorts" {
  const raw = String((config?.youtube_video_type as string) || "").toLowerCase();
  if (raw === "long") {
    return "long";
  }
  if (raw === "shorts" || raw === "short") {
    return "shorts";
  }
  return "any";
}

function toTriggerEditDraft(trigger: Trigger): TriggerEditDraft {
  return {
    id: trigger.id,
    name: trigger.name,
    platform: trigger.platform,
    event_type: trigger.event_type,
    source_key: trigger.source_key,
    profile_id: trigger.profile_id || "",
    pipeline_id: trigger.pipeline_id || "",
    enabled: trigger.enabled,
    youtube_video_type: getYoutubeTypeFromConfig(trigger.config_json),
    config_json_text: JSON.stringify(trigger.config_json || {}, null, 2),
  };
}

function splitSourceTokens(raw: string): string[] {
  const normalized = (raw || "").replace(/\n/g, ",").replace(/;/g, ",");
  return normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function TopologyPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);

  const [selectedPipelineId, setSelectedPipelineId] = useState("");

  const [creatingTrigger, setCreatingTrigger] = useState(false);
  const [savingTriggerEdit, setSavingTriggerEdit] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<TriggerEditDraft | null>(null);
  const [editingTriggerSources, setEditingTriggerSources] = useState<TriggerSourceItem[]>([]);
  const [loadingEditingSources, setLoadingEditingSources] = useState(false);
  const [editYoutubeVideoUrl, setEditYoutubeVideoUrl] = useState("");
  const [editTgChatLink, setEditTgChatLink] = useState("");
  const [mutatingSource, setMutatingSource] = useState(false);
  const [triggerDraft, setTriggerDraft] = useState<TriggerCreateDraft>({
    name: "",
    platform: "youtube",
    event_type: "new_video",
    source_key: "",
    profile_id: "",
    enabled: true,
    youtube_video_type: "any",
  });

  async function loadData() {
    setLoading(true);
    try {
      const [pipelinesRes, profilesRes, sourcesRes, groupsRes, botsRes, intentsRes, triggersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/pipelines`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/profiles`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/sources`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/groups`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/bots`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/intents`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/triggers`, { cache: "no-store" }),
      ]);

      const [pipelinesJson, profilesJson, sourcesJson, groupsJson, botsJson, intentsJson, triggersJson] = (await Promise.all([
        pipelinesRes.json(),
        profilesRes.json(),
        sourcesRes.json(),
        groupsRes.json(),
        botsRes.json(),
        intentsRes.json(),
        triggersRes.json(),
      ])) as [Pipeline[], Profile[], Source[], Group[], Bot[], Intent[], Trigger[]];

      setPipelines(pipelinesJson);
      setProfiles(profilesJson);
      setSources(sourcesJson);
      setGroups(groupsJson);
      setBots(botsJson);
      setIntents(intentsJson);
      setTriggers(triggersJson);

      if (!selectedPipelineId && pipelinesJson.length > 0) {
        setSelectedPipelineId(pipelinesJson[0].id);
      } else if (selectedPipelineId && !pipelinesJson.some((p) => p.id === selectedPipelineId)) {
        setSelectedPipelineId(pipelinesJson[0]?.id || "");
      }

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

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) || pipelines[0],
    [pipelines, selectedPipelineId],
  );

  useEffect(() => {
    if (!selectedPipeline) {
      setTriggerDraft({
        name: "",
        platform: "youtube",
        event_type: "new_video",
        source_key: "",
        profile_id: "",
        enabled: true,
        youtube_video_type: "any",
      });
      return;
    }
    setTriggerDraft((prev) => ({
      ...prev,
      platform: prev.platform,
      event_type: prev.platform === "youtube" ? "new_video" : "message",
      profile_id: "",
    }));
  }, [selectedPipeline?.id]);

  async function createTriggerForSelectedPipeline() {
    if (!selectedPipeline) {
      return;
    }
    const name = triggerDraft.name.trim();
    const sourceKey = triggerDraft.source_key.trim();
    if (!name || !sourceKey) {
      setMessage("請填 Trigger 名稱與來源");
      return;
    }

    const configJson: Record<string, unknown> = {};
    if (triggerDraft.platform === "youtube") {
      configJson.youtube_video_type = triggerDraft.youtube_video_type;
    }

    try {
      setCreatingTrigger(true);
      await apiRequest("/api/triggers", {
        method: "POST",
        body: JSON.stringify({
          name,
          platform: triggerDraft.platform,
          event_type: triggerDraft.event_type,
          source_key: sourceKey,
          profile_id: triggerDraft.profile_id || null,
          pipeline_id: selectedPipeline.id,
          enabled: triggerDraft.enabled,
          config_json: configJson,
        }),
      });
      await loadData();
      setTriggerDraft({
        name: "",
        platform: "youtube",
        event_type: "new_video",
        source_key: "",
        profile_id: "",
        enabled: true,
        youtube_video_type: "any",
      });
      setMessage("已在這條 Pipeline 新增 Trigger");
    } catch (err) {
      setMessage(`新增 Trigger 失敗：${String(err)}`);
    } finally {
      setCreatingTrigger(false);
    }
  }

  async function removeTrigger(triggerId: string) {
    try {
      await apiRequest(`/api/triggers/${triggerId}`, { method: "DELETE" });
      await loadData();
      setMessage("已刪除 Trigger");
    } catch (err) {
      setMessage(`刪除 Trigger 失敗：${String(err)}`);
    }
  }

  async function loadEditingTriggerSources(trigger: TriggerEditDraft) {
    setLoadingEditingSources(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/triggers/${trigger.id}/sources`, { cache: "no-store" });
      if (res.ok) {
        const payload = (await res.json()) as TriggerSourceListResponse;
        setEditingTriggerSources(payload.items || []);
        return;
      }
    } catch {
      // fallback below
    } finally {
      setLoadingEditingSources(false);
    }

    setEditingTriggerSources(
      splitSourceTokens(trigger.source_key).map((sourceKey) => ({
        source_key: sourceKey,
        display_name: sourceKey,
        platform: trigger.platform,
        source_id: null,
        routing_tag: null,
        enabled: null,
      })),
    );
  }

  function openTriggerEditor(trigger: Trigger) {
    const draft = toTriggerEditDraft(trigger);
    setEditingTrigger(draft);
    setEditYoutubeVideoUrl("");
    setEditTgChatLink("");
    void loadEditingTriggerSources(draft);
  }

  function closeTriggerEditor() {
    setEditingTrigger(null);
    setEditingTriggerSources([]);
    setEditYoutubeVideoUrl("");
    setEditTgChatLink("");
  }

  async function saveTriggerEditor() {
    if (!editingTrigger) {
      return;
    }

    const name = editingTrigger.name.trim();
    const sourceKey = editingTrigger.source_key.trim();
    if (!name || !sourceKey) {
      setMessage("Trigger 名稱與 source_key 不能空白");
      return;
    }

    let configJson: Record<string, unknown> = {};
    try {
      configJson = JSON.parse(editingTrigger.config_json_text || "{}") as Record<string, unknown>;
    } catch (err) {
      setMessage(`config_json 格式錯誤：${String(err)}`);
      return;
    }

    if (editingTrigger.platform === "youtube") {
      configJson.youtube_video_type = editingTrigger.youtube_video_type;
    } else {
      delete configJson.youtube_video_type;
    }

    try {
      setSavingTriggerEdit(true);
      await apiRequest(`/api/triggers/${editingTrigger.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          platform: editingTrigger.platform,
          event_type: editingTrigger.event_type,
          source_key: sourceKey,
          profile_id: editingTrigger.profile_id || null,
          pipeline_id: editingTrigger.pipeline_id || null,
          enabled: editingTrigger.enabled,
          config_json: configJson,
        }),
      });
      await loadData();
      setEditingTrigger(null);
      setMessage("Trigger 已更新");
    } catch (err) {
      setMessage(`更新 Trigger 失敗：${String(err)}`);
    } finally {
      setSavingTriggerEdit(false);
    }
  }

  async function removeSourceFromEditingTrigger(sourceKey: string) {
    if (!editingTrigger) {
      return;
    }
    try {
      setMutatingSource(true);
      const payload = await apiRequest<TriggerMutationResponse>(`/api/triggers/${editingTrigger.id}/remove-source`, {
        method: "POST",
        body: JSON.stringify({ source_key: sourceKey }),
      });
      const nextTrigger = payload.trigger;
      if (nextTrigger) {
        const nextDraft = toTriggerEditDraft(nextTrigger);
        setEditingTrigger(nextDraft);
        await loadEditingTriggerSources(nextDraft);
      } else {
        await loadEditingTriggerSources(editingTrigger);
      }
      await loadData();
      setMessage(`已移除來源：${sourceKey}`);
    } catch (err) {
      setMessage(`移除來源失敗：${String(err)}`);
    } finally {
      setMutatingSource(false);
    }
  }

  async function quickAddYoutubeInEditor() {
    if (!editingTrigger || !editYoutubeVideoUrl.trim()) {
      setMessage("請貼上 YouTube 影片連結");
      return;
    }
    try {
      setMutatingSource(true);
      const payload = await apiRequest<TriggerMutationResponse>(`/api/triggers/${editingTrigger.id}/quick-add/youtube`, {
        method: "POST",
        body: JSON.stringify({ video_url: editYoutubeVideoUrl.trim() }),
      });
      const nextTrigger = payload.trigger;
      if (nextTrigger) {
        const nextDraft = toTriggerEditDraft(nextTrigger);
        setEditingTrigger(nextDraft);
        await loadEditingTriggerSources(nextDraft);
      } else {
        await loadEditingTriggerSources(editingTrigger);
      }
      setEditYoutubeVideoUrl("");
      await loadData();
      setMessage("已新增 YouTube 監控對象");
    } catch (err) {
      setMessage(`新增 YouTube 來源失敗：${String(err)}`);
    } finally {
      setMutatingSource(false);
    }
  }

  async function quickAddTgInEditor() {
    if (!editingTrigger || !editTgChatLink.trim()) {
      setMessage("請貼上 Telegram 聊天連結");
      return;
    }
    try {
      setMutatingSource(true);
      const payload = await apiRequest<TriggerMutationResponse>(`/api/triggers/${editingTrigger.id}/quick-add/tg`, {
        method: "POST",
        body: JSON.stringify({ chat_link: editTgChatLink.trim() }),
      });
      const nextTrigger = payload.trigger;
      if (nextTrigger) {
        const nextDraft = toTriggerEditDraft(nextTrigger);
        setEditingTrigger(nextDraft);
        await loadEditingTriggerSources(nextDraft);
      } else {
        await loadEditingTriggerSources(editingTrigger);
      }
      setEditTgChatLink("");
      await loadData();
      setMessage("已新增 TG 監控對象");
    } catch (err) {
      setMessage(`新增 TG 來源失敗：${String(err)}`);
    } finally {
      setMutatingSource(false);
    }
  }

  const topology = useMemo(() => {
    if (!selectedPipeline) {
      return null;
    }

    const pipelineProfiles = profiles.filter((p) => p.pipeline_id === selectedPipeline.id);
    const profileIds = new Set(pipelineProfiles.map((p) => p.id));
    const pipelineTriggers = triggers.filter((t) => {
      if (t.pipeline_id === selectedPipeline.id) {
        return true;
      }
      if (t.profile_id && profileIds.has(t.profile_id)) {
        return true;
      }
      return false;
    });

    const directSources = sources.filter((s) => s.default_profile_id && profileIds.has(s.default_profile_id));
    const unassignedSources = sources.filter((s) => !s.default_profile_id);

    const botMap = new Map(bots.map((b) => [b.id, b]));

    const matchGroupsForTag = (routingTag: string | null) => {
      return groups.filter((g) => {
        if (!g.enabled) {
          return false;
        }
        if (!routingTag) {
          return g.routing_tag == null;
        }
        return g.routing_tag === routingTag || g.routing_tag == null;
      });
    };

    const sourceLinks = directSources.map((s) => {
      const matchedGroups = matchGroupsForTag(s.routing_tag || null);
      return {
        source: s,
        matchedGroups,
      };
    });

    const matchedGroupIds = new Set(sourceLinks.flatMap((x) => x.matchedGroups.map((g) => g.id)));
    const connectedGroups = groups.filter((g) => matchedGroupIds.has(g.id));

    return {
      pipelineTriggers,
      pipelineProfiles,
      directSources,
      unassignedSources,
      sourceLinks,
      connectedGroups,
      botMap,
    };
  }, [selectedPipeline, profiles, sources, groups, bots, triggers]);

  const enabledIntents = intents.filter((i) => i.enabled);

  return (
    <section className="card">
      <h2>Pipeline 連接總覽</h2>
      <p className="muted">看單一 pipeline 的完整鏈路：Profile → Source → routing_tag → Group。</p>

      <IntroDetails title="關聯規則（點我展開）">
        <p>1. Trigger 先決定事件是否啟動，並可直接指定 profile/pipeline。</p>
        <p>2. Pipeline 透過 <strong>Profile.pipeline_id</strong> 關聯到 Profile。</p>
        <p>3. Source 透過 <strong>default_profile_id</strong> 綁定到某個 Profile（進而屬於某個 Pipeline）。</p>
        <p>4. 投遞用 <strong>routing_tag</strong> 找 Group：精準 tag + 全域 tag(null) 都會送。</p>
        <p>5. Intent 目前是全域設定（不是 pipeline 專屬）。</p>
      </IntroDetails>

      <div className="form-grid">
        <select value={selectedPipeline?.id || ""} onChange={(e) => setSelectedPipelineId(e.target.value)}>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.enabled ? "啟用" : "停用"})
            </option>
          ))}
        </select>
        <button onClick={() => void loadData()}>重新整理</button>
      </div>

      {message ? <p className="muted">{message}</p> : null}
      {loading ? <p className="muted">載入中...</p> : null}

      {!loading && selectedPipeline && topology ? (
        <>
          <section className="help-box">
            <p>
              <strong>目前 Pipeline：</strong> {selectedPipeline.name}
            </p>
            <p>
              <code>{selectedPipeline.id.slice(0, 8)}...</code> <CopyIdButton value={selectedPipeline.id} />
            </p>
            <p className="muted">
              版本 {selectedPipeline.version} / {selectedPipeline.enabled ? "啟用" : "停用"}
            </p>
          </section>

          <h3>0) Triggers（這條 Pipeline 的啟動條件）</h3>
          <p className="muted">可直接在這裡新增或刪除，不用跳去 Triggers 頁面。</p>
          <div className="help-box">
            <div className="form-grid compact">
              <input
                value={triggerDraft.name}
                onChange={(e) => setTriggerDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Trigger 名稱"
              />
              <select
                value={triggerDraft.platform}
                onChange={(e) => {
                  const platform = e.target.value;
                  setTriggerDraft((prev) => ({
                    ...prev,
                    platform,
                    event_type: platform === "youtube" ? "new_video" : "message",
                  }));
                }}
              >
                {TRIGGER_PLATFORM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    平台：{option}
                  </option>
                ))}
              </select>
              <select
                value={triggerDraft.event_type}
                onChange={(e) => setTriggerDraft((prev) => ({ ...prev, event_type: e.target.value }))}
              >
                {TRIGGER_EVENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    事件：{option}
                  </option>
                ))}
              </select>
              {triggerDraft.platform === "youtube" ? (
                <select
                  value={triggerDraft.youtube_video_type}
                  onChange={(e) =>
                    setTriggerDraft((prev) => ({
                      ...prev,
                      youtube_video_type: e.target.value as "any" | "long" | "shorts",
                    }))
                  }
                >
                  {YOUTUBE_VIDEO_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      YouTube 類型：{option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select disabled value="none">
                  <option value="none">YouTube 類型：不適用</option>
                </select>
              )}
            </div>
            <div className="form-grid compact" style={{ marginTop: 8 }}>
              <input
                value={triggerDraft.source_key}
                onChange={(e) => setTriggerDraft((prev) => ({ ...prev, source_key: e.target.value }))}
                placeholder="source_key，例如 yt:channel:UCxxx 或 tg:-100xxxx"
              />
              <select
                value={triggerDraft.profile_id}
                onChange={(e) => setTriggerDraft((prev) => ({ ...prev, profile_id: e.target.value }))}
              >
                <option value="">綁定 Profile：預設</option>
                {topology.pipelineProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    綁定 Profile：{profile.name}
                  </option>
                ))}
              </select>
              <select
                value={triggerDraft.enabled ? "true" : "false"}
                onChange={(e) => setTriggerDraft((prev) => ({ ...prev, enabled: e.target.value === "true" }))}
              >
                <option value="true">狀態：啟用</option>
                <option value="false">狀態：停用</option>
              </select>
              <button
                onClick={() => void createTriggerForSelectedPipeline()}
                disabled={creatingTrigger || !triggerDraft.name.trim() || !triggerDraft.source_key.trim()}
              >
                {creatingTrigger ? "新增中..." : "新增到這條 Pipeline"}
              </button>
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Trigger 名稱</th>
                <th>ID</th>
                <th>平台/事件</th>
                <th>source_key</th>
                <th>綁定對象</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              {topology.pipelineTriggers.length === 0 ? (
                <tr>
                  <td colSpan={6}>此 Pipeline 目前沒有明確綁定的 Trigger。</td>
                </tr>
              ) : (
                topology.pipelineTriggers.map((t) => {
                  const profile = topology.pipelineProfiles.find((p) => p.id === t.profile_id);
                  const cfgType = getYoutubeTypeFromConfig(t.config_json);
                  const videoTypeLabel = cfgType === "long" ? "長片" : cfgType === "shorts" ? "Shorts" : "不限";
                  return (
                    <tr key={t.id}>
                      <td className="name-cell">{t.name}</td>
                      <td className="id-cell">
                        <code>{t.id.slice(0, 8)}...</code>
                        <br />
                        <CopyIdButton value={t.id} />
                      </td>
                      <td>
                        {t.platform} / {t.event_type}
                        {t.platform === "youtube" ? (
                          <>
                            <br />
                            <span className="muted">類型：{videoTypeLabel}</span>
                          </>
                        ) : null}
                        <br />
                        <span className="muted">狀態：{t.enabled ? "啟用" : "停用"}</span>
                      </td>
                      <td>{t.source_key}</td>
                      <td>
                        {profile ? `Profile: ${profile.name}` : "Profile: 預設"}
                        <br />
                        {t.pipeline_id ? `Pipeline: ${t.pipeline_id.slice(0, 8)}...` : "Pipeline: 預設"}
                      </td>
                      <td>
                        <button className="btn-inline" onClick={() => openTriggerEditor(t)} style={{ marginRight: 8 }}>
                          編輯
                        </button>
                        <button className="btn-inline danger" onClick={() => void removeTrigger(t.id)}>
                          刪除
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <h3>1) Profiles（此 Pipeline）</h3>
          <table className="table">
            <thead>
              <tr>
                <th>名稱</th>
                <th>ID</th>
                <th>參數</th>
                <th>旗標</th>
              </tr>
            </thead>
            <tbody>
              {topology.pipelineProfiles.length === 0 ? (
                <tr>
                  <td colSpan={4}>此 pipeline 尚未綁定任何 profile。</td>
                </tr>
              ) : (
                topology.pipelineProfiles.map((p) => (
                  <tr key={p.id}>
                    <td className="name-cell">{p.name}</td>
                    <td className="id-cell">
                      <code>{p.id.slice(0, 8)}...</code>
                      <br />
                      <CopyIdButton value={p.id} />
                    </td>
                    <td>
                      <code>{JSON.stringify(p.params_json || {})}</code>
                    </td>
                    <td>
                      <code>{JSON.stringify(p.flags_json || {})}</code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h3>2) Sources（經由 Profile 指向此 Pipeline）</h3>
          <table className="table">
            <thead>
              <tr>
                <th>來源名稱</th>
                <th>ID</th>
                <th>綁定 Profile</th>
                <th>routing_tag</th>
                <th>提取模式</th>
                <th>可送達 Group</th>
              </tr>
            </thead>
            <tbody>
              {topology.sourceLinks.length === 0 ? (
                <tr>
                  <td colSpan={6}>此 pipeline 目前沒有直接綁定來源（Source.default_profile_id）。</td>
                </tr>
              ) : (
                topology.sourceLinks.map(({ source, matchedGroups }) => {
                  const profile = topology.pipelineProfiles.find((p) => p.id === source.default_profile_id);
                  return (
                    <tr key={source.id}>
                      <td className="name-cell">{source.source_key}</td>
                      <td className="id-cell">
                        <code>{source.id.slice(0, 8)}...</code>
                        <br />
                        <CopyIdButton value={source.id} />
                      </td>
                      <td>{profile ? profile.name : source.default_profile_id || "-"}</td>
                      <td>{tagLabel(source.routing_tag)}</td>
                      <td>{source.extraction_mode}</td>
                      <td>
                        {matchedGroups.length === 0
                          ? "⚠ 沒有可送達群組"
                          : matchedGroups.map((g) => `${g.name} (${tagLabel(g.routing_tag)})`).join(" / ")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <h3>3) Groups（此 Pipeline 目前會送到）</h3>
          <table className="table">
            <thead>
              <tr>
                <th>群組名稱</th>
                <th>ID</th>
                <th>平台</th>
                <th>routing_tag</th>
                <th>Bot</th>
                <th>target_key</th>
              </tr>
            </thead>
            <tbody>
              {topology.connectedGroups.length === 0 ? (
                <tr>
                  <td colSpan={6}>目前沒有算出可送達群組，請檢查 Source.routing_tag 與 Group.routing_tag。</td>
                </tr>
              ) : (
                topology.connectedGroups.map((g) => {
                  const bot = topology.botMap.get(g.bot_id);
                  return (
                    <tr key={g.id}>
                      <td className="name-cell">{g.name}</td>
                      <td className="id-cell">
                        <code>{g.id.slice(0, 8)}...</code>
                        <br />
                        <CopyIdButton value={g.id} />
                      </td>
                      <td>{g.platform}</td>
                      <td>{tagLabel(g.routing_tag)}</td>
                      <td>{bot ? `${bot.name} (${bot.platform})` : g.bot_id}</td>
                      <td>{g.target_key}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <h3>4) Unassigned Sources（未綁 default_profile_id）</h3>
          <p className="muted">這些來源不屬於任何特定 pipeline，會走系統預設 profile（容易看不出關聯）。</p>
          <table className="table">
            <thead>
              <tr>
                <th>來源名稱</th>
                <th>ID</th>
                <th>routing_tag</th>
                <th>提取模式</th>
              </tr>
            </thead>
            <tbody>
              {topology.unassignedSources.length === 0 ? (
                <tr>
                  <td colSpan={4}>目前沒有 unassigned source。</td>
                </tr>
              ) : (
                topology.unassignedSources.map((s) => (
                  <tr key={s.id}>
                    <td className="name-cell">{s.source_key}</td>
                    <td className="id-cell">
                      <code>{s.id.slice(0, 8)}...</code>
                      <br />
                      <CopyIdButton value={s.id} />
                    </td>
                    <td>{tagLabel(s.routing_tag)}</td>
                    <td>{s.extraction_mode}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h3>5) Intents（全域互動）</h3>
          <table className="table">
            <thead>
              <tr>
                <th>intent_key</th>
                <th>平台</th>
                <th>step_id</th>
                <th>queue</th>
              </tr>
            </thead>
            <tbody>
              {enabledIntents.length === 0 ? (
                <tr>
                  <td colSpan={4}>目前沒有啟用中的 intent。</td>
                </tr>
              ) : (
                enabledIntents.map((i) => (
                  <tr key={i.id}>
                    <td>{i.intent_key}</td>
                    <td>{i.platform}</td>
                    <td>{i.step_id}</td>
                    <td>{i.queue_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      ) : null}

      {editingTrigger ? (
        <div className="modal-backdrop" onClick={closeTriggerEditor}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>編輯 Trigger</h3>
            <p className="muted" style={{ marginTop: -6 }}>
              ID: <code>{editingTrigger.id}</code>
            </p>

            <div className="form-grid compact">
              <input
                value={editingTrigger.name}
                onChange={(e) => setEditingTrigger((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                placeholder="Trigger 名稱"
              />
              <select
                value={editingTrigger.platform}
                onChange={(e) => {
                  const platform = e.target.value;
                  setEditingTrigger((prev) =>
                    prev
                      ? {
                          ...prev,
                          platform,
                          event_type: platform === "youtube" ? "new_video" : prev.event_type === "new_video" ? "message" : prev.event_type,
                        }
                      : prev,
                  );
                }}
              >
                {TRIGGER_PLATFORM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    平台：{option}
                  </option>
                ))}
              </select>
              <select
                value={editingTrigger.event_type}
                onChange={(e) => setEditingTrigger((prev) => (prev ? { ...prev, event_type: e.target.value } : prev))}
              >
                {TRIGGER_EVENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    事件：{option}
                  </option>
                ))}
              </select>
              <select
                value={editingTrigger.enabled ? "true" : "false"}
                onChange={(e) => setEditingTrigger((prev) => (prev ? { ...prev, enabled: e.target.value === "true" } : prev))}
              >
                <option value="true">狀態：啟用</option>
                <option value="false">狀態：停用</option>
              </select>
            </div>

            <div className="form-grid compact" style={{ marginTop: 8 }}>
              <select
                value={editingTrigger.profile_id}
                onChange={(e) => setEditingTrigger((prev) => (prev ? { ...prev, profile_id: e.target.value } : prev))}
              >
                <option value="">綁定 Profile：預設</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    綁定 Profile：{profile.name}
                  </option>
                ))}
              </select>
              <select
                value={editingTrigger.pipeline_id}
                onChange={(e) => setEditingTrigger((prev) => (prev ? { ...prev, pipeline_id: e.target.value } : prev))}
              >
                <option value="">綁定 Pipeline：預設</option>
                {pipelines.map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    綁定 Pipeline：{pipeline.name}
                  </option>
                ))}
              </select>
              {editingTrigger.platform === "youtube" ? (
                <select
                  value={editingTrigger.youtube_video_type}
                  onChange={(e) =>
                    setEditingTrigger((prev) =>
                      prev ? { ...prev, youtube_video_type: e.target.value as "any" | "long" | "shorts" } : prev,
                    )
                  }
                >
                  {YOUTUBE_VIDEO_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      YouTube 類型：{option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select disabled value="none">
                  <option value="none">YouTube 類型：不適用</option>
                </select>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <div className="field-label">監控對象</div>
              {editingTrigger.platform === "youtube" ? (
                <div className="form-grid compact">
                  <input
                    value={editYoutubeVideoUrl}
                    onChange={(e) => setEditYoutubeVideoUrl(e.target.value)}
                    placeholder="貼 YouTube 影片連結，會自動加入該頻道"
                  />
                  <button onClick={() => void quickAddYoutubeInEditor()} disabled={mutatingSource || !editYoutubeVideoUrl.trim()}>
                    加入 YouTube 頻道
                  </button>
                </div>
              ) : null}
              {editingTrigger.platform === "tg" ? (
                <div className="form-grid compact">
                  <input
                    value={editTgChatLink}
                    onChange={(e) => setEditTgChatLink(e.target.value)}
                    placeholder="貼 TG 連結（t.me/c/... 或 t.me/username）"
                  />
                  <button onClick={() => void quickAddTgInEditor()} disabled={mutatingSource || !editTgChatLink.trim()}>
                    加入 TG 聊天室
                  </button>
                </div>
              ) : null}
              {loadingEditingSources ? <p className="muted">讀取監控對象中...</p> : null}
              <div className="source-list" style={{ marginTop: 8 }}>
                {editingTriggerSources.length === 0 ? (
                  <span className="muted">目前沒有監控對象</span>
                ) : (
                  editingTriggerSources.map((item) => (
                    <div key={`${editingTrigger.id}-${item.source_key}`} className="source-item">
                      <div>
                        <div className="source-title">{item.display_name}</div>
                        <div className="source-meta">
                          <code>{item.source_key}</code> · {item.platform}
                        </div>
                      </div>
                      <button
                        className="btn-inline danger"
                        onClick={() => void removeSourceFromEditingTrigger(item.source_key)}
                        disabled={mutatingSource || editingTriggerSources.length <= 1}
                        title={editingTriggerSources.length <= 1 ? "至少保留一個來源" : "移除這個來源"}
                      >
                        移除
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <details className="source-advanced">
                <summary>進階：手動編輯 source_key</summary>
                <textarea
                  rows={3}
                  value={editingTrigger.source_key}
                  onChange={(e) => setEditingTrigger((prev) => (prev ? { ...prev, source_key: e.target.value } : prev))}
                />
              </details>
            </div>

            <div style={{ marginTop: 10 }}>
              <div className="field-label">config_json</div>
              <textarea
                rows={5}
                value={editingTrigger.config_json_text}
                onChange={(e) => setEditingTrigger((prev) => (prev ? { ...prev, config_json_text: e.target.value } : prev))}
              />
            </div>

            <div className="modal-actions">
              <button className="btn-danger" onClick={closeTriggerEditor} disabled={savingTriggerEdit}>
                取消
              </button>
              <button onClick={() => void saveTriggerEditor()} disabled={savingTriggerEdit}>
                {savingTriggerEdit ? "儲存中..." : "儲存變更"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
