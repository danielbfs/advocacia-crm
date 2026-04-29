"""Lead business logic."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, case, and_, or_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.leads.models import Lead, LeadInteraction
from app.modules.leads.pipeline import (
    InvalidTransitionError,
    REQUIRES_LOST_REASON,
    STATUS_LABELS,
    validate_transition,
)
from app.modules.followup.service import schedule_event_followups, cancel_event_followups


# --- CRUD ---

async def get_all_leads(
    db: AsyncSession,
    status: str | None = None,
    channel: str | None = None,
    assigned_to: uuid.UUID | None = None,
    is_overdue: bool | None = None,
    specialty_id: uuid.UUID | None = None,
    utm_campaign: str | None = None,
    search: str | None = None,
) -> list[Lead]:
    query = select(Lead).order_by(Lead.created_at.desc())

    if status:
        query = query.where(Lead.status == status)
    if channel:
        query = query.where(Lead.channel == channel)
    if assigned_to:
        query = query.where(Lead.assigned_to == assigned_to)
    if specialty_id:
        query = query.where(Lead.specialty_id == specialty_id)
    if utm_campaign:
        query = query.where(Lead.utm_campaign == utm_campaign)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Lead.full_name.ilike(pattern),
                Lead.phone.ilike(pattern),
                Lead.email.ilike(pattern),
            )
        )
    if is_overdue is True:
        now = datetime.now(timezone.utc)
        query = query.where(
            and_(Lead.contacted_at.is_(None), Lead.sla_deadline < now)
        ).where(Lead.status.notin_(["convertido", "perdido"]))

    result = await db.execute(query)
    return list(result.scalars().unique().all())


async def get_lead_by_id(db: AsyncSession, lead_id: uuid.UUID) -> Lead | None:
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    return result.scalar_one_or_none()


async def _generate_lead_code(db: AsyncSession) -> str:
    """Generate unique code in format L-{year}-{sequence:05d}."""
    year = datetime.now(timezone.utc).year
    count_result = await db.execute(
        select(func.count()).select_from(Lead).where(
            extract("year", Lead.created_at) == year
        )
    )
    count = count_result.scalar() or 0
    return f"L-{year}-{count + 1:05d}"


async def create_lead(
    db: AsyncSession,
    phone: str,
    full_name: str | None = None,
    email: str | None = None,
    channel: str = "outro",
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
    utm_content: str | None = None,
    utm_term: str | None = None,
    specialty_id: uuid.UUID | None = None,
    description: str | None = None,
    quote_value: float | None = None,
    assigned_to: uuid.UUID | None = None,
) -> Lead:
    sla_deadline = datetime.now(timezone.utc) + timedelta(hours=settings.CLINIC_SLA_HOURS)
    code = await _generate_lead_code(db)

    lead = Lead(
        code=code,
        full_name=full_name,
        phone=phone,
        email=email,
        channel=channel,
        utm_source=utm_source,
        utm_medium=utm_medium,
        utm_campaign=utm_campaign,
        utm_content=utm_content,
        utm_term=utm_term,
        specialty_id=specialty_id,
        description=description,
        quote_value=quote_value,
        assigned_to=assigned_to,
        sla_deadline=sla_deadline,
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return lead


async def update_lead(db: AsyncSession, lead: Lead, **kwargs) -> Lead:
    for key, value in kwargs.items():
        if value is not None and hasattr(lead, key):
            setattr(lead, key, value)
    await db.commit()
    await db.refresh(lead)
    return lead


# --- Pipeline actions ---

async def mark_contacted(db: AsyncSession, lead: Lead, notes: str | None = None) -> Lead:
    lead.contacted_at = datetime.now(timezone.utc)
    if lead.status == "novo":
        lead.status = "em_contato"
    await db.commit()
    await db.refresh(lead)
    return lead


async def mark_lost(db: AsyncSession, lead: Lead, lost_reason: str) -> Lead:
    lead.status = "perdido"
    lead.lost_reason = lost_reason
    await db.commit()
    await db.refresh(lead)
    await schedule_event_followups(db, "lead_lost", lead_id=lead.id)
    return lead


async def convert_lead(
    db: AsyncSession,
    lead: Lead,
    converted_patient_id: uuid.UUID,
    appointment_id: uuid.UUID | None = None,
) -> Lead:
    lead.status = "convertido"
    lead.converted_patient_id = converted_patient_id
    lead.appointment_id = appointment_id
    lead.converted_at = datetime.now(timezone.utc)
    if lead.contacted_at is None:
        lead.contacted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(lead)
    await cancel_event_followups(db, "inactivity", lead_id=lead.id)
    await schedule_event_followups(
        db, "lead_converted", lead_id=lead.id, patient_id=converted_patient_id, appointment_id=appointment_id
    )
    return lead


async def transition_status(
    db: AsyncSession,
    lead: Lead,
    to_status: str,
    user_id: uuid.UUID | None = None,
    note: str | None = None,
    lost_reason: str | None = None,
) -> Lead:
    """Move o lead para outro status validando a máquina de estados.

    Cria automaticamente uma interação de tipo 'nota' registrando a mudança
    para manter o histórico auditável. Não cria paciente/agendamento — para
    converter use ``convert_lead`` (após criar o paciente).
    """
    from_status = lead.status
    validate_transition(from_status, to_status)

    if to_status in REQUIRES_LOST_REASON and not lost_reason:
        raise InvalidTransitionError(
            f"Status '{to_status}' requer motivo (lost_reason)."
        )

    if to_status == "convertido":
        # Conversão deve passar por convert_lead que cria patient + appointment
        raise InvalidTransitionError(
            "Para 'convertido' use o endpoint /convert que cria paciente."
        )

    lead.status = to_status
    if to_status == "perdido":
        lead.lost_reason = lost_reason
        await schedule_event_followups(db, "lead_lost", lead_id=lead.id)
    elif from_status == "perdido":
        # Reabertura: limpa motivo
        lead.lost_reason = None
        await cancel_event_followups(db, "lead_lost", lead_id=lead.id)

    # Quando avança para qualquer estado pós-novo, registra contato
    if to_status not in {"novo", "perdido"} and lead.contacted_at is None:
        lead.contacted_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(lead)

    # Registra interação automática
    label_from = STATUS_LABELS.get(from_status, from_status)
    label_to = STATUS_LABELS.get(to_status, to_status)
    parts = [f"Status: {label_from} → {label_to}"]
    if lost_reason:
        parts.append(f"Motivo: {lost_reason}")
    if note:
        parts.append(note)
    await create_interaction(
        db,
        lead_id=lead.id,
        user_id=user_id,
        type="nota",
        content=" — ".join(parts),
    )
    return lead


async def bulk_assign(
    db: AsyncSession,
    lead_ids: list[uuid.UUID],
    assigned_to: uuid.UUID | None,
    user_id: uuid.UUID | None = None,
) -> int:
    """Atribui vários leads ao mesmo responsável. Retorna a contagem afetada."""
    if not lead_ids:
        return 0
    result = await db.execute(select(Lead).where(Lead.id.in_(lead_ids)))
    leads = list(result.scalars().all())
    count = 0
    for lead in leads:
        if lead.assigned_to != assigned_to:
            lead.assigned_to = assigned_to
            count += 1
    if count:
        await db.commit()
        # Registra uma interação por lead alterado
        for lead in leads:
            if lead.assigned_to == assigned_to:
                await create_interaction(
                    db,
                    lead_id=lead.id,
                    user_id=user_id,
                    type="nota",
                    content=(
                        f"Atribuído a {assigned_to}" if assigned_to else "Desatribuído"
                    ),
                )
    return count


# --- Interactions ---

async def get_lead_interactions(db: AsyncSession, lead_id: uuid.UUID) -> list[LeadInteraction]:
    result = await db.execute(
        select(LeadInteraction)
        .where(LeadInteraction.lead_id == lead_id)
        .order_by(LeadInteraction.interacted_at.desc())
    )
    return list(result.scalars().all())


async def create_interaction(
    db: AsyncSession,
    lead_id: uuid.UUID,
    user_id: uuid.UUID | None,
    type: str,
    content: str,
    next_action: str | None = None,
) -> LeadInteraction:
    interaction = LeadInteraction(
        lead_id=lead_id,
        user_id=user_id,
        type=type,
        content=content,
        next_action=next_action,
    )
    db.add(interaction)
    await db.commit()
    await db.refresh(interaction)
    return interaction


# --- Reports ---

async def get_funnel(db: AsyncSession, date_from: datetime | None = None) -> list[dict]:
    query = select(Lead.status, func.count().label("total")).group_by(Lead.status)
    if date_from:
        query = query.where(Lead.created_at >= date_from)
    result = await db.execute(query)
    return [{"status": row.status, "total": row.total} for row in result.all()]


async def get_leads_by_source(db: AsyncSession, date_from: datetime | None = None) -> list[dict]:
    converted_count = func.count().filter(Lead.status == "convertido")
    total_count = func.count()

    query = (
        select(
            Lead.channel,
            Lead.utm_campaign,
            total_count.label("total_leads"),
            converted_count.label("converted"),
        )
        .group_by(Lead.channel, Lead.utm_campaign)
        .order_by(total_count.desc())
    )
    if date_from:
        query = query.where(Lead.created_at >= date_from)

    result = await db.execute(query)
    rows = []
    for row in result.all():
        rate = round(100.0 * row.converted / row.total_leads, 1) if row.total_leads > 0 else 0.0
        rows.append({
            "channel": row.channel,
            "utm_campaign": row.utm_campaign,
            "total_leads": row.total_leads,
            "converted": row.converted,
            "conversion_rate": rate,
        })
    return rows


async def get_sla_report(db: AsyncSession, date_from: datetime | None = None) -> dict:
    now = datetime.now(timezone.utc)

    total_q = select(func.count()).select_from(Lead)
    within_sla_q = select(func.count()).select_from(Lead).where(
        Lead.contacted_at <= Lead.sla_deadline
    )
    overdue_q = select(func.count()).select_from(Lead).where(
        and_(Lead.contacted_at.is_(None), Lead.sla_deadline < now)
    ).where(Lead.status.notin_(["convertido", "perdido"]))

    if date_from:
        total_q = total_q.where(Lead.created_at >= date_from)
        within_sla_q = within_sla_q.where(Lead.created_at >= date_from)
        overdue_q = overdue_q.where(Lead.created_at >= date_from)

    total = (await db.execute(total_q)).scalar() or 0
    within_sla = (await db.execute(within_sla_q)).scalar() or 0
    overdue = (await db.execute(overdue_q)).scalar() or 0
    sla_rate = round(100.0 * within_sla / total, 1) if total > 0 else 0.0

    return {"total": total, "within_sla": within_sla, "overdue": overdue, "sla_rate": sla_rate}


async def get_pipeline_report(
    db: AsyncSession, date_from: datetime | None = None
) -> list[dict]:
    """Métricas por etapa do pipeline: contagem, valor total e médio."""
    query = (
        select(
            Lead.status,
            func.count().label("total"),
            func.coalesce(func.sum(Lead.quote_value), 0).label("value_total"),
            func.coalesce(func.avg(Lead.quote_value), 0).label("value_avg"),
        )
        .group_by(Lead.status)
    )
    if date_from:
        query = query.where(Lead.created_at >= date_from)
    result = await db.execute(query)
    return [
        {
            "status": row.status,
            "total": row.total,
            "value_total": float(row.value_total or 0),
            "value_avg": float(row.value_avg or 0),
        }
        for row in result.all()
    ]


async def get_timeline(db: AsyncSession, date_from: datetime | None = None) -> list[dict]:
    day_col = func.date_trunc("day", Lead.created_at).label("day")
    converted_count = func.count().filter(Lead.status == "convertido")

    query = (
        select(day_col, func.count().label("new_leads"), converted_count.label("converted"))
        .group_by(day_col)
        .order_by(day_col)
    )
    if date_from:
        query = query.where(Lead.created_at >= date_from)

    result = await db.execute(query)
    return [
        {"day": str(row.day.date()), "new_leads": row.new_leads, "converted": row.converted}
        for row in result.all()
    ]
