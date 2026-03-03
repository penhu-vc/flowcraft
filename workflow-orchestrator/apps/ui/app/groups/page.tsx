"use client";

import { useEffect, useState } from "react";
import CopyIdButton from "../components/CopyIdButton";
import IntroDetails from "../components/IntroDetails";
import { API_BASE_URL, apiRequest } from "../lib/api";

type Group = {
  id: string;
  platform: string;
  bot_id: string;
  target_key: string;
  name: string;
};

type Bot = {
  id: string;
  name: string;
};

type GroupDraft = {
  platform: string;
  bot_id: string;
  target_key: string;
  name: string;
};

function toDraft(group: Group): GroupDraft {
  return {
    platform: group.platform,
    bot_id: group.bot_id,
    target_key: group.target_key,
    name: group.name,
  };
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [drafts, setDrafts] = useState<Record<string, GroupDraft>>({});
  const [form, setForm] = useState<GroupDraft>({ platform: "tg", bot_id: "", target_key: "", name: "" });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [groupsRes, botsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/groups`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/bots`, { cache: "no-store" }),
      ]);
      const groupsJson = (await groupsRes.json()) as Group[];
      const botsJson = (await botsRes.json()) as Bot[];

      setGroups(groupsJson);
      setBots(botsJson);

      const nextDrafts: Record<string, GroupDraft> = {};
      for (const group of groupsJson) {
        nextDrafts[group.id] = toDraft(group);
      }
      setDrafts(nextDrafts);
      setForm((prev) => ({ ...prev, bot_id: prev.bot_id || botsJson[0]?.id || "" }));
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

  async function createGroup() {
    try {
      await apiRequest("/api/groups", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ platform: "tg", bot_id: bots[0]?.id || "", target_key: "", name: "" });
      await loadData();
      setMessage("群組建立成功");
    } catch (err) {
      setMessage(`建立失敗：${String(err)}`);
    }
  }

  async function saveGroup(groupId: string) {
    const draft = drafts[groupId];
    if (!draft) {
      return;
    }

    try {
      await apiRequest(`/api/groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      await loadData();
      setMessage(`群組已儲存：${groupId}`);
    } catch (err) {
      setMessage(`儲存失敗：${String(err)}`);
    }
  }

  return (
    <section className="card">
      <h2>群組（投遞目標）</h2>
      <p className="muted">把 Bot 綁到實際要發送的聊天目標（chat/channel）。</p>

      <IntroDetails title="這頁是做什麼？（點我展開）">
        <p><strong>platform</strong>：目標平台，tg 或 dc。</p>
        <p><strong>bot_id</strong>：用哪個 Bot 發送。</p>
        <p><strong>target_key</strong>：目標 ID。Telegram 通常填 chat_id（群組常見負數）。</p>
        <p><strong>name</strong>：後台辨識名稱，例如「交易群 A」、「客服群」。</p>
      </IntroDetails>

      <div className="form-grid">
        <select value={form.platform} onChange={(e) => setForm((prev) => ({ ...prev, platform: e.target.value }))}>
          <option value="tg">tg（Telegram）</option>
          <option value="dc">dc（Discord）</option>
        </select>
        <select value={form.bot_id} onChange={(e) => setForm((prev) => ({ ...prev, bot_id: e.target.value }))}>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.name} ({bot.id.slice(0, 8)})
            </option>
          ))}
        </select>
        <input
          value={form.target_key}
          onChange={(e) => setForm((prev) => ({ ...prev, target_key: e.target.value }))}
          placeholder="target_key（例如 -1001234567890）"
        />
      </div>

      <div className="form-grid">
        <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="群組名稱" />
        <button onClick={() => void createGroup()} disabled={!form.name || !form.bot_id || !form.target_key}>
          新增群組
        </button>
      </div>

      {message ? <p className="muted">{message}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>名稱</th>
            <th>ID</th>
            <th>平台</th>
            <th>Bot</th>
            <th>Target Key</th>
            <th>動作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6}>載入中...</td>
            </tr>
          ) : (
            groups.map((group) => {
              const draft = drafts[group.id] || toDraft(group);
              return (
                <tr key={group.id}>
                  <td className="name-cell">
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [group.id]: { ...draft, name: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="id-cell">
                    <code>{group.id.slice(0, 8)}...</code>
                    <br />
                    <CopyIdButton value={group.id} />
                  </td>
                  <td>
                    <select
                      value={draft.platform}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [group.id]: { ...draft, platform: e.target.value },
                        }))
                      }
                    >
                      <option value="tg">tg</option>
                      <option value="dc">dc</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={draft.bot_id}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [group.id]: { ...draft, bot_id: e.target.value },
                        }))
                      }
                    >
                      {bots.map((bot) => (
                        <option key={bot.id} value={bot.id}>
                          {bot.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={draft.target_key}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [group.id]: { ...draft, target_key: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <button onClick={() => void saveGroup(group.id)}>儲存</button>
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
