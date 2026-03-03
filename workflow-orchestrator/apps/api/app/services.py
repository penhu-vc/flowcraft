from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Group, InboxEvent, Intent, Job, OutboxMessage, Pipeline, Profile, ResourceLock, Run, Source, Trigger, Worker, utcnow


def compute_tg_event_id(update: dict[str, Any]) -> str:
    if "update_id" in update:
        return f"tg:update:{update['update_id']}"

    message = update.get("message") or update.get("edited_message")
    if message and message.get("chat") and message.get("message_id"):
        return f"tg:msg:{message['chat']['id']}:{message['message_id']}"

    cb = update.get("callback_query")
    if cb and cb.get("id"):
        return f"tg:cb:{cb['id']}"

    return f"tg:fallback:{hash(str(update))}"


def parse_tg_source(update: dict[str, Any]) -> tuple[str, str, str]:
    message = update.get("message") or update.get("edited_message")
    if message:
        chat_id = str(message["chat"]["id"])
        text = message.get("text") or message.get("caption") or ""
        return f"tg:{chat_id}", chat_id, text

    cb = update.get("callback_query")
    if cb:
        msg = cb.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = str(chat.get("id", "unknown"))
        text = cb.get("data") or ""
        return f"tg:{chat_id}", chat_id, text

    return "tg:unknown", "unknown", ""


def ensure_defaults(db: Session) -> tuple[Pipeline, Profile]:
    settings = get_settings()
    pipeline = db.execute(select(Pipeline).where(Pipeline.enabled.is_(True)).order_by(Pipeline.id)).scalars().first()
    if not pipeline:
        pipeline = Pipeline(
            name=settings.default_pipeline_name,
            graph_json={
                "nodes": [
                    {"id": "trigger", "type": "Trigger"},
                    {"id": "llm_generate_v1", "type": "Skill"},
                    {"id": "deliver_reply", "type": "Output"},
                ],
                "edges": [
                    {"id": "e1", "source": "trigger", "target": "llm_generate_v1"},
                    {"id": "e2", "source": "llm_generate_v1", "target": "deliver_reply"},
                ],
            },
            version=1,
            enabled=True,
        )
        db.add(pipeline)
        db.flush()

    profile = db.execute(select(Profile).where(Profile.pipeline_id == pipeline.id).order_by(Profile.id)).scalars().first()
    if not profile:
        profile = Profile(
            name=settings.default_profile_name,
            pipeline_id=pipeline.id,
            params_json={},
            flags_json={},
        )
        db.add(profile)
        db.flush()

    return pipeline, profile


def ensure_default_intents(db: Session) -> None:
    defaults = [
        {"platform": "tg", "intent_key": "rewrite_v2", "step_id": "intent_rewrite_v2", "queue_name": "q_llm"},
        {"platform": "tg", "intent_key": "make_card", "step_id": "intent_make_card", "queue_name": "q_media"},
        {"platform": "dc", "intent_key": "rewrite_v2", "step_id": "intent_rewrite_v2", "queue_name": "q_llm"},
        {"platform": "dc", "intent_key": "make_card", "step_id": "intent_make_card", "queue_name": "q_media"},
    ]
    for item in defaults:
        exists = (
            db.execute(
                select(Intent).where(
                    Intent.platform == item["platform"],
                    Intent.intent_key == item["intent_key"],
                )
            )
            .scalars()
            .first()
        )
        if exists:
            continue
        db.add(
            Intent(
                platform=item["platform"],
                intent_key=item["intent_key"],
                step_id=item["step_id"],
                queue_name=item["queue_name"],
                enabled=True,
            )
        )


def ensure_default_triggers(db: Session) -> None:
    tg_any = (
        db.execute(
            select(Trigger).where(
                Trigger.platform == "tg",
                Trigger.event_type == "message",
                Trigger.source_key == "tg:*",
            )
        )
        .scalars()
        .first()
    )
    if not tg_any:
        db.add(
            Trigger(
                name="Telegram 全域訊息觸發",
                platform="tg",
                event_type="message",
                source_key="tg:*",
                profile_id=None,
                pipeline_id=None,
                enabled=True,
                config_json={"auto_created": True},
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )

    sources = db.execute(select(Source).where(Source.enabled.is_(True))).scalars().all()
    for src in sources:
        if src.platform == "youtube":
            platform = "youtube"
            event_type = "new_video"
        elif src.platform in {"tg", "tg_channel"}:
            platform = "tg"
            event_type = "message"
        elif src.platform in {"dc", "dc_channel", "discord"}:
            platform = "dc"
            event_type = "message"
        elif src.platform in {"line", "line_channel"}:
            platform = "line"
            event_type = "message"
        else:
            continue

        exists = (
            db.execute(
                select(Trigger).where(
                    Trigger.platform == platform,
                    Trigger.event_type == event_type,
                    Trigger.source_key == src.source_key,
                )
            )
            .scalars()
            .first()
        )
        if exists:
            continue

        db.add(
            Trigger(
                name=f"{platform}:{src.source_key}",
                platform=platform,
                event_type=event_type,
                source_key=src.source_key,
                profile_id=src.default_profile_id,
                pipeline_id=None,
                enabled=True,
                config_json={"auto_created": True, "source_id": src.id},
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )


def _source_key_candidates(platform: str, source_key: str) -> list[str]:
    keys = {source_key}
    if platform == "tg":
        chat_id = source_key
        if source_key.startswith("tg:chat:"):
            chat_id = source_key[len("tg:chat:") :]
        elif source_key.startswith("tg:"):
            chat_id = source_key[len("tg:") :]
        keys.add(f"tg:{chat_id}")
        keys.add(f"tg:chat:{chat_id}")

    if platform == "youtube":
        channel_id = source_key
        if ":" in channel_id:
            channel_id = channel_id.split(":")[-1]
        keys.add(channel_id)
        keys.add(f"yt:{channel_id}")
        keys.add(f"yt:channel:{channel_id}")

    return list(keys)


def _split_source_tokens(raw: str) -> list[str]:
    normalized = (raw or "").replace("\n", ",").replace(";", ",")
    return [part.strip() for part in normalized.split(",") if part.strip()]


def split_source_tokens(raw: str) -> list[str]:
    return _split_source_tokens(raw)


def merge_source_tokens(current: str, extra_tokens: list[str]) -> str:
    ordered: list[str] = []
    seen: set[str] = set()

    for token in _split_source_tokens(current):
        if token not in seen:
            ordered.append(token)
            seen.add(token)

    for raw in extra_tokens:
        for token in _split_source_tokens(raw):
            if token not in seen:
                ordered.append(token)
                seen.add(token)

    return ", ".join(ordered)


def _single_source_match(token: str, candidates: list[str]) -> bool:
    if token in {"*", "all", "any"}:
        return True
    if token.endswith("*"):
        prefix = token[:-1]
        return any(key.startswith(prefix) for key in candidates)
    return token in candidates


def _trigger_source_match(trigger_source: str, candidates: list[str], config_json: dict[str, Any] | None = None) -> bool:
    tokens = _split_source_tokens(trigger_source)

    cfg = config_json or {}
    extra = cfg.get("source_keys")
    if isinstance(extra, list):
        for item in extra:
            if isinstance(item, str):
                tokens.extend(_split_source_tokens(item))

    if not tokens:
        return False
    return any(_single_source_match(token, candidates) for token in tokens)


def list_matching_triggers(db: Session, *, platform: str, event_type: str, source_key: str) -> list[Trigger]:
    rows = (
        db.execute(
            select(Trigger).where(
                Trigger.enabled.is_(True),
                Trigger.platform == platform,
                Trigger.event_type.in_([event_type, "*"]),
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return []

    candidates = _source_key_candidates(platform, source_key)
    exact: list[Trigger] = []
    wildcard: list[Trigger] = []
    for row in rows:
        if not _trigger_source_match(row.source_key, candidates, row.config_json):
            continue
        if row.source_key in {"*", "all", "any"} or row.source_key.endswith("*"):
            wildcard.append(row)
        else:
            exact.append(row)

    ordered = exact + wildcard
    if not ordered:
        return []
    ordered.sort(key=lambda x: x.updated_at, reverse=True)
    return ordered


def find_matching_trigger(db: Session, *, platform: str, event_type: str, source_key: str) -> Trigger | None:
    rows = list_matching_triggers(db, platform=platform, event_type=event_type, source_key=source_key)
    return rows[0] if rows else None


def _ensure_profile_for_pipeline(db: Session, pipeline: Pipeline) -> Profile:
    profile = db.execute(select(Profile).where(Profile.pipeline_id == pipeline.id).order_by(Profile.id)).scalars().first()
    if profile:
        return profile

    settings = get_settings()
    profile = Profile(
        name=f"{pipeline.name} / {settings.default_profile_name}",
        pipeline_id=pipeline.id,
        params_json={},
        flags_json={},
    )
    db.add(profile)
    db.flush()
    return profile


def resolve_pipeline_profile(
    db: Session,
    *,
    profile_id: str | None = None,
    pipeline_id: str | None = None,
) -> tuple[Pipeline, Profile]:
    default_pipeline, default_profile = ensure_defaults(db)

    profile = db.get(Profile, profile_id) if profile_id else None
    pipeline = db.get(Pipeline, pipeline_id) if pipeline_id else None

    if profile and not pipeline:
        pipeline = db.get(Pipeline, profile.pipeline_id)

    if pipeline and not profile:
        profile = _ensure_profile_for_pipeline(db, pipeline)

    if profile and pipeline and profile.pipeline_id != pipeline.id:
        profile = _ensure_profile_for_pipeline(db, pipeline)

    if not pipeline:
        pipeline = default_pipeline
    if not profile:
        if default_profile.pipeline_id == pipeline.id:
            profile = default_profile
        else:
            profile = _ensure_profile_for_pipeline(db, pipeline)

    return pipeline, profile


def append_timeline(run: Run, event: str, detail: dict[str, Any] | None = None) -> None:
    timeline = list(run.timeline_json or [])
    timeline.append(
        {
            "event": event,
            "detail": detail or {},
            "at": utcnow().isoformat(),
        }
    )
    run.timeline_json = timeline
    run.updated_at = utcnow()


def enqueue_job(
    db: Session,
    *,
    run_id: str,
    step_id: str,
    queue_name: str,
    input_json: dict[str, Any],
    requires_capabilities: list[str] | None = None,
) -> Job:
    job = Job(
        run_id=run_id,
        step_id=step_id,
        queue_name=queue_name,
        requires_capabilities_json=requires_capabilities or [],
        status="queued",
        attempts=0,
        next_retry_at=utcnow(),
        input_json=input_json,
        output_json={},
    )
    db.add(job)
    return job


def create_run_from_event(
    db: Session,
    inbox_event: InboxEvent,
    chat_id: str,
    text: str,
    *,
    profile_id: str | None = None,
    pipeline_id: str | None = None,
    trigger_id: str | None = None,
) -> Run:
    pipeline, profile = resolve_pipeline_profile(db, profile_id=profile_id, pipeline_id=pipeline_id)
    run = Run(
        profile_id=profile.id,
        pipeline_id=pipeline.id,
        trigger_event_id=inbox_event.id,
        status="running",
        outputs_json={"source_text": text, "trigger_id": trigger_id},
        timeline_json=[],
    )
    db.add(run)
    db.flush()

    append_timeline(run, "run_created", {"event_id": inbox_event.id})
    enqueue_job(
        db,
        run_id=run.id,
        step_id="llm_generate_v1",
        queue_name="q_llm",
        input_json={"chat_id": chat_id, "source_text": text},
    )
    append_timeline(run, "job_enqueued", {"step_id": "llm_generate_v1"})
    return run


def create_run_from_youtube_event(
    db: Session,
    *,
    inbox_event: InboxEvent,
    source: Source,
    payload: dict[str, Any],
    profile_id: str | None = None,
    pipeline_id: str | None = None,
    trigger_id: str | None = None,
) -> Run:
    selected_profile_id = profile_id or source.default_profile_id
    pipeline, profile = resolve_pipeline_profile(db, profile_id=selected_profile_id, pipeline_id=pipeline_id)

    run = Run(
        profile_id=profile.id,
        pipeline_id=pipeline.id,
        trigger_event_id=inbox_event.id,
        status="running",
        outputs_json={
            "video_id": payload["video_id"],
            "video_url": payload["video_url"],
            "video_title": payload["title"],
            "video_type": payload.get("video_type", "unknown"),
            "routing_tag": source.routing_tag,
            "source_id": source.id,
            "trigger_id": trigger_id,
        },
        timeline_json=[],
    )
    db.add(run)
    db.flush()
    append_timeline(run, "run_created", {"event_id": inbox_event.id, "source_id": source.id})

    if source.extraction_mode == "notebooklm":
        first_step = "extract_notebooklm"
        queue_name = "q_notebooklm"
        requires = ["notebooklm"]
    else:
        first_step = "extract_subtitle_gemini"
        queue_name = "q_llm"
        requires = []

    enqueue_job(
        db,
        run_id=run.id,
        step_id=first_step,
        queue_name=queue_name,
        input_json={
            "video_id": payload["video_id"],
            "video_url": payload["video_url"],
            "video_title": payload["title"],
            "video_type": payload.get("video_type", "unknown"),
            "routing_tag": source.routing_tag,
        },
        requires_capabilities=requires,
    )
    append_timeline(run, "job_enqueued", {"step_id": first_step})
    return run


def create_run_from_intent(
    db: Session,
    *,
    inbox_event: InboxEvent,
    platform: str,
    intent_key: str,
    parent_run_id: str | None,
    target_key: str,
) -> Run | None:
    intent = (
        db.execute(select(Intent).where(Intent.platform == platform, Intent.intent_key == intent_key, Intent.enabled.is_(True)))
        .scalars()
        .first()
    )
    if not intent:
        return None

    pipeline, profile = ensure_defaults(db)
    run = Run(
        profile_id=profile.id,
        pipeline_id=pipeline.id,
        trigger_event_id=inbox_event.id,
        status="running",
        outputs_json={"intent_key": intent_key, "parent_run_id": parent_run_id, "target_key": target_key},
        timeline_json=[],
    )
    db.add(run)
    db.flush()
    append_timeline(run, "run_created", {"intent_key": intent_key, "parent_run_id": parent_run_id})
    enqueue_job(
        db,
        run_id=run.id,
        step_id=intent.step_id,
        queue_name=intent.queue_name,
        input_json={"parent_run_id": parent_run_id, "target_key": target_key, "intent_key": intent_key, "platform": platform},
    )
    append_timeline(run, "job_enqueued", {"step_id": intent.step_id})
    return run


def upsert_worker(db: Session, worker_id: str, capabilities: list[str], max_concurrency: int) -> Worker:
    worker = db.get(Worker, worker_id)
    if worker:
        worker.name = worker_id
        worker.capabilities_json = capabilities
        worker.max_concurrency = max_concurrency
        worker.heartbeat_at = utcnow()
        worker.status = "active"
    else:
        worker = Worker(
            id=worker_id,
            name=worker_id,
            capabilities_json=capabilities,
            max_concurrency=max_concurrency,
            heartbeat_at=utcnow(),
            status="active",
        )
        db.add(worker)
    return worker


def insert_outbox_dedup(
    db: Session,
    *,
    platform: str,
    chat_id: str,
    text: str,
    run_id: str,
    variant: str = "v1",
) -> None:
    insert_outbox_dedup_payload(
        db,
        platform=platform,
        target_key=chat_id,
        payload_json={"text": text},
        run_id=run_id,
        variant=variant,
    )


def insert_outbox_dedup_payload(
    db: Session,
    *,
    platform: str,
    target_key: str,
    payload_json: dict[str, Any],
    run_id: str,
    variant: str = "v1",
) -> None:
    deliver_key = f"{platform}:{target_key}:{run_id}:{variant}"
    stmt = insert(OutboxMessage).values(
        deliver_key=deliver_key,
        bot_id=None,
        platform=platform,
        target_key=target_key,
        payload_json=payload_json,
        status="queued",
        attempts=0,
        next_retry_at=utcnow(),
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    stmt = stmt.on_conflict_do_nothing(index_elements=["deliver_key"])
    db.execute(stmt)


def create_inbox_event(
    db: Session,
    *,
    event_id: str,
    platform: str,
    source_key: str,
    payload_json: dict[str, Any],
) -> InboxEvent | None:
    event = InboxEvent(
        id=event_id,
        platform=platform,
        source_key=source_key,
        payload_json=payload_json,
        status="new",
        ttl_expires_at=utcnow() + timedelta(days=7),
    )
    db.add(event)
    try:
        db.flush()
        return event
    except IntegrityError:
        db.rollback()
        return None


def _parse_iso(ts: str) -> datetime:
    if ts.endswith("Z"):
        ts = ts.replace("Z", "+00:00")
    return datetime.fromisoformat(ts)


def acquire_lock(
    db: Session,
    *,
    resource_key: str,
    owner: str,
    job_id: str,
    lease_seconds: int,
    max_concurrency: int,
) -> tuple[bool, dict[str, Any]]:
    now = utcnow()
    row = db.execute(select(ResourceLock).where(ResourceLock.resource_key == resource_key).with_for_update()).scalar_one_or_none()
    if row is None:
        row = ResourceLock(
            resource_key=resource_key,
            max_concurrency=max_concurrency,
            holders_json=[],
            updated_at=now,
        )
        db.add(row)
        db.flush()

    holders = list(row.holders_json or [])
    valid_holders = []
    for holder in holders:
        expires_at = holder.get("expires_at")
        if not expires_at:
            continue
        try:
            if _parse_iso(expires_at) > now:
                valid_holders.append(holder)
        except ValueError:
            continue

    already = [h for h in valid_holders if h.get("owner") == owner and h.get("job_id") == job_id]
    if already:
        row.holders_json = valid_holders
        row.updated_at = now
        return True, {"reason": "already_acquired"}

    if len(valid_holders) >= row.max_concurrency:
        row.holders_json = valid_holders
        row.updated_at = now
        return False, {"reason": "capacity_exceeded", "holders": valid_holders}

    valid_holders.append(
        {
            "owner": owner,
            "job_id": job_id,
            "acquired_at": now.isoformat(),
            "expires_at": (now + timedelta(seconds=lease_seconds)).isoformat(),
        }
    )
    row.holders_json = valid_holders
    row.updated_at = now
    return True, {"holders": valid_holders}


def release_lock(db: Session, *, resource_key: str, owner: str, job_id: str) -> dict[str, Any]:
    now = utcnow()
    row = db.execute(select(ResourceLock).where(ResourceLock.resource_key == resource_key).with_for_update()).scalar_one_or_none()
    if row is None:
        return {"released": False, "reason": "not_found"}

    holders = [h for h in (row.holders_json or []) if not (h.get("owner") == owner and h.get("job_id") == job_id)]
    row.holders_json = holders
    row.updated_at = now
    return {"released": True, "holders": holders}
