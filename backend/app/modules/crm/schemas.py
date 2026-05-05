"""Pydantic schemas for patients."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class PatientContactResponse(BaseModel):
    id: uuid.UUID
    channel: str
    value: str
    is_primary: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LeadSummary(BaseModel):
    id: uuid.UUID
    code: str
    full_name: str | None
    channel: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PatientCreate(BaseModel):
    full_name: str | None = None
    phone: str
    email: str | None = None
    channel: str = "whatsapp"
    channel_id: str | None = None
    notes: str | None = None


class PatientUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    crm_status: str | None = None
    notes: str | None = None


class PatientResponse(BaseModel):
    id: uuid.UUID
    full_name: str | None
    phone: str
    email: str | None
    channel: str
    channel_id: str | None
    crm_status: str
    lead_id: uuid.UUID | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    contacts: list[PatientContactResponse] = []
    leads: list[LeadSummary] = []

    model_config = {"from_attributes": True}
