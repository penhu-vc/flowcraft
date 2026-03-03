"use client";

import { useEffect, useState } from "react";
import CopyIdButton from "../components/CopyIdButton";
import IntroDetails from "../components/IntroDetails";
import { API_BASE_URL, apiRequest } from "../lib/api";

type Intent = {
  id: string;
  platform: string;
  intent_key: string;
  step_id: string;
  queue_name: string;
  enabled: boolean;
};

type IntentDraft = {
  platform: string;
  intent_key: string;
  step_id: string;
  queue_name: string;
  enabled: boolean;
};

function toDraft(row: Intent): IntentDraft {
  return {
    platform: row.platform,
    intent_key: row.intent_key,
    step_id: row.step_id,
    queue_name: row.queue_name,
    enabled: row.enabled,
  };
}

export default function IntentsPage() {
  const [rows, setRows] = useState<Intent[]>([]);
  const [drafts, setDrafts] = useState<Record<string, IntentDraft>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/intents`, { cache: "no-store" });
      const data = (await res.json()) as Intent[];
      setRows(data);
      const nextDrafts: Record<string, IntentDraft> = {};
      for (const row of data) {
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

  async function saveRow(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }

    try {
      await apiRequest(`/api/intents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          platform: draft.platform,
          intent_key: draft.intent_key,
          step_id: draft.step_id,
          queue_name: draft.queue_name,
          enabled: draft.enabled,
        }),
      });
      await loadData();
      setMessage(`互動已儲存：${draft.intent_key}`);
    } catch (err) {
      setMessage(`儲存失敗：${String(err)}`);
    }
  }

  return (
    <section className="card">
      <h2>互動 Intent</h2>
      <p className="muted">名稱為主，ID 只做複製。這裡定義按鈕互動要觸發哪個 worker step。</p>

      <IntroDetails title="這頁是做什麼？（點我展開）">
        <p><strong>intent_key</strong> 是互動名稱（例如 rewrite_v2）。</p>
        <p><strong>step_id</strong> 是實際要跑的 worker 步驟。</p>
        <p><strong>queue_name</strong> 決定送到哪條 queue 執行。</p>
      </IntroDetails>

      {message ? <p className="muted">{message}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>名稱（intent_key）</th>
            <th>ID</th>
            <th>平台</th>
            <th>step_id</th>
            <th>queue</th>
            <th>啟用</th>
            <th>動作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7}>載入中...</td>
            </tr>
          ) : (
            rows.map((row) => {
              const draft = drafts[row.id] || toDraft(row);
              return (
                <tr key={row.id}>
                  <td className="name-cell">
                    <input
                      value={draft.intent_key}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, intent_key: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="id-cell">
                    <code>{row.id.slice(0, 8)}...</code>
                    <br />
                    <CopyIdButton value={row.id} />
                  </td>
                  <td>
                    <select
                      value={draft.platform}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, platform: e.target.value },
                        }))
                      }
                    >
                      <option value="tg">tg</option>
                      <option value="dc">dc</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={draft.step_id}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, step_id: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={draft.queue_name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, queue_name: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={draft.enabled ? "true" : "false"}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, enabled: e.target.value === "true" },
                        }))
                      }
                    >
                      <option value="true">是</option>
                      <option value="false">否</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={() => void saveRow(row.id)} disabled={!draft.intent_key.trim() || !draft.step_id.trim()}>
                      儲存
                    </button>
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
