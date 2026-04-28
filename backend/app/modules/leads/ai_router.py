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
from app.modules.leads.ai_models import LeadAgentConfig, LeadConversation, LeadMessage, SupervisorQuery
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
            response.append(configs_in_db[status])
        else:
            response.append(LeadAgentConfig(status=status))
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
