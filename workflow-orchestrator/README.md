# Workflow Orchestrator (MVP + YouTube/Skill Pipeline)

Monorepo scaffold that implements:

- Telegram inbound -> Inbox dedupe -> Run/Jobs -> Worker -> Outbox dedupe -> Sender
- YouTube (WebSub push/manual event) -> extraction(notebooklm/subtitle) -> Skill5 -> Skill3 -> card -> multicast delivery
- TG callback intents -> sub-run worker pipeline

## 1) Repo Structure

```text
/apps
  /api      FastAPI + SQLAlchemy + Alembic
  /ui       Next.js App Router dashboard
  /worker   Worker agent (claim/complete)
  /sender   Outbox sender (Telegram)
/packages
  /shared   placeholder for shared contracts
/deploy
  docker-compose.yml   PostgreSQL
  .env.example
```

## 2) Prerequisites

- Python 3.11+
- Node.js 20+
- Docker
- Telegram bot token

## 3) Environment Setup

```bash
cd /Users/yaja/projects/workflow-orchestrator
cp .env.example .env
# edit .env and set TG_BOT_TOKEN
```

## 4) Start PostgreSQL

```bash
docker compose -f deploy/docker-compose.yml up -d
```

## 5) Install Dependencies

```bash
# API
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/api/requirements.txt
pip install -r apps/worker/requirements.txt
pip install -r apps/sender/requirements.txt

# UI
cd apps/ui
npm install
cd ../..
```

## 6) Run DB Migration

```bash
cd apps/api
alembic upgrade head
cd ../..
```

## 7) Run Services (4 terminals)

Terminal A (API):
```bash
cd /Users/yaja/projects/workflow-orchestrator
source .venv/bin/activate
uvicorn apps.api.app.main:app --reload --port 8000
```

Terminal B (Worker):
```bash
cd /Users/yaja/projects/workflow-orchestrator
source .venv/bin/activate
python apps/worker/main.py
```

Terminal C (Sender):
```bash
cd /Users/yaja/projects/workflow-orchestrator
source .venv/bin/activate
python apps/sender/main.py
```

Terminal D (UI):
```bash
cd /Users/yaja/projects/workflow-orchestrator/apps/ui
npm run dev
```

UI URLs:
- Pipelines: [http://localhost:3000/pipelines](http://localhost:3000/pipelines)
- Triggers: [http://localhost:3000/triggers](http://localhost:3000/triggers)
- Topology: [http://localhost:3000/topology](http://localhost:3000/topology)
- Runs: [http://localhost:3000/runs](http://localhost:3000/runs)
- Ops: [http://localhost:3000/ops](http://localhost:3000/ops)

## 8) Configure Telegram Webhook

You need a public HTTPS URL for local API (for example via ngrok).

```bash
# example: ngrok http 8000
curl -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/setWebhook" \
  -d "url=https://<your-public-domain>/webhooks/telegram"
```

Verify:
```bash
curl "https://api.telegram.org/bot${TG_BOT_TOKEN}/getWebhookInfo"
```

## 9) Configure YouTube WebSub (optional)

1. Create source in API:
```bash
curl -X POST http://localhost:8000/api/sources \
  -H "content-type: application/json" \
  -d '{"platform":"youtube","source_key":"yt:channel:<CHANNEL_ID>","routing_tag":"crypto","extraction_mode":"notebooklm","enabled":true}'
```
> Source 建立後會自動建立對應 Trigger。也可在 `/triggers` 手動調整或新增多條規則。

2. Verify endpoint challenge:
`GET /webhooks/youtube?hub.challenge=...`

3. Push notifications from WebSub will hit:
`POST /webhooks/youtube`

## 10) End-to-End Test

1. Send a message to your Telegram bot.
2. API writes `inbox_events` with dedupe key (`tg:update:<update_id>`).
3. Router creates `run` + first job `llm_generate_v1`.
4. Worker claims with `FOR UPDATE SKIP LOCKED` and completes step1.
5. API auto-enqueues step2 `deliver_reply`.
6. Worker completes step2, API writes deduped outbox (`deliver_key` unique).
7. Sender polls outbox and sends `sendMessage`.

Expected:
- same Telegram update is only processed once (inbox PK dedupe)
- same deliver key is only inserted once (outbox unique dedupe)
- failed sends are retried with exponential backoff

## 11) Useful API Endpoints

- `GET /health`
- `POST /webhooks/telegram`
- `GET /webhooks/youtube`
- `POST /webhooks/youtube`
- `POST /api/youtube/events`
- `POST /api/youtube/websub/subscribe`
- `POST /api/worker/claim`
- `POST /api/worker/complete`
- `POST /api/worker/locks/acquire`
- `POST /api/worker/locks/release`
- `GET /api/pipelines`
- `POST /api/pipelines`
- `GET /api/profiles`
- `POST /api/profiles`
- `PATCH /api/profiles/{profile_id}`
- `GET /api/bots`
- `POST /api/bots`
- `PATCH /api/bots/{bot_id}`
- `GET /api/groups`
- `POST /api/groups`
- `PATCH /api/groups/{group_id}`
- `GET /api/sources`
- `POST /api/sources`
- `PATCH /api/sources/{source_id}`
- `GET /api/intents`
- `POST /api/intents`
- `PATCH /api/intents/{intent_id}`
- `GET /api/triggers`
- `POST /api/triggers`
- `PATCH /api/triggers/{trigger_id}`
- `DELETE /api/triggers/{trigger_id}`
- `GET /api/subscribers`
- `POST /api/subscribers`
- `PATCH /api/subscribers/{subscriber_id}`
- `GET /api/runs`
- `GET /api/jobs`
- `GET /api/locks`
- `GET /api/workers`
- `GET /api/outbox`

## 12) Notes

- Single source of truth is PostgreSQL only.
- No local `state.json`.
- Worker lock for `notebooklm` is implemented and requeue-aware.
- Designed so new queues/modules can be added incrementally.
- UI supports listing + creating + editing `profiles`, `bots`, and `groups`.
