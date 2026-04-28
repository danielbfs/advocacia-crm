"""Celery tasks for the Lead AI Agent."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# --- Proactive message when lead enters a status ---

@celery_app.task(
    name="app.modules.leads.ai_tasks.send_lead_proactive_message",
    queue="leads",
    max_retries=2,
    default_retry_delay=60,
)
def send_lead_proactive_message(lead_id: str):
    """Send the configured initial AI message when a lead enters a new status."""
    _run_async(_do_send_proactive(lead_id))


async def _do_send_proactive(lead_id_str: str) -> None:
    import uuid
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.modules.leads.models import Lead
    from app.modules.leads.ai_engine import load_agent_config, send_proactive_message

    async with AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(lead_id_str))
        if not lead:
            return
        agent_config = await load_agent_config(db, lead.status)
        if not agent_config or not agent_config.auto_send_on_enter:
            return
        ok = await send_proactive_message(db, lead, agent_config)
        if ok:
            logger.info("Proactive message sent for lead %s", lead.code)


# --- Inactivity follow-up check (runs every 30 min) ---

@celery_app.task(
    name="app.modules.leads.ai_tasks.check_lead_inactivity",
    queue="leads",
)
def check_lead_inactivity():
    """Check for leads with AI conversations that have gone inactive."""
    _run_async(_do_check_inactivity())


async def _do_check_inactivity() -> None:
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.modules.leads.models import Lead, LeadInteraction
    from app.modules.leads.ai_models import LeadAgentConfig, LeadConversation, LeadMessage
    from app.modules.messaging.gateway import send_message

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(LeadConversation).where(
                LeadConversation.control == "ai",
                LeadConversation.status == "active",
                LeadConversation.last_message_at.isnot(None),
            )
        )
        conversations = list(result.scalars().all())

        for conv in conversations:
            lead = await db.get(Lead, conv.lead_id)
            if not lead or lead.status in ("convertido", "perdido"):
                continue

            config_result = await db.execute(
                select(LeadAgentConfig).where(
                    LeadAgentConfig.status == lead.status,
                    LeadAgentConfig.is_active == True,  # noqa: E712
                )
            )
            config = config_result.scalar_one_or_none()
            if not config:
                continue

            hours_since = (now - conv.last_message_at).total_seconds() / 3600

            # Auto-lost threshold
            if hours_since >= config.auto_lost_after_hours:
                lead.status = "perdido"
                lead.lost_reason = "sem_resposta"
                conv.status = "closed"
                conv.closed_at = now
                db.add(LeadInteraction(
                    lead_id=lead.id,
                    type="nota",
                    content=(
                        f"[IA] Lead marcado como perdido por inatividade "
                        f"({config.auto_lost_after_hours}h sem resposta)."
                    ),
                ))
                await db.commit()
                logger.info("Lead %s auto-marked as lost due to inactivity", lead.code)
                continue

            # Inactivity follow-up
            if (
                hours_since >= config.inactivity_hours
                and conv.inactivity_followups_sent < config.max_inactivity_followups
                and config.inactivity_followup_message
            ):
                followup_msg = config.inactivity_followup_message.replace(
                    "{nome}", lead.full_name or "você"
                )
                ok = await send_message(conv.channel, conv.channel_chat_id, followup_msg)
                if ok:
                    conv.inactivity_followups_sent += 1
                    conv.last_message_at = now
                    db.add(LeadMessage(
                        conversation_id=conv.id,
                        role="assistant",
                        content=followup_msg,
                        sent_at=now,
                    ))
                    await db.commit()
                    logger.info(
                        "Inactivity follow-up sent to lead %s (%d/%d)",
                        lead.code,
                        conv.inactivity_followups_sent,
                        config.max_inactivity_followups,
                    )


# --- Supervisor query timeout check (runs every hour) ---

@celery_app.task(
    name="app.modules.leads.ai_tasks.check_supervisor_timeouts",
    queue="leads",
)
def check_supervisor_timeouts():
    """Expire supervisor queries that have not been answered within timeout_hours."""
    _run_async(_do_check_supervisor_timeouts())


async def _do_check_supervisor_timeouts() -> None:
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.modules.admin.models import SystemConfig
    from app.modules.leads.models import Lead, LeadInteraction
    from app.modules.leads.ai_models import LeadConversation, SupervisorQuery
    from app.modules.messaging.gateway import send_message

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        sup_result = await db.execute(
            select(SystemConfig).where(SystemConfig.key == "lead_agent_supervisor")
        )
        row = sup_result.scalar_one_or_none()
        supervisor_config = row.value if row and row.value else {}
        timeout_hours = int(supervisor_config.get("timeout_hours", 4))
        on_timeout = supervisor_config.get("on_timeout", "escalate_human")

        cutoff = now - timedelta(hours=timeout_hours)
        result = await db.execute(
            select(SupervisorQuery).where(
                SupervisorQuery.status == "pending",
                SupervisorQuery.asked_at < cutoff,
            )
        )
        expired = list(result.scalars().all())

        for query in expired:
            query.status = "timeout"
            query.answered_at = now

            conv_result = await db.execute(
                select(LeadConversation).where(LeadConversation.id == query.conversation_id)
            )
            conv = conv_result.scalar_one_or_none()
            lead = await db.get(Lead, query.lead_id)

            if not conv or not lead:
                await db.commit()
                continue

            if on_timeout == "escalate_human":
                conv.control = "human"
                note = "[IA] Supervisor não respondeu a tempo. Escalado para atendente humano."
            else:
                conv.status = "closed"
                conv.closed_at = now
                note = "[IA] Supervisor não respondeu a tempo. Conversa encerrada pela IA."

            db.add(LeadInteraction(lead_id=lead.id, type="nota", content=note))

            timeout_msg = (
                "Oi! Nossa equipe está verificando e em breve um atendente entrará em contato. "
                "Pedimos desculpas pela demora! 🙏"
            )
            await send_message(conv.channel, conv.channel_chat_id, timeout_msg)
            await db.commit()

            logger.info(
                "Supervisor query %s timed out for lead %s — action: %s",
                query.id,
                lead.code,
                on_timeout,
            )
