"""Lead AI Agent models — configs, conversations, supervisor queries, outbound messages and activities."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LeadAgentConfig(Base):
    """Per-status configuration for the Lead AI Agent."""

    __tablename__ = "lead_agent_configs"

    status: Mapped[str] = mapped_column(String(30), primary_key=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_send_on_enter: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    initial_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    inactivity_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    max_inactivity_followups: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    # Delay before sending the proactive first message when entering this status.
    proactive_delay_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    inactivity_followup_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_lost_after_hours: Mapped[int] = mapped_column(Integer, default=72, nullable=False)
    # When True, booking an appointment auto-converts the lead to 'convertido'
    convert_on_appointment: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class LeadConversation(Base):
    """AI conversation linked to a specific Lead (not a Patient)."""

    __tablename__ = "lead_conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leads.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    channel_chat_id: Mapped[str] = mapped_column(String(100), nullable=False)
    # "ai" | "awaiting_supervisor" | "human"
    control: Mapped[str] = mapped_column(String(30), default="ai", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    inactivity_followups_sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    messages = relationship(
        "LeadMessage",
        back_populates="conversation",
        lazy="selectin",
        order_by="LeadMessage.sent_at",
    )
    supervisor_queries = relationship(
        "SupervisorQuery",
        back_populates="conversation",
        lazy="selectin",
        order_by="SupervisorQuery.asked_at.desc()",
    )


class LeadMessage(Base):
    """A single message in a lead conversation."""

    __tablename__ = "lead_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lead_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    # "user" | "assistant"
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    conversation = relationship("LeadConversation", back_populates="messages")


class SupervisorQuery(Base):
    """A question sent to the supervisor WhatsApp, awaiting a quoted reply."""

    __tablename__ = "supervisor_queries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leads.id", ondelete="CASCADE"),
        nullable=False,
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lead_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    context_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "pending" | "answered" | "timeout"
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    # ID of the WhatsApp message we sent to the supervisor (for reply correlation)
    whatsapp_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    supervisor_chat_id: Mapped[str] = mapped_column(String(50), nullable=False)
    asked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    conversation = relationship("LeadConversation", back_populates="supervisor_queries")


class LeadOutboundMessage(Base):
    """WhatsApp message sent or scheduled by a human operator for a lead."""

    __tablename__ = "lead_outbound_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    channel: Mapped[str] = mapped_column(String(20), default="whatsapp", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # null = send immediately
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # "pending" | "sent" | "failed" | "cancelled"
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class LeadActivity(Base):
    """Reminder / to-do activity linked to a lead, assigned to a user."""

    __tablename__ = "lead_activities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # "pending" | "done" | "cancelled"
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
