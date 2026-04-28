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

logger = logging.getLogger(__name__)

LEAD_TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_lead_info",
            "description": "Retorna informações completas do lead atual (nome, especialidade, histórico, status).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pricing_table",
            "description": (
                "Retorna a tabela de preços configurada para as especialidades da clínica. "
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
                            "orcamento_enviado, negociando"
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
            "name": "convert_to_patient",
            "description": (
                "Converte o lead em paciente (fecha a venda). "
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
                            "Motivo da perda. Valores: sem_resposta, preco, ja_atendido, "
                            "fora_de_perfil, sem_disponibilidade, mudou_de_ideia, outro"
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
]


async def execute_lead_tool(
    tool_name: str,
    arguments: dict,
    db: AsyncSession,
    lead: Lead,
    conversation: LeadConversation,
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
        elif tool_name == "convert_to_patient":
            return await _convert_to_patient(db, lead, conversation, arguments)
        elif tool_name == "mark_lost":
            return await _mark_lost(db, lead, conversation, arguments)
        elif tool_name == "consult_supervisor":
            return await _consult_supervisor(db, lead, conversation, arguments)
        elif tool_name == "escalate_to_human":
            return await _escalate_to_human(db, lead, conversation, arguments)
        else:
            return json.dumps({"error": f"Tool desconhecida: {tool_name}"})
    except Exception as e:
        logger.exception("Lead tool execution error: %s args=%s", tool_name, arguments)
        return json.dumps({"error": str(e)})


async def _get_lead_info(lead: Lead) -> str:
    specialty_name = lead.specialty.name if lead.specialty else None
    return json.dumps({
        "code": lead.code,
        "full_name": lead.full_name,
        "phone": lead.phone,
        "email": lead.email,
        "channel": lead.channel,
        "specialty": specialty_name,
        "description": lead.description,
        "quote_value": float(lead.quote_value) if lead.quote_value else None,
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
        "notes": "Tabela de preços não configurada. Consulte o administrador.",
    })


async def _update_lead_status(db: AsyncSession, lead: Lead, args: dict) -> str:
    to_status = args.get("to_status", "")
    note = args.get("note")

    if to_status == "convertido":
        return json.dumps({
            "error": "Para converter use a ferramenta convert_to_patient"
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


async def _convert_to_patient(
    db: AsyncSession, lead: Lead, conversation: LeadConversation, args: dict
) -> str:
    from app.modules.crm.service import get_patient_by_phone, create_patient

    patient = await get_patient_by_phone(db, lead.phone)
    if not patient:
        channel = lead.channel if lead.channel in ("telegram", "whatsapp") else "whatsapp"
        patient = await create_patient(
            db,
            phone=lead.phone,
            full_name=lead.full_name,
            email=lead.email,
            channel=channel,
        )

    now = datetime.now(timezone.utc)
    lead.status = "convertido"
    lead.converted_patient_id = patient.id
    lead.converted_at = now
    if lead.contacted_at is None:
        lead.contacted_at = now

    notes = args.get("notes", "")
    interaction = LeadInteraction(
        lead_id=lead.id,
        type="nota",
        content=f"[IA] Lead convertido em paciente. {notes}".strip(),
    )
    db.add(interaction)

    conversation.status = "closed"
    conversation.closed_at = now
    await db.commit()

    return json.dumps({
        "success": True,
        "patient_id": str(patient.id),
        "message": "Ótimo! Cadastro realizado. Em breve nossa equipe entrará em contato para agendar.",
    })


async def _mark_lost(
    db: AsyncSession, lead: Lead, conversation: LeadConversation, args: dict
) -> str:
    lost_reason = args.get("lost_reason", "outro")
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
    specialty_name = lead.specialty.name if lead.specialty else "não informada"
    quote_str = f"R${float(lead.quote_value):.2f}" if lead.quote_value else "não informado"
    supervisor_text = (
        f"❓ *Consulta do Agente Comercial*\n\n"
        f"*Lead:* {lead.code} — {lead.full_name or 'sem nome'}\n"
        f"*Canal:* {lead.channel}\n"
        f"*Especialidade:* {specialty_name}\n"
        f"*Valor em negociação:* {quote_str}\n\n"
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
