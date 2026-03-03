"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, apiRequest } from "../lib/api";

type Bot = {
  id: string;
  name: string;
  platform: string;
};

type Group = {
  id: string;
  name: string;
};

type Pipeline = {
  id: string;
  name: string;
};

export default function QuickStartPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);

  const [botName, setBotName] = useState("我的 Telegram Bot");
  const [botTokenRef, setBotTokenRef] = useState("env://TG_BOT_TOKEN");

  const [groupName, setGroupName] = useState("預設回覆群組");
  const [groupTargetKey, setGroupTargetKey] = useState("");
  const [selectedBotId, setSelectedBotId] = useState("");

  const [profileName, setProfileName] = useState("預設風格");
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [tone, setTone] = useState("自然口語");
  const [skipFact, setSkipFact] = useState(false);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const [botsRes, groupsRes, pipelinesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/bots`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/groups`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/pipelines`, { cache: "no-store" }),
      ]);
      const botsJson = (await botsRes.json()) as Bot[];
      const groupsJson = (await groupsRes.json()) as Group[];
      const pipelinesJson = (await pipelinesRes.json()) as Pipeline[];

      setBots(botsJson);
      setGroups(groupsJson);
      setPipelines(pipelinesJson);

      if (!selectedBotId && botsJson[0]) {
        setSelectedBotId(botsJson[0].id);
      }
      if (!selectedPipelineId && pipelinesJson[0]) {
        setSelectedPipelineId(pipelinesJson[0].id);
      }
      setMessage("");
    } catch (err) {
      setMessage(`載入失敗：${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function createBotStep() {
    try {
      const bot = await apiRequest<Bot>("/api/bots", {
        method: "POST",
        body: JSON.stringify({
          platform: "tg",
          name: botName,
          token_secret_ref: botTokenRef,
          status: "active",
          rate_policy_json: { per_min: 20 },
        }),
      });
      await reload();
      setSelectedBotId(bot.id);
      setMessage("步驟 1 完成：Bot 已建立。接著做步驟 2。\n");
    } catch (err) {
      setMessage(`建立 Bot 失敗：${String(err)}`);
    }
  }

  async function createGroupStep() {
    if (!selectedBotId) {
      setMessage("請先選擇 Bot");
      return;
    }

    try {
      await apiRequest<Group>("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          platform: "tg",
          bot_id: selectedBotId,
          target_key: groupTargetKey,
          name: groupName,
        }),
      });
      await reload();
      setMessage("步驟 2 完成：群組已建立。接著做步驟 3。\n");
    } catch (err) {
      setMessage(`建立群組失敗：${String(err)}`);
    }
  }

  async function createProfileStep() {
    if (!selectedPipelineId) {
      setMessage("請先選擇 Pipeline");
      return;
    }

    try {
      await apiRequest("/api/profiles", {
        method: "POST",
        body: JSON.stringify({
          name: profileName,
          pipeline_id: selectedPipelineId,
          params_json: { tone },
          flags_json: { skip_fact: skipFact },
        }),
      });
      await reload();
      setMessage("步驟 3 完成：Profile 已建立。現在可以去 Runs/Ops 看流程執行。\n");
    } catch (err) {
      setMessage(`建立 Profile 失敗：${String(err)}`);
    }
  }

  const summary = useMemo(
    () => `目前資料：Bot ${bots.length} 個 / 群組 ${groups.length} 個 / Pipeline ${pipelines.length} 個`,
    [bots.length, groups.length, pipelines.length],
  );

  return (
    <section className="card">
      <h2>新手引導（最少欄位版）</h2>
      <p className="muted">只要照步驟 1、2、3 做完，就能建立可用的最小設定。</p>
      <p className="muted">{loading ? "載入中..." : summary}</p>

      <div className="help-box">
        <p><strong>步驟 1：建立 Bot</strong>（先定義誰負責發送）</p>
        <p><strong>步驟 2：建立群組</strong>（定義發到哪個 chat_id）</p>
        <p><strong>步驟 3：建立 Profile</strong>（定義語氣與開關）</p>
      </div>

      <h3>步驟 1：Bot</h3>
      <div className="form-grid">
        <input value={botName} onChange={(e) => setBotName(e.target.value)} placeholder="Bot 名稱" />
        <input value={botTokenRef} onChange={(e) => setBotTokenRef(e.target.value)} placeholder="token 參照（env://TG_BOT_TOKEN）" />
        <button onClick={() => void createBotStep()} disabled={!botName || !botTokenRef}>建立 Bot</button>
      </div>

      <h3>步驟 2：群組</h3>
      <div className="form-grid">
        <select value={selectedBotId} onChange={(e) => setSelectedBotId(e.target.value)}>
          <option value="">請選擇 Bot</option>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.name} ({bot.id.slice(0, 8)})
            </option>
          ))}
        </select>
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="群組名稱" />
        <input
          value={groupTargetKey}
          onChange={(e) => setGroupTargetKey(e.target.value)}
          placeholder="Telegram chat_id（例如 -1001234567890）"
        />
        <button onClick={() => void createGroupStep()} disabled={!selectedBotId || !groupName || !groupTargetKey}>
          建立群組
        </button>
      </div>

      <h3>步驟 3：Profile</h3>
      <div className="form-grid">
        <select value={selectedPipelineId} onChange={(e) => setSelectedPipelineId(e.target.value)}>
          <option value="">請選擇 Pipeline</option>
          {pipelines.map((pipeline) => (
            <option key={pipeline.id} value={pipeline.id}>
              {pipeline.name} ({pipeline.id.slice(0, 8)})
            </option>
          ))}
        </select>
        <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Profile 名稱" />
        <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="語氣（例如：自然口語、正式）" />
      </div>
      <div className="form-grid">
        <label className="checkbox-row">
          <input type="checkbox" checked={skipFact} onChange={(e) => setSkipFact(e.target.checked)} />
          <span>跳過 fact 步驟（skip_fact）</span>
        </label>
        <button onClick={() => void createProfileStep()} disabled={!selectedPipelineId || !profileName}>
          建立 Profile
        </button>
      </div>

      {message ? <p className="muted">{message}</p> : null}
    </section>
  );
}
