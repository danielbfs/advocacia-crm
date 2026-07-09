"""Pydantic schemas for lawyers, schedules and consultations."""
import uuid
from datetime import datetime, time

from pydantic import BaseModel


# --- Lawyer ---

class LawyerCreate(BaseModel):
    full_name: str
    oab: str | None = None
    practice_area_id: uuid.UUID | None = None
    scheduling_provider: str = "local_db"
    slot_duration_minutes: int = 30


class LawyerUpdate(BaseModel):
    full_name: str | None = None
    oab: str | None = None
    practice_area_id: uuid.UUID | None = None
    slot_duration_minutes: int | None = None
    is_active: bool | None = None


class LawyerScheduleItem(BaseModel):
    day_of_week: int  # 0=Mon ... 6=Sun
    start_time: str   # "08:00"
    end_time: str      # "12:00"


class LawyerScheduleSet(BaseModel):
    schedules: list[LawyerScheduleItem]


class LawyerScheduleResponse(BaseModel):
    id: uuid.UUID
    day_of_week: int
    start_time: time
    end_time: time
    is_active: bool

    model_config = {"from_attributes": True}


class LawyerResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    oab: str | None
    practice_area_id: uuid.UUID | None
    scheduling_provider: str
    slot_duration_minutes: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Schedule Block ---

class ScheduleBlockCreate(BaseModel):
    lawyer_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    reason: str | None = None


class ScheduleBlockResponse(BaseModel):
    id: uuid.UUID
    lawyer_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Consultation ---

class ConsultationCreate(BaseModel):
    client_id: uuid.UUID
    lawyer_id: uuid.UUID
    practice_area_id: uuid.UUID | None = None
    starts_at: datetime
    ends_at: datetime
    notes: str | None = None
    source: str = "secretary"


class ConsultationUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None


class ConsultationResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    lawyer_id: uuid.UUID
    practice_area_id: uuid.UUID | None
    starts_at: datetime
    ends_at: datetime
    status: str
    source: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Availability ---

class TimeSlot(BaseModel):
    starts_at: datetime
    ends_at: datetime
