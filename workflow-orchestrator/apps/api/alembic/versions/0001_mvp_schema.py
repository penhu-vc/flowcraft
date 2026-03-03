"""mvp schema

Revision ID: 0001_mvp_schema
Revises: 
Create Date: 2026-02-22 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_mvp_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inbox_events",
        sa.Column("id", sa.String(length=255), primary_key=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("source_key", sa.String(length=255), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ttl_expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "pipelines",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("graph_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
    )

    op.create_table(
        "profiles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("pipeline_id", sa.String(length=36), nullable=False),
        sa.Column("params_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("flags_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )

    op.create_table(
        "runs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("profile_id", sa.String(length=36), nullable=False),
        sa.Column("pipeline_id", sa.String(length=36), nullable=False),
        sa.Column("trigger_event_id", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("outputs_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("timeline_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("step_id", sa.String(length=128), nullable=False),
        sa.Column("queue_name", sa.String(length=64), nullable=False),
        sa.Column("requires_capabilities_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("lock_owner", sa.String(length=128), nullable=True),
        sa.Column("lock_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("input_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("output_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_index("ix_jobs_claim", "jobs", ["status", "queue_name", "next_retry_at", "created_at"])

    op.create_table(
        "resource_locks",
        sa.Column("resource_key", sa.String(length=128), primary_key=True),
        sa.Column("max_concurrency", sa.Integer(), nullable=False),
        sa.Column("holders_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "outbox_messages",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("deliver_key", sa.String(length=255), nullable=False),
        sa.Column("bot_id", sa.String(length=36), nullable=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("target_key", sa.String(length=255), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_unique_constraint("uq_outbox_deliver_key", "outbox_messages", ["deliver_key"])
    op.create_index("ix_outbox_dispatch", "outbox_messages", ["status", "next_retry_at", "created_at"])

    op.create_table(
        "workers",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("capabilities_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("max_concurrency", sa.Integer(), nullable=False),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
    )

    op.create_table(
        "modules",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("capabilities_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("input_schema_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("output_schema_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
    )

    op.create_table(
        "deploy_requests",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("env", sa.String(length=64), nullable=False),
        sa.Column("services_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("git_sha", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("logs_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("deploy_requests")
    op.drop_table("modules")
    op.drop_table("workers")
    op.drop_index("ix_outbox_dispatch", table_name="outbox_messages")
    op.drop_constraint("uq_outbox_deliver_key", "outbox_messages", type_="unique")
    op.drop_table("outbox_messages")
    op.drop_table("resource_locks")
    op.drop_index("ix_jobs_claim", table_name="jobs")
    op.drop_table("jobs")
    op.drop_table("runs")
    op.drop_table("profiles")
    op.drop_table("pipelines")
    op.drop_table("inbox_events")
