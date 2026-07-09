"""Pydantic schemas for practice areas."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class PracticeAreaCreate(BaseModel):
    name: str
    description: str | None = None


class PracticeAreaUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class PracticeAreaResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
