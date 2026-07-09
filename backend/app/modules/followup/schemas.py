"""Pydantic schemas for follow-up rules and jobs."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class FollowupRuleCreate(BaseModel):
    name: str
    trigger_event: str  # consultation_scheduled, consultation_confirmed, etc.
    offset_minutes: int  # negative = before, positive = after
    message_template: str
    channel: str | None = None  # telegram, whatsapp, or None (same as client)
    is_active: bool = True


class FollowupRuleUpdate(BaseModel):
    name: str | None = None
    trigger_event: str | None = None
    offset_minutes: int | None = None
    message_template: str | None = None
    channel: str | None = None
    is_active: bool | None = None


class FollowupRuleResponse(BaseModel):
    id: uuid.UUID
    name: str
    trigger_event: str
    offset_minutes: int
    message_template: str
    channel: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class FollowupJobResponse(BaseModel):
    id: uuid.UUID
    rule_id: uuid.UUID
    consultation_id: uuid.UUID
    client_id: uuid.UUID
    scheduled_for: datetime
    status: str
    error_message: str | None
    executed_at: datetime | None

    model_config = {"from_attributes": True}
