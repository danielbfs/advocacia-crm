"""Client API endpoints."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_current_user
from app.database import get_db
from app.modules.auth.models import User
from app.modules.clients.schemas import ClientCreate, ClientResponse, ClientUpdate
from app.modules.clients.service import (
    create_client,
    get_all_clients,
    get_client_by_id,
    get_client_by_phone,
    get_unmatched_leads,
    link_lead_to_client,
    merge_clients,
    update_client,
    add_client_contact,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Client CRUD
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[ClientResponse])
async def list_clients(
    status: str | None = None,
    search: str | None = Query(None, description="Buscar por nome, telefone ou email"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_all_clients(db, status=status, search=search)


@router.post("/", response_model=ClientResponse, status_code=201)
async def create_new_client(
    body: ClientCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_client_by_phone(db, body.phone)
    if existing:
        raise HTTPException(status_code=409, detail="Cliente com este telefone já existe.")

    return await create_client(
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
    """Return recent leads that have not been linked to a client profile yet."""
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


@router.get("/{client_id}", response_model=ClientResponse)
async def get_single_client(
    client_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    return client


@router.patch("/{client_id}", response_model=ClientResponse)
async def update_existing_client(
    client_id: uuid.UUID,
    body: ClientUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    if body.phone is not None:
        existing = await get_client_by_phone(db, body.phone)
        if existing and existing.id != client_id:
            raise HTTPException(status_code=409, detail="Telefone já cadastrado para outro cliente.")

    return await update_client(
        db, client,
        full_name=body.full_name,
        phone=body.phone,
        email=body.email,
        client_status=body.client_status,
        notes=body.notes,
    )


# ---------------------------------------------------------------------------
# Merge two clients
# ---------------------------------------------------------------------------

class MergeRequest(BaseModel):
    source_client_id: uuid.UUID


@router.post("/{client_id}/merge", response_model=ClientResponse)
async def merge_into_client(
    client_id: uuid.UUID,
    body: MergeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Merge source_client_id into client_id (target). Source is deleted after merge."""
    if client_id == body.source_client_id:
        raise HTTPException(status_code=400, detail="Não é possível unificar um cliente com ele mesmo.")
    try:
        return await merge_clients(db, source_id=body.source_client_id, target_id=client_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Link a lead to an existing client
# ---------------------------------------------------------------------------

class LinkLeadRequest(BaseModel):
    lead_id: uuid.UUID


@router.post("/{client_id}/link-lead")
async def link_lead(
    client_id: uuid.UUID,
    body: LinkLeadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link an unmatched lead to an existing client profile."""
    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    await link_lead_to_client(db, body.lead_id, client_id)
    return {"success": True}


# ---------------------------------------------------------------------------
# Add contact channel to a client
# ---------------------------------------------------------------------------

class AddContactRequest(BaseModel):
    channel: str
    value: str
    is_primary: bool = False


@router.post("/{client_id}/contacts")
async def add_contact(
    client_id: uuid.UUID,
    body: AddContactRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new contact channel (phone/telegram/email) to a client."""
    client = await get_client_by_id(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    contact = await add_client_contact(db, client_id, body.channel, body.value, body.is_primary)
    return {
        "id": str(contact.id),
        "channel": contact.channel,
        "value": contact.value,
        "is_primary": contact.is_primary,
    }
