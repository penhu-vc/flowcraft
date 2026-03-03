import { fetchApi } from "../lib/api";

type Job = {
  id: string;
  run_id: string;
  step_id: string;
  queue_name: string;
  status: string;
  attempts: number;
  lock_owner: string | null;
  updated_at: string;
};

type Lock = {
  resource_key: string;
  max_concurrency: number;
  holders_json: Array<Record<string, unknown>>;
  updated_at: string;
};

type Worker = {
  id: string;
  capabilities_json: string[];
  heartbeat_at: string;
  status: string;
};

type Outbox = {
  id: string;
  deliver_key: string;
  status: string;
  attempts: number;
  target_key: string;
  updated_at: string;
};

export default async function OpsPage() {
  const [jobs, locks, workers, outbox] = await Promise.all([
    fetchApi<Job[]>("/api/jobs?limit=100"),
    fetchApi<Lock[]>("/api/locks"),
    fetchApi<Worker[]>("/api/workers"),
    fetchApi<Outbox[]>("/api/outbox?limit=100"),
  ]);

  return (
    <>
      <section className="card">
        <h2>任務 / 佇列</h2>
        <p className="muted">看每一步任務現在在哪條 queue、是否卡住、重試幾次。</p>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>佇列</th>
              <th>步驟</th>
              <th>狀態</th>
              <th>嘗試次數</th>
              <th>鎖持有者</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.id}</td>
                <td>{job.queue_name}</td>
                <td>{job.step_id}</td>
                <td><span className="badge">{job.status}</span></td>
                <td>{job.attempts}</td>
                <td>{job.lock_owner || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>資源鎖</h2>
        <p className="muted">避免同機資源互搶，例如 notebooklm / photoshop / gpu。</p>
        <table className="table">
          <thead>
            <tr>
              <th>資源</th>
              <th>最大並行</th>
              <th>持有數</th>
              <th>更新時間</th>
            </tr>
          </thead>
          <tbody>
            {locks.map((lock) => (
              <tr key={lock.resource_key}>
                <td>{lock.resource_key}</td>
                <td>{lock.max_concurrency}</td>
                <td>{lock.holders_json.length}</td>
                <td>{new Date(lock.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Workers</h2>
        <p className="muted">看每個 worker 能力、心跳與是否在線。</p>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>能力</th>
              <th>狀態</th>
              <th>心跳時間</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => (
              <tr key={worker.id}>
                <td>{worker.id}</td>
                <td>{worker.capabilities_json.join(", ") || "-"}</td>
                <td><span className="badge">{worker.status}</span></td>
                <td>{new Date(worker.heartbeat_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Outbox（待發送）</h2>
        <p className="muted">Sender 會從這裡取件。可觀察去重鍵與重試狀態。</p>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>去重鍵</th>
              <th>目標</th>
              <th>狀態</th>
              <th>嘗試次數</th>
              <th>更新時間</th>
            </tr>
          </thead>
          <tbody>
            {outbox.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.deliver_key}</td>
                <td>{row.target_key}</td>
                <td><span className="badge">{row.status}</span></td>
                <td>{row.attempts}</td>
                <td>{new Date(row.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
