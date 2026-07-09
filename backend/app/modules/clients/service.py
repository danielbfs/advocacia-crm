"""Client business logic."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, or_, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.clients.models import Client, ClientContact


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------

async def get_all_clients(
    db: AsyncSession,
    status: str | None = None,
    search: str | None = None,
) -> list[Client]:
    query = select(Client).order_by(Client.created_at.desc())
    if status:
        query = query.where(Client.client_status == status)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Client.full_name.ilike(pattern),
                Client.phone.ilike(pattern),
                Client.email.ilike(pattern),
            )
        )
    result = await db.execute(query)
    return list(result.scalars().unique().all())


async def get_client_by_id(db: AsyncSession, client_id: uuid.UUID) -> Client | None:
    result = await db.execute(select(Client).where(Client.id == client_id))
    return result.scalar_one_or_none()


async def get_client_by_phone(db: AsyncSession, phone: str) -> Client | None:
    """Find client by phone — searches both clients.phone and client_contacts."""
    # First try the legacy column
    result = await db.execute(select(Client).where(Client.phone == phone))
    client = result.scalar_one_or_none()
    if client:
        return client
    # Then try client_contacts
    return await get_client_by_contact(db, "whatsapp", phone)


async def get_client_by_contact(db: AsyncSession, channel: str, value: str) -> Client | None:
    """Find a client via any of their linked contact channels."""
    result = await db.execute(
        select(Client)
        .join(ClientContact, ClientContact.client_id == Client.id)
        .where(
            and_(
                ClientContact.channel == channel,
                ClientContact.value == value,
            )
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_client(
    db: AsyncSession,
    phone: str,
    full_name: str | None = None,
    email: str | None = None,
    channel: str = "whatsapp",
    channel_id: str | None = None,
    notes: str | None = None,
) -> Client:
    client = Client(
        full_name=full_name,
        phone=phone,
        email=email,
        channel=channel,
        channel_id=channel_id,
        notes=notes,
    )
    db.add(client)
    await db.flush()  # get client.id before adding contact

    # Register contact in client_contacts
    contact = ClientContact(
        client_id=client.id,
        channel=channel,
        value=phone,
        is_primary=True,
    )
    db.add(contact)

    await db.commit()
    await db.refresh(client)
    return client


async def update_client(
    db: AsyncSession,
    client: Client,
    full_name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    client_status: str | None = None,
    notes: str | None = None,
) -> Client:
    if full_name is not None:
        client.full_name = full_name
    if phone is not None:
        client.phone = phone
    if email is not None:
        client.email = email
    if client_status is not None:
        client.client_status = client_status
    if notes is not None:
        client.notes = notes
    await db.commit()
    await db.refresh(client)
    return client


async def add_client_contact(
    db: AsyncSession,
    client_id: uuid.UUID,
    channel: str,
    value: str,
    is_primary: bool = False,
) -> ClientContact:
    """Add a new contact channel to a client. Ignores if already exists."""
    existing = await db.execute(
        select(ClientContact).where(
            ClientContact.channel == channel,
            ClientContact.value == value,
        )
    )
    if existing.scalar_one_or_none():
        # Already registered (possibly to another client) — do nothing
        return existing.scalar_one_or_none()  # type: ignore[return-value]

    contact = ClientContact(
        client_id=client_id,
        channel=channel,
        value=value,
        is_primary=is_primary,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

async def merge_clients(
    db: AsyncSession,
    source_id: uuid.UUID,
    target_id: uuid.UUID,
) -> Client:
    """
    Merge source client into target client.
    All leads, contacts, conversations and consultations from source are
    re-linked to target. Source record is then deleted.
    """
    from sqlalchemy import update as sa_update
    from app.modules.leads.models import Lead
    from app.modules.scheduling.models import Consultation
    from app.modules.messaging.models import Conversation

    source = await get_client_by_id(db, source_id)
    target = await get_client_by_id(db, target_id)

    if not source or not target:
        raise ValueError("Cliente não encontrado")

    # Migrate leads (client_id and converted_client_id)
    await db.execute(
        sa_update(Lead)
        .where(Lead.client_id == source_id)
        .values(client_id=target_id)
    )
    await db.execute(
        sa_update(Lead)
        .where(Lead.converted_client_id == source_id)
        .values(converted_client_id=target_id)
    )

    # Migrate consultations
    try:
        await db.execute(
            sa_update(Consultation)
            .where(Consultation.client_id == source_id)
            .values(client_id=target_id)
        )
    except Exception:
        pass  # Consultation may not have this column yet

    # Migrate conversations
    try:
        await db.execute(
            sa_update(Conversation)
            .where(Conversation.client_id == source_id)
            .values(client_id=target_id)
        )
    except Exception:
        pass

    # Migrate client_contacts (avoiding duplicates)
    contacts_result = await db.execute(
        select(ClientContact).where(ClientContact.client_id == source_id)
    )
    for contact in contacts_result.scalars().all():
        existing = await db.execute(
            select(ClientContact).where(
                ClientContact.channel == contact.channel,
                ClientContact.value == contact.value,
                ClientContact.client_id == target_id,
            )
        )
        if not existing.scalar_one_or_none():
            contact.client_id = target_id
        else:
            await db.delete(contact)

    # Fill in missing data on target from source
    if not target.full_name and source.full_name:
        target.full_name = source.full_name
    if not target.email and source.email:
        target.email = source.email
    if not target.notes and source.notes:
        target.notes = source.notes

    await db.commit()

    # Delete source
    await db.delete(source)
    await db.commit()
    await db.refresh(target)
    return target


# ---------------------------------------------------------------------------
# Unmatched leads (no client_id) — for the "pending unification" section
# ---------------------------------------------------------------------------

async def get_unmatched_leads(db: AsyncSession, limit: int = 50):
    """Return recent leads that have not been linked to any client yet."""
    from app.modules.leads.models import Lead
    result = await db.execute(
        select(Lead)
        .where(Lead.client_id.is_(None))
        .order_by(Lead.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().unique().all())


async def link_lead_to_client(
    db: AsyncSession,
    lead_id: uuid.UUID,
    client_id: uuid.UUID,
) -> None:
    """Link a lead to an existing client (manual unification)."""
    from app.modules.leads.models import Lead
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(Lead)
        .where(Lead.id == lead_id)
        .values(client_id=client_id)
    )
    await db.commit()
