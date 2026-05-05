"""Patient and PatientContact models."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="whatsapp")
    channel_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    crm_status: Mapped[str] = mapped_column(String(30), nullable=False, default="new")
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    contacts: Mapped[list["PatientContact"]] = relationship(
        "PatientContact", back_populates="patient", lazy="selectin",
        cascade="all, delete-orphan", order_by="PatientContact.is_primary.desc()"
    )
    leads: Mapped[list] = relationship(
        "Lead", foreign_keys="Lead.patient_id",
        back_populates="patient", lazy="selectin",
        order_by="Lead.created_at.desc()"
    )


class PatientContact(Base):
    """A single contact channel (phone/telegram/email) linked to a Patient."""
    __tablename__ = "patient_contacts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False)   # whatsapp | telegram | email
    value: Mapped[str] = mapped_column(String(255), nullable=False)     # phone number / telegram id / email
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    patient: Mapped["Patient"] = relationship("Patient", back_populates="contacts")
