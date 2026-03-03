import Link from "next/link";

export default function Home() {
  return (
    <section className="card">
      <h2>歡迎使用工作流控制台</h2>
      <p className="muted">從下列入口進入你要看的頁面。</p>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <Link href="/pipelines">流程設定</Link>
        <Link href="/topology">流程連接圖</Link>
        <Link href="/triggers">觸發器</Link>
        <Link href="/runs">執行紀錄</Link>
        <Link href="/ops">營運看板</Link>
        <Link href="/quickstart">新手引導</Link>
        <Link href="/help">欄位說明</Link>
      </div>
    </section>
  );
}
