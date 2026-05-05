"""
Configuração do Celery para tasks assíncronas e agendadas.
"""
from celery import Celery
from celery.schedules import crontab

from app.config import settings

# ---------------------------------------------------------------------------
# PRE-LOAD all SQLAlchemy models so the ORM mapper can resolve every
# relationship() string reference (e.g. Lead → "User") before any task
# module is imported.  Without this, the Celery worker crashes with
# "expression 'User' failed to locate a name" because the task modules
# transitively import Lead (which references User via relationship).
# ---------------------------------------------------------------------------
import app.modules.auth.models  # noqa: F401  — User
import app.modules.admin.models  # noqa: F401  — Specialty, SystemConfig, AuditLog
import app.modules.scheduling.models  # noqa: F401  — Doctor, Appointment, etc.
import app.modules.crm.models  # noqa: F401  — Patient
import app.modules.leads.models  # noqa: F401  — Lead, LeadInteraction
import app.modules.leads.ai_models  # noqa: F401  — LeadAgentConfig, LeadConversation, etc.
import app.modules.messaging.models  # noqa: F401  — Conversation, Message
import app.modules.followup.models  # noqa: F401  — FollowupRule, FollowupJob

celery_app = Celery(
    "openclinic",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.modules.followup.tasks",
        "app.modules.leads.sla",
        "app.modules.leads.ai_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.CLINIC_TIMEZONE,
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Filas
celery_app.conf.task_queues = {
    "default": {"exchange": "default", "routing_key": "default"},
    "followup": {"exchange": "followup", "routing_key": "followup"},
    "leads": {"exchange": "leads", "routing_key": "leads"},
}
celery_app.conf.task_default_queue = "default"

# Tarefas agendadas (Celery Beat)
celery_app.conf.beat_schedule = {
    # Verifica leads com SLA vencido a cada 15 minutos
    "check-overdue-leads": {
        "task": "app.modules.leads.sla.check_overdue_leads",
        "schedule": crontab(minute="*/15"),
        "options": {"queue": "leads"},
    },
    # Processa follow-ups pendentes a cada 2 minutos
    "process-pending-followups": {
        "task": "app.modules.followup.tasks.process_pending_followups",
        "schedule": crontab(minute="*/2"),
        "options": {"queue": "followup"},
    },
    # Verifica inatividade nos leads com IA ativa a cada 30 minutos
    "check-lead-inactivity": {
        "task": "app.modules.leads.ai_tasks.check_lead_inactivity",
        "schedule": crontab(minute="*/30"),
        "options": {"queue": "leads"},
    },
    # Verifica consultas ao supervisor sem resposta a cada hora
    "check-supervisor-timeouts": {
        "task": "app.modules.leads.ai_tasks.check_supervisor_timeouts",
        "schedule": crontab(minute="0"),
        "options": {"queue": "leads"},
    },
    # Processa mensagens outbound agendadas para leads a cada 2 minutos
    "process-lead-scheduled-messages": {
        "task": "app.modules.leads.ai_tasks.process_lead_scheduled_messages",
        "schedule": crontab(minute="*/2"),
        "options": {"queue": "leads"},
    },
}
