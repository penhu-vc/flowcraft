import { fetchApi } from "../lib/api";

type Run = {
  id: string;
  status: string;
  trigger_event_id: string;
  outputs_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export default async function RunsPage() {
  const runs = await fetchApi<Run[]>("/api/runs?limit=100");

  return (
    <section className="card">
      <h2>執行紀錄（Runs / Timeline）</h2>
      <p className="muted">一筆 Run 代表一次事件觸發後的完整產出。</p>
      <table className="table">
        <thead>
          <tr>
            <th>Run ID</th>
            <th>狀態</th>
            <th>觸發事件</th>
            <th>輸出</th>
            <th>更新時間</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>{run.id}</td>
              <td>
                <span className="badge">{run.status}</span>
              </td>
              <td>{run.trigger_event_id}</td>
              <td>{String(run.outputs_json?.v1_script || "")}</td>
              <td>{new Date(run.updated_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
