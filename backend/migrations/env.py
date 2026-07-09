"""Alembic migrations environment configuration.

Usa uma URL SÍNCRONA (psycopg2) para o Alembic, independente da URL asyncpg
usada pela aplicação em runtime. O Neon exige SSL (sslmode=require).
"""
import os
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

from app.database import Base

# Import all models so they're registered in Base.metadata
from app.modules.auth.models import User  # noqa
from app.modules.admin.models import AuditLog, PracticeArea, SystemConfig  # noqa
from app.modules.scheduling.models import Lawyer, LawyerSchedule, ScheduleBlock, Consultation  # noqa
from app.modules.clients.models import Client, ClientContact  # noqa
from app.modules.leads.models import Lead, LeadInteraction  # noqa
from app.modules.leads.ai_models import (  # noqa
    LeadAgentConfig,
    LeadConversation,
    LeadMessage,
    SupervisorQuery,
    LeadOutboundMessage,
    LeadActivity,
)
from app.modules.messaging.models import Conversation, Message  # noqa
from app.modules.followup.models import FollowupRule, FollowupJob  # noqa

load_dotenv()

config = context.config

# URL síncrona (psycopg2) exclusiva para Alembic — nunca a asyncpg de runtime.
alembic_url = os.getenv("ALEMBIC_DATABASE_URL")
if not alembic_url:
    from app.config import settings

    alembic_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")

config.set_main_option("sqlalchemy.url", alembic_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
