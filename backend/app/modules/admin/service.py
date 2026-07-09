"""Practice area business logic."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.models import PracticeArea


async def get_all_practice_areas(db: AsyncSession, active_only: bool = False) -> list[PracticeArea]:
    query = select(PracticeArea).order_by(PracticeArea.name)
    if active_only:
        query = query.where(PracticeArea.is_active == True)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_practice_area_by_id(db: AsyncSession, practice_area_id: uuid.UUID) -> PracticeArea | None:
    result = await db.execute(select(PracticeArea).where(PracticeArea.id == practice_area_id))
    return result.scalar_one_or_none()


async def create_practice_area(db: AsyncSession, name: str, description: str | None = None) -> PracticeArea:
    practice_area = PracticeArea(name=name, description=description)
    db.add(practice_area)
    await db.commit()
    await db.refresh(practice_area)
    return practice_area


async def update_practice_area(
    db: AsyncSession,
    practice_area: PracticeArea,
    name: str | None = None,
    description: str | None = None,
    is_active: bool | None = None,
) -> PracticeArea:
    if name is not None:
        practice_area.name = name
    if description is not None:
        practice_area.description = description
    if is_active is not None:
        practice_area.is_active = is_active
    await db.commit()
    await db.refresh(practice_area)
    return practice_area


async def delete_practice_area(db: AsyncSession, practice_area: PracticeArea) -> None:
    practice_area.is_active = False
    await db.commit()
