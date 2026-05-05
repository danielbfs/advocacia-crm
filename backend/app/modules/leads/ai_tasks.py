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


def _ensure_models_loaded():
    """
    Import all SQLAlchemy models so that the ORM mapper can resolve all
    relationships (e.g. Lead.assigned_user → User) before any query runs.
    This is required in Celery workers, which bypass FastAPI's startup event.
    """
    from app.modules.auth.models import User  # noqa: F401
    from app.modules.admin.models import AuditLog, Specialty, SystemConfig  # noqa: F401
    from app.modules.scheduling.models import Doctor, DoctorSchedule, ScheduleBlock, Appointment  # noqa: F401
    from app.modules.crm.models import Patient  # noqa: F401
    from app.modules.leads.models import Lead, LeadInteraction  # noqa: F401
    from app.modules.leads.ai_models import (  # noqa: F401
        LeadAgentConfig, LeadConversation, LeadMessage,
        SupervisorQuery, LeadOutboundMessage, LeadActivity
    )
    from app.modules.messaging.models import Conversation, Message  # noqa: F401
    from app.modules.followup.models import FollowupRule, FollowupJob  # noqa: F401


# ---------------------------------------------------------------------------
# Proactive message when lead enters a status
# ---------------------------------------------------------------------------

@celery_app.task(
    name="app.modules.leads.ai_tasks.send_lead_proactive_message",
    queue="leads",
    max_retries=2,
    default_retry_delay=60,
)
def send_lead_proactive_message(lead_id: str, status: str | None = None):
    """
    Send the configured initial AI message when a lead enters a new status.
    Optionally pass the target status to avoid a race condition where the
    lead's status was already updated before the task runs.
    """
    _run_async(_do_send_proactive(lead_id, status))


async def _do_send_proactive(lead_id_str: str, status: str | None = None) -> None:
    import uuid
    from app.database import AsyncSessionLocal
    from app.modules.leads.models import Lead
    from app.modules.leads.ai_engine import load_agent_config, send_proactive_message
    from app.modules.leads.schedule import is_messaging_allowed

    _ensure_models_loaded()

    async with AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(lead_id_str))
        if not lead:
            logger.warning("Proactive task: lead %s not found", lead_id_str)
            return

        # Use the passed status or fall back to the current lead status
        check_status = status or lead.status

        # Skip for terminal statuses
        if check_status in ("convertido", "perdido"):
            return

        # Only run for leads with a real messaging channel
        if lead.channel not in ("whatsapp", "telegram"):
            logger.info(
                "Proactive task: lead %s channel '%s' not supported, skipping",
                lead.code, lead.channel,
            )
            return

        # Check schedule — but only if schedule enforcement is enabled
        if not await is_messaging_allowed(db):
            logger.info(
                "Proactive message for lead %s skipped — outside allowed hours", lead_id_str
            )
            return

        agent_config = await load_agent_config(db, check_status)
        if not agent_config:
            logger.info(
                "Proactive task: no active AI config for status '%s' (lead %s)",
                check_status, lead.code,
            )
            return

        if not agent_config.auto_send_on_enter:
            logger.info(
                "Proactive task: auto_send_on_enter=False for status '%s' (lead %s)",
                check_status, lead.code,
            )
            return

        if not agent_config.initial_message:
            logger.info(
                "Proactive task: no initial_message configured for status '%s' (lead %s)",
                check_status, lead.code,
            )
            return

        ok = await send_proactive_message(db, lead, agent_config)
        if ok:
            logger.info("Proactive message sent for lead %s (status=%s)", lead.code, check_status)
        else:
            logger.warning(
                "Proactive message FAILED for lead %s (status=%s)", lead.code, check_status
            )


# ---------------------------------------------------------------------------
# Inactivity follow-up check (runs every 30 min)
# ---------------------------------------------------------------------------

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
    from app.modules.leads.schedule import is_messaging_allowed
    from app.modules.messaging.gateway import send_message

    _ensure_models_loaded()

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        if not await is_messaging_allowed(db):
            logger.info("Inactivity check skipped — outside allowed messaging hours")
            return

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


# ---------------------------------------------------------------------------
# Supervisor query timeout check (runs every hour)
# ---------------------------------------------------------------------------

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

    _ensure_models_loaded()

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
                query.id, lead.code, on_timeout,
            )


# ---------------------------------------------------------------------------
# Scheduled outbound messages (runs every 2 min)
# ---------------------------------------------------------------------------

@celery_app.task(
    name="app.modules.leads.ai_tasks.process_lead_scheduled_messages",
    queue="leads",
)
def process_lead_scheduled_messages():
    """Send pending outbound messages whose scheduled_for time has arrived."""
    _run_async(_do_process_scheduled_messages())


async def _do_process_scheduled_messages() -> None:
    from sqlalchemy import select, and_
    from app.database import AsyncSessionLocal
    from app.modules.leads.models import Lead
    from app.modules.leads.ai_models import LeadOutboundMessage
    from app.modules.leads.schedule import is_messaging_allowed
    from app.modules.messaging.gateway import send_message

    _ensure_models_loaded()

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        if not await is_messaging_allowed(db):
            logger.info("Scheduled messages skipped — outside allowed messaging hours")
            return
        result = await db.execute(
            select(LeadOutboundMessage).where(
                and_(
                    LeadOutboundMessage.status == "pending",
                    LeadOutboundMessage.scheduled_for <= now,
                )
            )
        )
        pending = list(result.scalars().all())

        for msg in pending:
            lead = await db.get(Lead, msg.lead_id)
            if not lead:
                msg.status = "failed"
                msg.error = "Lead not found"
                await db.commit()
                continue

            try:
                ok = await send_message(msg.channel, lead.phone, msg.message)
                msg.status = "sent" if ok else "failed"
                msg.sent_at = datetime.now(timezone.utc)
                if not ok:
                    msg.error = "send_message retornou False"
            except Exception as e:
                msg.status = "failed"
                msg.error = str(e)[:500]
                logger.exception(
                    "Failed to send scheduled message %s for lead %s", msg.id, lead.code
                )

            await db.commit()

        if pending:
            logger.info("Processed %d scheduled lead message(s)", len(pending))
