"""Conversation session management via Redis."""
import json
import logging
import uuid

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

SESSION_TTL = 60 * 60 * 24  # 24 hours
MAX_HISTORY = 20  # max messages kept in session

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def _session_key(client_id: uuid.UUID) -> str:
    return f"session:{client_id}"


async def load_session(client_id: uuid.UUID) -> list[dict]:
    """Load conversation history from Redis."""
    r = await get_redis()
    key = _session_key(client_id)
    data = await r.get(key)
    if not data:
        return []
    try:
        messages = json.loads(data)
        return messages[-MAX_HISTORY:]
    except (json.JSONDecodeError, TypeError):
        return []


async def save_session(client_id: uuid.UUID, messages: list[dict]) -> None:
    """Save conversation history to Redis with TTL."""
    r = await get_redis()
    key = _session_key(client_id)
    trimmed = messages[-MAX_HISTORY:]
    await r.setex(key, SESSION_TTL, json.dumps(trimmed, ensure_ascii=False))


async def clear_session(client_id: uuid.UUID) -> None:
    """Clear a client's conversation session."""
    r = await get_redis()
    await r.delete(_session_key(client_id))
