"""Follow-up business logic."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.followup.models import FollowupRule, FollowupJob
from app.modules.scheduling.models import Appointment


# --- Rules ---

async def get_all_rules(db: AsyncSession) -> list[FollowupRule]:
    result = await db.execute(select(FollowupRule).order_by(FollowupRule.name))
    return list(result.scalars().all())


async def get_rule_by_id(db: AsyncSession, rule_id: uuid.UUID) -> FollowupRule | None:
    result = await db.execute(select(FollowupRule).where(FollowupRule.id == rule_id))
    return result.scalar_one_or_none()


async def create_rule(db: AsyncSession, **kwargs) -> FollowupRule:
    rule = FollowupRule(**kwargs)
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def update_rule(db: AsyncSession, rule: FollowupRule, **kwargs) -> FollowupRule:
    for key, value in kwargs.items():
        if value is not None:
            setattr(rule, key, value)
    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, rule: FollowupRule) -> None:
    await db.delete(rule)
    await db.commit()


# --- Jobs ---

async def get_jobs(
    db: AsyncSession,
    status: str | None = None,
    limit: int = 50,
) -> list[FollowupJob]:
    query = select(FollowupJob).order_by(FollowupJob.scheduled_for.desc()).limit(limit)
    if status:
        query = query.where(FollowupJob.status == status)
    result = await db.execute(query)
    return list(result.scalars().unique().all())


async def schedule_followups_for_appointment(
    db: AsyncSession,
    appointment: Appointment,
) -> list[FollowupJob]:
    """Create follow-up jobs for a new/updated appointment based on active rules."""
    result = await db.execute(
        select(FollowupRule).where(
            and_(
                FollowupRule.is_active == True,
                FollowupRule.trigger_event == "appointment_scheduled",
            )
        )
    )
    rules = list(result.scalars().all())

    jobs = []
    now = datetime.now(timezone.utc)

    for rule in rules:
        scheduled_for = appointment.starts_at + timedelta(minutes=rule.offset_minutes)

        # Don't schedule in the past
        if scheduled_for <= now:
            continue

        job = FollowupJob(
            rule_id=rule.id,
            appointment_id=appointment.id,
            patient_id=appointment.patient_id,
            scheduled_for=scheduled_for,
            status="pending",
        )
        db.add(job)
        jobs.append(job)

    if jobs:
        await db.commit()
        for job in jobs:
            await db.refresh(job)

    return jobs


async def cancel_followups_for_appointment(
    db: AsyncSession,
    appointment_id: uuid.UUID,
) -> int:
    """Cancel all pending follow-up jobs for an appointment."""
    result = await db.execute(
        select(FollowupJob).where(
            and_(
                FollowupJob.appointment_id == appointment_id,
                FollowupJob.status == "pending",
            )
        )
    )
    jobs = list(result.scalars().all())

    for job in jobs:
        job.status = "cancelled"

    if jobs:
        await db.commit()

    return len(jobs)


async def schedule_event_followups(
    db: AsyncSession,
    trigger_event: str,
    base_time: datetime | None = None,
    patient_id: uuid.UUID | None = None,
    lead_id: uuid.UUID | None = None,
    appointment_id: uuid.UUID | None = None,
) -> list[FollowupJob]:
    """Create follow-up jobs based on a generic event and active rules."""
    result = await db.execute(
        select(FollowupRule).where(
            and_(
                FollowupRule.is_active == True,
                FollowupRule.trigger_event == trigger_event,
            )
        )
    )
    rules = list(result.scalars().all())

    jobs = []
    now = datetime.now(timezone.utc)
    base_t = base_time or now

    for rule in rules:
        scheduled_for = base_t + timedelta(minutes=rule.offset_minutes)
        if scheduled_for <= now:
            continue

        job = FollowupJob(
            rule_id=rule.id,
            patient_id=patient_id,
            lead_id=lead_id,
            appointment_id=appointment_id,
            scheduled_for=scheduled_for,
            status="pending",
        )
        db.add(job)
        jobs.append(job)

    if jobs:
        await db.commit()
        for job in jobs:
            await db.refresh(job)

    return jobs


async def cancel_event_followups(
    db: AsyncSession,
    trigger_event: str,
    patient_id: uuid.UUID | None = None,
    lead_id: uuid.UUID | None = None,
) -> int:
    """Cancel pending follow-ups for a specific event and user."""
    query = select(FollowupJob).join(FollowupJob.rule).where(
        and_(
            FollowupRule.trigger_event == trigger_event,
            FollowupJob.status == "pending",
        )
    )
    
    if patient_id:
        query = query.where(FollowupJob.patient_id == patient_id)
    if lead_id:
        query = query.where(FollowupJob.lead_id == lead_id)
        
    result = await db.execute(query)
    jobs = list(result.scalars().all())

    for job in jobs:
        job.status = "cancelled"

    if jobs:
        await db.commit()

    return len(jobs)
