"""Lead and LeadInteraction models."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    # null=sem IA envolvida, True=IA ativa, False=humano assumiu
    ai_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Dados de contato
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Origem
    channel: Mapped[str] = mapped_column(String(30), nullable=False, default="outro")
    utm_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String(100), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_content: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_term: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Interesse clínico
    specialty_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("specialties.id"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_value: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Pipeline
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="novo")
    lost_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Responsabilidade e SLA
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    sla_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Conversão
    converted_patient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id"), nullable=True
    )
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    # Vínculo direto ao paciente (preenchido assim que o lead é associado)
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    specialty = relationship("Specialty", lazy="joined")
    assigned_user = relationship("User", foreign_keys=[assigned_to], lazy="joined")
    interactions = relationship("LeadInteraction", back_populates="lead", lazy="selectin", order_by="LeadInteraction.interacted_at.desc()")
    patient = relationship("Patient", foreign_keys="Lead.patient_id", back_populates="leads", lazy="joined")

    @property
    def is_overdue(self) -> bool:
        if self.contacted_at is not None:
            return False
        return self.sla_deadline < datetime.now(timezone.utc)


class LeadInteraction(Base):
    __tablename__ = "lead_interactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    next_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    interacted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    lead = relationship("Lead", back_populates="interactions")
    user = relationship("User", lazy="joined")
