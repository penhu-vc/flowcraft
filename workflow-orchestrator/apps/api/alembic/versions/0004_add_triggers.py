"""add triggers table

Revision ID: 0004_add_triggers
Revises: 0003_sources_intents_subscribers
Create Date: 2026-02-23 13:40:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_add_triggers"
down_revision = "0003_sources_intents_subscribers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "triggers",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("source_key", sa.String(length=255), nullable=False),
        sa.Column("profile_id", sa.String(length=36), nullable=True),
        sa.Column("pipeline_id", sa.String(length=36), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("config_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_triggers_match", "triggers", ["platform", "event_type", "enabled", "source_key"])


def downgrade() -> None:
    op.drop_index("ix_triggers_match", table_name="triggers")
    op.drop_table("triggers")
