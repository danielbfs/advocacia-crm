"""Lawyer and scheduling business logic."""
import logging
import uuid
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.scheduling.models import (
    Consultation,
    Lawyer,
    LawyerSchedule,
    ScheduleBlock,
)

logger = logging.getLogger(__name__)


# --- Lawyers ---

async def get_all_lawyers(db: AsyncSession, active_only: bool = False) -> list[Lawyer]:
    query = select(Lawyer).order_by(Lawyer.full_name)
    if active_only:
        query = query.where(Lawyer.is_active == True)
    result = await db.execute(query)
    return list(result.scalars().unique().all())


async def get_lawyer_by_id(db: AsyncSession, lawyer_id: uuid.UUID) -> Lawyer | None:
    result = await db.execute(select(Lawyer).where(Lawyer.id == lawyer_id))
    return result.scalar_one_or_none()


async def create_lawyer(
    db: AsyncSession,
    full_name: str,
    oab: str | None = None,
    practice_area_id: uuid.UUID | None = None,
    scheduling_provider: str = "local_db",
    slot_duration_minutes: int = 30,
) -> Lawyer:
    lawyer = Lawyer(
        full_name=full_name,
        oab=oab,
        practice_area_id=practice_area_id,
        scheduling_provider=scheduling_provider,
        slot_duration_minutes=slot_duration_minutes,
    )
    db.add(lawyer)
    await db.commit()
    await db.refresh(lawyer)
    return lawyer


async def update_lawyer(
    db: AsyncSession,
    lawyer: Lawyer,
    full_name: str | None = None,
    oab: str | None = None,
    practice_area_id: uuid.UUID | None = None,
    slot_duration_minutes: int | None = None,
    is_active: bool | None = None,
) -> Lawyer:
    if full_name is not None:
        lawyer.full_name = full_name
    if oab is not None:
        lawyer.oab = oab
    if practice_area_id is not None:
        lawyer.practice_area_id = practice_area_id
    if slot_duration_minutes is not None:
        lawyer.slot_duration_minutes = slot_duration_minutes
    if is_active is not None:
        lawyer.is_active = is_active
    await db.commit()
    await db.refresh(lawyer)
    return lawyer


# --- Lawyer Schedules ---

async def get_lawyer_schedules(db: AsyncSession, lawyer_id: uuid.UUID) -> list[LawyerSchedule]:
    result = await db.execute(
        select(LawyerSchedule)
        .where(LawyerSchedule.lawyer_id == lawyer_id)
        .order_by(LawyerSchedule.day_of_week, LawyerSchedule.start_time)
    )
    return list(result.scalars().all())


async def set_lawyer_schedules(
    db: AsyncSession,
    lawyer_id: uuid.UUID,
    schedules: list[dict],
) -> list[LawyerSchedule]:
    """Replace all schedules for a lawyer."""
    # Remove existing
    existing = await db.execute(
        select(LawyerSchedule).where(LawyerSchedule.lawyer_id == lawyer_id)
    )
    for sched in existing.scalars().all():
        await db.delete(sched)

    # Create new
    new_schedules = []
    for item in schedules:
        h_start, m_start = map(int, item["start_time"].split(":"))
        h_end, m_end = map(int, item["end_time"].split(":"))
        sched = LawyerSchedule(
            lawyer_id=lawyer_id,
            day_of_week=item["day_of_week"],
            start_time=time(h_start, m_start),
            end_time=time(h_end, m_end),
        )
        db.add(sched)
        new_schedules.append(sched)

    await db.commit()
    for s in new_schedules:
        await db.refresh(s)
    return new_schedules


# --- Schedule Blocks ---

async def get_schedule_blocks(
    db: AsyncSession,
    lawyer_id: uuid.UUID,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[ScheduleBlock]:
    query = select(ScheduleBlock).where(ScheduleBlock.lawyer_id == lawyer_id)
    if date_from:
        query = query.where(ScheduleBlock.ends_at >= date_from)
    if date_to:
        query = query.where(ScheduleBlock.starts_at <= date_to)
    query = query.order_by(ScheduleBlock.starts_at)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_schedule_block(
    db: AsyncSession,
    lawyer_id: uuid.UUID,
    starts_at: datetime,
    ends_at: datetime,
    reason: str | None = None,
    created_by: uuid.UUID | None = None,
) -> ScheduleBlock:
    block = ScheduleBlock(
        lawyer_id=lawyer_id,
        starts_at=starts_at,
        ends_at=ends_at,
        reason=reason,
        created_by=created_by,
    )
    db.add(block)
    await db.commit()
    await db.refresh(block)
    return block


async def delete_schedule_block(db: AsyncSession, block: ScheduleBlock) -> None:
    await db.delete(block)
    await db.commit()


async def get_schedule_block_by_id(db: AsyncSession, block_id: uuid.UUID) -> ScheduleBlock | None:
    result = await db.execute(select(ScheduleBlock).where(ScheduleBlock.id == block_id))
    return result.scalar_one_or_none()


# --- Availability Calculation ---

async def get_available_slots(
    db: AsyncSession,
    lawyer_id: uuid.UUID,
    date_from: datetime,
    date_to: datetime,
) -> list[dict]:
    """Calculate available time slots for a lawyer in a date range."""
    lawyer = await get_lawyer_by_id(db, lawyer_id)
    if not lawyer:
        return []

    slot_duration = timedelta(minutes=lawyer.slot_duration_minutes)

    # 1. Get recurring schedule rules
    schedules = await get_lawyer_schedules(db, lawyer_id)

    # 2. Get blocks in this period
    blocks = await get_schedule_blocks(db, lawyer_id, date_from, date_to)

    # 3. Get existing consultations (non-cancelled)
    result = await db.execute(
        select(Consultation).where(
            and_(
                Consultation.lawyer_id == lawyer_id,
                Consultation.starts_at < date_to,
                Consultation.ends_at > date_from,
                Consultation.status.notin_(["cancelled"]),
            )
        )
    )
    booked = list(result.scalars().all())

    # 4. Generate slots day by day — schedules are in the firm's local time
    firm_tz = ZoneInfo(settings.FIRM_TIMEZONE)
    available = []
    current_date = date_from.date() if hasattr(date_from, "date") else date_from
    end_date = date_to.date() if hasattr(date_to, "date") else date_to
    now = datetime.now(timezone.utc)

    while current_date <= end_date:
        day_of_week = current_date.weekday()  # 0=Mon

        for sched in schedules:
            if sched.day_of_week != day_of_week or not sched.is_active:
                continue

            # Combine local date + local time, then convert to UTC for comparisons
            slot_start_local = datetime.combine(
                current_date, sched.start_time, tzinfo=firm_tz
            )
            slot_end_local = datetime.combine(
                current_date, sched.end_time, tzinfo=firm_tz
            )
            slot_start_dt = slot_start_local.astimezone(timezone.utc)
            slot_end_limit = slot_end_local.astimezone(timezone.utc)

            while slot_start_dt + slot_duration <= slot_end_limit:
                slot_end_dt = slot_start_dt + slot_duration

                # Skip past slots
                if slot_start_dt < now:
                    slot_start_dt = slot_end_dt
                    continue

                # Check blocks
                blocked = any(
                    b.starts_at < slot_end_dt and b.ends_at > slot_start_dt
                    for b in blocks
                )
                if blocked:
                    slot_start_dt = slot_end_dt
                    continue

                # Check booked consultations
                conflict = any(
                    a.starts_at < slot_end_dt and a.ends_at > slot_start_dt
                    for a in booked
                )
                if conflict:
                    slot_start_dt = slot_end_dt
                    continue

                available.append({
                    "starts_at": slot_start_dt.isoformat(),
                    "ends_at": slot_end_dt.isoformat(),
                })
                slot_start_dt = slot_end_dt

        current_date += timedelta(days=1)

    return available


async def get_available_slots_by_practice_area(
    db: AsyncSession,
    practice_area_id: uuid.UUID,
    date_from: datetime,
    date_to: datetime,
) -> list[dict]:
    """Get available slots across all active lawyers of a practice area."""
    result = await db.execute(
        select(Lawyer).where(
            and_(Lawyer.practice_area_id == practice_area_id, Lawyer.is_active == True)
        )
    )
    lawyers = list(result.scalars().unique().all())

    all_slots = []
    for lawyer in lawyers:
        slots = await get_available_slots(db, lawyer.id, date_from, date_to)
        for slot in slots:
            slot["lawyer_id"] = str(lawyer.id)
            slot["lawyer_name"] = lawyer.full_name
        all_slots.extend(slots)

    all_slots.sort(key=lambda s: s["starts_at"])
    return all_slots


# --- Consultations ---

async def get_consultations(
    db: AsyncSession,
    lawyer_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status: str | None = None,
) -> list[Consultation]:
    query = select(Consultation).order_by(Consultation.starts_at.desc())
    if lawyer_id:
        query = query.where(Consultation.lawyer_id == lawyer_id)
    if client_id:
        query = query.where(Consultation.client_id == client_id)
    if date_from:
        query = query.where(Consultation.starts_at >= date_from)
    if date_to:
        query = query.where(Consultation.starts_at <= date_to)
    if status:
        query = query.where(Consultation.status == status)
    result = await db.execute(query)
    return list(result.scalars().unique().all())


async def get_consultation_by_id(db: AsyncSession, consultation_id: uuid.UUID) -> Consultation | None:
    result = await db.execute(select(Consultation).where(Consultation.id == consultation_id))
    return result.scalar_one_or_none()


class SlotNotAvailableError(Exception):
    """Slot ocupado por outra consulta (corrida ou booking duplo)."""


async def create_consultation(
    db: AsyncSession,
    client_id: uuid.UUID,
    lawyer_id: uuid.UUID,
    starts_at: datetime,
    ends_at: datetime,
    practice_area_id: uuid.UUID | None = None,
    source: str = "secretary",
    notes: str | None = None,
    created_by_user: uuid.UUID | None = None,
) -> Consultation:
    # Optimistic lock: verifica conflito com SELECT FOR UPDATE para serializar
    # tentativas concorrentes. A constraint EXCLUDE no DB é o backstop final.
    conflict_q = (
        select(Consultation.id)
        .where(
            and_(
                Consultation.lawyer_id == lawyer_id,
                Consultation.starts_at < ends_at,
                Consultation.ends_at > starts_at,
                Consultation.status.notin_(["cancelled"]),
            )
        )
        .with_for_update()
    )
    existing = await db.execute(conflict_q)
    if existing.scalar() is not None:
        raise SlotNotAvailableError(
            "O horário selecionado não está mais disponível."
        )

    consultation = Consultation(
        client_id=client_id,
        lawyer_id=lawyer_id,
        practice_area_id=practice_area_id,
        starts_at=starts_at,
        ends_at=ends_at,
        source=source,
        notes=notes,
        created_by_user=created_by_user,
    )
    db.add(consultation)
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        # IntegrityError disparado pela EXCLUDE constraint — converte em erro amigável
        if "no_lawyer_overlap" in str(exc) or "exclusion" in str(exc).lower():
            raise SlotNotAvailableError(
                "O horário selecionado acabou de ser ocupado por outra consulta."
            ) from exc
        raise
    await db.refresh(consultation)

    # Schedule follow-up jobs based on active rules — best-effort
    try:
        from app.modules.followup.service import schedule_followups_for_consultation
        await schedule_followups_for_consultation(db, consultation)
    except Exception:
        logger.exception(
            "Failed to schedule follow-ups for consultation %s", consultation.id
        )

    return consultation


async def update_consultation(
    db: AsyncSession,
    consultation: Consultation,
    status: str | None = None,
    notes: str | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
) -> Consultation:
    if status is not None:
        consultation.status = status
    if notes is not None:
        consultation.notes = notes
    if starts_at is not None:
        consultation.starts_at = starts_at
    if ends_at is not None:
        consultation.ends_at = ends_at
    await db.commit()
    await db.refresh(consultation)
    return consultation


async def cancel_consultation(db: AsyncSession, consultation: Consultation) -> Consultation:
    consultation.status = "cancelled"
    await db.commit()
    await db.refresh(consultation)
    return consultation
