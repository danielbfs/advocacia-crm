"""Celery task para verificação de SLA de leads."""
import asyncio
import logging
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import select, and_

from app.config import settings
from app.modules.admin.models import SystemConfig
from app.modules.leads.models import Lead
from app.modules.messaging.gateway import send_message

from celery_app import celery_app

logger = logging.getLogger(__name__)

# Lead IDs notificados ficam por 24h no Redis para evitar reenvios consecutivos
NOTIFY_TTL = 60 * 60 * 24


@celery_app.task(name="app.modules.leads.sla.check_overdue_leads")
def check_overdue_leads():
    """Verifica leads com SLA vencido. Roda a cada 15 minutos via Celery Beat."""
    asyncio.run(_check_overdue())


async def _get_chat_id(db) -> str:
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "notifications")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return ""
    return (row.value or {}).get("sla_telegram_chat_id") or ""


async def _check_overdue():
    from app.modules.leads.ai_tasks import _celery_db_session

    async with _celery_db_session() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(Lead).where(
                and_(
                    Lead.contacted_at.is_(None),
                    Lead.sla_deadline < now,
                    Lead.status.in_(["novo", "em_contato"]),
                )
            )
        )
        overdue_leads = list(result.scalars().all())

        if not overdue_leads:
            return

        chat_id = await _get_chat_id(db)
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

        # Filtra leads ainda não notificados nesta janela
        new_overdue = []
        for lead in overdue_leads:
            key = f"sla:notified:{lead.id}"
            if not await redis.exists(key):
                new_overdue.append(lead)
                await redis.setex(key, NOTIFY_TTL, "1")

        logger.warning(
            "SLA vencido em %d lead(s) (%d novos para notificar)",
            len(overdue_leads),
            len(new_overdue),
        )

        if not new_overdue or not chat_id or not settings.TELEGRAM_BOT_TOKEN:
            return

        lines = [f"⚠️ *{len(new_overdue)} lead(s) com SLA vencido*", ""]
        for lead in new_overdue[:15]:
            name = lead.full_name or lead.phone
            deadline = lead.sla_deadline.strftime("%d/%m %H:%M")
            lines.append(f"• {name} (deadline {deadline}) — canal: {lead.channel}")
        if len(new_overdue) > 15:
            lines.append(f"... e mais {len(new_overdue) - 15}")

        try:
            await send_message("telegram", chat_id, "\n".join(lines))
        except Exception:
            logger.exception("Falha ao notificar SLA via Telegram")
