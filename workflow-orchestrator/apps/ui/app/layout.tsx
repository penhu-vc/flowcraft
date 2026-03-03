import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "工作流控制台",
  description: "Workflow Orchestrator 控制平面",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <main>
          <h1>工作流控制台</h1>
          <p className="muted">單一資料來源：PostgreSQL。所有 Worker 都透過 API 派工與回寫。</p>
          <nav className="nav">
            <Link href="/quickstart">新手引導</Link>
            <Link href="/pipelines">流程</Link>
            <Link href="/topology">連接圖</Link>
            <Link href="/profiles">Profile</Link>
            <Link href="/bots">Bot</Link>
            <Link href="/groups">群組</Link>
            <Link href="/sources">來源</Link>
            <Link href="/triggers">觸發器</Link>
            <Link href="/intents">互動</Link>
            <Link href="/subscribers">訂閱者</Link>
            <Link href="/runs">執行紀錄</Link>
            <Link href="/ops">營運看板</Link>
            <Link href="/help">欄位說明</Link>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
