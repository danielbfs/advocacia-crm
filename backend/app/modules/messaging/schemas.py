"""Normalized message schemas for all channels."""
import uuid
from pydantic import BaseModel


class IncomingMessage(BaseModel):
    """Normalized incoming message from any channel."""
    channel: str  # "telegram", "whatsapp"
    channel_user_id: str  # user ID in the channel
    channel_chat_id: str  # chat ID in the channel
    user_name: str | None = None
    text: str
    # ID of this incoming message in the channel (used for reply correlation)
    raw_message_id: str | None = None
    # ID of the message being quoted/replied to (supervisor reply tracking)
    quoted_message_id: str | None = None


class OutgoingMessage(BaseModel):
    """Message to send back to a channel."""
    channel: str
    channel_chat_id: str
    text: str
