"""Practice area API endpoints."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user, require_role
from app.database import get_db
from app.modules.admin.models import PracticeArea
from app.modules.admin.schemas import PracticeAreaCreate, PracticeAreaResponse, PracticeAreaUpdate
from app.modules.admin.service import (
    create_practice_area,
    delete_practice_area,
    get_all_practice_areas,
    get_practice_area_by_id,
    update_practice_area,
)
from app.modules.auth.models import User

router = APIRouter()


@router.get("/", response_model=list[PracticeAreaResponse])
async def list_practice_areas(
    active_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_all_practice_areas(db, active_only=active_only)


@router.post("/", response_model=PracticeAreaResponse, status_code=201)
async def create_new_practice_area(
    body: PracticeAreaCreate,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    return await create_practice_area(db, name=body.name, description=body.description)


@router.get("/{practice_area_id}", response_model=PracticeAreaResponse)
async def get_practice_area(
    practice_area_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    practice_area = await get_practice_area_by_id(db, practice_area_id)
    if not practice_area:
        raise HTTPException(status_code=404, detail="Área de atuação não encontrada.")
    return practice_area


@router.patch("/{practice_area_id}", response_model=PracticeAreaResponse)
async def update_existing_practice_area(
    practice_area_id: uuid.UUID,
    body: PracticeAreaUpdate,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    practice_area = await get_practice_area_by_id(db, practice_area_id)
    if not practice_area:
        raise HTTPException(status_code=404, detail="Área de atuação não encontrada.")
    return await update_practice_area(
        db, practice_area, name=body.name, description=body.description, is_active=body.is_active
    )


@router.delete("/{practice_area_id}", status_code=204)
async def delete_existing_practice_area(
    practice_area_id: uuid.UUID,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    practice_area = await get_practice_area_by_id(db, practice_area_id)
    if not practice_area:
        raise HTTPException(status_code=404, detail="Área de atuação não encontrada.")
    await delete_practice_area(db, practice_area)
