"""Lawyer and scheduling API endpoints."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.exceptions import ForbiddenError
from app.core.permissions import get_current_user, require_role
from app.database import get_db
from app.modules.auth.models import User
from app.modules.scheduling.schemas import (
    ConsultationCreate,
    ConsultationResponse,
    ConsultationUpdate,
    LawyerCreate,
    LawyerResponse,
    LawyerScheduleResponse,
    LawyerScheduleSet,
    LawyerUpdate,
    ScheduleBlockCreate,
    ScheduleBlockResponse,
    TimeSlot,
)
from app.modules.scheduling.service import (
    SlotNotAvailableError,
    cancel_consultation,
    create_consultation,
    create_lawyer,
    create_schedule_block,
    delete_schedule_block,
    get_all_lawyers,
    get_consultation_by_id,
    get_consultations,
    get_available_slots,
    get_available_slots_by_practice_area,
    get_lawyer_by_id,
    get_lawyer_schedules,
    get_schedule_block_by_id,
    get_schedule_blocks,
    set_lawyer_schedules,
    update_consultation,
    update_lawyer,
)

router = APIRouter()


# --- Lawyers ---

@router.get("/lawyers", response_model=list[LawyerResponse])
async def list_lawyers(
    active_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_all_lawyers(db, active_only=active_only)


@router.post("/lawyers", response_model=LawyerResponse, status_code=201)
async def create_new_lawyer(
    body: LawyerCreate,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    return await create_lawyer(
        db,
        full_name=body.full_name,
        oab=body.oab,
        practice_area_id=body.practice_area_id,
        scheduling_provider=body.scheduling_provider,
        slot_duration_minutes=body.slot_duration_minutes,
    )


@router.get("/lawyers/{lawyer_id}", response_model=LawyerResponse)
async def get_single_lawyer(
    lawyer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lawyer = await get_lawyer_by_id(db, lawyer_id)
    if not lawyer:
        raise HTTPException(status_code=404, detail="Advogado não encontrado.")
    return lawyer


@router.patch("/lawyers/{lawyer_id}", response_model=LawyerResponse)
async def update_existing_lawyer(
    lawyer_id: uuid.UUID,
    body: LawyerUpdate,
    current_user: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    lawyer = await get_lawyer_by_id(db, lawyer_id)
    if not lawyer:
        raise HTTPException(status_code=404, detail="Advogado não encontrado.")
    return await update_lawyer(
        db, lawyer,
        full_name=body.full_name,
        oab=body.oab,
        practice_area_id=body.practice_area_id,
        slot_duration_minutes=body.slot_duration_minutes,
        is_active=body.is_active,
    )


# --- Lawyer Schedules ---

@router.get("/lawyers/{lawyer_id}/schedule", response_model=list[LawyerScheduleResponse])
async def get_lawyer_schedule(
    lawyer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lawyer = await get_lawyer_by_id(db, lawyer_id)
    if not lawyer:
        raise HTTPException(status_code=404, detail="Advogado não encontrado.")
    return await get_lawyer_schedules(db, lawyer_id)


@router.put("/lawyers/{lawyer_id}/schedule", response_model=list[LawyerScheduleResponse])
async def replace_lawyer_schedule(
    lawyer_id: uuid.UUID,
    body: LawyerScheduleSet,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "admin":
        if current_user.role != "lawyer" or current_user.lawyer_id != lawyer_id:
            raise ForbiddenError()
    lawyer = await get_lawyer_by_id(db, lawyer_id)
    if not lawyer:
        raise HTTPException(status_code=404, detail="Advogado não encontrado.")
    schedules_data = [item.model_dump() for item in body.schedules]
    return await set_lawyer_schedules(db, lawyer_id, schedules_data)


# --- Schedule Blocks ---

@router.get("/blocks", response_model=list[ScheduleBlockResponse])
async def list_schedule_blocks(
    lawyer_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_schedule_blocks(db, lawyer_id)


@router.post("/blocks", response_model=ScheduleBlockResponse, status_code=201)
async def create_new_block(
    body: ScheduleBlockCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_schedule_block(
        db,
        lawyer_id=body.lawyer_id,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        reason=body.reason,
        created_by=current_user.id,
    )


@router.delete("/blocks/{block_id}", status_code=204)
async def delete_existing_block(
    block_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    block = await get_schedule_block_by_id(db, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Bloqueio não encontrado.")
    await delete_schedule_block(db, block)


# --- Availability Slots ---

@router.get("/slots")
async def list_available_slots(
    lawyer_id: uuid.UUID | None = None,
    practice_area_id: uuid.UUID | None = None,
    date_from: datetime = Query(...),
    date_to: datetime = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if lawyer_id:
        return await get_available_slots(db, lawyer_id, date_from, date_to)
    if practice_area_id:
        return await get_available_slots_by_practice_area(db, practice_area_id, date_from, date_to)
    raise HTTPException(status_code=400, detail="Informe lawyer_id ou practice_area_id.")


# --- Consultations ---

@router.get("/consultations", response_model=list[ConsultationResponse])
async def list_consultations(
    lawyer_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_consultations(db, lawyer_id, client_id, date_from, date_to, status)


@router.post("/consultations", response_model=ConsultationResponse, status_code=201)
async def create_new_consultation(
    body: ConsultationCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        consultation = await create_consultation(
            db,
            client_id=body.client_id,
            lawyer_id=body.lawyer_id,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            practice_area_id=body.practice_area_id,
            source=body.source,
            notes=body.notes,
            created_by_user=current_user.id,
        )
    except SlotNotAvailableError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await log_action(
        db,
        action="consultation.create",
        user_id=current_user.id,
        entity_type="consultation",
        entity_id=consultation.id,
        payload={
            "client_id": str(consultation.client_id),
            "lawyer_id": str(consultation.lawyer_id),
            "starts_at": consultation.starts_at.isoformat(),
            "source": consultation.source,
        },
        request=request,
    )
    return consultation


@router.get("/consultations/{consultation_id}", response_model=ConsultationResponse)
async def get_single_consultation(
    consultation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    consultation = await get_consultation_by_id(db, consultation_id)
    if not consultation:
        raise HTTPException(status_code=404, detail="Consulta não encontrada.")
    return consultation


@router.patch("/consultations/{consultation_id}", response_model=ConsultationResponse)
async def update_existing_consultation(
    consultation_id: uuid.UUID,
    body: ConsultationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    consultation = await get_consultation_by_id(db, consultation_id)
    if not consultation:
        raise HTTPException(status_code=404, detail="Consulta não encontrada.")
    return await update_consultation(db, consultation, status=body.status, notes=body.notes)


@router.delete("/consultations/{consultation_id}", status_code=204)
async def cancel_existing_consultation(
    consultation_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    consultation = await get_consultation_by_id(db, consultation_id)
    if not consultation:
        raise HTTPException(status_code=404, detail="Consulta não encontrada.")
    await cancel_consultation(db, consultation)
    await log_action(
        db,
        action="consultation.cancel",
        user_id=current_user.id,
        entity_type="consultation",
        entity_id=consultation.id,
        request=request,
    )
