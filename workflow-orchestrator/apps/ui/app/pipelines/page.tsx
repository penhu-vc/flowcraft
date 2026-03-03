"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CopyIdButton from "../components/CopyIdButton";
import IntroDetails from "../components/IntroDetails";
import { API_BASE_URL, apiRequest } from "../lib/api";

type PipelineNode = {
  id: string;
  type?: string;
  label?: string;
  data?: Record<string, unknown>;
};

type Pipeline = {
  id: string;
  name: string;
  graph_json: {
    nodes?: PipelineNode[];
    edges?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  version: number;
  enabled: boolean;
};

type PipelineDraft = {
  name: string;
  enabled: boolean;
  nodeLabels: Record<string, string>;
};

function getNodes(graph: Pipeline["graph_json"]): PipelineNode[] {
  return Array.isArray(graph?.nodes) ? graph.nodes : [];
}

function getNodeLabel(node: PipelineNode): string {
  if (typeof node.label === "string" && node.label.trim()) {
    return node.label;
  }
  const fromData = node.data?.label;
  if (typeof fromData === "string" && fromData.trim()) {
    return fromData;
  }
  return node.id;
}

function setNodeLabel(node: PipelineNode, nextLabel: string): PipelineNode {
  return {
    ...node,
    label: nextLabel,
    data: { ...(node.data || {}), label: nextLabel },
  };
}

function toDraft(p: Pipeline): PipelineDraft {
  const labels: Record<string, string> = {};
  for (const node of getNodes(p.graph_json)) {
    labels[node.id] = getNodeLabel(node);
  }
  return { name: p.name, enabled: p.enabled, nodeLabels: labels };
}

export default function PipelinesPage() {
  const [rows, setRows] = useState<Pipeline[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PipelineDraft>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/pipelines`, { cache: "no-store" });
      const data = (await res.json()) as Pipeline[];
      setRows(data);
      const nextDrafts: Record<string, PipelineDraft> = {};
      for (const p of data) {
        nextDrafts[p.id] = toDraft(p);
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

  async function savePipeline(pipelineId: string) {
    const pipeline = rows.find((row) => row.id === pipelineId);
    const draft = drafts[pipelineId];
    if (!pipeline || !draft) {
      return;
    }

    const nextNodes = getNodes(pipeline.graph_json).map((node) =>
      setNodeLabel(node, (draft.nodeLabels[node.id] || node.id).trim() || node.id),
    );
    const nextGraph = { ...pipeline.graph_json, nodes: nextNodes };

    try {
      await apiRequest(`/api/pipelines/${pipelineId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name,
          enabled: draft.enabled,
          graph_json: nextGraph,
        }),
      });
      await loadData();
      setMessage(`流程已儲存：${draft.name}`);
    } catch (err) {
      setMessage(`儲存失敗：${String(err)}`);
    }
  }

  return (
    <section className="card">
      <h2>流程（Pipelines）</h2>
      <p className="muted">名稱為主、ID 僅備查。可直接改流程名稱與節點名稱。</p>
      <p className="muted">
        看完整關聯請到 <Link href="/topology">連接圖</Link>。
      </p>

      <IntroDetails title="這頁是做什麼？（點我展開）">
        <p>流程是整套工作流骨架，決定觸發後要跑哪些步驟。</p>
        <p>你可以先改流程名稱，再改每個節點名稱（例如把 skill3_pipeline 改成「事實重寫」）。</p>
        <p>ID 不用背，旁邊有「複製 ID」按鈕。</p>
      </IntroDetails>

      {message ? <p className="muted">{message}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>流程名稱</th>
            <th>ID</th>
            <th>版本</th>
            <th>節點名稱（可改）</th>
            <th>啟用</th>
            <th>動作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6}>載入中...</td>
            </tr>
          ) : (
            rows.map((row) => {
              const draft = drafts[row.id] || toDraft(row);
              const nodes = getNodes(row.graph_json);
              return (
                <tr key={row.id}>
                  <td className="name-cell">
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, name: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="id-cell">
                    <code>{row.id.slice(0, 8)}...</code>
                    <br />
                    <CopyIdButton value={row.id} />
                  </td>
                  <td>{row.version}</td>
                  <td>
                    {nodes.length === 0 ? (
                      <span className="muted">此流程暫無節點</span>
                    ) : (
                      nodes.map((node) => (
                        <div key={node.id} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              value={draft.nodeLabels[node.id] || node.id}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [row.id]: {
                                    ...draft,
                                    nodeLabels: { ...draft.nodeLabels, [node.id]: e.target.value },
                                  },
                                }))
                              }
                            />
                            <CopyIdButton value={node.id} />
                          </div>
                          <span className="muted">type: {node.type || "node"}</span>
                        </div>
                      ))
                    )}
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
                    <button onClick={() => void savePipeline(row.id)} disabled={!draft.name.trim()}>
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
