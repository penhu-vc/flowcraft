"use client";

import { useEffect, useState } from "react";
import CopyIdButton from "../components/CopyIdButton";
import IntroDetails from "../components/IntroDetails";
import { API_BASE_URL, apiRequest } from "../lib/api";

type Source = {
  id: string;
  platform: string;
  source_key: string;
  routing_tag: string | null;
  extraction_mode: string;
  enabled: boolean;
};

type SourceDraft = {
  platform: string;
  source_key: string;
  routing_tag: string;
  extraction_mode: string;
  enabled: boolean;
};

function toDraft(row: Source): SourceDraft {
  return {
    platform: row.platform,
    source_key: row.source_key,
    routing_tag: row.routing_tag || "",
    extraction_mode: row.extraction_mode,
    enabled: row.enabled,
  };
}

export default function SourcesPage() {
  const [rows, setRows] = useState<Source[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SourceDraft>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sources`, { cache: "no-store" });
      const data = (await res.json()) as Source[];
      setRows(data);
      const nextDrafts: Record<string, SourceDraft> = {};
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
      await apiRequest(`/api/sources/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          platform: draft.platform,
          source_key: draft.source_key,
          routing_tag: draft.routing_tag || null,
          extraction_mode: draft.extraction_mode,
          enabled: draft.enabled,
        }),
      });
      await loadData();
      setMessage(`來源已儲存：${draft.source_key}`);
    } catch (err) {
      setMessage(`儲存失敗：${String(err)}`);
    }
  }

  return (
    <section className="card">
      <h2>來源（YouTube/RSS）</h2>
      <p className="muted">名稱為主，ID 只用來複製與對照。</p>

      <IntroDetails title="這頁是做什麼？（點我展開）">
        <p>來源代表你監聽的頻道或來源鍵，例如 YouTube channel。</p>
        <p><strong>source_key</strong> 建議用 <code>yt:channel:&lt;channel_id&gt;</code>。</p>
        <p><strong>extraction_mode</strong> 可切換 notebooklm 或 subtitle。</p>
      </IntroDetails>

      {message ? <p className="muted">{message}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>名稱（來源鍵）</th>
            <th>ID</th>
            <th>平台</th>
            <th>分類</th>
            <th>提取模式</th>
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
                      value={draft.source_key}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, source_key: e.target.value },
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
                      <option value="youtube">youtube</option>
                      <option value="rss">rss</option>
                      <option value="tg_channel">tg_channel</option>
                      <option value="dc_channel">dc_channel</option>
                      <option value="manual">manual</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={draft.routing_tag}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, routing_tag: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={draft.extraction_mode}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, extraction_mode: e.target.value },
                        }))
                      }
                    >
                      <option value="notebooklm">notebooklm</option>
                      <option value="subtitle">subtitle</option>
                    </select>
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
                    <button onClick={() => void saveRow(row.id)} disabled={!draft.source_key.trim()}>
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
