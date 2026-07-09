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
    get_consultations,
    get_available_slots,
    get_available_slots_by_practice_area,
    get_consultation_by_id,
    create_consultation,
    cancel_consultation,
    update_consultation,
    get_lawyer_by_id,
)
from app.modules.leads.service import dispatch_proactive_on_status_change

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
                "Use quando o cliente quer marcar consulta."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "practice_area_id": {
                        "type": "string",
                        "description": "UUID da área de atuação (opcional se lawyer_id fornecido)",
                    },
                    "lawyer_id": {
                        "type": "string",
                        "description": "UUID do advogado específico (opcional)",
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
            "name": "book_consultation",
            "description": (
                "Agenda uma consulta para o cliente. "
                "SEMPRE confirme o horário com o cliente antes de chamar esta função. "
                "Se estiver REMARCANDO, informe replaces_consultation_id para cancelar a consulta anterior."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "lawyer_id": {
                        "type": "string",
                        "description": "UUID do advogado",
                    },
                    "starts_at": {
                        "type": "string",
                        "description": "Data/hora de início (ISO 8601)",
                    },
                    "client_notes": {
                        "type": "string",
                        "description": "Observações do cliente (resumo do caso, etc.)",
                    },
                    "replaces_consultation_id": {
                        "type": "string",
                        "description": "UUID da consulta anterior a cancelar (obrigatório ao remarcar)",
                    },
                },
                "required": ["lawyer_id", "starts_at"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cancel_consultation",
            "description": "Cancela uma consulta existente do cliente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "consultation_id": {
                        "type": "string",
                        "description": "UUID da consulta a cancelar",
                    },
                },
                "required": ["consultation_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reschedule_consultation",
            "description": "Remarca uma consulta existente para novo horário.",
            "parameters": {
                "type": "object",
                "properties": {
                    "consultation_id": {
                        "type": "string",
                        "description": "UUID da consulta a remarcar",
                    },
                    "new_starts_at": {
                        "type": "string",
                        "description": "Nova data/hora de início (ISO 8601)",
                    },
                },
                "required": ["consultation_id", "new_starts_at"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_client_consultations",
            "description": "Lista as consultas do cliente atual.",
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
                "Transfere a conversa para atendimento humano (equipe comercial). "
                "Use quando não conseguir resolver o pedido do cliente."
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
                "Use quando o cliente pedir orçamento/honorários, demonstrar interesse mas não quiser agendar agora, "
                "ou quando houver potencial de conversão futura."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "client_name": {
                        "type": "string",
                        "description": "Nome do cliente mencionado na conversa (se informado)",
                    },
                    "practice_area_id": {
                        "type": "string",
                        "description": "UUID da área de atuação de interesse (opcional)",
                    },
                    "description": {
                        "type": "string",
                        "description": "O que o cliente busca — resumo do caso, orçamento, dúvida, etc.",
                    },
                    "proposal_value": {
                        "type": "number",
                        "description": "Valor de honorários mencionado (opcional)",
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
    client_id: uuid.UUID,
) -> str:
    """Execute a tool call and return the result as a string."""
    try:
        if tool_name == "check_availability":
            return await _check_availability(db, arguments)
        elif tool_name == "book_consultation":
            return await _book_consultation(db, client_id, arguments)
        elif tool_name == "cancel_consultation":
            return await _cancel_consultation(db, arguments)
        elif tool_name == "reschedule_consultation":
            return await _reschedule_consultation(db, arguments)
        elif tool_name == "get_client_consultations":
            return await _get_client_consultations(db, client_id)
        elif tool_name == "escalate_to_human":
            return await _escalate_to_human(db, client_id, arguments)
        elif tool_name == "create_lead":
            return await _create_lead(db, client_id, arguments)
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

    if args.get("lawyer_id"):
        slots = await get_available_slots(
            db, uuid.UUID(args["lawyer_id"]), date_from, date_to
        )
    elif args.get("practice_area_id"):
        slots = await get_available_slots_by_practice_area(
            db, uuid.UUID(args["practice_area_id"]), date_from, date_to
        )
    else:
        return json.dumps({"error": "Informe lawyer_id ou practice_area_id"})

    # Mantém starts_at em UTC (para o LLM copiar literalmente ao agendar).
    # Adiciona campo "display" em hora local para o LLM mostrar ao cliente.
    # NUNCA retornar starts_at em hora local com offset — o LLM reconverteria
    # para UTC e causaria dupla conversão.
    firm_tz = ZoneInfo(settings.FIRM_TIMEZONE)
    result_slots = []
    for slot in slots[:15]:
        start_utc = datetime.fromisoformat(slot["starts_at"])
        end_utc   = datetime.fromisoformat(slot["ends_at"])
        start_loc = start_utc.astimezone(firm_tz)
        end_loc   = end_utc.astimezone(firm_tz)
        entry: dict = {
            "starts_at": slot["starts_at"],                          # UTC — copiar exatamente
            "ends_at":   slot["ends_at"],                            # UTC
            "display":   start_loc.strftime("%d/%m/%Y %H:%M"),       # hora local para exibir
            "display_end": end_loc.strftime("%H:%M"),
        }
        if "lawyer_id"   in slot: entry["lawyer_id"]   = slot["lawyer_id"]
        if "lawyer_name" in slot: entry["lawyer_name"] = slot["lawyer_name"]
        result_slots.append(entry)

    return json.dumps({"available_slots": result_slots, "total": len(slots)})


async def _book_consultation(
    db: AsyncSession, client_id: uuid.UUID, args: dict
) -> str:
    lawyer_id = uuid.UUID(args["lawyer_id"])
    starts_at = _parse_datetime_aware(args["starts_at"])

    lawyer = await get_lawyer_by_id(db, lawyer_id)
    if not lawyer:
        return json.dumps({"error": "Advogado não encontrado"})

    ends_at = starts_at + timedelta(minutes=lawyer.slot_duration_minutes)

    # Se for remarcação, cancela a consulta anterior antes de criar a nova
    cancelled_old_id = None
    if args.get("replaces_consultation_id"):
        try:
            old_consultation = await get_consultation_by_id(db, uuid.UUID(args["replaces_consultation_id"]))
            if old_consultation and old_consultation.status not in ("cancelled",):
                await cancel_consultation(db, old_consultation)
                cancelled_old_id = str(old_consultation.id)
                logger.info("Consulta anterior %s cancelada na remarcação", cancelled_old_id)
        except Exception:
            logger.exception("Falha ao cancelar consulta anterior na remarcação")

    try:
        consultation = await create_consultation(
            db,
            client_id=client_id,
            lawyer_id=lawyer_id,
            starts_at=starts_at,
            ends_at=ends_at,
            practice_area_id=lawyer.practice_area_id,
            source="ai_chat",
            notes=args.get("client_notes"),
        )
        return json.dumps({
            "success": True,
            "consultation_id": str(consultation.id),
            "lawyer_name": lawyer.full_name,
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "cancelled_previous": cancelled_old_id,
        })
    except SlotNotAvailableError as e:
        return json.dumps({"error": str(e), "slot_unavailable": True})
    except Exception as e:
        return json.dumps({"error": f"Não foi possível agendar: {e}"})


async def _cancel_consultation(db: AsyncSession, args: dict) -> str:
    consultation_id = uuid.UUID(args["consultation_id"])
    consultation = await get_consultation_by_id(db, consultation_id)
    if not consultation:
        return json.dumps({"error": "Consulta não encontrada"})
    if consultation.status == "cancelled":
        return json.dumps({"error": "Consulta já foi cancelada"})

    await cancel_consultation(db, consultation)
    return json.dumps({"success": True, "message": "Consulta cancelada"})


async def _reschedule_consultation(db: AsyncSession, args: dict) -> str:
    consultation_id = uuid.UUID(args["consultation_id"])
    new_starts_at = _parse_datetime_aware(args["new_starts_at"])

    consultation = await get_consultation_by_id(db, consultation_id)
    if not consultation:
        return json.dumps({"error": "Consulta não encontrada"})

    lawyer = await get_lawyer_by_id(db, consultation.lawyer_id)
    new_ends_at = new_starts_at + timedelta(minutes=lawyer.slot_duration_minutes)

    await update_consultation(
        db, consultation, starts_at=new_starts_at, ends_at=new_ends_at
    )
    return json.dumps({
        "success": True,
        "new_starts_at": new_starts_at.isoformat(),
        "new_ends_at": new_ends_at.isoformat(),
    })


async def _get_client_consultations(db: AsyncSession, client_id: uuid.UUID) -> str:
    consultations = await get_consultations(db, client_id=client_id)
    active = [a for a in consultations if a.status not in ("cancelled",)]
    result = []
    for a in active[:10]:
        result.append({
            "consultation_id": str(a.id),
            "lawyer_name": a.lawyer.full_name if a.lawyer else "—",
            "practice_area": a.practice_area.name if a.practice_area else "—",
            "starts_at": a.starts_at.isoformat(),
            "ends_at": a.ends_at.isoformat(),
            "status": a.status,
        })
    return json.dumps({"consultations": result})


async def _escalate_to_human(
    db: AsyncSession, client_id: uuid.UUID, args: dict
) -> str:
    """Marca o cliente como escalonado, encerra sessão IA e notifica humano.

    Sempre tenta criar (ou atualizar) o lead para garantir registro no CRM,
    independente de o LLM ter chamado create_lead antes.
    """
    from app.modules.admin.models import SystemConfig
    from app.modules.ai.session import clear_session
    from app.modules.clients.models import Client
    from app.modules.messaging.gateway import send_message

    reason = args.get("reason", "Cliente solicitou atendimento humano")

    # Auto-cria lead ao escalar — garante registro mesmo que o LLM não tenha chamado create_lead
    try:
        lead_result = await _create_lead(db, client_id, {
            "description": f"Escalonado para atendimento humano. Motivo: {reason}",
        })
        lead_data = json.loads(lead_result)
        if lead_data.get("success") and not lead_data.get("already_existed"):
            logger.info("Lead auto-criado na escalação: %s", lead_data.get("lead_id"))
    except Exception:
        logger.exception("Falha ao criar lead automático na escalação para cliente %s", client_id)

    # 1. Marca o cliente — usamos client_status para indicar revisão humana
    client = await db.get(Client, client_id)
    if client:
        existing_notes = client.notes or ""
        prefix = "[ESCALONADO PARA HUMANO] "
        if not existing_notes.startswith(prefix):
            client.notes = f"{prefix}{reason}\n{existing_notes}".strip()
        await db.commit()

    # 2. Limpa sessão IA para que próximas mensagens não continuem o fluxo automatizado
    try:
        await clear_session(client_id)
    except Exception:
        logger.exception("Failed to clear AI session for client %s", client_id)

    # 3. Notifica via Telegram (se configurado)
    try:
        result = await db.execute(
            select(SystemConfig).where(SystemConfig.key == "notifications")
        )
        row = result.scalar_one_or_none()
        chat_id = (row.value or {}).get("escalation_telegram_chat_id") if row else ""
        if chat_id and client:
            name = client.full_name or client.phone
            text = (
                f"🆘 *Atendimento humano solicitado*\n\n"
                f"Cliente: {name}\n"
                f"Canal: {client.channel}\n"
                f"Motivo: {reason}"
            )
            await send_message("telegram", chat_id, text)
    except Exception:
        logger.exception("Failed to send escalation notification")

    return json.dumps({
        "escalated": True,
        "message": (
            "Conversa encaminhada para a equipe comercial. "
            f"Motivo: {reason}. "
            "Em breve alguém entrará em contato."
        ),
    })


async def _create_lead(
    db: AsyncSession, client_id: uuid.UUID, args: dict
) -> str:
    """Cria um lead no CRM a partir da conversa do chatbot."""
    from app.modules.admin.models import SystemConfig
    from app.modules.clients.models import Client
    from app.modules.leads.models import Lead

    now = datetime.now(timezone.utc)

    # Busca dados reais do cliente (telefone, canal)
    client = await db.get(Client, client_id)
    if not client:
        # Sessão de teste — sem cliente real no banco
        return json.dumps({
            "success": False,
            "message": (
                "Simulação: em produção criaria um lead com o telefone do cliente. "
                "Nenhum dado foi salvo nesta sessão de teste."
            ),
        })

    phone   = client.phone
    channel = client.channel or "outro"

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
    sla_hours = settings.FIRM_SLA_HOURS
    try:
        row = (await db.execute(
            select(SystemConfig).where(SystemConfig.key == "sla")
        )).scalar_one_or_none()
        if row and row.value:
            sla_hours = int(row.value.get("hours", sla_hours))
    except Exception:
        pass

    practice_area_id = None
    if args.get("practice_area_id"):
        try:
            practice_area_id = uuid.UUID(args["practice_area_id"])
        except ValueError:
            pass

    proposal_value = None
    if args.get("proposal_value"):
        try:
            proposal_value = float(args["proposal_value"])
        except (TypeError, ValueError):
            pass

    full_name = args.get("client_name") or client.full_name

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
        practice_area_id=practice_area_id,
        description=args.get("description"),
        proposal_value=proposal_value,
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    dispatch_proactive_on_status_change(lead, None, lead.status)

    logger.info("Lead criado via chatbot: %s (cliente %s)", lead.id, client_id)
    return json.dumps({
        "success": True,
        "lead_id": str(lead.id),
        "message": (
            "Lead registrado no CRM com sucesso. "
            "A equipe de vendas receberá para dar seguimento."
        ),
    })
