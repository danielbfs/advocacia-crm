"""Pydantic schemas for authentication."""
import uuid
from datetime import datetime

from pydantic import BaseModel


# --- Request schemas ---

class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class CreateUserRequest(BaseModel):
    username: str
    full_name: str
    password: str
    role: str  # 'admin', 'secretary', 'lawyer'
    lawyer_id: uuid.UUID | None = None


class UpdateUserRequest(BaseModel):
    username: str | None = None
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    lawyer_id: uuid.UUID | None = None


# --- Response schemas ---

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: uuid.UUID
    username: str
    full_name: str
    role: str
    lawyer_id: uuid.UUID | None = None
    is_active: bool
    must_change_password: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str
