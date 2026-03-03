"use client";

import { useEffect, useState } from "react";
import CopyIdButton from "../components/CopyIdButton";
import IntroDetails from "../components/IntroDetails";
import { API_BASE_URL, apiRequest } from "../lib/api";

type Bot = {
  id: string;
  platform: string;
  name: string;
  token_secret_ref: string;
  status: string;
  rate_policy_json: Record<string, unknown>;
};

type BotDraft = {
  platform: string;
  name: string;
  token_secret_ref: string;
  status: string;
  rate_policy_json: string;
};

function toDraft(bot: Bot): BotDraft {
  return {
    platform: bot.platform,
    name: bot.name,
    token_secret_ref: bot.token_secret_ref,
    status: bot.status,
    rate_policy_json: JSON.stringify(bot.rate_policy_json || {}, null, 2),
  };
}

function parseJson(raw: string): Record<string, unknown> {
  return raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

export default function BotsPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [drafts, setDrafts] = useState<Record<string, BotDraft>>({});
  const [form, setForm] = useState<BotDraft>({
    platform: "tg",
    name: "",
    token_secret_ref: "env://TG_BOT_TOKEN",
    status: "active",
    rate_policy_json: "{}",
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/bots`, { cache: "no-store" });
      const rows = (await res.json()) as Bot[];
      setBots(rows);

      const nextDrafts: Record<string, BotDraft> = {};
      for (const row of rows) {
        nextDrafts[row.id] = toDraft(row);
      }
      setDrafts(nextDrafts);
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

  async function createBot() {
    try {
      await apiRequest("/api/bots", {
        method: "POST",
        body: JSON.stringify({
          platform: form.platform,
          name: form.name,
          token_secret_ref: form.token_secret_ref,
          status: form.status,
          rate_policy_json: parseJson(form.rate_policy_json),
        }),
      });
      setForm({
        platform: "tg",
        name: "",
        token_secret_ref: "env://TG_BOT_TOKEN",
        status: "active",
        rate_policy_json: "{}",
      });
      await loadData();
      setMessage("Bot 建立成功");
    } catch (err) {
      setMessage(`建立失敗：${String(err)}`);
    }
  }

  async function saveBot(botId: string) {
    const draft = drafts[botId];
    if (!draft) {
      return;
    }

    try {
      await apiRequest(`/api/bots/${botId}`, {
        method: "PATCH",
        body: JSON.stringify({
          platform: draft.platform,
          name: draft.name,
          token_secret_ref: draft.token_secret_ref,
          status: draft.status,
          rate_policy_json: parseJson(draft.rate_policy_json),
        }),
      });
      await loadData();
      setMessage(`Bot 已儲存：${botId}`);
    } catch (err) {
      setMessage(`儲存失敗：${String(err)}`);
    }
  }

  return (
    <section className="card">
      <h2>Bot（發送器設定）</h2>
      <p className="muted">這裡管理每個可發送訊息的 Bot，支援 TG / DC。</p>

      <IntroDetails title="這頁是做什麼？（點我展開）">
        <p><strong>platform</strong>：平台，tg=Telegram，dc=Discord。</p>
        <p><strong>name</strong>：後台識別名稱。</p>
        <p><strong>token_secret_ref</strong>：金鑰參照，不要放明文。建議 <code>env://TG_BOT_TOKEN</code>。</p>
        <p><strong>status</strong>：active 可用，paused 暫停。</p>
        <p><strong>rate_policy_json</strong>：節流策略，例如 <code>{'{"per_min":20}'}</code>。</p>
      </IntroDetails>

      <div className="form-grid">
        <select value={form.platform} onChange={(e) => setForm((prev) => ({ ...prev, platform: e.target.value }))}>
          <option value="tg">tg（Telegram）</option>
          <option value="dc">dc（Discord）</option>
        </select>
        <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Bot 名稱" />
        <input
          value={form.token_secret_ref}
          onChange={(e) => setForm((prev) => ({ ...prev, token_secret_ref: e.target.value }))}
          placeholder="token 參照（例如 env://TG_BOT_TOKEN）"
        />
      </div>

      <div className="form-grid">
        <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
          <option value="active">active（啟用）</option>
          <option value="paused">paused（暫停）</option>
        </select>
        <textarea
          rows={5}
          value={form.rate_policy_json}
          onChange={(e) => setForm((prev) => ({ ...prev, rate_policy_json: e.target.value }))}
          placeholder='rate_policy_json，例如 {"per_min":20}'
        />
        <button onClick={() => void createBot()} disabled={!form.name || !form.token_secret_ref}>
          新增 Bot
        </button>
      </div>

      {message ? <p className="muted">{message}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>名稱</th>
            <th>ID</th>
            <th>平台</th>
            <th>狀態</th>
            <th>Token 參照</th>
            <th>節流 JSON</th>
            <th>動作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7}>載入中...</td>
            </tr>
          ) : (
            bots.map((bot) => {
              const draft = drafts[bot.id] || toDraft(bot);
              return (
                <tr key={bot.id}>
                  <td className="name-cell">
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [bot.id]: { ...draft, name: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="id-cell">
                    <code>{bot.id.slice(0, 8)}...</code>
                    <br />
                    <CopyIdButton value={bot.id} />
                  </td>
                  <td>
                    <select
                      value={draft.platform}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [bot.id]: { ...draft, platform: e.target.value },
                        }))
                      }
                    >
                      <option value="tg">tg</option>
                      <option value="dc">dc</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={draft.status}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [bot.id]: { ...draft, status: e.target.value },
                        }))
                      }
                    >
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={draft.token_secret_ref}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [bot.id]: { ...draft, token_secret_ref: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      rows={4}
                      value={draft.rate_policy_json}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [bot.id]: { ...draft, rate_policy_json: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <button onClick={() => void saveBot(bot.id)}>儲存</button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
