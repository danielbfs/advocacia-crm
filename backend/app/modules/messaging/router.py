"""Webhook endpoints for messaging channels."""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.modules.crm.models import Patient
from app.modules.messaging.gateway import gateway, send_message
from app.modules.messaging.schemas import IncomingMessage
from app.modules.messaging.service import messaging_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Supervisor reply handler
# ---------------------------------------------------------------------------

async def _handle_supervisor_reply(
    db: AsyncSession,
    msg: IncomingMessage,
    supervisor_phone: str,
) -> bool:
    """
    If the message comes from the supervisor and quotes a known SupervisorQuery,
    process the answer and resume the lead conversation.
    Returns True if handled.
    """
    # Normalise: strip non-digits for comparison
    def _norm(p: str) -> str:
        return "".join(c for c in p if c.isdigit())

    if _norm(msg.channel_user_id) != _norm(supervisor_phone):
        return False

    # Message with no quoted reply → show pending queue
    if not msg.quoted_message_id:
        await _send_supervisor_queue(db, msg.channel_chat_id, msg.channel)
        return True

    # Look up SupervisorQuery by the whatsapp_message_id we stored when we sent the question
    from app.modules.leads.ai_models import LeadConversation, SupervisorQuery
    from app.modules.leads.models import Lead
    from app.modules.leads.ai_engine import get_or_create_lead_conversation, resume_after_supervisor

    result = await db.execute(
        select(SupervisorQuery).where(
            SupervisorQuery.whatsapp_message_id == msg.quoted_message_id,
            SupervisorQuery.status == "pending",
        )
    )
    query = result.scalar_one_or_none()

    if not query:
        # Quoted message not found or already answered — silently ignore
        return True

    # Mark as answered
    from datetime import datetime, timezone
    query.status = "answered"
    query.answer = msg.text
    query.answered_at = datetime.now(timezone.utc)

    # Resume conversation
    conv_result = await db.execute(
        select(LeadConversation).where(LeadConversation.id == query.conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    lead = await db.get(Lead, query.lead_id)

    if not conv or not lead:
        await db.commit()
        return True

    conv.control = "ai"
    await db.commit()
    await db.refresh(conv)
    await db.refresh(lead)

    response_text = await resume_after_supervisor(db, lead, conv, msg.text)
    await send_message(conv.channel, conv.channel_chat_id, response_text)

    # Confirm to supervisor
    confirmation = (
        f"✅ Resposta repassada ao lead {lead.code} ({lead.full_name or lead.phone})."
    )
    await send_message(msg.channel, msg.channel_chat_id, confirmation)

    logger.info(
        "Supervisor answered query %s for lead %s", query.id, lead.code
    )
    return True


async def _send_supervisor_queue(db: AsyncSession, chat_id: str, channel: str) -> None:
    """Send the pending supervisor queries list when supervisor messages without a reply."""
    from app.modules.leads.ai_models import SupervisorQuery
    from app.modules.leads.models import Lead

    result = await db.execute(
        select(SupervisorQuery)
        .where(SupervisorQuery.status == "pending")
        .order_by(SupervisorQuery.asked_at)
    )
    pending = list(result.scalars().all())

    if not pending:
        await send_message(channel, chat_id, "✅ Nenhuma consulta pendente no momento.")
        return

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    lines = [f"📋 *Consultas pendentes ({len(pending)}):*", ""]
    for i, q in enumerate(pending, 1):
        lead = await db.get(Lead, q.lead_id)
        lead_label = f"{lead.code} · {lead.full_name or lead.phone}" if lead else str(q.lead_id)
        elapsed = now - q.asked_at
        hours = int(elapsed.total_seconds() // 3600)
        mins = int((elapsed.total_seconds() % 3600) // 60)
        elapsed_str = f"{hours}h {mins}min" if hours else f"{mins}min"
        lines.append(f"{i}️⃣ {lead_label}")
        lines.append(f'   "{q.question}"')
        lines.append(f"   ⏱ Há {elapsed_str}")
        lines.append("")
    lines.append("_Responda cada pergunta usando Reply (↩️) na mensagem correspondente._")

    await send_message(channel, chat_id, "\n".join(lines))


# ---------------------------------------------------------------------------
# Lead AI handler
# ---------------------------------------------------------------------------

async def _handle_lead_message(db: AsyncSession, msg: IncomingMessage) -> bool:
    """
    If the sender is an active lead with AI enabled for its status,
    process through the Lead AI Engine.
    Returns True if handled.
    """
    from sqlalchemy import and_
    from app.modules.leads.models import Lead
    from app.modules.leads.ai_engine import (
        get_or_create_lead_conversation,
        load_agent_config,
        process_lead_message,
    )
    from app.modules.leads.ai_models import LeadConversation

    # Find active lead by phone
    result = await db.execute(
        select(Lead).where(
            Lead.phone == msg.channel_user_id,
            Lead.status.notin_(["convertido", "perdido"]),
        ).order_by(Lead.created_at.desc()).limit(1)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        return False

    # Update name if we now know it
    if msg.user_name and not lead.full_name:
        lead.full_name = msg.user_name
        await db.commit()

    # Check if AI is configured for this status
    agent_config = await load_agent_config(db, lead.status)
    if not agent_config:
        return False

    # Get or create conversation
    conversation = await get_or_create_lead_conversation(
        db, lead, msg.channel, msg.channel_chat_id
    )

    # Human control — save message but don't auto-reply (human operator handles it)
    if conversation.control == "human":
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        from app.modules.leads.ai_models import LeadMessage as LeadMsg
        db.add(LeadMsg(conversation_id=conversation.id, role="user", content=msg.text, sent_at=now))
        conversation.last_message_at = now
        await db.commit()
        return True

    # Awaiting supervisor — respond with waiting message
    if conversation.control == "awaiting_supervisor":
        from app.modules.admin.models import SystemConfig
        result2 = await db.execute(
            select(SystemConfig).where(SystemConfig.key == "lead_agent_supervisor")
        )
        row = result2.scalar_one_or_none()
        waiting_msg = (row.value or {}).get(
            "awaiting_message",
            "Ainda estou verificando com nosso supervisor. Retorno em breve! ✅",
        ) if row else "Ainda estou verificando. Retorno em breve! ✅"
        await send_message(msg.channel, msg.channel_chat_id, waiting_msg)
        return True

    # Process through Lead AI Engine
    try:
        response_text = await process_lead_message(db, lead, conversation, msg.text)
    except Exception:
        logger.exception("Lead AI engine error for lead %s", lead.id)
        response_text = (
            "Desculpe, tive uma dificuldade técnica. "
            "Um de nossos atendentes entrará em contato!"
        )

    await send_message(msg.channel, msg.channel_chat_id, response_text)
    return True


# ---------------------------------------------------------------------------
# Common message handler
# ---------------------------------------------------------------------------

async def get_or_create_patient(
    db: AsyncSession,
    channel: str,
    channel_user_id: str,
    user_name: str | None = None,
) -> Patient:
    result = await db.execute(
        select(Patient).where(
            Patient.channel == channel,
            Patient.channel_id == channel_user_id,
        )
    )
    patient = result.scalar_one_or_none()

    if patient:
        if user_name and not patient.full_name:
            patient.full_name = user_name
            await db.commit()
            await db.refresh(patient)
        return patient

    patient = Patient(
        full_name=user_name,
        phone=f"{channel}:{channel_user_id}",
        channel=channel,
        channel_id=channel_user_id,
        crm_status="new",
    )
    db.add(patient)
    await db.commit()
    await db.refresh(patient)
    return patient


async def handle_incoming_message(
    request: Request,
    channel: str,
    db: AsyncSession,
) -> dict:
    """Common logic to process messages from any channel."""
    payload = await request.json()
    msg = gateway.parse_webhook(channel, payload)

    if not msg:
        return {"ok": True}

    # 1. Check if message is from the supervisor (WhatsApp only)
    if channel == "whatsapp":
        from app.modules.admin.models import SystemConfig
        sup_result = await db.execute(
            select(SystemConfig).where(SystemConfig.key == "lead_agent_supervisor")
        )
        sup_row = sup_result.scalar_one_or_none()
        supervisor_phone = (sup_row.value or {}).get("supervisor_whatsapp", "") if sup_row else ""

        if supervisor_phone:
            handled = await _handle_supervisor_reply(db, msg, supervisor_phone)
            if handled:
                return {"ok": True}

    # 2. Check if message is from an active lead with AI enabled
    handled = await _handle_lead_message(db, msg)
    if handled:
        return {"ok": True}

    # 3. Patient flow (unchanged)
    patient = await get_or_create_patient(
        db,
        channel=channel,
        channel_user_id=msg.channel_user_id,
        user_name=msg.user_name,
    )

    from app.modules.messaging.models import Conversation
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.channel == channel,
            Conversation.patient_id == patient.id,
            Conversation.status == "active",
        )
    )
    conversation = conv_result.scalar_one_or_none()

    if conversation and conversation.control == "human":
        return {"ok": True}

    try:
        from app.modules.ai.engine import process_message
        response_text = await process_message(db, patient, msg.text)
    except Exception:
        logger.exception("AI engine error for patient %s", patient.id)
        response_text = (
            "Desculpe, estou com dificuldades no momento. "
            "Por favor, tente novamente em alguns instantes."
        )

    await send_message(channel, msg.channel_chat_id, response_text)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------

@router.post("/telegram/{bot_token}")
async def telegram_webhook(
    bot_token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if bot_token != settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid bot token")
    return await handle_incoming_message(request, "telegram", db)


@router.post("/whatsapp/{token}")
async def whatsapp_webhook(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if token != settings.EVOLUTION_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid token")
    return await handle_incoming_message(request, "whatsapp", db)


@router.get("/conversations")
async def list_conversations(
    channel: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await messaging_service.get_active_conversations(db, channel)


@router.patch("/conversations/{conversation_id}/control")
async def toggle_conversation_control(
    conversation_id: uuid.UUID,
    control: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        await messaging_service.toggle_control(db, conversation_id, control)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/conversations/{conversation_id}/send")
async def send_human_message(
    conversation_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    text = payload.get("text")
    channel = payload.get("channel")
    chat_id = payload.get("chat_id")

    if not all([text, channel, chat_id]):
        raise HTTPException(status_code=400, detail="Missing text, channel, or chat_id")

    success = await messaging_service.send_human_message(
        db, conversation_id, text, channel, chat_id
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send message")

    return {"ok": True}
