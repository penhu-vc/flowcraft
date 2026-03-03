"""add bots and groups

Revision ID: 0002_add_bots_groups
Revises: 0001_mvp_schema
Create Date: 2026-02-22 00:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_add_bots_groups"
down_revision = "0001_mvp_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bots",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("token_secret_ref", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("rate_policy_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "groups",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("bot_id", sa.String(length=36), nullable=False),
        sa.Column("target_key", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("groups")
    op.drop_table("bots")
