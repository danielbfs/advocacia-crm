"""Patient business logic."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, or_, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.crm.models import Patient, PatientContact


# ---------------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------------

async def get_all_patients(
    db: AsyncSession,
    status: str | None = None,
    search: str | None = None,
) -> list[Patient]:
    query = select(Patient).order_by(Patient.created_at.desc())
    if status:
        query = query.where(Patient.crm_status == status)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Patient.full_name.ilike(pattern),
                Patient.phone.ilike(pattern),
                Patient.email.ilike(pattern),
            )
        )
    result = await db.execute(query)
    return list(result.scalars().unique().all())


async def get_patient_by_id(db: AsyncSession, patient_id: uuid.UUID) -> Patient | None:
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    return result.scalar_one_or_none()


async def get_patient_by_phone(db: AsyncSession, phone: str) -> Patient | None:
    """Find patient by phone — searches both patients.phone and patient_contacts."""
    # First try the legacy column
    result = await db.execute(select(Patient).where(Patient.phone == phone))
    patient = result.scalar_one_or_none()
    if patient:
        return patient
    # Then try patient_contacts
    return await get_patient_by_contact(db, "whatsapp", phone)


async def get_patient_by_contact(db: AsyncSession, channel: str, value: str) -> Patient | None:
    """Find a patient via any of their linked contact channels."""
    result = await db.execute(
        select(Patient)
        .join(PatientContact, PatientContact.patient_id == Patient.id)
        .where(
            and_(
                PatientContact.channel == channel,
                PatientContact.value == value,
            )
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_patient(
    db: AsyncSession,
    phone: str,
    full_name: str | None = None,
    email: str | None = None,
    channel: str = "whatsapp",
    channel_id: str | None = None,
    notes: str | None = None,
) -> Patient:
    patient = Patient(
        full_name=full_name,
        phone=phone,
        email=email,
        channel=channel,
        channel_id=channel_id,
        notes=notes,
    )
    db.add(patient)
    await db.flush()  # get patient.id before adding contact

    # Register contact in patient_contacts
    contact = PatientContact(
        patient_id=patient.id,
        channel=channel,
        value=phone,
        is_primary=True,
    )
    db.add(contact)

    await db.commit()
    await db.refresh(patient)
    return patient


async def update_patient(
    db: AsyncSession,
    patient: Patient,
    full_name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    crm_status: str | None = None,
    notes: str | None = None,
) -> Patient:
    if full_name is not None:
        patient.full_name = full_name
    if phone is not None:
        patient.phone = phone
    if email is not None:
        patient.email = email
    if crm_status is not None:
        patient.crm_status = crm_status
    if notes is not None:
        patient.notes = notes
    await db.commit()
    await db.refresh(patient)
    return patient


async def add_patient_contact(
    db: AsyncSession,
    patient_id: uuid.UUID,
    channel: str,
    value: str,
    is_primary: bool = False,
) -> PatientContact:
    """Add a new contact channel to a patient. Ignores if already exists."""
    existing = await db.execute(
        select(PatientContact).where(
            PatientContact.channel == channel,
            PatientContact.value == value,
        )
    )
    if existing.scalar_one_or_none():
        # Already registered (possibly to another patient) — do nothing
        return existing.scalar_one_or_none()  # type: ignore[return-value]

    contact = PatientContact(
        patient_id=patient_id,
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

async def merge_patients(
    db: AsyncSession,
    source_id: uuid.UUID,
    target_id: uuid.UUID,
) -> Patient:
    """
    Merge source patient into target patient.
    All leads, contacts, conversations and appointments from source are
    re-linked to target. Source record is then deleted.
    """
    from sqlalchemy import update as sa_update
    from app.modules.leads.models import Lead
    from app.modules.scheduling.models import Appointment
    from app.modules.messaging.models import Conversation

    source = await get_patient_by_id(db, source_id)
    target = await get_patient_by_id(db, target_id)

    if not source or not target:
        raise ValueError("Paciente não encontrado")

    # Migrate leads (patient_id and converted_patient_id)
    await db.execute(
        sa_update(Lead)
        .where(Lead.patient_id == source_id)
        .values(patient_id=target_id)
    )
    await db.execute(
        sa_update(Lead)
        .where(Lead.converted_patient_id == source_id)
        .values(converted_patient_id=target_id)
    )

    # Migrate appointments
    try:
        await db.execute(
            sa_update(Appointment)
            .where(Appointment.patient_id == source_id)
            .values(patient_id=target_id)
        )
    except Exception:
        pass  # Appointment may not have this column yet

    # Migrate conversations
    try:
        await db.execute(
            sa_update(Conversation)
            .where(Conversation.patient_id == source_id)
            .values(patient_id=target_id)
        )
    except Exception:
        pass

    # Migrate patient_contacts (avoiding duplicates)
    contacts_result = await db.execute(
        select(PatientContact).where(PatientContact.patient_id == source_id)
    )
    for contact in contacts_result.scalars().all():
        existing = await db.execute(
            select(PatientContact).where(
                PatientContact.channel == contact.channel,
                PatientContact.value == contact.value,
                PatientContact.patient_id == target_id,
            )
        )
        if not existing.scalar_one_or_none():
            contact.patient_id = target_id
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
# Unmatched leads (no patient_id) — for the "pending unification" section
# ---------------------------------------------------------------------------

async def get_unmatched_leads(db: AsyncSession, limit: int = 50):
    """Return recent leads that have not been linked to any patient yet."""
    from app.modules.leads.models import Lead
    result = await db.execute(
        select(Lead)
        .where(Lead.patient_id.is_(None))
        .order_by(Lead.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().unique().all())


async def link_lead_to_patient(
    db: AsyncSession,
    lead_id: uuid.UUID,
    patient_id: uuid.UUID,
) -> None:
    """Link a lead to an existing patient (manual unification)."""
    from app.modules.leads.models import Lead
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(Lead)
        .where(Lead.id == lead_id)
        .values(patient_id=patient_id)
    )
    await db.commit()
