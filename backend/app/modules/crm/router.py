"""Patient API endpoints."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.database import get_db
from app.modules.auth.models import User
from app.modules.crm.schemas import PatientCreate, PatientResponse, PatientUpdate
from app.modules.crm.service import (
    create_patient,
    get_all_patients,
    get_patient_by_id,
    get_patient_by_phone,
    get_unmatched_leads,
    link_lead_to_patient,
    merge_patients,
    update_patient,
    add_patient_contact,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Patient CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[PatientResponse])
async def list_patients(
    status: str | None = None,
    search: str | None = Query(None, description="Buscar por nome, telefone ou email"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_all_patients(db, status=status, search=search)


@router.post("/", response_model=PatientResponse, status_code=201)
async def create_new_patient(
    body: PatientCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_patient_by_phone(db, body.phone)
    if existing:
        raise HTTPException(status_code=409, detail="Paciente com este telefone já existe.")

    return await create_patient(
        db,
        phone=body.phone,
        full_name=body.full_name,
        email=body.email,
        channel=body.channel,
        channel_id=body.channel_id,
        notes=body.notes,
    )


@router.get("/unmatched", response_model=list[dict])
async def list_unmatched_contacts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return recent leads that have not been linked to a patient profile yet."""
    leads = await get_unmatched_leads(db)
    return [
        {
            "lead_id": str(lead.id),
            "code": lead.code,
            "full_name": lead.full_name,
            "phone": lead.phone,
            "email": lead.email,
            "channel": lead.channel,
            "status": lead.status,
            "created_at": lead.created_at.isoformat(),
        }
        for lead in leads
    ]


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_single_patient(
    patient_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    patient = await get_patient_by_id(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    return patient


@router.patch("/{patient_id}", response_model=PatientResponse)
async def update_existing_patient(
    patient_id: uuid.UUID,
    body: PatientUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    patient = await get_patient_by_id(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")

    if body.phone is not None:
        existing = await get_patient_by_phone(db, body.phone)
        if existing and existing.id != patient_id:
            raise HTTPException(status_code=409, detail="Telefone já cadastrado para outro paciente.")

    return await update_patient(
        db, patient,
        full_name=body.full_name,
        phone=body.phone,
        email=body.email,
        crm_status=body.crm_status,
        notes=body.notes,
    )


# ---------------------------------------------------------------------------
# Merge two patients
# ---------------------------------------------------------------------------

class MergeRequest(BaseModel):
    source_patient_id: uuid.UUID


@router.post("/{patient_id}/merge", response_model=PatientResponse)
async def merge_into_patient(
    patient_id: uuid.UUID,
    body: MergeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Merge source_patient_id into patient_id (target). Source is deleted after merge."""
    if patient_id == body.source_patient_id:
        raise HTTPException(status_code=400, detail="Não é possível unificar um paciente com ele mesmo.")
    try:
        return await merge_patients(db, source_id=body.source_patient_id, target_id=patient_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Link a lead to an existing patient
# ---------------------------------------------------------------------------

class LinkLeadRequest(BaseModel):
    lead_id: uuid.UUID


@router.post("/{patient_id}/link-lead")
async def link_lead(
    patient_id: uuid.UUID,
    body: LinkLeadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link an unmatched lead to an existing patient profile."""
    patient = await get_patient_by_id(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    await link_lead_to_patient(db, body.lead_id, patient_id)
    return {"success": True}


# ---------------------------------------------------------------------------
# Add contact channel to a patient
# ---------------------------------------------------------------------------

class AddContactRequest(BaseModel):
    channel: str
    value: str
    is_primary: bool = False


@router.post("/{patient_id}/contacts")
async def add_contact(
    patient_id: uuid.UUID,
    body: AddContactRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new contact channel (phone/telegram/email) to a patient."""
    patient = await get_patient_by_id(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    contact = await add_patient_contact(db, patient_id, body.channel, body.value, body.is_primary)
    return {
        "id": str(contact.id),
        "channel": contact.channel,
        "value": contact.value,
        "is_primary": contact.is_primary,
    }
