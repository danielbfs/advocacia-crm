"""Follow-up Celery tasks — sends scheduled follow-up messages."""
import asyncio
import logging
import uuid

from celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async function from a sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=300, queue="followup")
def send_followup_message(self, job_id: str):
    """Send a single follow-up message for a scheduled job."""
    _run_async(_send_followup(self, job_id))


async def _send_followup(task, job_id: str):
    from app.modules.leads.ai_tasks import _celery_db_session
    from app.modules.followup.models import FollowupJob
    from app.modules.clients.models import Client
    from app.modules.leads.models import Lead
    from app.modules.scheduling.models import Consultation
    from app.modules.messaging.gateway import send_message
    from app.config import settings
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo

    async with _celery_db_session() as db:
        result = await db.execute(
            select(FollowupJob).where(FollowupJob.id == uuid.UUID(job_id))
        )
        job = result.scalar_one_or_none()
        if not job:
            logger.error("Follow-up job %s not found", job_id)
            return

        if job.status != "pending":
            logger.info("Job %s already processed (status=%s)", job_id, job.status)
            return

        # Load target (Client or Lead)
        target = None
        if job.client_id:
            target = await db.get(Client, job.client_id)
        elif job.lead_id:
            target = await db.get(Lead, job.lead_id)

        if not target:
            job.status = "failed"
            job.error_message = "Client or Lead not found"
            job.executed_at = datetime.now(timezone.utc)
            await db.commit()
            return

        # Load consultation with lawyer and practice area relationships
        consultation = None
        if job.consultation_id:
            consultation_result = await db.execute(
                select(Consultation)
                .options(
                    joinedload(Consultation.lawyer),
                    joinedload(Consultation.practice_area),
                )
                .where(Consultation.id == job.consultation_id)
            )
            consultation = consultation_result.scalar_one_or_none()

        # Render template — replace all supported variables
        rule = job.rule
        message = rule.message_template
        firm_tz = ZoneInfo(settings.FIRM_TIMEZONE)

        message = message.replace("{client_name}", target.full_name or target.phone)

        if consultation:
            consultation_local = consultation.starts_at.astimezone(firm_tz)
            message = message.replace(
                "{consultation_date}",
                consultation_local.strftime("%d/%m/%Y às %H:%M"),
            )
            message = message.replace(
                "{lawyer_name}",
                consultation.lawyer.full_name if consultation.lawyer else "",
            )
            message = message.replace(
                "{practice_area}",
                consultation.practice_area.name if consultation.practice_area else "",
            )
        else:
            # Remove placeholders gracefully if no consultation
            for var in ("{consultation_date}", "{lawyer_name}", "{practice_area}"):
                message = message.replace(var, "")

        # Determine channel
        channel = rule.channel or target.channel

        chat_id = None
        if hasattr(target, "channel_id") and target.channel_id:
            chat_id = target.channel_id
        else:
            chat_id = target.phone

        if not chat_id:
            job.status = "failed"
            job.error_message = "Client has no channel_id"
            job.executed_at = datetime.now(timezone.utc)
            await db.commit()
            return

        try:
            success = await send_message(channel, chat_id, message)
            if success:
                job.status = "sent"
            else:
                job.status = "failed"
                job.error_message = "Message send returned false"
        except Exception as exc:
            job.status = "failed"
            job.error_message = str(exc)[:500]
            logger.exception("Failed to send follow-up %s", job_id)
            await db.commit()
            raise task.retry(exc=exc)

        job.executed_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("Follow-up job %s completed: %s", job_id, job.status)


@celery_app.task(queue="followup")
def process_pending_followups():
    """Scan for pending follow-up jobs that are due and dispatch them."""
    _run_async(_process_pending())


async def _process_pending():
    from app.modules.leads.ai_tasks import _celery_db_session
    from app.modules.followup.models import FollowupJob
    from sqlalchemy import select, and_
    from datetime import datetime, timezone

    async with _celery_db_session() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(FollowupJob).where(
                and_(
                    FollowupJob.status == "pending",
                    FollowupJob.scheduled_for <= now,
                )
            )
        )
        jobs = list(result.scalars().all())

        for job in jobs:
            send_followup_message.delay(str(job.id))

        if jobs:
            logger.info("Dispatched %d pending follow-up jobs", len(jobs))
