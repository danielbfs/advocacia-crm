"""
Configuração do banco de dados PostgreSQL com SQLAlchemy async.
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    echo=settings.ENVIRONMENT == "development",
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base para todos os modelos SQLAlchemy."""
    pass


async def init_db():
    """Importa todos os modelos para garantir registro no metadata."""
    from app.modules.auth.models import User  # noqa
    from app.modules.admin.models import AuditLog, Specialty, SystemConfig  # noqa
    from app.modules.scheduling.models import Doctor, DoctorSchedule, ScheduleBlock, Appointment  # noqa
    from app.modules.crm.models import Patient  # noqa
    from app.modules.leads.models import Lead, LeadInteraction  # noqa
    from app.modules.leads.ai_models import LeadAgentConfig, LeadConversation, LeadMessage, SupervisorQuery, LeadOutboundMessage, LeadActivity  # noqa
    from app.modules.messaging.models import Conversation, Message  # noqa
    from app.modules.followup.models import FollowupRule, FollowupJob  # noqa


async def get_db() -> AsyncSession:
    """Dependency injection para sessão do banco."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
