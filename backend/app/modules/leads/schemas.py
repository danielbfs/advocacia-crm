"""Pydantic schemas for leads."""
import uuid
from datetime import datetime

from pydantic import BaseModel


# --- Lead ---

class LeadCreate(BaseModel):
    full_name: str | None = None
    phone: str
    email: str | None = None
    channel: str = "outro"
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    utm_content: str | None = None
    utm_term: str | None = None
    practice_area_id: uuid.UUID | None = None
    description: str | None = None
    proposal_value: float | None = None
    assigned_to: uuid.UUID | None = None


class LeadUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    status: str | None = None
    lost_reason: str | None = None
    assigned_to: uuid.UUID | None = None
    practice_area_id: uuid.UUID | None = None
    description: str | None = None
    proposal_value: float | None = None
    next_followup_at: datetime | None = None


class AssignedUserSummary(BaseModel):
    id: uuid.UUID
    username: str
    full_name: str

    model_config = {"from_attributes": True}


class LeadResponse(BaseModel):
    id: uuid.UUID
    code: str
    ai_active: bool | None
    full_name: str | None
    phone: str
    email: str | None
    channel: str
    utm_source: str | None
    utm_medium: str | None
    utm_campaign: str | None
    utm_content: str | None
    utm_term: str | None
    practice_area_id: uuid.UUID | None
    description: str | None
    proposal_value: float | None
    status: str
    lost_reason: str | None
    assigned_to: uuid.UUID | None
    assigned_user: AssignedUserSummary | None = None
    sla_deadline: datetime
    contacted_at: datetime | None
    is_overdue: bool
    next_followup_at: datetime | None
    converted_client_id: uuid.UUID | None
    converted_at: datetime | None
    consultation_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Lead Interaction ---

class InteractionCreate(BaseModel):
    type: str  # nota, ligacao, whatsapp, email, reuniao, outro
    content: str
    next_action: str | None = None


class InteractionResponse(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    user_id: uuid.UUID | None
    type: str
    content: str
    next_action: str | None
    interacted_at: datetime

    model_config = {"from_attributes": True}


# --- Pipeline actions ---

class LeadContactRequest(BaseModel):
    """Registra primeiro contato com o lead."""
    notes: str | None = None


class LeadConvertRequest(BaseModel):
    """Converte lead em cliente. Opcionalmente já cria a consulta."""
    client_name: str | None = None
    consultation_notes: str | None = None
    # Quando informados, criam a consulta na conversão
    lawyer_id: uuid.UUID | None = None
    starts_at: datetime | None = None


class LeadLostRequest(BaseModel):
    """Marca lead como perdido."""
    lost_reason: str


class LeadAssignRequest(BaseModel):
    """Atribui lead a um usuário."""
    assigned_to: uuid.UUID | None = None


class LeadTransitionRequest(BaseModel):
    """Transição genérica de status (não inclui convertido — use /convert)."""
    to_status: str
    note: str | None = None
    lost_reason: str | None = None


class BulkAssignRequest(BaseModel):
    lead_ids: list[uuid.UUID]
    assigned_to: uuid.UUID | None = None


class PipelineConfigResponse(BaseModel):
    statuses: list[str]
    pipeline_order: list[str]
    terminal_statuses: list[str]
    allowed_transitions: dict[str, list[str]]
    lost_reasons: list[dict]
    status_labels: dict[str, str]


class PipelineStageMetric(BaseModel):
    status: str
    total: int
    value_total: float
    value_avg: float


# --- Webhook inbound ---

class InboundLeadWebhook(BaseModel):
    """Payload de leads externos (Google Ads, Meta, formulários)."""
    name: str | None = None
    phone: str
    email: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    utm_content: str | None = None
    utm_term: str | None = None
    practice_area: str | None = None
    message: str | None = None


# --- Reports ---

class FunnelItem(BaseModel):
    status: str
    total: int


class LeadsBySourceItem(BaseModel):
    channel: str
    utm_campaign: str | None
    total_leads: int
    converted: int
    conversion_rate: float


class SLAReport(BaseModel):
    total: int
    within_sla: int
    overdue: int
    sla_rate: float


class TimelineItem(BaseModel):
    day: str
    new_leads: int
    converted: int
