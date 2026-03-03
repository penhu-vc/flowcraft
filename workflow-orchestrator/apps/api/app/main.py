from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, quote, urlparse
import re

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .config import get_settings
from .database import SessionLocal, get_db
from .models import (
    Bot,
    Group,
    InboxEvent,
    Intent,
    Job,
    OutboxMessage,
    Pipeline,
    Profile,
    ResourceLock,
    Run,
    Source,
    Subscriber,
    Trigger,
    Worker,
    utcnow,
)
from .schemas import (
    BotCreateRequest,
    BotUpdateRequest,
    GroupCreateRequest,
    GroupUpdateRequest,
    IntentCreateRequest,
    IntentUpdateRequest,
    LockAcquireRequest,
    LockReleaseRequest,
    PipelineCreateRequest,
    PipelineUpdateRequest,
    ProfileCreateRequest,
    ProfileUpdateRequest,
    SourceCreateRequest,
    SourceUpdateRequest,
    SubscriberCreateRequest,
    SubscriberUpdateRequest,
    TriggerCreateRequest,
    TriggerQuickAddTgRequest,
    TriggerQuickAddYoutubeRequest,
    TriggerRemoveSourceRequest,
    TriggerUpdateRequest,
    WorkerClaimRequest,
    WorkerClaimResponse,
    WorkerCompleteRequest,
    WorkerJobResponse,
    YoutubeEventRequest,
)
from .services import (
    acquire_lock,
    append_timeline,
    compute_tg_event_id,
    create_run_from_event,
    create_run_from_intent,
    create_run_from_youtube_event,
    ensure_default_intents,
    ensure_default_triggers,
    ensure_defaults,
    list_matching_triggers,
    insert_outbox_dedup,
    insert_outbox_dedup_payload,
    parse_tg_source,
    release_lock,
    split_source_tokens,
    merge_source_tokens,
    upsert_worker,
)

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _as_dict(obj: Any) -> dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def _safe_json(obj: Any) -> dict[str, Any]:
    return obj if isinstance(obj, dict) else {}


def _get_tg_user_id(update: dict[str, Any]) -> str | None:
    message = update.get("message") or update.get("edited_message")
    if message and message.get("from") and message["from"].get("id") is not None:
        return str(message["from"]["id"])

    cb = update.get("callback_query") or {}
    from_user = cb.get("from") or {}
    if from_user.get("id") is not None:
        return str(from_user["id"])
    return None


def _get_tg_chat_type(update: dict[str, Any]) -> str | None:
    message = update.get("message") or update.get("edited_message")
    if message and message.get("chat"):
        return message["chat"].get("type")

    cb = update.get("callback_query") or {}
    msg = cb.get("message") or {}
    chat = msg.get("chat") or {}
    return chat.get("type")


def _upsert_subscriber(db: Session, *, platform: str, user_key: str) -> Subscriber:
    row = db.execute(select(Subscriber).where(Subscriber.platform == platform, Subscriber.user_key == user_key)).scalars().first()
    if row:
        row.updated_at = utcnow()
        return row

    row = Subscriber(
        platform=platform,
        user_key=user_key,
        groups_json=[],
        permissions_json={"routing_tags": []},
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def _build_tg_start_buttons(sources: list[Source]) -> dict[str, Any]:
    rows: list[list[dict[str, str]]] = []
    for src in sources[:12]:
        label = src.routing_tag or src.source_key
        rows.append([
            {
                "text": f"訂閱 {label}",
                "callback_data": f"subsrc:{src.id}",
            }
        ])
    return {"inline_keyboard": rows}


def _extract_yt_entries_from_atom(xml_body: bytes) -> list[dict[str, str]]:
    root = ET.fromstring(xml_body)
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
    }
    out: list[dict[str, str]] = []
    for entry in root.findall("atom:entry", ns):
        video_id = (entry.findtext("yt:videoId", default="", namespaces=ns) or "").strip()
        channel_id = (entry.findtext("yt:channelId", default="", namespaces=ns) or "").strip()
        title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
        published = (entry.findtext("atom:published", default="", namespaces=ns) or "").strip()
        if not video_id or not channel_id:
            continue
        out.append(
            {
                "video_id": video_id,
                "channel_id": channel_id,
                "title": title,
                "published_at": published,
                "video_url": f"https://www.youtube.com/watch?v={video_id}",
            }
        )
    return out


def _find_source_by_channel(db: Session, channel_id: str) -> Source | None:
    keys = [channel_id, f"yt:{channel_id}", f"yt:channel:{channel_id}"]
    return (
        db.execute(select(Source).where(Source.source_key.in_(keys), Source.enabled.is_(True)).order_by(Source.updated_at.desc()))
        .scalars()
        .first()
    )


def _normalize_http_url(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="url is required")
    if not value.startswith(("http://", "https://")):
        value = f"https://{value}"
    return value


def _extract_youtube_video_id(video_url: str) -> str | None:
    parsed = urlparse(video_url)
    host = parsed.netloc.lower().replace("www.", "")
    path_parts = [part for part in parsed.path.split("/") if part]

    if host == "youtu.be" and path_parts:
        return path_parts[0]

    if host.endswith("youtube.com"):
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [None])[0]
        if len(path_parts) >= 2 and path_parts[0] in {"shorts", "live", "embed"}:
            return path_parts[1]

    return None


def _extract_channel_id_from_url(value: str) -> str | None:
    parsed = urlparse(value)
    path_parts = [part for part in parsed.path.split("/") if part]
    if len(path_parts) >= 2 and path_parts[0] == "channel" and path_parts[1].startswith("UC"):
        return path_parts[1]
    return None


def _resolve_youtube_channel_id(video_url: str) -> str:
    video_id = _extract_youtube_video_id(video_url)
    if not video_id:
        raise HTTPException(status_code=400, detail="invalid youtube video url")

    oembed_url = f"https://www.youtube.com/oembed?url={quote(video_url, safe=':/?=&')}&format=json"
    try:
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            resp = client.get(oembed_url)
            if resp.is_success:
                author_url = str(resp.json().get("author_url") or "")
                channel_id = _extract_channel_id_from_url(author_url)
                if channel_id:
                    return channel_id
    except Exception:
        pass

    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            resp = client.get(
                watch_url,
                headers={"user-agent": "Mozilla/5.0"},
            )
            if resp.is_success:
                m = re.search(r'"channelId":"(UC[a-zA-Z0-9_-]{20,})"', resp.text)
                if m:
                    return m.group(1)
    except Exception:
        pass

    raise HTTPException(status_code=400, detail="cannot resolve youtube channel id from this url")


def _youtube_video_type_from_trigger(trigger: Trigger) -> str:
    cfg = _safe_json(trigger.config_json)
    raw = str(cfg.get("youtube_video_type") or cfg.get("video_type") or "any").strip().lower()
    if raw in {"short", "shorts"}:
        return "shorts"
    if raw in {"long", "long_video", "normal"}:
        return "long"
    return "any"


def _detect_youtube_video_type(*, video_id: str, video_url: str) -> str:
    lowered = (video_url or "").lower()
    if "/shorts/" in lowered:
        return "shorts"

    watch_url = video_url
    if "youtube.com/watch" not in lowered and video_id:
        watch_url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        with httpx.Client(timeout=12, follow_redirects=True) as client:
            resp = client.get(
                watch_url,
                headers={"user-agent": "Mozilla/5.0"},
            )
        if resp.is_success:
            html = resp.text
            m = re.search(r'"lengthSeconds":"(\d+)"', html)
            if m:
                seconds = int(m.group(1))
                return "shorts" if seconds <= 180 else "long"
            if '"isShortsEligible":true' in html:
                return "shorts"
    except Exception:
        pass

    try:
        shorts_url = f"https://www.youtube.com/shorts/{video_id}"
        with httpx.Client(timeout=10, follow_redirects=True) as client:
            resp = client.get(shorts_url, headers={"user-agent": "Mozilla/5.0"})
        final_url = str(resp.url).lower()
        if "/shorts/" in final_url:
            return "shorts"
        if "/watch" in final_url:
            return "long"
    except Exception:
        pass

    return "unknown"


def _filter_youtube_triggers_by_video_type(
    triggers: list[Trigger],
    *,
    video_id: str,
    video_url: str,
) -> tuple[list[Trigger], str]:
    if not triggers:
        return [], "unknown"

    requires_filter = any(_youtube_video_type_from_trigger(t) != "any" for t in triggers)
    if not requires_filter:
        return triggers, "unknown"

    detected = _detect_youtube_video_type(video_id=video_id, video_url=video_url)
    filtered: list[Trigger] = []
    for trigger in triggers:
        wanted = _youtube_video_type_from_trigger(trigger)
        if wanted == "any" or wanted == detected:
            filtered.append(trigger)
    return filtered, detected


def _append_source_key_to_trigger(trigger: Trigger, source_key: str) -> bool:
    merged = merge_source_tokens(trigger.source_key, [source_key])
    changed = merged != (trigger.source_key or "")
    if changed:
        trigger.source_key = merged
        trigger.updated_at = utcnow()
    return changed


def _upsert_source_from_trigger(
    db: Session,
    *,
    source_platform: str,
    source_key: str,
    trigger: Trigger,
    extraction_mode: str = "subtitle",
) -> tuple[Source, bool]:
    row = (
        db.execute(select(Source).where(Source.platform == source_platform, Source.source_key == source_key).order_by(Source.updated_at.desc()))
        .scalars()
        .first()
    )
    if row:
        row.enabled = True
        if trigger.profile_id and not row.default_profile_id:
            row.default_profile_id = trigger.profile_id
        row.updated_at = utcnow()
        return row, False

    row = Source(
        platform=source_platform,
        source_key=source_key,
        routing_tag=None,
        default_profile_id=trigger.profile_id,
        extraction_mode=extraction_mode,
        enabled=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(row)
    db.flush()
    return row, True


def _resolve_tg_chat_id_from_link(chat_link: str) -> str:
    link = _normalize_http_url(chat_link)
    parsed = urlparse(link)
    host = parsed.netloc.lower()
    if host not in {"t.me", "telegram.me", "www.t.me", "www.telegram.me"}:
        raise HTTPException(status_code=400, detail="invalid telegram link host")

    parts = [part for part in parsed.path.split("/") if part]
    if not parts:
        raise HTTPException(status_code=400, detail="invalid telegram link path")

    if parts[0] == "c":
        if len(parts) < 2 or not parts[1].isdigit():
            raise HTTPException(status_code=400, detail="invalid t.me/c link")
        return f"-100{parts[1]}"

    if parts[0].startswith("+") or parts[0] == "joinchat":
        raise HTTPException(status_code=400, detail="invite link cannot be resolved automatically")

    username = parts[0]
    if username.startswith("-100") and username[1:].isdigit():
        return username

    if not settings.tg_bot_token:
        raise HTTPException(status_code=400, detail="API TG_BOT_TOKEN not configured; cannot resolve @username link")

    api_url = f"https://api.telegram.org/bot{settings.tg_bot_token}/getChat"
    with httpx.Client(timeout=15) as client:
        resp = client.get(api_url, params={"chat_id": f"@{username}"})
        data = resp.json()

    if not isinstance(data, dict) or not data.get("ok") or not isinstance(data.get("result"), dict):
        raise HTTPException(status_code=400, detail=f"cannot resolve telegram chat from link: {chat_link}")

    chat_id = data["result"].get("id")
    if chat_id is None:
        raise HTTPException(status_code=400, detail=f"telegram getChat returned no id for: {chat_link}")

    return str(chat_id)


def _extract_channel_id_from_source_key(value: str) -> str | None:
    token = (value or "").strip()
    if token.startswith("yt:channel:"):
        candidate = token[len("yt:channel:") :]
    elif token.startswith("yt:"):
        candidate = token[len("yt:") :]
    elif token.startswith("UC"):
        candidate = token
    else:
        return None

    return candidate if candidate.startswith("UC") else None


def _extract_tg_chat_id_from_source_key(value: str) -> str | None:
    token = (value or "").strip()
    if token.startswith("tg:chat:"):
        return token[len("tg:chat:") :]
    if token.startswith("tg:"):
        return token[len("tg:") :]
    if token.startswith("-100") and token[1:].isdigit():
        return token
    return None


def _resolve_youtube_channel_title(channel_id: str) -> str | None:
    if not channel_id:
        return None

    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(url)
        if not resp.is_success:
            return None

        root = ET.fromstring(resp.content)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        author_name = (root.findtext("atom:author/atom:name", default="", namespaces=ns) or "").strip()
        if author_name:
            return author_name

        title = (root.findtext("atom:title", default="", namespaces=ns) or "").strip()
        if title and title.lower() != "youtube video feed":
            return title
    except Exception:
        return None
    return None


def _resolve_tg_chat_title(chat_id: str) -> str | None:
    if not chat_id or not settings.tg_bot_token:
        return None

    try:
        api_url = f"https://api.telegram.org/bot{settings.tg_bot_token}/getChat"
        with httpx.Client(timeout=10) as client:
            resp = client.get(api_url, params={"chat_id": chat_id})
        data = resp.json()
        if not isinstance(data, dict) or not data.get("ok") or not isinstance(data.get("result"), dict):
            return None
        result = data["result"]
        title = str(result.get("title") or "").strip()
        if title:
            return title
        username = str(result.get("username") or "").strip()
        if username:
            return f"@{username}"
    except Exception:
        return None
    return None


def _source_lookup_candidates(token: str) -> list[str]:
    out = {token}
    channel_id = _extract_channel_id_from_source_key(token)
    if channel_id:
        out.add(channel_id)
        out.add(f"yt:{channel_id}")
        out.add(f"yt:channel:{channel_id}")

    chat_id = _extract_tg_chat_id_from_source_key(token)
    if chat_id:
        out.add(chat_id)
        out.add(f"tg:{chat_id}")
        out.add(f"tg:chat:{chat_id}")

    return list(out)


def _build_trigger_source_items(db: Session, trigger: Trigger) -> list[dict[str, Any]]:
    tokens = split_source_tokens(trigger.source_key)
    cfg = _safe_json(trigger.config_json)
    extra = cfg.get("source_keys")
    if isinstance(extra, list):
        for item in extra:
            if isinstance(item, str):
                tokens.extend(split_source_tokens(item))

    ordered: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if token in seen:
            continue
        ordered.append(token)
        seen.add(token)

    yt_name_cache: dict[str, str | None] = {}
    tg_name_cache: dict[str, str | None] = {}
    items: list[dict[str, Any]] = []

    for token in ordered:
        source_row = (
            db.execute(select(Source).where(Source.source_key.in_(_source_lookup_candidates(token))).order_by(Source.updated_at.desc()))
            .scalars()
            .first()
        )
        if token in {"*", "all", "any"}:
            display_name = "全部來源"
        elif token.endswith("*"):
            display_name = f"前綴匹配：{token}"
        else:
            display_name = source_row.routing_tag if source_row and source_row.routing_tag else ""
            channel_id = _extract_channel_id_from_source_key(token)
            chat_id = _extract_tg_chat_id_from_source_key(token)
            if not display_name and channel_id:
                if channel_id not in yt_name_cache:
                    yt_name_cache[channel_id] = _resolve_youtube_channel_title(channel_id)
                display_name = yt_name_cache[channel_id] or ""
            if not display_name and chat_id:
                if chat_id not in tg_name_cache:
                    tg_name_cache[chat_id] = _resolve_tg_chat_title(chat_id)
                display_name = tg_name_cache[chat_id] or ""
            if not display_name:
                display_name = token

        items.append(
            {
                "source_key": token,
                "display_name": display_name,
                "platform": source_row.platform if source_row else trigger.platform,
                "source_id": source_row.id if source_row else None,
                "routing_tag": source_row.routing_tag if source_row else None,
                "enabled": source_row.enabled if source_row else None,
            }
        )

    return items


def _enqueue_multicast_outbox(db: Session, run: Run, outputs: dict[str, Any]) -> None:
    routing_tag = outputs.get("routing_tag")
    text_v1 = outputs.get("skill5_script") or outputs.get("v1_script") or ""
    text_v2 = outputs.get("final_script") or outputs.get("v2_script") or ""
    card_url = outputs.get("card_url")

    text = "\n\n".join(
        part
        for part in [
            "【版本一 / Skill5】\n" + text_v1 if text_v1 else "",
            "【版本二 / Skill5>Skill3】\n" + text_v2 if text_v2 else "",
        ]
        if part
    )
    if not text:
        text = "本次任務完成，但尚無可展示腳本。"

    callback_buttons = {
        "inline_keyboard": [
            [
                {"text": "重寫版本二", "callback_data": f"intent:rewrite_v2:{run.id}"},
                {"text": "重做圖卡", "callback_data": f"intent:make_card:{run.id}"},
            ]
        ]
    }

    groups_stmt = select(Group).where(Group.enabled.is_(True))
    if routing_tag:
        groups_stmt = groups_stmt.where((Group.routing_tag == routing_tag) | (Group.routing_tag.is_(None)))

    groups = db.execute(groups_stmt).scalars().all()
    for group in groups:
        payload: dict[str, Any] = {"text": text}
        if group.platform == "tg":
            payload["reply_markup"] = callback_buttons
            if card_url:
                payload["photo_url"] = card_url
                payload["caption"] = text

        insert_outbox_dedup_payload(
            db,
            platform=group.platform,
            target_key=group.target_key,
            payload_json=payload,
            run_id=run.id,
            variant=f"broadcast:{group.id}",
        )

    if routing_tag:
        subscribers = db.execute(select(Subscriber).where(Subscriber.platform == "tg")).scalars().all()
        for sub in subscribers:
            perms = _safe_json(sub.permissions_json)
            tags = perms.get("routing_tags") or []
            if routing_tag not in tags:
                continue
            insert_outbox_dedup_payload(
                db,
                platform="tg",
                target_key=sub.user_key,
                payload_json={"text": text, "reply_markup": callback_buttons, "photo_url": card_url, "caption": text},
                run_id=run.id,
                variant=f"dm:{sub.id}",
            )


@app.on_event("startup")
def startup_seed() -> None:
    db = SessionLocal()
    try:
        with db.begin():
            ensure_defaults(db)
            ensure_default_intents(db)
            ensure_default_triggers(db)
    finally:
        db.close()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/webhooks/youtube", response_class=PlainTextResponse)
def youtube_webhook_verify(request: Request) -> str:
    # WebSub verification handshake
    challenge = request.query_params.get("hub.challenge")
    return challenge or "ok"


@app.post("/webhooks/youtube")
async def youtube_webhook_push(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    xml_body = await request.body()

    try:
        entries = _extract_yt_entries_from_atom(xml_body)
    except Exception:
        return {"status": "ignored", "reason": "invalid_xml"}

    accepted = 0
    triggered_runs = 0
    duplicates = 0
    skipped = 0
    type_filtered = 0

    with db.begin():
        for item in entries:
            source = _find_source_by_channel(db, item["channel_id"])
            if not source:
                skipped += 1
                continue

            matched_triggers = list_matching_triggers(
                db,
                platform="youtube",
                event_type="new_video",
                source_key=source.source_key,
            )
            if not matched_triggers:
                skipped += 1
                continue

            matched_triggers, detected_video_type = _filter_youtube_triggers_by_video_type(
                matched_triggers,
                video_id=item["video_id"],
                video_url=item["video_url"],
            )
            if not matched_triggers:
                type_filtered += 1
                continue

            event_id = f"yt:video:{source.id}:{item['video_id']}"
            stmt = (
                insert(InboxEvent)
                .values(
                    id=event_id,
                    platform="youtube",
                    source_key=source.source_key,
                    payload_json=item,
                    status="new",
                    created_at=utcnow(),
                    ttl_expires_at=utcnow() + timedelta(days=30),
                )
                .on_conflict_do_nothing(index_elements=["id"])
                .returning(InboxEvent.id)
            )
            inserted = db.execute(stmt).scalar_one_or_none()
            if not inserted:
                duplicates += 1
                continue

            event = db.get(InboxEvent, event_id)
            for trigger in matched_triggers:
                create_run_from_youtube_event(
                    db,
                    inbox_event=event,
                    source=source,
                    payload={**item, "video_type": detected_video_type},
                    profile_id=trigger.profile_id,
                    pipeline_id=trigger.pipeline_id,
                    trigger_id=trigger.id,
                )
                triggered_runs += 1
            accepted += 1

    return {
        "status": "ok",
        "accepted": accepted,
        "triggered_runs": triggered_runs,
        "duplicates": duplicates,
        "skipped": skipped,
        "type_filtered": type_filtered,
    }


@app.post("/api/youtube/events")
def ingest_youtube_event(req: YoutubeEventRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        source = db.get(Source, req.source_id)
        if not source or not source.enabled:
            raise HTTPException(status_code=404, detail="source not found or disabled")

        matched_triggers = list_matching_triggers(
            db,
            platform="youtube",
            event_type="new_video",
            source_key=source.source_key,
        )
        if not matched_triggers:
            return {"status": "ignored", "reason": "no_trigger_match", "source_id": source.id}

        matched_triggers, detected_video_type = _filter_youtube_triggers_by_video_type(
            matched_triggers,
            video_id=req.video_id,
            video_url=req.video_url,
        )
        if not matched_triggers:
            return {
                "status": "ignored",
                "reason": "video_type_filtered",
                "source_id": source.id,
                "video_type": detected_video_type,
            }

        event_id = f"yt:video:{source.id}:{req.video_id}"
        stmt = (
            insert(InboxEvent)
            .values(
                id=event_id,
                platform="youtube",
                source_key=source.source_key,
                payload_json=req.model_dump(),
                status="new",
                created_at=utcnow(),
                ttl_expires_at=utcnow() + timedelta(days=30),
            )
            .on_conflict_do_nothing(index_elements=["id"])
            .returning(InboxEvent.id)
        )
        inserted = db.execute(stmt).scalar_one_or_none()
        if not inserted:
            return {"status": "duplicate", "event_id": event_id}

        event = db.get(InboxEvent, event_id)
        run_ids: list[str] = []
        for trigger in matched_triggers:
            run = create_run_from_youtube_event(
                db,
                inbox_event=event,
                source=source,
                payload={**req.model_dump(), "video_type": detected_video_type},
                profile_id=trigger.profile_id,
                pipeline_id=trigger.pipeline_id,
                trigger_id=trigger.id,
            )
            run_ids.append(run.id)

    return {"status": "accepted", "event_id": event_id, "run_ids": run_ids, "video_type": detected_video_type}


@app.post("/api/youtube/websub/subscribe")
def websub_subscribe(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    callback_url = str(payload.get("callback_url") or "").strip()
    if not callback_url:
        raise HTTPException(status_code=400, detail="callback_url is required")

    mode = str(payload.get("mode") or "subscribe")
    hub_url = str(payload.get("hub_url") or "https://pubsubhubbub.appspot.com/subscribe")
    verify = str(payload.get("verify") or "async")

    sources = db.execute(select(Source).where(Source.platform == "youtube", Source.enabled.is_(True))).scalars().all()
    if not sources:
        return {"status": "ok", "requested": 0, "details": []}

    details: list[dict[str, Any]] = []
    with httpx.Client(timeout=20) as client:
        for src in sources:
            channel_key = src.source_key
            if ":" in channel_key:
                channel_key = channel_key.split(":")[-1]
            topic = f"https://www.youtube.com/xml/feeds/videos.xml?channel_id={channel_key}"
            form = {
                "hub.mode": mode,
                "hub.topic": topic,
                "hub.callback": callback_url,
                "hub.verify": verify,
            }
            resp = client.post(hub_url, data=form)
            details.append(
                {
                    "source_id": src.id,
                    "channel_id": channel_key,
                    "status_code": resp.status_code,
                    "ok": 200 <= resp.status_code < 300,
                }
            )

    ok_count = len([d for d in details if d["ok"]])
    return {"status": "ok", "requested": len(details), "accepted": ok_count, "details": details}


@app.post("/webhooks/telegram")
def telegram_webhook(update: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    event_id = compute_tg_event_id(update)
    source_key, chat_id, text = parse_tg_source(update)

    if chat_id == "unknown":
        return {"status": "ignored", "reason": "unsupported_update_type"}

    user_key = _get_tg_user_id(update)
    chat_type = _get_tg_chat_type(update)

    with db.begin():
        stmt = (
            insert(InboxEvent)
            .values(
                id=event_id,
                platform="tg",
                source_key=source_key,
                payload_json=update,
                status="new",
                created_at=utcnow(),
                ttl_expires_at=utcnow() + timedelta(days=7),
            )
            .on_conflict_do_nothing(index_elements=["id"])
            .returning(InboxEvent.id)
        )
        inserted = db.execute(stmt).scalar_one_or_none()
        if not inserted:
            return {"status": "duplicate", "event_id": event_id}

        event = db.get(InboxEvent, event_id)

        callback_query = update.get("callback_query") or {}
        callback_data = callback_query.get("data")
        event_type = "callback_query" if callback_query else "message"
        if callback_data:
            if callback_data.startswith("subsrc:") and user_key:
                source_id = callback_data.split(":", 1)[1]
                src = db.get(Source, source_id)
                if not src:
                    return {"status": "ignored", "reason": "source_not_found", "event_id": event_id}

                sub = _upsert_subscriber(db, platform="tg", user_key=user_key)
                perms = _safe_json(sub.permissions_json)
                tags = list(perms.get("routing_tags") or [])
                wanted_tag = src.routing_tag or src.source_key
                if wanted_tag not in tags:
                    tags.append(wanted_tag)
                perms["routing_tags"] = tags
                sub.permissions_json = perms
                sub.updated_at = utcnow()

                insert_outbox_dedup_payload(
                    db,
                    platform="tg",
                    target_key=user_key,
                    payload_json={"text": f"已訂閱：{wanted_tag}"},
                    run_id=event_id,
                    variant="sub_ack",
                )
                event.status = "processed"
                return {"status": "processed", "event_id": event_id, "action": "subscribe_source"}

            if callback_data.startswith("intent:"):
                parts = callback_data.split(":")
                if len(parts) >= 3:
                    intent_key = parts[1]
                    parent_run_id = parts[2]
                    run = create_run_from_intent(
                        db,
                        inbox_event=event,
                        platform="tg",
                        intent_key=intent_key,
                        parent_run_id=parent_run_id,
                        target_key=chat_id,
                    )
                    if run:
                        return {"status": "accepted", "event_id": event_id, "run_id": run.id, "action": "intent"}

        if chat_type == "private" and text.strip().startswith("/start") and user_key:
            _upsert_subscriber(db, platform="tg", user_key=user_key)
            sources = db.execute(select(Source).where(Source.platform == "youtube", Source.enabled.is_(True)).order_by(Source.source_key)).scalars().all()
            if not sources:
                insert_outbox_dedup_payload(
                    db,
                    platform="tg",
                    target_key=user_key,
                    payload_json={"text": "目前沒有可訂閱的 YouTube 來源。"},
                    run_id=event_id,
                    variant="start_empty",
                )
            else:
                insert_outbox_dedup_payload(
                    db,
                    platform="tg",
                    target_key=user_key,
                    payload_json={
                        "text": "請選擇你要訂閱的頻道（可多選）：",
                        "reply_markup": _build_tg_start_buttons(sources),
                    },
                    run_id=event_id,
                    variant="start_menu",
                )
            event.status = "processed"
            return {"status": "processed", "event_id": event_id, "action": "start_menu"}

        if chat_type == "private" and text.strip().startswith("/bind") and user_key:
            # /bind <target_key> <routing_tag>
            parts = text.strip().split()
            if len(parts) >= 3:
                target_key = parts[1]
                routing_tag = parts[2]
                bot = db.execute(select(Bot).where(Bot.platform == "tg", Bot.status == "active").order_by(Bot.created_at.desc())).scalars().first()
                if not bot:
                    insert_outbox_dedup_payload(
                        db,
                        platform="tg",
                        target_key=user_key,
                        payload_json={"text": "綁定失敗：找不到可用 TG Bot。"},
                        run_id=event_id,
                        variant="bind_fail",
                    )
                else:
                    grp = Group(
                        platform="tg",
                        bot_id=bot.id,
                        target_key=target_key,
                        name=f"bound:{routing_tag}:{target_key}",
                        routing_tag=routing_tag,
                        enabled=True,
                    )
                    db.add(grp)
                    db.flush()
                    sub = _upsert_subscriber(db, platform="tg", user_key=user_key)
                    gids = list(sub.groups_json or [])
                    if grp.id not in gids:
                        gids.append(grp.id)
                    sub.groups_json = gids
                    sub.updated_at = utcnow()
                    insert_outbox_dedup_payload(
                        db,
                        platform="tg",
                        target_key=user_key,
                        payload_json={"text": f"綁定成功：{routing_tag} -> {target_key}"},
                        run_id=event_id,
                        variant="bind_ok",
                    )
            else:
                insert_outbox_dedup_payload(
                    db,
                    platform="tg",
                    target_key=user_key,
                    payload_json={"text": "格式：/bind <target_key> <routing_tag>"},
                    run_id=event_id,
                    variant="bind_usage",
                )
            event.status = "processed"
            return {"status": "processed", "event_id": event_id, "action": "bind"}

        matched_triggers = list_matching_triggers(db, platform="tg", event_type=event_type, source_key=source_key)
        if not matched_triggers:
            event.status = "processed"
            return {"status": "ignored", "reason": "no_trigger_match", "event_id": event_id}

        run_ids: list[str] = []
        for trigger in matched_triggers:
            run = create_run_from_event(
                db,
                event,
                chat_id,
                text,
                profile_id=trigger.profile_id,
                pipeline_id=trigger.pipeline_id,
                trigger_id=trigger.id,
            )
            run_ids.append(run.id)

    if len(run_ids) == 1:
        return {"status": "accepted", "event_id": event_id, "run_id": run_ids[0]}
    return {"status": "accepted", "event_id": event_id, "run_ids": run_ids}


@app.post("/api/worker/claim", response_model=WorkerClaimResponse)
def worker_claim(req: WorkerClaimRequest, db: Session = Depends(get_db)) -> WorkerClaimResponse:
    with db.begin():
        upsert_worker(db, req.worker_id, req.capabilities, req.max_concurrency)

        stmt = select(Job).where(Job.status == "queued", Job.next_retry_at <= utcnow())
        if req.queues:
            stmt = stmt.where(Job.queue_name.in_(req.queues))

        job = db.execute(stmt.order_by(Job.created_at).with_for_update(skip_locked=True)).scalars().first()
        if not job:
            return WorkerClaimResponse(job=None)

        job.status = "running"
        job.lock_owner = req.worker_id
        job.lock_until = utcnow() + timedelta(seconds=settings.job_lease_seconds)
        job.attempts += 1
        job.updated_at = utcnow()

        run = db.get(Run, job.run_id)
        if run:
            append_timeline(run, "job_claimed", {"job_id": job.id, "step_id": job.step_id, "worker": req.worker_id})

        return WorkerClaimResponse(
            job=WorkerJobResponse(
                id=job.id,
                run_id=job.run_id,
                step_id=job.step_id,
                queue_name=job.queue_name,
                requires_capabilities_json=job.requires_capabilities_json,
                input_json=job.input_json,
                attempts=job.attempts,
            )
        )


@app.post("/api/worker/complete")
def worker_complete(req: WorkerCompleteRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        job = db.execute(select(Job).where(Job.id == req.job_id).with_for_update()).scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="job not found")

        run = db.execute(select(Run).where(Run.id == job.run_id).with_for_update()).scalar_one_or_none()
        if not run:
            raise HTTPException(status_code=404, detail="run not found")

        if req.requeue:
            job.status = "queued"
            job.lock_owner = None
            job.lock_until = None
            job.next_retry_at = utcnow() + timedelta(seconds=max(req.delay_seconds, 1))
            job.updated_at = utcnow()
            append_timeline(run, "job_requeued", {"job_id": job.id, "reason": req.error})
            return {"status": "requeued", "job_id": job.id}

        if not req.success:
            job.status = "failed"
            job.output_json = req.output_json
            job.lock_owner = None
            job.lock_until = None
            job.updated_at = utcnow()

            run.status = "failed"
            run.updated_at = utcnow()
            append_timeline(run, "job_failed", {"job_id": job.id, "step_id": job.step_id, "error": req.error})
            inbox = db.get(InboxEvent, run.trigger_event_id)
            if inbox:
                inbox.status = "failed"
            return {"status": "failed", "job_id": req.job_id}

        job.status = "done"
        job.output_json = req.output_json
        job.lock_owner = None
        job.lock_until = None
        job.updated_at = utcnow()
        append_timeline(run, "job_done", {"job_id": job.id, "step_id": job.step_id})

        outputs = dict(run.outputs_json or {})

        if job.step_id == "llm_generate_v1":
            v1_script = req.output_json.get("v1_script") or outputs.get("source_text") or ""
            outputs["v1_script"] = v1_script
            run.outputs_json = outputs
            run.updated_at = utcnow()

            enqueue = Job(
                run_id=run.id,
                step_id="deliver_reply",
                queue_name="q_delivery",
                requires_capabilities_json=[],
                status="queued",
                attempts=0,
                next_retry_at=utcnow(),
                input_json={"chat_id": job.input_json.get("chat_id"), "text": v1_script, "platform": "tg"},
                output_json={},
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            db.add(enqueue)
            db.flush()
            append_timeline(run, "job_enqueued", {"step_id": "deliver_reply", "job_id": enqueue.id})
            return {"status": "ok", "job_id": job.id}

        if job.step_id in {"extract_notebooklm", "extract_subtitle_gemini"}:
            outputs["mined"] = req.output_json.get("mined") or {}
            outputs["source_material"] = req.output_json.get("source_material") or ""
            run.outputs_json = outputs
            run.updated_at = utcnow()

            enqueue = Job(
                run_id=run.id,
                step_id="skill5_pipeline",
                queue_name="q_llm",
                requires_capabilities_json=[],
                status="queued",
                attempts=0,
                next_retry_at=utcnow(),
                input_json={"mined": outputs.get("mined"), "source_material": outputs.get("source_material"), "video_title": outputs.get("video_title")},
                output_json={},
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            db.add(enqueue)
            db.flush()
            append_timeline(run, "job_enqueued", {"step_id": "skill5_pipeline", "job_id": enqueue.id})
            return {"status": "ok", "job_id": job.id}

        if job.step_id == "skill5_pipeline":
            outputs["mined"] = req.output_json.get("mined", outputs.get("mined", {}))
            outputs["skill5_script"] = req.output_json.get("skill5_script", "")
            outputs["skill5_review"] = req.output_json.get("skill5_review", "PASS")
            run.outputs_json = outputs
            run.updated_at = utcnow()

            enqueue = Job(
                run_id=run.id,
                step_id="skill3_pipeline",
                queue_name="q_llm",
                requires_capabilities_json=[],
                status="queued",
                attempts=0,
                next_retry_at=utcnow(),
                input_json={
                    "source_material": outputs.get("source_material"),
                    "script_from_5": outputs.get("skill5_script"),
                    "video_title": outputs.get("video_title"),
                },
                output_json={},
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            db.add(enqueue)
            db.flush()
            append_timeline(run, "job_enqueued", {"step_id": "skill3_pipeline", "job_id": enqueue.id})
            return {"status": "ok", "job_id": job.id}

        if job.step_id == "skill3_pipeline":
            outputs["fact_ledger"] = req.output_json.get("fact_ledger", [])
            outputs["skill3_review"] = req.output_json.get("skill3_review", "PASS")
            outputs["final_script"] = req.output_json.get("final_script", "")
            outputs["v2_script"] = outputs["final_script"]
            run.outputs_json = outputs
            run.updated_at = utcnow()

            enqueue = Job(
                run_id=run.id,
                step_id="generate_story_card",
                queue_name="q_media",
                requires_capabilities_json=[],
                status="queued",
                attempts=0,
                next_retry_at=utcnow(),
                input_json={
                    "topic": outputs.get("routing_tag") or outputs.get("video_title") or "市場",
                    "headline": req.output_json.get("card_fields", {}).get("headline") or outputs.get("video_title") or "重點更新",
                    "subhead": req.output_json.get("card_fields", {}).get("subhead") or "重點整理",
                    "metric": req.output_json.get("card_fields", {}).get("metric") or "95分",
                    "note": req.output_json.get("card_fields", {}).get("note") or "加入1%，成為1%",
                    "style": req.output_json.get("card_fields", {}).get("style") or "v9",
                },
                output_json={},
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            db.add(enqueue)
            db.flush()
            append_timeline(run, "job_enqueued", {"step_id": "generate_story_card", "job_id": enqueue.id})
            return {"status": "ok", "job_id": job.id}

        if job.step_id == "generate_story_card":
            outputs["card_url"] = req.output_json.get("card_url")
            outputs["card_fields"] = req.output_json.get("card_fields")
            run.outputs_json = outputs
            run.updated_at = utcnow()

            enqueue = Job(
                run_id=run.id,
                step_id="deliver_multicast",
                queue_name="q_delivery",
                requires_capabilities_json=[],
                status="queued",
                attempts=0,
                next_retry_at=utcnow(),
                input_json={"run_id": run.id},
                output_json={},
                created_at=utcnow(),
                updated_at=utcnow(),
            )
            db.add(enqueue)
            db.flush()
            append_timeline(run, "job_enqueued", {"step_id": "deliver_multicast", "job_id": enqueue.id})
            return {"status": "ok", "job_id": job.id}

        if job.step_id == "deliver_multicast":
            _enqueue_multicast_outbox(db, run, outputs)
            run.status = "done"
            run.updated_at = utcnow()
            append_timeline(run, "outbox_enqueued", {"delivery": "multicast"})
            inbox = db.get(InboxEvent, run.trigger_event_id)
            if inbox:
                inbox.status = "processed"
            return {"status": "ok", "job_id": job.id}

        if job.step_id == "deliver_reply":
            chat_id = str(job.input_json.get("chat_id"))
            text = req.output_json.get("text") or job.input_json.get("text") or ""
            insert_outbox_dedup(db, platform="tg", chat_id=chat_id, text=text, run_id=run.id, variant="v1")
            run.status = "done"
            run.updated_at = utcnow()
            append_timeline(run, "outbox_enqueued", {"chat_id": chat_id})
            inbox = db.get(InboxEvent, run.trigger_event_id)
            if inbox:
                inbox.status = "processed"
            return {"status": "ok", "job_id": job.id}

        if job.step_id in {"intent_rewrite_v2", "intent_make_card"}:
            target_key = str(job.input_json.get("target_key") or outputs.get("target_key") or "")
            platform = str(job.input_json.get("platform") or "tg")
            if job.step_id == "intent_rewrite_v2":
                text = req.output_json.get("final_script") or req.output_json.get("text") or "重寫完成"
                payload = {"text": f"【互動重寫】\n{text}"}
                variant = "intent_rewrite_v2"
            else:
                card_url = req.output_json.get("card_url")
                payload = {"text": "【互動圖卡】已生成", "photo_url": card_url, "caption": "【互動圖卡】已生成"}
                variant = "intent_make_card"

            insert_outbox_dedup_payload(
                db,
                platform=platform,
                target_key=target_key,
                payload_json=payload,
                run_id=run.id,
                variant=variant,
            )
            run.status = "done"
            run.updated_at = utcnow()
            append_timeline(run, "outbox_enqueued", {"intent": job.step_id})
            inbox = db.get(InboxEvent, run.trigger_event_id)
            if inbox:
                inbox.status = "processed"
            return {"status": "ok", "job_id": job.id}

        # fallback
        run.updated_at = utcnow()
        return {"status": "ok", "job_id": job.id}


@app.post("/api/worker/locks/acquire")
def worker_lock_acquire(req: LockAcquireRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        acquired, payload = acquire_lock(
            db,
            resource_key=req.resource_key,
            owner=req.owner,
            job_id=req.job_id,
            lease_seconds=req.lease_seconds,
            max_concurrency=req.max_concurrency,
        )
    return {"acquired": acquired, **payload}


@app.post("/api/worker/locks/release")
def worker_lock_release(req: LockReleaseRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        payload = release_lock(db, resource_key=req.resource_key, owner=req.owner, job_id=req.job_id)
    return payload


@app.get("/api/pipelines")
def list_pipelines(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(Pipeline).order_by(Pipeline.name)).scalars().all()
    return [_as_dict(row) for row in rows]


@app.post("/api/pipelines")
def create_pipeline(req: PipelineCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = Pipeline(name=req.name, graph_json=req.graph_json, version=req.version, enabled=req.enabled)
        db.add(row)
        db.flush()
    return _as_dict(row)


@app.patch("/api/pipelines/{pipeline_id}")
def update_pipeline(pipeline_id: str, req: PipelineUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = db.get(Pipeline, pipeline_id)
        if not row:
            raise HTTPException(status_code=404, detail="pipeline not found")
        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
    return _as_dict(row)


@app.get("/api/profiles")
def list_profiles(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(Profile).order_by(Profile.name)).scalars().all()
    return [_as_dict(row) for row in rows]


@app.post("/api/profiles")
def create_profile(req: ProfileCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = Profile(name=req.name, pipeline_id=req.pipeline_id, params_json=req.params_json, flags_json=req.flags_json)
        db.add(row)
        db.flush()
    return _as_dict(row)


@app.patch("/api/profiles/{profile_id}")
def update_profile(profile_id: str, req: ProfileUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = db.get(Profile, profile_id)
        if not row:
            raise HTTPException(status_code=404, detail="profile not found")

        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
    return _as_dict(row)


@app.get("/api/bots")
def list_bots(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(Bot).order_by(Bot.created_at.desc())).scalars().all()
    return [_as_dict(row) for row in rows]


@app.post("/api/bots")
def create_bot(req: BotCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = Bot(
            platform=req.platform,
            name=req.name,
            token_secret_ref=req.token_secret_ref,
            status=req.status,
            rate_policy_json=req.rate_policy_json,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(row)
        db.flush()
    return _as_dict(row)


@app.patch("/api/bots/{bot_id}")
def update_bot(bot_id: str, req: BotUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = db.get(Bot, bot_id)
        if not row:
            raise HTTPException(status_code=404, detail="bot not found")

        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
        row.updated_at = utcnow()
    return _as_dict(row)


@app.get("/api/groups")
def list_groups(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(Group).order_by(Group.name)).scalars().all()
    return [_as_dict(row) for row in rows]


@app.post("/api/groups")
def create_group(req: GroupCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = Group(
            platform=req.platform,
            bot_id=req.bot_id,
            target_key=req.target_key,
            name=req.name,
            routing_tag=req.routing_tag,
            enabled=req.enabled,
        )
        db.add(row)
        db.flush()
    return _as_dict(row)


@app.patch("/api/groups/{group_id}")
def update_group(group_id: str, req: GroupUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = db.get(Group, group_id)
        if not row:
            raise HTTPException(status_code=404, detail="group not found")

        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
    return _as_dict(row)


@app.get("/api/sources")
def list_sources(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(Source).order_by(Source.created_at.desc())).scalars().all()
    return [_as_dict(row) for row in rows]


@app.post("/api/sources")
def create_source(req: SourceCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = Source(
            platform=req.platform,
            source_key=req.source_key,
            routing_tag=req.routing_tag,
            default_profile_id=req.default_profile_id,
            extraction_mode=req.extraction_mode,
            enabled=req.enabled,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(row)
        db.flush()

        trigger_platform: str | None = None
        trigger_event_type = "message"
        if req.platform == "youtube":
            trigger_platform = "youtube"
            trigger_event_type = "new_video"
        elif req.platform in {"tg", "tg_channel"}:
            trigger_platform = "tg"
        elif req.platform in {"dc", "dc_channel", "discord"}:
            trigger_platform = "dc"
        elif req.platform in {"line", "line_channel"}:
            trigger_platform = "line"

        if trigger_platform:
            exists = (
                db.execute(
                    select(Trigger).where(
                        Trigger.platform == trigger_platform,
                        Trigger.event_type == trigger_event_type,
                        Trigger.source_key == row.source_key,
                    )
                )
                .scalars()
                .first()
            )
            if not exists:
                db.add(
                    Trigger(
                        name=f"{trigger_platform}:{row.source_key}",
                        platform=trigger_platform,
                        event_type=trigger_event_type,
                        source_key=row.source_key,
                        profile_id=row.default_profile_id,
                        pipeline_id=None,
                        enabled=row.enabled,
                        config_json={"auto_created": True, "source_id": row.id},
                        created_at=utcnow(),
                        updated_at=utcnow(),
                    )
                )
    return _as_dict(row)


@app.patch("/api/sources/{source_id}")
def update_source(source_id: str, req: SourceUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = db.get(Source, source_id)
        if not row:
            raise HTTPException(status_code=404, detail="source not found")

        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
        row.updated_at = utcnow()
    return _as_dict(row)


@app.get("/api/triggers")
def list_triggers(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(Trigger).order_by(Trigger.created_at.desc())).scalars().all()
    return [_as_dict(row) for row in rows]


@app.get("/api/triggers/{trigger_id}/sources")
def list_trigger_sources(trigger_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(Trigger, trigger_id)
    if not row:
        raise HTTPException(status_code=404, detail="trigger not found")
    items = _build_trigger_source_items(db, row)
    return {
        "trigger_id": row.id,
        "count": len(items),
        "items": items,
    }


@app.post("/api/triggers")
def create_trigger(req: TriggerCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = Trigger(
            name=req.name,
            platform=req.platform,
            event_type=req.event_type,
            source_key=req.source_key,
            profile_id=req.profile_id,
            pipeline_id=req.pipeline_id,
            enabled=req.enabled,
            config_json=req.config_json,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(row)
        db.flush()
    return _as_dict(row)


@app.patch("/api/triggers/{trigger_id}")
def update_trigger(trigger_id: str, req: TriggerUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = db.get(Trigger, trigger_id)
        if not row:
            raise HTTPException(status_code=404, detail="trigger not found")

        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
        row.updated_at = utcnow()
    return _as_dict(row)


@app.post("/api/triggers/{trigger_id}/quick-add/youtube")
def quick_add_youtube_channel_to_trigger(
    trigger_id: str,
    req: TriggerQuickAddYoutubeRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    with db.begin():
        trigger = db.get(Trigger, trigger_id)
        if not trigger:
            raise HTTPException(status_code=404, detail="trigger not found")
        if trigger.platform != "youtube":
            raise HTTPException(status_code=400, detail="trigger platform must be youtube")

        video_url = _normalize_http_url(req.video_url)
        channel_id = _resolve_youtube_channel_id(video_url)
        source_key = f"yt:channel:{channel_id}"
        added_to_trigger = _append_source_key_to_trigger(trigger, source_key)

        cfg = _safe_json(trigger.config_json)
        extraction_mode = str(cfg.get("extraction_mode") or "subtitle")
        if extraction_mode not in {"notebooklm", "subtitle"}:
            extraction_mode = "subtitle"

        source, created_source = _upsert_source_from_trigger(
            db,
            source_platform="youtube",
            source_key=source_key,
            trigger=trigger,
            extraction_mode=extraction_mode,
        )
        monitored_count = len(split_source_tokens(trigger.source_key))

    return {
        "status": "ok",
        "trigger": _as_dict(trigger),
        "added_to_trigger": added_to_trigger,
        "monitored_count": monitored_count,
        "resolved_source_key": source_key,
        "source_created": created_source,
        "source": _as_dict(source),
    }


@app.post("/api/triggers/{trigger_id}/quick-add/tg")
def quick_add_tg_chat_to_trigger(
    trigger_id: str,
    req: TriggerQuickAddTgRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    with db.begin():
        trigger = db.get(Trigger, trigger_id)
        if not trigger:
            raise HTTPException(status_code=404, detail="trigger not found")
        if trigger.platform != "tg":
            raise HTTPException(status_code=400, detail="trigger platform must be tg")

        chat_id = _resolve_tg_chat_id_from_link(req.chat_link)
        source_key = f"tg:{chat_id}"
        added_to_trigger = _append_source_key_to_trigger(trigger, source_key)

        source, created_source = _upsert_source_from_trigger(
            db,
            source_platform="tg_channel",
            source_key=source_key,
            trigger=trigger,
            extraction_mode="subtitle",
        )
        monitored_count = len(split_source_tokens(trigger.source_key))

    return {
        "status": "ok",
        "trigger": _as_dict(trigger),
        "added_to_trigger": added_to_trigger,
        "monitored_count": monitored_count,
        "resolved_source_key": source_key,
        "source_created": created_source,
        "source": _as_dict(source),
    }


@app.post("/api/triggers/{trigger_id}/remove-source")
def remove_source_from_trigger(
    trigger_id: str,
    req: TriggerRemoveSourceRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    with db.begin():
        row = db.get(Trigger, trigger_id)
        if not row:
            raise HTTPException(status_code=404, detail="trigger not found")

        target = req.source_key.strip()
        if not target:
            raise HTTPException(status_code=400, detail="source_key is required")

        tokens = split_source_tokens(row.source_key)
        next_tokens = [token for token in tokens if token != target]
        if len(next_tokens) == len(tokens):
            raise HTTPException(status_code=404, detail="source_key not found in trigger")
        if not next_tokens:
            raise HTTPException(status_code=400, detail="cannot remove last source; set another source first")

        row.source_key = ", ".join(next_tokens)
        row.updated_at = utcnow()

    return {
        "status": "ok",
        "trigger": _as_dict(row),
        "removed_source_key": target,
        "monitored_count": len(next_tokens),
    }


@app.delete("/api/triggers/{trigger_id}")
def delete_trigger(trigger_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = db.get(Trigger, trigger_id)
        if not row:
            raise HTTPException(status_code=404, detail="trigger not found")
        db.delete(row)
    return {"status": "deleted", "id": trigger_id}


@app.get("/api/intents")
def list_intents(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(Intent).order_by(Intent.created_at.desc())).scalars().all()
    return [_as_dict(row) for row in rows]


@app.post("/api/intents")
def create_intent(req: IntentCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = Intent(
            platform=req.platform,
            intent_key=req.intent_key,
            step_id=req.step_id,
            queue_name=req.queue_name,
            enabled=req.enabled,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(row)
        db.flush()
    return _as_dict(row)


@app.patch("/api/intents/{intent_id}")
def update_intent(intent_id: str, req: IntentUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = db.get(Intent, intent_id)
        if not row:
            raise HTTPException(status_code=404, detail="intent not found")

        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
        row.updated_at = utcnow()
    return _as_dict(row)


@app.get("/api/subscribers")
def list_subscribers(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(Subscriber).order_by(Subscriber.created_at.desc())).scalars().all()
    return [_as_dict(row) for row in rows]


@app.post("/api/subscribers")
def create_subscriber(req: SubscriberCreateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = Subscriber(
            platform=req.platform,
            user_key=req.user_key,
            groups_json=req.groups_json,
            permissions_json=req.permissions_json,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(row)
        db.flush()
    return _as_dict(row)


@app.patch("/api/subscribers/{subscriber_id}")
def update_subscriber(subscriber_id: str, req: SubscriberUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    with db.begin():
        row = db.get(Subscriber, subscriber_id)
        if not row:
            raise HTTPException(status_code=404, detail="subscriber not found")

        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
        row.updated_at = utcnow()
    return _as_dict(row)


@app.get("/api/runs")
def list_runs(db: Session = Depends(get_db), limit: int = 100) -> list[dict[str, Any]]:
    rows = db.execute(select(Run).order_by(Run.created_at.desc()).limit(limit)).scalars().all()
    return [_as_dict(row) for row in rows]


@app.get("/api/jobs")
def list_jobs(db: Session = Depends(get_db), limit: int = 200) -> list[dict[str, Any]]:
    rows = db.execute(select(Job).order_by(Job.created_at.desc()).limit(limit)).scalars().all()
    return [_as_dict(row) for row in rows]


@app.get("/api/locks")
def list_locks(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(ResourceLock).order_by(ResourceLock.resource_key)).scalars().all()
    return [_as_dict(row) for row in rows]


@app.get("/api/workers")
def list_workers(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.execute(select(Worker).order_by(Worker.id)).scalars().all()
    return [_as_dict(row) for row in rows]


@app.get("/api/outbox")
def list_outbox(db: Session = Depends(get_db), limit: int = 200) -> list[dict[str, Any]]:
    rows = db.execute(select(OutboxMessage).order_by(OutboxMessage.created_at.desc()).limit(limit)).scalars().all()
    return [_as_dict(row) for row in rows]
