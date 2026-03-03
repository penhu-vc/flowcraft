export default function HelpPage() {
  return (
    <section className="card">
      <h2>欄位說明</h2>
      <p className="muted">先看這頁，再去各頁新增資料會比較快上手。</p>

      <h3>1. 這個系統在做什麼</h3>
      <p>收到 Telegram 訊息後，系統會建立 Run 與 Jobs，交給 Worker 執行，最後由 Sender 回覆訊息。</p>

      <h3>2. 每個主頁用途</h3>
      <p><strong>流程（Pipelines）</strong>：定義執行流程圖（目前先以 JSON 儲存）。</p>
      <p><strong>Profile</strong>：同一條流程下的參數覆蓋，例如語氣、禁詞、是否跳過某步。</p>
      <p><strong>Bot</strong>：可發送訊息的機器人設定。</p>
      <p><strong>群組（Groups）</strong>：投遞目標（對哪個 chat/channel 發）。</p>
      <p><strong>觸發器（Triggers）</strong>：定義哪些來源事件會啟動流程，並可指定 profile/pipeline。</p>
      <p><strong>執行紀錄（Runs）</strong>：每次事件產生的結果。</p>
      <p><strong>營運看板（Ops）</strong>：Jobs/Locks/Workers/Outbox 的即時狀態。</p>

      <h3>3. 常用欄位解釋</h3>
      <p><strong>pipeline_id</strong>：Profile 要套用到哪條流程。</p>
      <p><strong>params_json</strong>：輸出參數，例如 tone、CTA、template。</p>
      <p><strong>flags_json</strong>：功能開關，例如 skip_fact、skip_card。</p>
      <p><strong>token_secret_ref</strong>：不要放明文 token，放參照值，例如 <code>env://TG_BOT_TOKEN</code>。</p>
      <p><strong>target_key</strong>：平台目標 ID。Telegram 通常是 chat_id（群組常見負數）。</p>
      <p><strong>source_key</strong>：觸發來源識別，例如 <code>yt:channel:UCxxx</code>、<code>tg:-100xxx</code>。</p>
      <p><strong>快速加入來源</strong>：在「觸發器」頁貼上 YouTube 影片連結或 TG 聊天連結即可自動加入監控來源。</p>
      <p><strong>rate_policy_json</strong>：發送節流策略，例如每分鐘上限。</p>

      <h3>4. 建議最小填法</h3>
      <p>Bot：platform=tg、token_secret_ref=env://TG_BOT_TOKEN。</p>
      <p>Group：選好 bot_id，target_key 填 Telegram chat_id。</p>
      <p>Profile：選 pipeline_id，params_json 與 flags_json 先用空物件 <code>{"{}"}</code>。</p>
    </section>
  );
}
