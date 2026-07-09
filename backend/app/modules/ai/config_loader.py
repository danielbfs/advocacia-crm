"""Load AI configuration from system_config (DB) with env fallback."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.admin.models import SystemConfig

logger = logging.getLogger(__name__)

# Defaults matching the env-based config
_DEFAULTS = {
    "ai": {"type": "openai", "model": "gpt-4o-mini", "use_local_llm": False, "local_llm_url": "", "local_llm_model": ""},
    "chatbot": {"system_prompt": "", "max_tool_calls": 3, "temperature": 0.3},
    "firm_info": {"name": "Meu Escritório", "timezone": "America/Sao_Paulo"},
}


async def load_ai_config(db: AsyncSession) -> dict:
    """Load AI provider config from DB, fallback to env."""
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "ai_provider")
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        cfg = row.value
        return {
            "type": cfg.get("type", "openai"),
            "model": cfg.get("model", settings.OPENAI_MODEL),
            "use_local_llm": cfg.get("use_local_llm", False),
            "local_llm_url": cfg.get("local_llm_url", settings.LOCAL_LLM_BASE_URL),
            "local_llm_model": cfg.get("local_llm_model", settings.LOCAL_LLM_MODEL),
        }
    # Fallback to env
    return {
        "type": "local" if settings.LOCAL_LLM_BASE_URL else "openai",
        "model": settings.OPENAI_MODEL,
        "use_local_llm": bool(settings.LOCAL_LLM_BASE_URL),
        "local_llm_url": settings.LOCAL_LLM_BASE_URL,
        "local_llm_model": settings.LOCAL_LLM_MODEL,
    }


async def load_chatbot_config(db: AsyncSession) -> dict:
    """Load chatbot config (system prompt, temperature, etc.) from DB."""
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "chatbot")
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        return {
            "system_prompt": row.value.get("system_prompt", ""),
            "max_tool_calls": row.value.get("max_tool_calls", 3),
            "temperature": row.value.get("temperature", 0.3),
        }
    return {"system_prompt": "", "max_tool_calls": 3, "temperature": 0.3}


async def load_firm_config(db: AsyncSession) -> dict:
    """Load firm info from DB."""
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "firm_info")
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        return row.value
    return {"name": "Meu Escritório", "timezone": settings.FIRM_TIMEZONE}
