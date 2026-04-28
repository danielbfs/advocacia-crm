"""add lead code and lead ai agent tables

Revision ID: 010
Revises: 009
Create Date: 2026-04-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- code em leads ---
    op.add_column("leads", sa.Column("code", sa.String(20), nullable=True))
    op.execute("""
        WITH numbered AS (
            SELECT id,
                   EXTRACT(YEAR FROM created_at)::int AS yr,
                   ROW_NUMBER() OVER (
                       PARTITION BY EXTRACT(YEAR FROM created_at)
                       ORDER BY created_at
                   ) AS rn
            FROM leads
        )
        UPDATE leads
        SET code = 'L-' || numbered.yr::text || '-' || LPAD(numbered.rn::text, 5, '0')
        FROM numbered
        WHERE leads.id = numbered.id
    """)
    op.alter_column("leads", "code", nullable=False)
    op.create_unique_constraint("uq_leads_code", "leads", ["code"])
    op.create_index("ix_leads_code", "leads", ["code"])

    # --- LeadAgentConfig ---
    op.create_table(
        "lead_agent_configs",
        sa.Column("status", sa.String(30), primary_key=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("auto_send_on_enter", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("initial_message", sa.Text(), nullable=True),
        sa.Column("inactivity_hours", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("max_inactivity_followups", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("inactivity_followup_message", sa.Text(), nullable=True),
        sa.Column("auto_lost_after_hours", sa.Integer(), nullable=False, server_default="72"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # --- LeadConversation ---
    op.create_table(
        "lead_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "lead_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("channel_chat_id", sa.String(100), nullable=False),
        sa.Column("control", sa.String(30), nullable=False, server_default="ai"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("inactivity_followups_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint("uq_lead_conversations_lead", "lead_conversations", ["lead_id"])
    op.create_index("ix_lead_conversations_lead", "lead_conversations", ["lead_id"])
    op.create_index(
        "ix_lead_conversations_channel_chat",
        "lead_conversations",
        ["channel", "channel_chat_id"],
    )
    op.create_index("ix_lead_conversations_control", "lead_conversations", ["control"])

    # --- LeadMessage ---
    op.create_table(
        "lead_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lead_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_lead_messages_conversation",
        "lead_messages",
        ["conversation_id", "sent_at"],
    )

    # --- SupervisorQuery ---
    op.create_table(
        "supervisor_queries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "lead_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lead_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("context_summary", sa.Text(), nullable=True),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("whatsapp_message_id", sa.String(100), nullable=True),
        sa.Column("supervisor_chat_id", sa.String(50), nullable=False),
        sa.Column(
            "asked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_supervisor_queries_lead", "supervisor_queries", ["lead_id"])
    op.create_index("ix_supervisor_queries_status", "supervisor_queries", ["status"])
    op.create_index(
        "ix_supervisor_queries_whatsapp_msg",
        "supervisor_queries",
        ["whatsapp_message_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_supervisor_queries_whatsapp_msg", table_name="supervisor_queries")
    op.drop_index("ix_supervisor_queries_status", table_name="supervisor_queries")
    op.drop_index("ix_supervisor_queries_lead", table_name="supervisor_queries")
    op.drop_table("supervisor_queries")

    op.drop_index("ix_lead_messages_conversation", table_name="lead_messages")
    op.drop_table("lead_messages")

    op.drop_index("ix_lead_conversations_control", table_name="lead_conversations")
    op.drop_index("ix_lead_conversations_channel_chat", table_name="lead_conversations")
    op.drop_index("ix_lead_conversations_lead", table_name="lead_conversations")
    op.drop_constraint("uq_lead_conversations_lead", "lead_conversations", type_="unique")
    op.drop_table("lead_conversations")

    op.drop_table("lead_agent_configs")

    op.drop_index("ix_leads_code", table_name="leads")
    op.drop_constraint("uq_leads_code", "leads", type_="unique")
    op.drop_column("leads", "code")
