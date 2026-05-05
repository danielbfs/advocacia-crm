"""Lead AI Agent configuration and conversation endpoints."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_role
from app.database import get_db
from app.modules.auth.models import User
from app.modules.leads.ai_models import LeadAgentConfig, LeadConversation, LeadMessage, SupervisorQuery, LeadOutboundMessage, LeadActivity
from app.modules.leads.pipeline import LEAD_STATUSES

router = APIRouter()


# --- Schemas ---

class LeadAgentConfigSchema(BaseModel):
    status: str
    is_active: bool = False
    system_prompt: str | None = None
    auto_send_on_enter: bool = False
    initial_message: str | None = None
    inactivity_hours: int = 24
    max_inactivity_followups: int = 2
    inactivity_followup_message: str | None = None
    auto_lost_after_hours: int = 72
    convert_on_appointment: bool = True

    model_config = {"from_attributes": True}


class LeadMessageSchema(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    sent_at: datetime

    model_config = {"from_attributes": True}


class SupervisorQuerySchema(BaseModel):
    id: uuid.UUID
    question: str
    context_summary: str | None
    answer: str | None
    status: str
    asked_at: datetime
    answered_at: datetime | None

    model_config = {"from_attributes": True}


class LeadConversationSchema(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    channel: str
    channel_chat_id: str
    control: str
    status: str
    inactivity_followups_sent: int
    last_message_at: datetime | None
    started_at: datetime
    messages: list[LeadMessageSchema]
    supervisor_queries: list[SupervisorQuerySchema]

    model_config = {"from_attributes": True}


class SupervisorConfigSchema(BaseModel):
    supervisor_whatsapp: str = ""
    awaiting_message: str = "Vou verificar com nosso supervisor e retorno em breve! ✅"
    timeout_hours: int = 4
    on_timeout: str = "escalate_human"


# --- Agent Config endpoints ---

@router.get("/ai-configs", response_model=list[LeadAgentConfigSchema])
async def list_ai_configs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List AI config for all pipeline statuses."""
    result = await db.execute(select(LeadAgentConfig))
    configs_in_db = {c.status: c for c in result.scalars().all()}

    # Return config for every pipeline status (create defaults for missing ones)
    response = []
    for status in LEAD_STATUSES:
        if status in ("convertido", "perdido"):
            continue
        if status in configs_in_db:
            # Use model_validate to convert SQLAlchemy model to schema
            response.append(LeadAgentConfigSchema.model_validate(configs_in_db[status]))
        else:
            # Create a default schema instance
            response.append(LeadAgentConfigSchema(status=status))
    return response


@router.put("/ai-configs/{status}", response_model=LeadAgentConfigSchema)
async def upsert_ai_config(
    status: str,
    body: LeadAgentConfigSchema,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Create or update AI config for a pipeline status."""
    if status not in LEAD_STATUSES or status in ("convertido", "perdido"):
        raise HTTPException(status_code=400, detail="Status inválido para configuração de IA.")

    result = await db.execute(
        select(LeadAgentConfig).where(LeadAgentConfig.status == status)
    )
    config = result.scalar_one_or_none()

    if config:
        config.is_active = body.is_active
        config.system_prompt = body.system_prompt
        config.auto_send_on_enter = body.auto_send_on_enter
        config.initial_message = body.initial_message
        config.inactivity_hours = body.inactivity_hours
        config.max_inactivity_followups = body.max_inactivity_followups
        config.inactivity_followup_message = body.inactivity_followup_message
        config.auto_lost_after_hours = body.auto_lost_after_hours
        config.updated_at = datetime.now(timezone.utc)
    else:
        config = LeadAgentConfig(
            status=status,
            is_active=body.is_active,
            system_prompt=body.system_prompt,
            auto_send_on_enter=body.auto_send_on_enter,
            initial_message=body.initial_message,
            inactivity_hours=body.inactivity_hours,
            max_inactivity_followups=body.max_inactivity_followups,
            inactivity_followup_message=body.inactivity_followup_message,
            auto_lost_after_hours=body.auto_lost_after_hours,
        )
        db.add(config)

    await db.commit()
    await db.refresh(config)
    return config


# --- Supervisor config (stored in SystemConfig) ---

@router.get("/ai-supervisor-config", response_model=SupervisorConfigSchema)
async def get_supervisor_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.admin.models import SystemConfig
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_agent_supervisor")
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        return SupervisorConfigSchema(**row.value)
    return SupervisorConfigSchema()


@router.put("/ai-supervisor-config", response_model=SupervisorConfigSchema)
async def update_supervisor_config(
    body: SupervisorConfigSchema,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.admin.models import SystemConfig
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_agent_supervisor")
    )
    row = result.scalar_one_or_none()
    data = body.model_dump()
    if row:
        row.value = data
        row.updated_by = current_user.id
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = SystemConfig(
            key="lead_agent_supervisor",
            value=data,
            updated_by=current_user.id,
        )
        db.add(row)
    await db.commit()
    return body


# --- Lead conversation endpoints ---

@router.get("/{lead_id}/ai-conversation", response_model=LeadConversationSchema)
async def get_lead_conversation(
    lead_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeadConversation).where(LeadConversation.lead_id == lead_id)
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversa não encontrada.")
    return conversation


@router.patch("/{lead_id}/ai-conversation/control")
async def toggle_lead_conversation_control(
    lead_id: uuid.UUID,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set control to 'ai' or 'human' for a lead conversation."""
    control = body.get("control")
    if control not in ("ai", "human"):
        raise HTTPException(status_code=400, detail="control deve ser 'ai' ou 'human'.")

    result = await db.execute(
        select(LeadConversation).where(LeadConversation.lead_id == lead_id)
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversa não encontrada.")

    conversation.control = control
    await db.commit()
    return {"ok": True, "control": control}


@router.get("/ai-pricing")
async def get_lead_pricing(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.admin.models import SystemConfig
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_pricing")
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        return row.value
    return {"items": [], "currency": "BRL", "notes": ""}


@router.put("/ai-pricing")
async def update_lead_pricing(
    body: dict,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.admin.models import SystemConfig
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_pricing")
    )
    row = result.scalar_one_or_none()
    if row:
        row.value = body
        row.updated_by = current_user.id
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = SystemConfig(key="lead_pricing", value=body, updated_by=current_user.id)
        db.add(row)
    await db.commit()
    return body


@router.get("/ai-supervisor-queue", response_model=list[SupervisorQuerySchema])
async def get_supervisor_queue(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all pending supervisor queries."""
    result = await db.execute(
        select(SupervisorQuery)
        .where(SupervisorQuery.status == "pending")
        .order_by(SupervisorQuery.asked_at)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# AI/Human handling control
# ---------------------------------------------------------------------------

class HandlingSchema(BaseModel):
    mode: str  # "ia" | "human"


@router.patch("/{lead_id}/ai-handling")
async def set_lead_handling(
    lead_id: uuid.UUID,
    body: HandlingSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Switch lead handling between AI and a human operator."""
    if body.mode not in ("ia", "human"):
        raise HTTPException(status_code=400, detail="mode deve ser 'ia' ou 'human'.")

    from app.modules.leads.models import Lead, LeadInteraction

    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")

    is_ai = body.mode == "ia"
    lead.ai_active = is_ai

    # If human takes over and lead has no responsible, assign to current user
    if not is_ai and lead.assigned_to is None:
        lead.assigned_to = current_user.id

    # Sync conversation control if exists
    conv_result = await db.execute(
        select(LeadConversation).where(LeadConversation.lead_id == lead_id)
    )
    conv = conv_result.scalar_one_or_none()
    if conv and conv.status == "active":
        conv.control = "ai" if is_ai else "human"

    # Audit interaction
    if is_ai:
        note = f"[Secretaria] Atendimento devolvido para IA por {current_user.full_name}."
    else:
        note = f"[Secretaria] Atendimento assumido por {current_user.full_name}."

    db.add(LeadInteraction(lead_id=lead_id, user_id=current_user.id, type="nota", content=note))
    await db.commit()

    return {"ok": True, "ai_active": lead.ai_active}


# ---------------------------------------------------------------------------
# Outbound WhatsApp messages
# ---------------------------------------------------------------------------

class OutboundMessageCreate(BaseModel):
    message: str
    scheduled_for: datetime | None = None
    channel: str = "whatsapp"


class OutboundMessageSchema(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    channel: str
    message: str
    scheduled_for: datetime | None
    status: str
    sent_at: datetime | None
    error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/{lead_id}/send-whatsapp", response_model=OutboundMessageSchema, status_code=201)
async def send_whatsapp_to_lead(
    lead_id: uuid.UUID,
    body: OutboundMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send or schedule a WhatsApp message to a lead."""
    from app.modules.leads.models import Lead
    from app.modules.messaging.gateway import send_message

    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")

    now = datetime.now(timezone.utc)
    send_now = body.scheduled_for is None or body.scheduled_for <= now

    msg = LeadOutboundMessage(
        lead_id=lead_id,
        created_by=current_user.id,
        channel=body.channel,
        message=body.message,
        scheduled_for=body.scheduled_for,
        status="pending",
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    if send_now:
        try:
            ok = await send_message(body.channel, lead.phone, body.message)
            msg.status = "sent" if ok else "failed"
            msg.sent_at = datetime.now(timezone.utc)
            if not ok:
                msg.error = "send_message retornou False"
        except Exception as e:
            msg.status = "failed"
            msg.error = str(e)[:500]
        await db.commit()
        await db.refresh(msg)

    return msg


@router.get("/{lead_id}/outbound-messages", response_model=list[OutboundMessageSchema])
async def list_outbound_messages(
    lead_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeadOutboundMessage)
        .where(LeadOutboundMessage.lead_id == lead_id)
        .order_by(LeadOutboundMessage.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/{lead_id}/outbound-messages/{msg_id}", status_code=204)
async def cancel_outbound_message(
    lead_id: uuid.UUID,
    msg_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeadOutboundMessage).where(
            LeadOutboundMessage.id == msg_id,
            LeadOutboundMessage.lead_id == lead_id,
            LeadOutboundMessage.status == "pending",
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada ou já enviada.")
    msg.status = "cancelled"
    await db.commit()


# ---------------------------------------------------------------------------
# Lead Activities (reminders)
# ---------------------------------------------------------------------------

class ActivityCreate(BaseModel):
    title: str
    description: str | None = None
    due_at: datetime | None = None
    assigned_to: uuid.UUID | None = None


class ActivityUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_at: datetime | None = None
    assigned_to: uuid.UUID | None = None
    status: str | None = None  # "done" | "cancelled"


class ActivitySchema(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    created_by: uuid.UUID | None
    assigned_to: uuid.UUID | None
    title: str
    description: str | None
    due_at: datetime | None
    status: str
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/{lead_id}/activities", response_model=list[ActivitySchema])
async def list_lead_activities(
    lead_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeadActivity)
        .where(LeadActivity.lead_id == lead_id)
        .order_by(LeadActivity.due_at.asc().nullslast(), LeadActivity.created_at.asc())
    )
    return list(result.scalars().all())


@router.post("/{lead_id}/activities", response_model=ActivitySchema, status_code=201)
async def create_lead_activity(
    lead_id: uuid.UUID,
    body: ActivityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    activity = LeadActivity(
        lead_id=lead_id,
        created_by=current_user.id,
        assigned_to=body.assigned_to or current_user.id,
        title=body.title,
        description=body.description,
        due_at=body.due_at,
        status="pending",
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.patch("/{lead_id}/activities/{activity_id}", response_model=ActivitySchema)
async def update_lead_activity(
    lead_id: uuid.UUID,
    activity_id: uuid.UUID,
    body: ActivityUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeadActivity).where(
            LeadActivity.id == activity_id,
            LeadActivity.lead_id == lead_id,
        )
    )
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Atividade não encontrada.")

    if body.title is not None:
        activity.title = body.title
    if body.description is not None:
        activity.description = body.description
    if body.due_at is not None:
        activity.due_at = body.due_at
    if body.assigned_to is not None:
        activity.assigned_to = body.assigned_to
    if body.status in ("done", "cancelled"):
        activity.status = body.status
        if body.status == "done" and activity.completed_at is None:
            activity.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(activity)
    return activity


@router.get("/ai-messaging-schedule")
async def get_messaging_schedule(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.admin.models import SystemConfig
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_messaging_schedule")
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        return row.value
    return {
        "enabled": False,
        "timezone": "America/Sao_Paulo",
        "allowed_slots": {
            "mon": list(range(8, 18)),
            "tue": list(range(8, 18)),
            "wed": list(range(8, 18)),
            "thu": list(range(8, 18)),
            "fri": list(range(8, 18)),
            "sat": [],
            "sun": [],
        },
        "holidays": [],
    }


@router.put("/ai-messaging-schedule")
async def update_messaging_schedule(
    body: dict,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    from app.modules.admin.models import SystemConfig
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_messaging_schedule")
    )
    row = result.scalar_one_or_none()
    if row:
        row.value = body
        row.updated_by = current_user.id
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = SystemConfig(key="lead_messaging_schedule", value=body, updated_by=current_user.id)
        db.add(row)
    await db.commit()
    return body


@router.get("/my-activities", response_model=list[ActivitySchema])
async def my_pending_activities(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All pending activities assigned to the current user (across all leads)."""
    result = await db.execute(
        select(LeadActivity)
        .where(
            LeadActivity.assigned_to == current_user.id,
            LeadActivity.status == "pending",
        )
        .order_by(LeadActivity.due_at.asc().nullslast())
    )
    return list(result.scalars().all())
