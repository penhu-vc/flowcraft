import { fetchApi } from "../lib/api";

type Subscriber = {
  id: string;
  platform: string;
  user_key: string;
  groups_json: string[];
  permissions_json: Record<string, unknown>;
};

export default async function SubscribersPage() {
  const rows = await fetchApi<Subscriber[]>("/api/subscribers");
  return (
    <section className="card">
      <h2>訂閱者</h2>
      <p className="muted">TG 用戶在 DM /start 後可訂閱分類，這裡可看到綁定結果。</p>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>平台</th>
            <th>user_key</th>
            <th>群組數</th>
            <th>權限/分類</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.platform}</td>
              <td>{row.user_key}</td>
              <td>{row.groups_json?.length || 0}</td>
              <td><code>{JSON.stringify(row.permissions_json || {})}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
