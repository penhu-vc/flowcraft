from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.types import DateTime, Integer, String


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/orchestrator"
    tg_bot_token: str = ""
    sender_poll_interval_seconds: float = 1.5
    sender_max_attempts: int = 6
    sender_base_backoff_seconds: int = 3


class Base(DeclarativeBase):
    pass


class OutboxMessage(Base):
    __tablename__ = "outbox_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    deliver_key: Mapped[str] = mapped_column(String(255), nullable=False)
    bot_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    target_key: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    next_retry_at: Mapped[Any] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[Any] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[Any] = mapped_column(DateTime(timezone=True), nullable=False)


settings = Settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("sender")

engine = create_engine(settings.database_url, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def claim_one_message() -> dict[str, Any] | None:
    with SessionLocal() as db:
        with db.begin():
            row = (
                db.execute(
                    select(OutboxMessage)
                    .where(OutboxMessage.status == "queued", OutboxMessage.next_retry_at <= utcnow())
                    .order_by(OutboxMessage.created_at)
                    .with_for_update(skip_locked=True)
                )
                .scalars()
                .first()
            )
            if not row:
                return None

            row.attempts += 1
            row.next_retry_at = utcnow() + timedelta(seconds=60)
            row.updated_at = utcnow()

            return {
                "id": row.id,
                "platform": row.platform,
                "target_key": row.target_key,
                "payload_json": row.payload_json,
                "attempts": row.attempts,
            }


def mark_sent(message_id: str) -> None:
    with SessionLocal() as db:
        with db.begin():
            row = db.get(OutboxMessage, message_id)
            if not row:
                return
            row.status = "sent"
            row.updated_at = utcnow()


def mark_retry_or_failed(message_id: str, attempts: int, error: str) -> None:
    with SessionLocal() as db:
        with db.begin():
            row = db.get(OutboxMessage, message_id)
            if not row:
                return

            if attempts >= settings.sender_max_attempts:
                row.status = "failed"
                row.payload_json = {**(row.payload_json or {}), "last_error": error}
                row.updated_at = utcnow()
                return

            backoff = settings.sender_base_backoff_seconds * (2 ** max(attempts - 1, 0))
            row.status = "queued"
            row.next_retry_at = utcnow() + timedelta(seconds=backoff)
            row.payload_json = {**(row.payload_json or {}), "last_error": error}
            row.updated_at = utcnow()


def send_telegram(chat_id: str, payload: dict[str, Any]) -> None:
    if not settings.tg_bot_token:
        raise RuntimeError("TG_BOT_TOKEN is empty")

    text = str(payload.get("text") or "")
    reply_markup = payload.get("reply_markup")

    with httpx.Client(timeout=20) as client:
        if payload.get("photo_url"):
            url = f"https://api.telegram.org/bot{settings.tg_bot_token}/sendPhoto"
            body: dict[str, Any] = {
                "chat_id": chat_id,
                "photo": payload.get("photo_url"),
                "caption": str(payload.get("caption") or text),
            }
            if reply_markup:
                body["reply_markup"] = reply_markup
            resp = client.post(url, json=body)
        else:
            url = f"https://api.telegram.org/bot{settings.tg_bot_token}/sendMessage"
            body = {"chat_id": chat_id, "text": text}
            if reply_markup:
                body["reply_markup"] = reply_markup
            resp = client.post(url, json=body)

    if resp.status_code >= 400:
        raise RuntimeError(f"telegram send failed: status={resp.status_code} body={resp.text[:300]}")


def send_discord(target_key: str, payload: dict[str, Any]) -> None:
    # target_key can be full Discord webhook URL
    if not target_key.startswith("http"):
        raise RuntimeError("discord target_key must be webhook url")

    text = str(payload.get("text") or payload.get("caption") or "")
    body = {"content": text}
    with httpx.Client(timeout=20) as client:
        resp = client.post(target_key, json=body)
    if resp.status_code >= 400:
        raise RuntimeError(f"discord send failed: status={resp.status_code} body={resp.text[:300]}")


def dispatch(msg: dict[str, Any]) -> None:
    platform = msg["platform"]
    payload = msg.get("payload_json") or {}

    if platform == "tg":
        send_telegram(msg["target_key"], payload)
        return

    if platform == "dc":
        send_discord(msg["target_key"], payload)
        return

    raise RuntimeError(f"unsupported platform: {platform}")


def run() -> None:
    logger.info("sender started")
    while True:
        try:
            msg = claim_one_message()
            if not msg:
                time.sleep(settings.sender_poll_interval_seconds)
                continue

            try:
                dispatch(msg)
                mark_sent(msg["id"])
                logger.info("sent outbox id=%s", msg["id"])
            except Exception as exc:
                mark_retry_or_failed(msg["id"], msg["attempts"], str(exc))
                logger.warning("dispatch failed id=%s error=%s", msg["id"], exc)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            logger.exception("sender loop error: %s", exc)
            time.sleep(max(settings.sender_poll_interval_seconds, 1))


if __name__ == "__main__":
    run()
