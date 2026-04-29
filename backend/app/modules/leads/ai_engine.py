"""Lead AI Engine — LLM-powered commercial agent for lead negotiation."""
import json
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.admin.models import Specialty, SystemConfig
from app.modules.ai.config_loader import load_ai_config
from app.modules.leads.models import Lead
from app.modules.leads.ai_models import LeadAgentConfig, LeadConversation, LeadMessage
from app.modules.leads.ai_tools import LEAD_TOOL_DEFINITIONS, execute_lead_tool

logger = logging.getLogger(__name__)

MAX_HISTORY = 30
DEFAULT_LEAD_PROMPT = """Você é um agente comercial virtual da clínica. Seu objetivo é transformar leads em clientes satisfeitos.

Suas responsabilidades:
1. Apresentar os serviços e valores da clínica de forma atrativa e honesta
2. Responder dúvidas sobre procedimentos, valores e condições de pagamento
3. Negociar e fechar consultas ou procedimentos
4. Atualizar o status do lead conforme o andamento da negociação
5. Registrar informações relevantes no histórico

Regras IMPORTANTES:
- Seja cordial, profissional e persuasivo sem ser agressivo
- Use get_pricing_table SEMPRE antes de informar qualquer valor ao cliente — NUNCA invente preços
- Se o cliente pedir desconto, parcelamento especial ou algo fora da tabela → use consult_supervisor
- Ao fechar negócio → use convert_to_patient
- Se o cliente definitivamente não tiver interesse → use mark_lost com motivo adequado
- Atualize o status com update_lead_status conforme avança a negociação
- Fale em português do Brasil com tom profissional e acolhedor
- Seja conciso — mensagens curtas funcionam melhor no WhatsApp

Regras de STATUS (atualizar durante a negociação):
- "em_contato": ao iniciar o contato
- "qualificado": ao confirmar interesse real
- "orcamento_enviado": ao enviar valores
- "negociando": em negociação ativa
- Use convert_to_patient ao fechar

Quando consultar o SUPERVISOR:
- Pedido de desconto ou condição especial
- Serviço não listado na tabela de preços
- Qualquer dúvida que precise de autorização da gestão
"""


def _get_client(ai_config: dict) -> AsyncOpenAI:
    if ai_config.get("use_local_llm"):
        url = ai_config.get("local_llm_url") or settings.LOCAL_LLM_BASE_URL
        if url:
            return AsyncOpenAI(base_url=url, api_key="not-needed")
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY or "missing")


def _get_model(ai_config: dict) -> str:
    if ai_config.get("use_local_llm"):
        return ai_config.get("local_llm_model") or settings.LOCAL_LLM_MODEL
    return ai_config.get("model") or settings.OPENAI_MODEL


async def get_or_create_lead_conversation(
    db: AsyncSession, lead: Lead, channel: str, channel_chat_id: str
) -> LeadConversation:
    """Return the existing conversation for this lead or create a new one."""
    result = await db.execute(
        select(LeadConversation).where(LeadConversation.lead_id == lead.id)
    )
    conversation = result.scalar_one_or_none()
    if conversation:
        return conversation

    conversation = LeadConversation(
        lead_id=lead.id,
        channel=channel,
        channel_chat_id=channel_chat_id,
        control="ai",
        status="active",
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


async def load_agent_config(db: AsyncSession, status: str) -> LeadAgentConfig | None:
    """Return the LeadAgentConfig for a given pipeline status if active."""
    result = await db.execute(
        select(LeadAgentConfig).where(
            LeadAgentConfig.status == status,
            LeadAgentConfig.is_active == True,  # noqa: E712
        )
    )
    return result.scalar_one_or_none()


async def _load_conversation_history(conversation: LeadConversation) -> list[dict]:
    """Build LLM message history from stored LeadMessages."""
    messages = [
        {"role": m.role, "content": m.content}
        for m in conversation.messages
        if m.role in ("user", "assistant")
    ]
    return messages[-MAX_HISTORY:]


async def _save_turn(
    db: AsyncSession,
    conversation: LeadConversation,
    user_text: str,
    assistant_text: str,
) -> None:
    now = datetime.now(timezone.utc)
    db.add(LeadMessage(conversation_id=conversation.id, role="user", content=user_text, sent_at=now))
    if assistant_text:
        db.add(LeadMessage(conversation_id=conversation.id, role="assistant", content=assistant_text, sent_at=now))
    conversation.last_message_at = now
    await db.commit()


def _build_system_prompt(
    agent_config: LeadAgentConfig | None,
    lead: Lead,
    clinic_name: str,
    clinic_timezone: str,
) -> str:
    tz = clinic_timezone or settings.CLINIC_TIMEZONE
    clinic_tz = ZoneInfo(tz)
    now_local = datetime.now(timezone.utc).astimezone(clinic_tz)
    now_str = now_local.strftime("%Y-%m-%d %H:%M") + f" ({tz})"

    specialty_name = lead.specialty.name if lead.specialty else "não informada"
    quote_str = f"R${lead.quote_value:.2f}" if lead.quote_value else "não informado"

    header = f"Você é o agente comercial virtual de {clinic_name or 'a clínica'}."
    context = (
        f"\nFuso horário: {tz}\n"
        f"Data/hora atual: {now_str}\n"
        f"\nLEAD ATUAL:\n"
        f"- Código: {lead.code}\n"
        f"- Nome: {lead.full_name or 'não informado'}\n"
        f"- Telefone: {lead.phone}\n"
        f"- Especialidade de interesse: {specialty_name}\n"
        f"- Descrição: {lead.description or 'não informada'}\n"
        f"- Valor em negociação: {quote_str}\n"
        f"- Status atual: {lead.status}\n"
    )

    custom = (agent_config.system_prompt or "").strip() if agent_config else ""
    instructions = custom or DEFAULT_LEAD_PROMPT

    tool_rules = """
---
REGRAS DE USO DAS FERRAMENTAS (obrigatórias):
- get_pricing_table → use ANTES de qualquer citação de valor. NUNCA invente preços.
- update_lead_status → atualize conforme o progresso (qualificado → orcamento_enviado → negociando)
- consult_supervisor → use para desconto, parcelamento especial, serviço fora da tabela
- convert_to_patient → ao fechar negócio confirmado pelo cliente
- mark_lost → ao confirmar definitivamente que o cliente não tem interesse
- escalate_to_human → último recurso quando nem a IA nem o supervisor conseguem resolver
"""
    return f"{header}{context}\n{instructions}\n{tool_rules}"


async def process_lead_message(
    db: AsyncSession,
    lead: Lead,
    conversation: LeadConversation,
    user_text: str,
) -> str:
    """Process an incoming lead message and return the AI response."""
    ai_config = await load_ai_config(db)

    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "clinic_info")
    )
    row = result.scalar_one_or_none()
    clinic_cfg = row.value if row and row.value else {}

    agent_config = await load_agent_config(db, lead.status)

    client = _get_client(ai_config)
    model = _get_model(ai_config)
    max_tool_calls = 5
    temperature = 0.3

    history = await _load_conversation_history(conversation)
    system_prompt = _build_system_prompt(
        agent_config,
        lead,
        clinic_name=clinic_cfg.get("name", ""),
        clinic_timezone=clinic_cfg.get("timezone", settings.CLINIC_TIMEZONE),
    )

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_text})

    tool_calls_count = 0
    response_text = ""
    # Track if consult_supervisor was called — the awaiting message is already stored in the tool result
    supervisor_message: str | None = None

    try:
        while tool_calls_count <= max_tool_calls:
            completion = await client.chat.completions.create(
                model=model,
                messages=messages,
                tools=LEAD_TOOL_DEFINITIONS,
                tool_choice="auto",
                temperature=temperature,
                max_tokens=800,
            )

            choice = completion.choices[0]
            assistant_message = choice.message

            if assistant_message.tool_calls:
                messages.append({
                    "role": "assistant",
                    "content": assistant_message.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in assistant_message.tool_calls
                    ],
                })

                for tc in assistant_message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}

                    logger.info("Lead tool call: %s(%s) lead=%s", tool_name, args, lead.id)

                    # Refresh lead/conversation before tool execution so tools see current state
                    await db.refresh(lead)
                    await db.refresh(conversation)

                    result_str = await execute_lead_tool(tool_name, args, db, lead, conversation)

                    # If supervisor was consulted, capture the awaiting message
                    if tool_name == "consult_supervisor":
                        try:
                            result_data = json.loads(result_str)
                            if result_data.get("awaiting_supervisor") or result_data.get("already_pending"):
                                supervisor_message = result_data.get("message", "")
                        except Exception:
                            pass

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result_str,
                    })

                tool_calls_count += 1
            else:
                response_text = assistant_message.content or ""
                break
        else:
            response_text = (
                "Preciso verificar algumas informações. "
                "Um de nossos atendentes entrará em contato em breve!"
            )
    except Exception:
        logger.exception("LLM API error for lead %s", lead.id)
        return "Desculpe, tive uma dificuldade técnica. Tente novamente em alguns instantes."

    # If supervisor was consulted, the response IS the awaiting message (not LLM text)
    if supervisor_message is not None:
        await _save_turn(db, conversation, user_text, supervisor_message)
        return supervisor_message

    await _save_turn(db, conversation, user_text, response_text)
    return response_text


async def resume_after_supervisor(
    db: AsyncSession,
    lead: Lead,
    conversation: LeadConversation,
    supervisor_answer: str,
) -> str:
    """Continue the lead conversation after the supervisor has replied."""
    ai_config = await load_ai_config(db)
    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "clinic_info")
    )
    row = result.scalar_one_or_none()
    clinic_cfg = row.value if row and row.value else {}

    agent_config = await load_agent_config(db, lead.status)
    client = _get_client(ai_config)
    model = _get_model(ai_config)

    history = await _load_conversation_history(conversation)
    system_prompt = _build_system_prompt(
        agent_config,
        lead,
        clinic_name=clinic_cfg.get("name", ""),
        clinic_timezone=clinic_cfg.get("timezone", settings.CLINIC_TIMEZONE),
    )

    # Inject supervisor answer as a system note
    supervisor_context = (
        f"[SISTEMA] O supervisor autorizou/respondeu: {supervisor_answer}\n"
        "Continue a conversa com o cliente usando essa informação."
    )

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "system", "content": supervisor_context})

    try:
        completion = await client.chat.completions.create(
            model=model,
            messages=messages,
            tools=LEAD_TOOL_DEFINITIONS,
            tool_choice="auto",
            temperature=0.3,
            max_tokens=800,
        )
        choice = completion.choices[0]
        # Simple single-turn after supervisor (tool calls allowed but not looped)
        if choice.message.tool_calls:
            # Execute single tool if needed and get final response
            tc = choice.message.tool_calls[0]
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}
            await execute_lead_tool(tc.function.name, args, db, lead, conversation)
            # Ask LLM for the final message without tools
            messages.append({
                "role": "assistant",
                "content": "",
                "tool_calls": [{
                    "id": tc.id, "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }],
            })
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": "done"})
            followup = await client.chat.completions.create(
                model=model, messages=messages, temperature=0.3, max_tokens=800
            )
            response_text = followup.choices[0].message.content or ""
        else:
            response_text = choice.message.content or ""
    except Exception:
        logger.exception("LLM error resuming after supervisor for lead %s", lead.id)
        response_text = "Já tenho a informação do supervisor! Vamos continuar nossa conversa."

    # Save assistant turn
    now = datetime.now(timezone.utc)
    db.add(LeadMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=response_text,
        sent_at=now,
    ))
    conversation.last_message_at = now
    await db.commit()

    return response_text


async def send_proactive_message(
    db: AsyncSession,
    lead: Lead,
    agent_config: LeadAgentConfig,
) -> bool:
    """Send the configured initial message to the lead and create the conversation."""
    if not agent_config.initial_message:
        return False

    channel = lead.channel if lead.channel in ("whatsapp", "telegram") else "whatsapp"
    conversation = await get_or_create_lead_conversation(db, lead, channel, lead.phone)

    from app.modules.messaging.gateway import send_message
    ok = await send_message(channel, lead.phone, agent_config.initial_message)
    if ok:
        now = datetime.now(timezone.utc)
        db.add(LeadMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=agent_config.initial_message,
            sent_at=now,
        ))
        conversation.last_message_at = now
        await db.commit()

        # Mark lead as AI-handled and move to em_contato if still in novo
        lead.ai_active = True
        if lead.status == "novo":
            lead.status = "em_contato"
            if lead.contacted_at is None:
                lead.contacted_at = now
        await db.commit()
    return ok
