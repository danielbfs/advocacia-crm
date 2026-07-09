"""Lead AI Agent function-calling tools."""
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.leads.models import Lead, LeadInteraction
from app.modules.leads.ai_models import LeadConversation, SupervisorQuery
from app.modules.leads.pipeline import validate_transition, InvalidTransitionError, STATUS_LABELS
from app.modules.leads.service import dispatch_proactive_on_status_change

logger = logging.getLogger(__name__)

LEAD_TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_lead_info",
            "description": "Retorna informações completas do lead atual (nome, área de atuação, histórico, status).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pricing_table",
            "description": (
                "Retorna a tabela de honorários configurada para as áreas de atuação do escritório. "
                "Use SEMPRE antes de informar valores ao cliente."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_lead_status",
            "description": (
                "Move o lead para outro status do pipeline. "
                "Use para registrar o avanço da negociação."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "to_status": {
                        "type": "string",
                        "description": (
                            "Novo status. Valores: em_contato, qualificado, "
                            "proposta_enviada, negociando"
                        ),
                    },
                    "note": {
                        "type": "string",
                        "description": "Nota sobre o motivo da mudança (opcional)",
                    },
                },
                "required": ["to_status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_interaction",
            "description": "Registra uma nota no histórico do lead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "Conteúdo da nota a registrar",
                    },
                },
                "required": ["content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_followup",
            "description": "Agenda o próximo contato com o lead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hours_from_now": {
                        "type": "integer",
                        "description": "Em quantas horas fazer o próximo contato",
                    },
                },
                "required": ["hours_from_now"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "convert_to_client",
            "description": (
                "Converte o lead em cliente (fecha a venda). "
                "Use quando o cliente confirmar interesse em iniciar o atendimento."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "notes": {
                        "type": "string",
                        "description": "Observações sobre a conversão (opcional)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mark_lost",
            "description": "Marca o lead como perdido quando o cliente definitivamente não tem interesse.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lost_reason": {
                        "type": "string",
                        "description": (
                            "Motivo da perda. Valores: sem_resposta, honorarios, ja_tem_advogado, "
                            "fora_de_area, sem_viabilidade, mudou_de_ideia, outro"
                        ),
                    },
                },
                "required": ["lost_reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "consult_supervisor",
            "description": (
                "Envia uma pergunta ao supervisor via WhatsApp quando a IA não tem autorização "
                "para responder: pedidos de desconto, parcelamento especial, serviços fora da "
                "tabela ou qualquer situação que exija aprovação. "
                "A conversa com o cliente é pausada até o supervisor responder."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "Pergunta objetiva para o supervisor",
                    },
                    "context_summary": {
                        "type": "string",
                        "description": "Breve resumo do contexto da negociação",
                    },
                },
                "required": ["question", "context_summary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "escalate_to_human",
            "description": (
                "Transfere a conversa definitivamente para um atendente humano. "
                "Use apenas quando a IA não conseguir resolver mesmo com suporte do supervisor."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Motivo da escalada",
                    },
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_lawyers",
            "description": "Lista os advogados/áreas de atuação disponíveis no escritório. Use antes de book_consultation.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_available_slots",
            "description": (
                "Lista os horários disponíveis de um advogado para agendamento. "
                "Use antes de book_consultation para mostrar opções ao cliente."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "lawyer_id": {
                        "type": "string",
                        "description": "UUID do advogado",
                    },
                    "date": {
                        "type": "string",
                        "description": "Data para verificar (YYYY-MM-DD). Se omitida, retorna próximos dias.",
                    },
                },
                "required": ["lawyer_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_consultation",
            "description": (
                "Agenda uma consulta para o lead no escritório. "
                "Use SOMENTE após o lead confirmar data/hora. "
                "Se a configuração 'converter ao agendar' estiver ativa, "
                "o lead será automaticamente convertido em cliente."
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
                        "description": "Data/hora da consulta em ISO 8601 (ex: 2026-05-10T14:00:00)",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Observações (opcional)",
                    },
                },
                "required": ["lawyer_id", "starts_at"],
            },
        },
    },
]


async def execute_lead_tool(
    tool_name: str,
    arguments: dict,
    db: AsyncSession,
    lead: Lead,
    conversation: LeadConversation,
    agent_config=None,
) -> str:
    """Execute a lead tool call and return the result as a JSON string."""
    try:
        if tool_name == "get_lead_info":
            return await _get_lead_info(lead)
        elif tool_name == "get_pricing_table":
            return await _get_pricing_table(db)
        elif tool_name == "update_lead_status":
            return await _update_lead_status(db, lead, arguments)
        elif tool_name == "add_interaction":
            return await _add_interaction(db, lead, arguments)
        elif tool_name == "schedule_followup":
            return await _schedule_followup(db, lead, arguments)
        elif tool_name == "convert_to_client":
            return await _convert_to_client(db, lead, conversation, arguments)
        elif tool_name == "mark_lost":
            return await _mark_lost(db, lead, conversation, arguments)
        elif tool_name == "consult_supervisor":
            return await _consult_supervisor(db, lead, conversation, arguments)
        elif tool_name == "escalate_to_human":
            return await _escalate_to_human(db, lead, conversation, arguments)
        elif tool_name == "list_lawyers":
            return await _list_lawyers(db)
        elif tool_name == "list_available_slots":
            return await _list_available_slots(db, arguments)
        elif tool_name == "book_consultation":
            return await _book_consultation(db, lead, conversation, arguments, agent_config)
        else:
            return json.dumps({"error": f"Tool desconhecida: {tool_name}"})
    except Exception as e:
        logger.exception("Lead tool execution error: %s args=%s", tool_name, arguments)
        return json.dumps({"error": str(e)})



async def _get_lead_info(lead: Lead) -> str:
    practice_area_name = lead.practice_area.name if lead.practice_area else None
    return json.dumps({
        "code": lead.code,
        "full_name": lead.full_name,
        "phone": lead.phone,
        "email": lead.email,
        "channel": lead.channel,
        "practice_area": practice_area_name,
        "description": lead.description,
        "proposal_value": float(lead.proposal_value) if lead.proposal_value else None,
        "status": lead.status,
        "status_label": STATUS_LABELS.get(lead.status, lead.status),
        "created_at": lead.created_at.isoformat(),
    })


async def _get_pricing_table(db: AsyncSession) -> str:
    from app.modules.admin.models import SystemConfig
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_pricing")
    )
    row = result.scalar_one_or_none()
    if row and row.value:
        return json.dumps(row.value)
    return json.dumps({
        "items": [],
        "notes": "Tabela de honorários não configurada. Consulte o administrador.",
    })


async def _update_lead_status(db: AsyncSession, lead: Lead, args: dict) -> str:
    to_status = args.get("to_status", "")
    note = args.get("note")

    if to_status == "convertido":
        return json.dumps({
            "error": "Para converter use a ferramenta convert_to_client"
        })
    if to_status == "perdido":
        return json.dumps({
            "error": "Para marcar como perdido use a ferramenta mark_lost"
        })

    try:
        validate_transition(lead.status, to_status)
    except InvalidTransitionError as e:
        return json.dumps({"error": str(e)})

    from_status = lead.status
    lead.status = to_status
    if to_status not in {"novo", "perdido"} and lead.contacted_at is None:
        lead.contacted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(lead)
    dispatch_proactive_on_status_change(lead, from_status, lead.status)

    label_from = STATUS_LABELS.get(from_status, from_status)
    label_to = STATUS_LABELS.get(to_status, to_status)
    parts = [f"[IA] Status: {label_from} → {label_to}"]
    if note:
        parts.append(note)
    interaction = LeadInteraction(
        lead_id=lead.id,
        type="nota",
        content=" — ".join(parts),
    )
    db.add(interaction)
    await db.commit()

    return json.dumps({"success": True, "new_status": to_status})


async def _add_interaction(db: AsyncSession, lead: Lead, args: dict) -> str:
    content = args.get("content", "")
    interaction = LeadInteraction(
        lead_id=lead.id,
        type="nota",
        content=f"[IA] {content}",
    )
    db.add(interaction)
    await db.commit()
    return json.dumps({"success": True})


async def _schedule_followup(db: AsyncSession, lead: Lead, args: dict) -> str:
    hours = int(args.get("hours_from_now", 24))
    lead.next_followup_at = datetime.now(timezone.utc) + timedelta(hours=hours)
    await db.commit()
    return json.dumps({"success": True, "scheduled_at": lead.next_followup_at.isoformat()})


async def _convert_to_client(
    db: AsyncSession, lead: Lead, conversation: LeadConversation, args: dict
) -> str:
    from app.modules.clients.service import get_client_by_phone, create_client

    client = await get_client_by_phone(db, lead.phone)
    if not client:
        channel = lead.channel if lead.channel in ("telegram", "whatsapp") else "whatsapp"
        client = await create_client(
            db,
            phone=lead.phone,
            full_name=lead.full_name,
            email=lead.email,
            channel=channel,
        )

    now = datetime.now(timezone.utc)
    from_status = lead.status
    lead.status = "convertido"
    lead.converted_client_id = client.id
    lead.converted_at = now
    if lead.contacted_at is None:
        lead.contacted_at = now

    notes = args.get("notes", "")
    interaction = LeadInteraction(
        lead_id=lead.id,
        type="nota",
        content=f"[IA] Lead convertido em cliente. {notes}".strip(),
    )
    db.add(interaction)

    conversation.status = "closed"
    conversation.closed_at = now
    await db.commit()
    dispatch_proactive_on_status_change(lead, from_status, lead.status)

    return json.dumps({
        "success": True,
        "client_id": str(client.id),
        "message": "Ótimo! Cadastro realizado. Em breve nossa equipe entrará em contato para agendar.",
    })


async def _mark_lost(
    db: AsyncSession, lead: Lead, conversation: LeadConversation, args: dict
) -> str:
    lost_reason = args.get("lost_reason", "outro")
    from_status = lead.status
    lead.status = "perdido"
    lead.lost_reason = lost_reason

    interaction = LeadInteraction(
        lead_id=lead.id,
        type="nota",
        content=f"[IA] Lead perdido. Motivo: {lost_reason}",
    )
    db.add(interaction)

    conversation.status = "closed"
    conversation.closed_at = datetime.now(timezone.utc)
    await db.commit()
    dispatch_proactive_on_status_change(lead, from_status, lead.status)

    return json.dumps({"success": True, "lost_reason": lost_reason})


async def _consult_supervisor(
    db: AsyncSession, lead: Lead, conversation: LeadConversation, args: dict
) -> str:
    from app.modules.admin.models import SystemConfig
    from app.modules.messaging.gateway import gateway

    question = args.get("question", "")
    context_summary = args.get("context_summary", "")

    # Load supervisor config
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_agent_supervisor")
    )
    row = result.scalar_one_or_none()
    supervisor_config = row.value if row and row.value else {}
    supervisor_phone = supervisor_config.get("supervisor_whatsapp", "")
    awaiting_message = supervisor_config.get(
        "awaiting_message",
        "Vou verificar com nosso supervisor e retorno em breve! ✅",
    )

    if not supervisor_phone:
        return json.dumps({
            "error": "Supervisor WhatsApp não configurado. Use escalate_to_human."
        })

    # Check for existing pending query for this lead
    existing = next(
        (q for q in conversation.supervisor_queries if q.status == "pending"),
        None,
    )
    if existing:
        return json.dumps({
            "already_pending": True,
            "message": awaiting_message,
        })

    # Build supervisor message
    practice_area_name = lead.practice_area.name if lead.practice_area else "não informada"
    proposal_str = f"R${float(lead.proposal_value):.2f}" if lead.proposal_value else "não informado"
    supervisor_text = (
        f"❓ *Consulta do Agente Comercial*\n\n"
        f"*Lead:* {lead.code} — {lead.full_name or 'sem nome'}\n"
        f"*Canal:* {lead.channel}\n"
        f"*Área de atuação:* {practice_area_name}\n"
        f"*Valor em negociação:* {proposal_str}\n\n"
        f"*Contexto:*\n{context_summary}\n\n"
        f"*Pergunta:*\n{question}\n\n"
        f"_Responda esta mensagem diretamente (use Reply ↩️) para que eu repasse ao cliente._"
    )

    ok, msg_id = await gateway.send_message_tracked("whatsapp", supervisor_phone, supervisor_text)
    if not ok:
        return json.dumps({"error": "Falha ao contatar supervisor. Use escalate_to_human."})

    # Save the query
    query = SupervisorQuery(
        lead_id=lead.id,
        conversation_id=conversation.id,
        question=question,
        context_summary=context_summary,
        status="pending",
        whatsapp_message_id=msg_id,
        supervisor_chat_id=supervisor_phone,
    )
    db.add(query)

    # Pause the conversation
    conversation.control = "awaiting_supervisor"
    await db.commit()

    return json.dumps({
        "success": True,
        "awaiting_supervisor": True,
        "message": awaiting_message,
    })


async def _escalate_to_human(
    db: AsyncSession, lead: Lead, conversation: LeadConversation, args: dict
) -> str:
    from app.modules.admin.models import SystemConfig
    from app.modules.messaging.gateway import send_message

    reason = args.get("reason", "Atendimento humano solicitado")

    conversation.control = "human"
    interaction = LeadInteraction(
        lead_id=lead.id,
        type="nota",
        content=f"[IA] Escalonado para atendente humano. Motivo: {reason}",
    )
    db.add(interaction)
    await db.commit()

    # Notify via Telegram if configured
    try:
        result = await db.execute(
            select(SystemConfig).where(SystemConfig.key == "notifications")
        )
        row = result.scalar_one_or_none()
        chat_id = (row.value or {}).get("escalation_telegram_chat_id") if row else ""
        if chat_id:
            text = (
                f"🆘 *Lead precisa de atendimento humano*\n\n"
                f"Lead: {lead.code} — {lead.full_name or lead.phone}\n"
                f"Canal: {lead.channel}\n"
                f"Motivo: {reason}"
            )
            await send_message("telegram", chat_id, text)
    except Exception:
        logger.exception("Failed to send lead escalation notification")

    return json.dumps({
        "escalated": True,
        "message": (
            "Vou chamar nossa equipe para te atender. "
            "Em breve um de nossos atendentes entrará em contato!"
        ),
    })


async def _list_lawyers(db: AsyncSession) -> str:
    """Return all active lawyers with their practice areas."""
    from app.modules.scheduling.models import Lawyer
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Lawyer)
        .options(selectinload(Lawyer.practice_area))
        .where(Lawyer.is_active == True)  # noqa: E712
        .order_by(Lawyer.full_name)
    )
    lawyers = result.scalars().all()

    return json.dumps([
        {
            "id": str(l.id),
            "full_name": l.full_name,
            "oab": l.oab,
            "practice_area": l.practice_area.name if l.practice_area else None,
            "slot_duration_minutes": l.slot_duration_minutes,
        }
        for l in lawyers
    ])


async def _list_available_slots(db: AsyncSession, args: dict) -> str:
    """Return available time slots for a lawyer."""
    from app.modules.scheduling.service import get_available_slots
    from datetime import date as date_type

    lawyer_id_str = args.get("lawyer_id", "")
    date_str = args.get("date")

    try:
        lawyer_id = uuid.UUID(lawyer_id_str)
    except ValueError:
        return json.dumps({"error": "lawyer_id inválido"})

    now = datetime.now(timezone.utc)

    if date_str:
        try:
            target_date = date_type.fromisoformat(date_str)
            date_from = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
            date_to = datetime.combine(target_date, datetime.max.time(), tzinfo=timezone.utc)
        except ValueError:
            return json.dumps({"error": "Formato de data inválido. Use YYYY-MM-DD"})
    else:
        # Next 7 days
        date_from = now
        date_to = now + timedelta(days=7)

    try:
        slots = await get_available_slots(db, lawyer_id, date_from, date_to)
        # Limit to 20 slots to avoid huge responses
        return json.dumps({"slots": slots[:20], "total": len(slots)})
    except Exception as e:
        logger.exception("Error fetching slots for lawyer %s", lawyer_id_str)
        return json.dumps({"error": str(e)})



async def _book_consultation(
    db: AsyncSession,
    lead: Lead,
    conversation: LeadConversation,
    args: dict,
    agent_config=None,
) -> str:
    """
    Book a consultation for the lead and optionally convert them to a client.
    If agent_config.convert_on_consultation is True (default), the lead is
    automatically converted to 'convertido' status after a successful booking.
    """
    from app.modules.scheduling.models import Lawyer, Consultation
    from app.modules.admin.models import SystemConfig
    from app.modules.clients.service import get_client_by_phone, create_client

    lawyer_id_str = args.get("lawyer_id", "")
    starts_at_str = args.get("starts_at", "")
    notes = args.get("notes", "")

    try:
        lawyer_id = uuid.UUID(lawyer_id_str)
    except ValueError:
        return json.dumps({"error": "lawyer_id inválido"})

    try:
        # Parse ISO 8601 — accept with or without timezone
        starts_at = datetime.fromisoformat(starts_at_str)
        if starts_at.tzinfo is None:
            starts_at = starts_at.replace(tzinfo=timezone.utc)
    except ValueError:
        return json.dumps({"error": "Formato de data/hora inválido. Use ISO 8601 (ex: 2026-05-10T14:00:00)"})

    # Load lawyer
    lawyer = await db.get(Lawyer, lawyer_id)
    if not lawyer:
        return json.dumps({"error": "Advogado não encontrado"})

    ends_at = starts_at + timedelta(minutes=lawyer.slot_duration_minutes or 30)

    # Ensure client exists
    clean_phone = lead.phone
    for prefix in ("whatsapp:", "telegram:"):
        if clean_phone.startswith(prefix):
            clean_phone = clean_phone[len(prefix):]

    client = await get_client_by_phone(db, clean_phone)
    if not client:
        channel = lead.channel if lead.channel in ("telegram", "whatsapp") else "whatsapp"
        client = await create_client(
            db,
            phone=clean_phone,
            full_name=lead.full_name,
            email=lead.email,
            channel=channel,
        )

    # Create consultation
    consultation = Consultation(
        client_id=client.id,
        lawyer_id=lawyer.id,
        practice_area_id=lawyer.practice_area_id,
        starts_at=starts_at,
        ends_at=ends_at,
        status="agendado",
        source="ia_comercial",
        notes=f"[IA Comercial] {notes}".strip() if notes else "[IA Comercial] Agendado pelo atendente IA",
        created_by_user=None,
    )
    db.add(consultation)
    await db.flush()  # get consultation.id before commit

    # Log interaction
    db.add(LeadInteraction(
        lead_id=lead.id,
        type="nota",
        content=(
            f"[IA] Consulta agendada com Dr(a). {lawyer.full_name} "
            f"em {starts_at.strftime('%d/%m/%Y às %H:%M')}."
        ),
    ))

    # Auto-convert is a global IA Comercial setting (not per-status).
    should_convert = True
    cfg_result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_ai_global")
    )
    cfg_row = cfg_result.scalar_one_or_none()
    if cfg_row and cfg_row.value:
        should_convert = bool(cfg_row.value.get("convert_on_consultation", True))

    if should_convert:
        now = datetime.now(timezone.utc)
        from_status = lead.status
        lead.status = "convertido"
        lead.converted_client_id = client.id
        lead.converted_at = now
        lead.consultation_id = consultation.id
        if lead.contacted_at is None:
            lead.contacted_at = now

        conversation.status = "closed"
        conversation.closed_at = now

        db.add(LeadInteraction(
            lead_id=lead.id,
            type="nota",
            content="[IA] Lead convertido automaticamente após agendamento de consulta.",
        ))

    await db.commit()
    if should_convert:
        dispatch_proactive_on_status_change(lead, from_status, lead.status)

    practice_area_name = lawyer.practice_area.name if lawyer.practice_area else "consulta"
    date_fmt = starts_at.strftime("%d/%m/%Y às %H:%M")

    return json.dumps({
        "success": True,
        "consultation_id": str(consultation.id),
        "lawyer": lawyer.full_name,
        "practice_area": practice_area_name,
        "starts_at": date_fmt,
        "lead_converted": should_convert,
        "message": (
            f"Consulta agendada com sucesso! ✅\n"
            f"📅 {date_fmt}\n"
            f"⚖️ Dr(a). {lawyer.full_name} — {practice_area_name}\n"
            f"{'Você já está cadastrado(a) como cliente!' if should_convert else ''}"
        ).strip(),
    })
