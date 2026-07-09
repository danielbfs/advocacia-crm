"""Lead API endpoints."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.audit import log_action
from app.core.permissions import get_current_user, require_role
from app.database import get_db
from app.modules.auth.models import User
from app.modules.clients.service import get_client_by_phone, create_client
from app.modules.scheduling.service import (
    SlotNotAvailableError,
    create_consultation,
    get_lawyer_by_id,
)
from app.modules.leads.pipeline import (
    ALLOWED_TRANSITIONS,
    InvalidTransitionError,
    LEAD_STATUSES,
    LOST_REASONS,
    PIPELINE_ORDER,
    STATUS_LABELS,
    TERMINAL_STATUSES,
)
from app.modules.leads.schemas import (
    BulkAssignRequest,
    FunnelItem,
    InboundLeadWebhook,
    InteractionCreate,
    InteractionResponse,
    LeadAssignRequest,
    LeadContactRequest,
    LeadConvertRequest,
    LeadCreate,
    LeadLostRequest,
    LeadResponse,
    LeadsBySourceItem,
    LeadTransitionRequest,
    LeadUpdate,
    PipelineConfigResponse,
    PipelineStageMetric,
    SLAReport,
    TimelineItem,
)
from app.modules.leads.service import (
    bulk_assign,
    convert_lead,
    create_interaction,
    create_lead,
    delete_lead,
    get_all_leads,
    get_funnel,
    get_lead_by_id,
    get_lead_interactions,
    get_leads_by_source,
    get_pipeline_report,
    get_sla_report,
    get_timeline,
    mark_contacted,
    mark_lost,
    transition_status,
    update_lead,
    get_automations_report,
)

router = APIRouter()


# --- CRUD ---

@router.get("/", response_model=list[LeadResponse])
async def list_leads(
    status: str | None = None,
    channel: str | None = None,
    assigned_to: uuid.UUID | None = None,
    is_overdue: bool | None = None,
    practice_area_id: uuid.UUID | None = None,
    utm_campaign: str | None = None,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_all_leads(
        db,
        status=status,
        channel=channel,
        assigned_to=assigned_to,
        is_overdue=is_overdue,
        practice_area_id=practice_area_id,
        utm_campaign=utm_campaign,
        search=search,
    )


@router.post("/", response_model=LeadResponse, status_code=201)
async def create_new_lead(
    body: LeadCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await create_lead(
        db,
        phone=body.phone,
        full_name=body.full_name,
        email=body.email,
        channel=body.channel,
        utm_source=body.utm_source,
        utm_medium=body.utm_medium,
        utm_campaign=body.utm_campaign,
        utm_content=body.utm_content,
        utm_term=body.utm_term,
        practice_area_id=body.practice_area_id,
        description=body.description,
        proposal_value=body.proposal_value,
        assigned_to=body.assigned_to,
    )
    return lead


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_single_lead(
    lead_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    return lead


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_existing_lead(
    lead_id: uuid.UUID,
    body: LeadUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    return await update_lead(db, lead, **body.model_dump(exclude_unset=True))


@router.delete("/{lead_id}", status_code=204)
async def delete_existing_lead(
    lead_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a lead (test/spam cleanup). Requires authenticated user."""
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    await delete_lead(db, lead)


@router.post("/{lead_id}/contact", response_model=LeadResponse)
async def contact_lead(
    lead_id: uuid.UUID,
    body: LeadContactRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")

    lead = await mark_contacted(db, lead, notes=body.notes)

    # Registra interação automática
    await create_interaction(
        db, lead_id=lead.id, user_id=current_user.id,
        type="nota", content=body.notes or "Primeiro contato realizado.",
    )
    return lead


@router.post("/{lead_id}/convert", response_model=LeadResponse)
async def convert_lead_to_client(
    lead_id: uuid.UUID,
    body: LeadConvertRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")

    # Cria ou recupera cliente pelo telefone
    client = await get_client_by_phone(db, lead.phone)
    if not client:
        client = await create_client(
            db,
            phone=lead.phone,
            full_name=body.client_name or lead.full_name,
            email=lead.email,
            channel=lead.channel if lead.channel in ("telegram", "whatsapp") else "whatsapp",
        )

    # Se advogado+horário foram informados, já cria a consulta
    consultation_id = None
    interaction_note = "Lead convertido em cliente."
    if body.lawyer_id and body.starts_at:
        lawyer = await get_lawyer_by_id(db, body.lawyer_id)
        if not lawyer:
            raise HTTPException(status_code=404, detail="Advogado não encontrado.")

        ends_at = body.starts_at + timedelta(minutes=lawyer.slot_duration_minutes)
        try:
            consultation = await create_consultation(
                db,
                client_id=client.id,
                lawyer_id=lawyer.id,
                starts_at=body.starts_at,
                ends_at=ends_at,
                practice_area_id=lawyer.practice_area_id or lead.practice_area_id,
                source="secretary",
                notes=body.consultation_notes,
                created_by_user=current_user.id,
            )
        except SlotNotAvailableError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Não foi possível criar a consulta: {exc}",
            )
        consultation_id = consultation.id
        interaction_note = (
            f"Lead convertido em cliente e consulta agendada com {lawyer.full_name} "
            f"em {body.starts_at.isoformat()}."
        )

    lead = await convert_lead(
        db, lead, converted_client_id=client.id, consultation_id=consultation_id
    )

    await create_interaction(
        db, lead_id=lead.id, user_id=current_user.id,
        type="nota", content=interaction_note,
    )
    await log_action(
        db,
        action="lead.convert",
        user_id=current_user.id,
        entity_type="lead",
        entity_id=lead.id,
        payload={
            "client_id": str(client.id),
            "consultation_id": str(consultation_id) if consultation_id else None,
        },
        request=request,
    )
    return lead


@router.post("/{lead_id}/lost", response_model=LeadResponse)
async def mark_lead_lost(
    lead_id: uuid.UUID,
    body: LeadLostRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")

    lead = await mark_lost(db, lead, lost_reason=body.lost_reason)

    await create_interaction(
        db, lead_id=lead.id, user_id=current_user.id,
        type="nota", content=f"Lead perdido: {body.lost_reason}",
    )
    await log_action(
        db,
        action="lead.lost",
        user_id=current_user.id,
        entity_type="lead",
        entity_id=lead.id,
        payload={"lost_reason": body.lost_reason},
        request=request,
    )
    return lead


@router.patch("/{lead_id}/assign", response_model=LeadResponse)
async def assign_lead(
    lead_id: uuid.UUID,
    body: LeadAssignRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    updated = await update_lead(db, lead, assigned_to=body.assigned_to)
    await create_interaction(
        db, lead_id=lead.id, user_id=current_user.id,
        type="nota",
        content=(
            f"Atribuído a {body.assigned_to}" if body.assigned_to else "Desatribuído"
        ),
    )
    await log_action(
        db,
        action="lead.assign",
        user_id=current_user.id,
        entity_type="lead",
        entity_id=lead.id,
        payload={"assigned_to": str(body.assigned_to) if body.assigned_to else None},
        request=request,
    )
    return updated


@router.post("/{lead_id}/transition", response_model=LeadResponse)
async def transition_lead(
    lead_id: uuid.UUID,
    body: LeadTransitionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Transição genérica de status. Para 'convertido' use /convert."""
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    try:
        lead = await transition_status(
            db,
            lead,
            to_status=body.to_status,
            user_id=current_user.id,
            note=body.note,
            lost_reason=body.lost_reason,
        )
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await log_action(
        db,
        action="lead.transition",
        user_id=current_user.id,
        entity_type="lead",
        entity_id=lead.id,
        payload={"to_status": body.to_status, "lost_reason": body.lost_reason},
        request=request,
    )
    return lead


@router.post("/bulk/assign")
async def bulk_assign_leads(
    body: BulkAssignRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await bulk_assign(
        db,
        lead_ids=body.lead_ids,
        assigned_to=body.assigned_to,
        user_id=current_user.id,
    )
    await log_action(
        db,
        action="lead.bulk_assign",
        user_id=current_user.id,
        entity_type="lead",
        payload={
            "count": count,
            "assigned_to": str(body.assigned_to) if body.assigned_to else None,
            "lead_ids": [str(i) for i in body.lead_ids],
        },
        request=request,
    )
    return {"updated": count}


@router.get("/pipeline/config", response_model=PipelineConfigResponse)
async def get_pipeline_config(
    current_user: User = Depends(get_current_user),
):
    """Retorna a configuração do pipeline para o frontend renderizar Kanban."""
    return PipelineConfigResponse(
        statuses=LEAD_STATUSES,
        pipeline_order=PIPELINE_ORDER,
        terminal_statuses=sorted(TERMINAL_STATUSES),
        allowed_transitions={k: sorted(v) for k, v in ALLOWED_TRANSITIONS.items()},
        lost_reasons=LOST_REASONS,
        status_labels=STATUS_LABELS,
    )


# --- Interactions ---

@router.get("/{lead_id}/interactions", response_model=list[InteractionResponse])
async def list_interactions(
    lead_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    return await get_lead_interactions(db, lead_id)


@router.post("/{lead_id}/interactions", response_model=InteractionResponse, status_code=201)
async def create_new_interaction(
    lead_id: uuid.UUID,
    body: InteractionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await get_lead_by_id(db, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")

    return await create_interaction(
        db,
        lead_id=lead_id,
        user_id=current_user.id,
        type=body.type,
        content=body.content,
        next_action=body.next_action,
    )


# --- Webhook inbound (leads externos) ---

@router.post("/webhook/inbound", response_model=LeadResponse, status_code=201)
async def inbound_lead_webhook(
    body: InboundLeadWebhook,
    x_api_key: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Recebe leads de fontes externas (Google Ads, Meta Ads, formulários)."""
    # Fail closed: rejeita se nenhuma chave estiver configurada no servidor
    if not settings.LEADS_WEBHOOK_API_KEY or x_api_key != settings.LEADS_WEBHOOK_API_KEY:
        raise HTTPException(status_code=401, detail="API key inválida.")

    # Determina canal pela UTM
    channel = "outro"
    if body.utm_source:
        source_lower = body.utm_source.lower()
        if "google" in source_lower:
            channel = "google_ads"
        elif "facebook" in source_lower or "meta" in source_lower or "instagram" in source_lower:
            channel = "meta_ads"

    lead = await create_lead(
        db,
        phone=body.phone,
        full_name=body.name,
        email=body.email,
        channel=channel,
        utm_source=body.utm_source,
        utm_medium=body.utm_medium,
        utm_campaign=body.utm_campaign,
        utm_content=body.utm_content,
        utm_term=body.utm_term,
        description=body.message,
    )
    return lead


# --- Reports ---

def _parse_period(period: str) -> datetime | None:
    now = datetime.now(timezone.utc)
    if period == "7d":
        return now - timedelta(days=7)
    elif period == "30d":
        return now - timedelta(days=30)
    elif period == "90d":
        return now - timedelta(days=90)
    return None


@router.get("/reports/funnel", response_model=list[FunnelItem])
async def report_funnel(
    period: str = Query("30d", description="7d, 30d, 90d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_funnel(db, date_from=_parse_period(period))


@router.get("/reports/by-source", response_model=list[LeadsBySourceItem])
async def report_by_source(
    period: str = Query("30d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_leads_by_source(db, date_from=_parse_period(period))


@router.get("/reports/sla", response_model=SLAReport)
async def report_sla(
    period: str = Query("30d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_sla_report(db, date_from=_parse_period(period))


@router.get("/reports/timeline", response_model=list[TimelineItem])
async def report_timeline(
    period: str = Query("30d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_timeline(db, date_from=_parse_period(period))


@router.get("/reports/pipeline", response_model=list[PipelineStageMetric])
async def report_pipeline(
    period: str = Query("30d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_pipeline_report(db, date_from=_parse_period(period))


@router.get("/reports/automations")
async def report_automations(
    period: str = Query("30d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_automations_report(db, date_from=_parse_period(period))


@router.get("/export.csv")
async def export_leads_csv(
    status: str | None = None,
    channel: str | None = None,
    assigned_to: uuid.UUID | None = None,
    is_overdue: bool | None = None,
    practice_area_id: uuid.UUID | None = None,
    utm_campaign: str | None = None,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exporta a lista de leads em CSV (mesmos filtros do GET /leads)."""
    import csv
    import io

    from fastapi.responses import StreamingResponse

    leads = await get_all_leads(
        db,
        status=status,
        channel=channel,
        assigned_to=assigned_to,
        is_overdue=is_overdue,
        practice_area_id=practice_area_id,
        utm_campaign=utm_campaign,
        search=search,
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "id", "codigo", "nome", "telefone", "email", "canal",
        "status", "lost_reason", "valor_proposta",
        "utm_source", "utm_campaign", "responsavel_id",
        "sla_deadline", "contacted_at", "is_overdue",
        "convertido_em", "criado_em",
    ])
    for l in leads:
        writer.writerow([
            str(l.id),
            l.code,
            l.full_name or "",
            l.phone,
            l.email or "",
            l.channel,
            l.status,
            l.lost_reason or "",
            l.proposal_value or "",
            l.utm_source or "",
            l.utm_campaign or "",
            str(l.assigned_to) if l.assigned_to else "",
            l.sla_deadline.isoformat() if l.sla_deadline else "",
            l.contacted_at.isoformat() if l.contacted_at else "",
            "sim" if l.is_overdue else "não",
            l.converted_at.isoformat() if l.converted_at else "",
            l.created_at.isoformat() if l.created_at else "",
        ])

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="leads.csv"'},
    )
