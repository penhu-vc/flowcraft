import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uuid_str() -> str:
    return str(uuid.uuid4())


class InboxEvent(Base):
    __tablename__ = "inbox_events"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    source_key: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="new", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    ttl_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Pipeline(Base):
    __tablename__ = "pipelines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    graph_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Bot(Base):
    __tablename__ = "bots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    token_secret_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    rate_policy_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    bot_id: Mapped[str] = mapped_column(String(36), nullable=False)
    target_key: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    routing_tag: Mapped[str | None] = mapped_column(String(128), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Subscriber(Base):
    __tablename__ = "subscribers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    user_key: Mapped[str] = mapped_column(String(255), nullable=False)
    groups_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    permissions_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    pipeline_id: Mapped[str] = mapped_column(String(36), nullable=False)
    params_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    flags_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    source_key: Mapped[str] = mapped_column(String(255), nullable=False)
    routing_tag: Mapped[str | None] = mapped_column(String(128), nullable=True)
    default_profile_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    extraction_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="subtitle")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Trigger(Base):
    __tablename__ = "triggers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, default="message")
    source_key: Mapped[str] = mapped_column(String(255), nullable=False)
    profile_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    pipeline_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    config_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Intent(Base):
    __tablename__ = "intents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    intent_key: Mapped[str] = mapped_column(String(128), nullable=False)
    step_id: Mapped[str] = mapped_column(String(128), nullable=False)
    queue_name: Mapped[str] = mapped_column(String(64), nullable=False, default="q_llm")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    profile_id: Mapped[str] = mapped_column(String(36), nullable=False)
    pipeline_id: Mapped[str] = mapped_column(String(36), nullable=False)
    trigger_event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    outputs_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    timeline_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(String(36), nullable=False)
    step_id: Mapped[str] = mapped_column(String(128), nullable=False)
    queue_name: Mapped[str] = mapped_column(String(64), nullable=False)
    requires_capabilities_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    lock_owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    lock_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_retry_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    input_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    output_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ResourceLock(Base):
    __tablename__ = "resource_locks"

    resource_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    max_concurrency: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    holders_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class OutboxMessage(Base):
    __tablename__ = "outbox_messages"
    __table_args__ = (
        UniqueConstraint("deliver_key", name="uq_outbox_deliver_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    deliver_key: Mapped[str] = mapped_column(String(255), nullable=False)
    bot_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    target_key: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_retry_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    capabilities_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    max_concurrency: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, default="module")
    capabilities_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    input_schema_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    output_schema_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class DeployRequest(Base):
    __tablename__ = "deploy_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    env: Mapped[str] = mapped_column(String(64), nullable=False, default="local")
    services_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    git_sha: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    logs_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
