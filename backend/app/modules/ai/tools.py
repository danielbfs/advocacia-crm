"""AI function calling tools — executed when the LLM requests them."""
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.scheduling.service import (
    SlotNotAvailableError,
    get_appointments,
    get_available_slots,
    get_available_slots_by_specialty,
    get_appointment_by_id,
    create_appointment,
    cancel_appointment,
    update_appointment,
    get_doctor_by_id,
)

logger = logging.getLogger(__name__)


def _parse_datetime_aware(value: str) -> datetime:
    """Parse ISO 8601 string.
    - Se já tem timezone explícito → usa como está.
    - Se naive → trata como UTC (o LLM deve copiar o starts_at retornado por
      check_availability, que é UTC; se chegar naive, é UTC sem offset).
    """
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

# OpenAI function definitions
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": (
                "Verifica horários disponíveis para agendamento. "
                "Use quando o paciente quer marcar consulta."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "specialty_id": {
                        "type": "string",
                        "description": "UUID da especialidade (opcional se doctor_id fornecido)",
                    },
                    "doctor_id": {
                        "type": "string",
                        "description": "UUID do médico específico (opcional)",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "Data início (ISO 8601). Se não informado, usa hoje.",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "Data fim (ISO 8601). Se não informado, usa 7 dias a partir de date_from.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": (
                "Agenda uma consulta para o paciente. "
                "SEMPRE confirme o horário com o paciente antes de chamar esta função. "
                "Se estiver REMARCANDO, informe replaces_appointment_id para cancelar o agendamento anterior."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "doctor_id": {
                        "type": "string",
                        "description": "UUID do médico",
                    },
                    "starts_at": {
                        "type": "string",
                        "description": "Data/hora de início (ISO 8601)",
                    },
                    "patient_notes": {
                        "type": "string",
                        "description": "Observações do paciente (queixa principal, etc.)",
                    },
                    "replaces_appointment_id": {
                        "type": "string",
                        "description": "UUID do agendamento anterior a cancelar (obrigatório ao remarcar)",
                    },
                },
                "required": ["doctor_id", "starts_at"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cancel_appointment",
            "description": "Cancela um agendamento existente do paciente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "appointment_id": {
                        "type": "string",
                        "description": "UUID do agendamento a cancelar",
                    },
                },
                "required": ["appointment_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reschedule_appointment",
            "description": "Remarca um agendamento existente para novo horário.",
            "parameters": {
                "type": "object",
                "properties": {
                    "appointment_id": {
                        "type": "string",
                        "description": "UUID do agendamento a remarcar",
                    },
                    "new_starts_at": {
                        "type": "string",
                        "description": "Nova data/hora de início (ISO 8601)",
                    },
                },
                "required": ["appointment_id", "new_starts_at"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_patient_appointments",
            "description": "Lista os agendamentos do paciente atual.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "escalate_to_human",
            "description": (
                "Transfere a conversa para atendimento humano (secretária). "
                "Use quando não conseguir resolver o pedido do paciente."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Motivo da escalação",
                    },
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_lead",
            "description": (
                "Registra um lead (oportunidade de venda) no CRM. "
                "Use quando o paciente pedir orçamento/preço, demonstrar interesse mas não quiser agendar agora, "
                "ou quando houver potencial de conversão futura."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_name": {
                        "type": "string",
                        "description": "Nome do paciente mencionado na conversa (se informado)",
                    },
                    "specialty_id": {
                        "type": "string",
                        "description": "UUID da especialidade de interesse (opcional)",
                    },
                    "description": {
                        "type": "string",
                        "description": "O que o paciente busca — tratamento, orçamento, dúvida, etc.",
                    },
                    "quote_value": {
                        "type": "number",
                        "description": "Valor de orçamento mencionado (opcional)",
                    },
                },
                "required": ["description"],
            },
        },
    },
]


async def execute_tool(
    tool_name: str,
    arguments: dict,
    db: AsyncSession,
    patient_id: uuid.UUID,
) -> str:
    """Execute a tool call and return the result as a string."""
    try:
        if tool_name == "check_availability":
            return await _check_availability(db, arguments)
        elif tool_name == "book_appointment":
            return await _book_appointment(db, patient_id, arguments)
        elif tool_name == "cancel_appointment":
            return await _cancel_appointment(db, arguments)
        elif tool_name == "reschedule_appointment":
            return await _reschedule_appointment(db, arguments)
        elif tool_name == "get_patient_appointments":
            return await _get_patient_appointments(db, patient_id)
        elif tool_name == "escalate_to_human":
            return await _escalate_to_human(db, patient_id, arguments)
        elif tool_name == "create_lead":
            return await _create_lead(db, patient_id, arguments)
        else:
            return json.dumps({"error": f"Tool desconhecida: {tool_name}"})
    except Exception as e:
        logger.exception("Tool execution error: %s", tool_name)
        return json.dumps({"error": str(e)})


async def _check_availability(db: AsyncSession, args: dict) -> str:
    now = datetime.now(timezone.utc)
    date_from = _parse_datetime_aware(args["date_from"]) if args.get("date_from") else now
    date_to = (
        _parse_datetime_aware(args["date_to"])
        if args.get("date_to")
        else date_from + timedelta(days=7)
    )

    if args.get("doctor_id"):
        slots = await get_available_slots(
            db, uuid.UUID(args["doctor_id"]), date_from, date_to
        )
    elif args.get("specialty_id"):
        slots = await get_available_slots_by_specialty(
            db, uuid.UUID(args["specialty_id"]), date_from, date_to
        )
    else:
        return json.dumps({"error": "Informe doctor_id ou specialty_id"})

    # Mantém starts_at em UTC (para o LLM copiar literalmente ao agendar).
    # Adiciona campo "display" em hora local para o LLM mostrar ao paciente.
    # NUNCA retornar starts_at em hora local com offset — o LLM reconverteria
    # para UTC e causaria dupla conversão.
    clinic_tz = ZoneInfo(settings.CLINIC_TIMEZONE)
    result_slots = []
    for slot in slots[:15]:
        start_utc = datetime.fromisoformat(slot["starts_at"])
        end_utc   = datetime.fromisoformat(slot["ends_at"])
        start_loc = start_utc.astimezone(clinic_tz)
        end_loc   = end_utc.astimezone(clinic_tz)
        entry: dict = {
            "starts_at": slot["starts_at"],                          # UTC — copiar exatamente
            "ends_at":   slot["ends_at"],                            # UTC
            "display":   start_loc.strftime("%d/%m/%Y %H:%M"),       # hora local para exibir
            "display_end": end_loc.strftime("%H:%M"),
        }
        if "doctor_id"   in slot: entry["doctor_id"]   = slot["doctor_id"]
        if "doctor_name" in slot: entry["doctor_name"] = slot["doctor_name"]
        result_slots.append(entry)

    return json.dumps({"available_slots": result_slots, "total": len(slots)})


async def _book_appointment(
    db: AsyncSession, patient_id: uuid.UUID, args: dict
) -> str:
    doctor_id = uuid.UUID(args["doctor_id"])
    starts_at = _parse_datetime_aware(args["starts_at"])

    doctor = await get_doctor_by_id(db, doctor_id)
    if not doctor:
        return json.dumps({"error": "Médico não encontrado"})

    ends_at = starts_at + timedelta(minutes=doctor.slot_duration_minutes)

    # Se for remarcação, cancela o agendamento anterior antes de criar o novo
    cancelled_old_id = None
    if args.get("replaces_appointment_id"):
        try:
            old_appt = await get_appointment_by_id(db, uuid.UUID(args["replaces_appointment_id"]))
            if old_appt and old_appt.status not in ("cancelled",):
                await cancel_appointment(db, old_appt)
                cancelled_old_id = str(old_appt.id)
                logger.info("Agendamento anterior %s cancelado na remarcação", cancelled_old_id)
        except Exception:
            logger.exception("Falha ao cancelar agendamento anterior na remarcação")

    try:
        appt = await create_appointment(
            db,
            patient_id=patient_id,
            doctor_id=doctor_id,
            starts_at=starts_at,
            ends_at=ends_at,
            specialty_id=doctor.specialty_id,
            source="ai_chat",
            notes=args.get("patient_notes"),
        )
        return json.dumps({
            "success": True,
            "appointment_id": str(appt.id),
            "doctor_name": doctor.full_name,
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "cancelled_previous": cancelled_old_id,
        })
    except SlotNotAvailableError as e:
        return json.dumps({"error": str(e), "slot_unavailable": True})
    except Exception as e:
        return json.dumps({"error": f"Não foi possível agendar: {e}"})


async def _cancel_appointment(db: AsyncSession, args: dict) -> str:
    appt_id = uuid.UUID(args["appointment_id"])
    appt = await get_appointment_by_id(db, appt_id)
    if not appt:
        return json.dumps({"error": "Agendamento não encontrado"})
    if appt.status == "cancelled":
        return json.dumps({"error": "Agendamento já foi cancelado"})

    await cancel_appointment(db, appt)
    return json.dumps({"success": True, "message": "Agendamento cancelado"})


async def _reschedule_appointment(db: AsyncSession, args: dict) -> str:
    appt_id = uuid.UUID(args["appointment_id"])
    new_starts_at = _parse_datetime_aware(args["new_starts_at"])

    appt = await get_appointment_by_id(db, appt_id)
    if not appt:
        return json.dumps({"error": "Agendamento não encontrado"})

    doctor = await get_doctor_by_id(db, appt.doctor_id)
    new_ends_at = new_starts_at + timedelta(minutes=doctor.slot_duration_minutes)

    await update_appointment(
        db, appt, starts_at=new_starts_at, ends_at=new_ends_at
    )
    return json.dumps({
        "success": True,
        "new_starts_at": new_starts_at.isoformat(),
        "new_ends_at": new_ends_at.isoformat(),
    })


async def _get_patient_appointments(db: AsyncSession, patient_id: uuid.UUID) -> str:
    appts = await get_appointments(db, patient_id=patient_id)
    active = [a for a in appts if a.status not in ("cancelled",)]
    result = []
    for a in active[:10]:
        result.append({
            "appointment_id": str(a.id),
            "doctor_name": a.doctor.full_name if a.doctor else "—",
            "specialty": a.specialty.name if a.specialty else "—",
            "starts_at": a.starts_at.isoformat(),
            "ends_at": a.ends_at.isoformat(),
            "status": a.status,
        })
    return json.dumps({"appointments": result})


async def _escalate_to_human(
    db: AsyncSession, patient_id: uuid.UUID, args: dict
) -> str:
    """Marca o paciente como escalonado, encerra sessão IA e notifica humano.

    Sempre tenta criar (ou atualizar) o lead para garantir registro no CRM,
    independente de o LLM ter chamado create_lead antes.
    """
    from app.modules.admin.models import SystemConfig
    from app.modules.ai.session import clear_session
    from app.modules.crm.models import Patient
    from app.modules.messaging.gateway import send_message

    reason = args.get("reason", "Paciente solicitou atendimento humano")

    # Auto-cria lead ao escalar — garante registro mesmo que o LLM não tenha chamado create_lead
    try:
        lead_result = await _create_lead(db, patient_id, {
            "description": f"Escalonado para atendimento humano. Motivo: {reason}",
        })
        lead_data = json.loads(lead_result)
        if lead_data.get("success") and not lead_data.get("already_existed"):
            logger.info("Lead auto-criado na escalação: %s", lead_data.get("lead_id"))
    except Exception:
        logger.exception("Falha ao criar lead automático na escalação para paciente %s", patient_id)

    # 1. Marca o paciente — usamos crm_status para indicar revisão humana
    patient = await db.get(Patient, patient_id)
    if patient:
        existing_notes = patient.notes or ""
        prefix = "[ESCALONADO PARA HUMANO] "
        if not existing_notes.startswith(prefix):
            patient.notes = f"{prefix}{reason}\n{existing_notes}".strip()
        await db.commit()

    # 2. Limpa sessão IA para que próximas mensagens não continuem o fluxo automatizado
    try:
        await clear_session(patient_id)
    except Exception:
        logger.exception("Failed to clear AI session for patient %s", patient_id)

    # 3. Notifica via Telegram (se configurado)
    try:
        result = await db.execute(
            select(SystemConfig).where(SystemConfig.key == "notifications")
        )
        row = result.scalar_one_or_none()
        chat_id = (row.value or {}).get("escalation_telegram_chat_id") if row else ""
        if chat_id and patient:
            name = patient.full_name or patient.phone
            text = (
                f"🆘 *Atendimento humano solicitado*\n\n"
                f"Paciente: {name}\n"
                f"Canal: {patient.channel}\n"
                f"Motivo: {reason}"
            )
            await send_message("telegram", chat_id, text)
    except Exception:
        logger.exception("Failed to send escalation notification")

    return json.dumps({
        "escalated": True,
        "message": (
            "Conversa encaminhada para a secretária. "
            f"Motivo: {reason}. "
            "Em breve alguém entrará em contato."
        ),
    })


async def _create_lead(
    db: AsyncSession, patient_id: uuid.UUID, args: dict
) -> str:
    """Cria um lead no CRM a partir da conversa do chatbot."""
    from app.modules.admin.models import SystemConfig
    from app.modules.crm.models import Patient
    from app.modules.leads.models import Lead

    now = datetime.now(timezone.utc)

    # Busca dados reais do paciente (telefone, canal)
    patient = await db.get(Patient, patient_id)
    if not patient:
        # Sessão de teste — sem paciente real no banco
        return json.dumps({
            "success": False,
            "message": (
                "Simulação: em produção criaria um lead com o telefone do paciente. "
                "Nenhum dado foi salvo nesta sessão de teste."
            ),
        })

    phone   = patient.phone
    channel = patient.channel or "outro"

    # Evita duplicata: verifica lead ativo para este telefone
    existing_q = await db.execute(
        select(Lead)
        .where(Lead.phone == phone)
        .where(Lead.status.notin_(["convertido", "perdido"]))
        .order_by(Lead.created_at.desc())
    )
    existing = existing_q.scalars().first()
    if existing:
        # Atualiza descrição se trouxer mais informação
        if args.get("description") and not existing.description:
            existing.description = args["description"]
            await db.commit()
        return json.dumps({
            "success": True,
            "lead_id": str(existing.id),
            "already_existed": True,
            "message": "Lead já existe no CRM. Informações atualizadas.",
        })

    # Lê SLA do banco ou usa padrão das configurações
    sla_hours = settings.CLINIC_SLA_HOURS
    try:
        row = (await db.execute(
            select(SystemConfig).where(SystemConfig.key == "sla")
        )).scalar_one_or_none()
        if row and row.value:
            sla_hours = int(row.value.get("hours", sla_hours))
    except Exception:
        pass

    specialty_id = None
    if args.get("specialty_id"):
        try:
            specialty_id = uuid.UUID(args["specialty_id"])
        except ValueError:
            pass

    quote_value = None
    if args.get("quote_value"):
        try:
            quote_value = float(args["quote_value"])
        except (TypeError, ValueError):
            pass

    full_name = args.get("patient_name") or patient.full_name

    from app.modules.leads.service import _generate_lead_code
    code = await _generate_lead_code(db)

    lead = Lead(
        code=code,
        phone=phone,
        full_name=full_name,
        channel=channel,
        status="em_contato",
        contacted_at=now,
        sla_deadline=now + timedelta(hours=sla_hours),
        specialty_id=specialty_id,
        description=args.get("description"),
        quote_value=quote_value,
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)

    logger.info("Lead criado via chatbot: %s (paciente %s)", lead.id, patient_id)
    return json.dumps({
        "success": True,
        "lead_id": str(lead.id),
        "message": (
            "Lead registrado no CRM com sucesso. "
            "A equipe de vendas receberá para dar seguimento."
        ),
    })
