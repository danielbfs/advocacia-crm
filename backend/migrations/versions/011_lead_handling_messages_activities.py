"""lead ai_active, outbound messages and activities

Revision ID: 011
Revises: 010
Create Date: 2026-04-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Campo de controle de atendimento no lead
    op.add_column("leads", sa.Column("ai_active", sa.Boolean(), nullable=True))

    # 2. Mensagens outbound do atendente
    op.create_table(
        "lead_outbound_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "lead_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("channel", sa.String(20), nullable=False, server_default="whatsapp"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_lead_outbound_lead", "lead_outbound_messages", ["lead_id"])
    op.create_index(
        "ix_lead_outbound_status",
        "lead_outbound_messages",
        ["status", "scheduled_for"],
    )

    # 3. Lembretes / atividades
    op.create_table(
        "lead_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "lead_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "assigned_to",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_lead_activities_lead", "lead_activities", ["lead_id"])
    op.create_index(
        "ix_lead_activities_assigned",
        "lead_activities",
        ["assigned_to", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_lead_activities_assigned", table_name="lead_activities")
    op.drop_index("ix_lead_activities_lead", table_name="lead_activities")
    op.drop_table("lead_activities")

    op.drop_index("ix_lead_outbound_status", table_name="lead_outbound_messages")
    op.drop_index("ix_lead_outbound_lead", table_name="lead_outbound_messages")
    op.drop_table("lead_outbound_messages")

    op.drop_column("leads", "ai_active")
