"""add sources intents subscribers and group routing

Revision ID: 0003_sources_intents_subscribers
Revises: 0002_add_bots_groups
Create Date: 2026-02-22 18:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_sources_intents_subscribers"
down_revision = "0002_add_bots_groups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("groups", sa.Column("routing_tag", sa.String(length=128), nullable=True))
    op.add_column("groups", sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")))

    op.create_table(
        "sources",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("source_key", sa.String(length=255), nullable=False),
        sa.Column("routing_tag", sa.String(length=128), nullable=True),
        sa.Column("default_profile_id", sa.String(length=36), nullable=True),
        sa.Column("extraction_mode", sa.String(length=32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sources_platform_source_key", "sources", ["platform", "source_key"])

    op.create_table(
        "intents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("intent_key", sa.String(length=128), nullable=False),
        sa.Column("step_id", sa.String(length=128), nullable=False),
        sa.Column("queue_name", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_intents_platform_key", "intents", ["platform", "intent_key"])

    op.create_table(
        "subscribers",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("user_key", sa.String(length=255), nullable=False),
        sa.Column("groups_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("permissions_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_subscribers_platform_user", "subscribers", ["platform", "user_key"])


def downgrade() -> None:
    op.drop_index("ix_subscribers_platform_user", table_name="subscribers")
    op.drop_table("subscribers")

    op.drop_index("ix_intents_platform_key", table_name="intents")
    op.drop_table("intents")

    op.drop_index("ix_sources_platform_source_key", table_name="sources")
    op.drop_table("sources")

    op.drop_column("groups", "enabled")
    op.drop_column("groups", "routing_tag")
