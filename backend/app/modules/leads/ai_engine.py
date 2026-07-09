"""Lead AI Engine — LLM-powered commercial agent for lead negotiation."""
import json
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.admin.models import PracticeArea, SystemConfig
from app.modules.ai.config_loader import load_ai_config
from app.modules.leads.models import Lead, LeadInteraction
from app.modules.leads.ai_models import LeadAgentConfig, LeadConversation, LeadMessage
from app.modules.leads.ai_tools import LEAD_TOOL_DEFINITIONS, execute_lead_tool

logger = logging.getLogger(__name__)

MAX_HISTORY = 30
MAX_INTERACTIONS_CONTEXT = 12
DEFAULT_LEAD_PROMPT = """Você é um agente comercial virtual do escritório de advocacia. Seu objetivo é transformar leads em clientes satisfeitos.

Suas responsabilidades:
1. Apresentar os serviços e áreas de atuação do escritório de forma atrativa e honesta
2. Responder dúvidas sobre honorários e condições de pagamento (sem dar aconselhamento jurídico)
3. Negociar e fechar a contratação da consulta jurídica
4. Atualizar o status do lead conforme o andamento da negociação
5. Registrar informações relevantes no histórico

Regras IMPORTANTES:
- Seja cordial, profissional e persuasivo sem ser agressivo
- Use get_pricing_table SEMPRE antes de informar qualquer valor ao cliente — NUNCA invente honorários
- NUNCA opine sobre o mérito ou a viabilidade do caso — direcione sempre para a consulta com o advogado
- Se o cliente pedir desconto, parcelamento especial ou algo fora da tabela → use consult_supervisor
- Ao fechar negócio → use convert_to_client
- Se o cliente definitivamente não tiver interesse → use mark_lost com motivo adequado
- Atualize o status com update_lead_status conforme avança a negociação
- Fale em português do Brasil com tom profissional e acolhedor
- Seja conciso — mensagens curtas funcionam melhor no WhatsApp

Regras de STATUS (atualizar durante a negociação):
- "em_contato": ao iniciar o contato
- "qualificado": ao confirmar interesse real
- "proposta_enviada": ao enviar valores
- "negociando": em negociação ativa
- Use convert_to_client ao fechar

Quando consultar o SUPERVISOR:
- Pedido de desconto ou condição especial
- Serviço não listado na tabela de honorários
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
    firm_name: str,
    firm_timezone: str,
    pricing_table: dict | None = None,
    interactions_context: str | None = None,
) -> str:
    tz = firm_timezone or settings.FIRM_TIMEZONE
    firm_tz = ZoneInfo(tz)
    now_local = datetime.now(timezone.utc).astimezone(firm_tz)
    now_str = now_local.strftime("%Y-%m-%d %H:%M") + f" ({tz})"

    practice_area_name = lead.practice_area.name if lead.practice_area else "não informada"
    proposal_str = f"R${lead.proposal_value:.2f}" if lead.proposal_value else "não informado"

    header = f"Você é o agente comercial virtual de {firm_name or 'o escritório'}."
    context = (
        f"\nFuso horário: {tz}\n"
        f"Data/hora atual: {now_str}\n"
        f"\nLEAD ATUAL:\n"
        f"- Código: {lead.code}\n"
        f"- Nome: {lead.full_name or 'não informado'}\n"
        f"- Telefone: {lead.phone}\n"
        f"- Área de atuação de interesse: {practice_area_name}\n"
        f"- Descrição: {lead.description or 'não informada'}\n"
        f"- Valor em negociação: {proposal_str}\n"
        f"- Status atual: {lead.status}\n"
    )

    custom = (agent_config.system_prompt or "").strip() if agent_config else ""
    instructions = custom or DEFAULT_LEAD_PROMPT

    pricing_context = ""
    if pricing_table and pricing_table.get("items"):
        items_str = "\n".join([
            f"- {item['practice_area']} ({item['service']}): R${item['price']:.2f} {item.get('notes', '')}"
            for item in pricing_table["items"]
        ])
        pricing_context = f"\nTABELA DE HONORÁRIOS ATUAL:\n{items_str}\n"
        if pricing_table.get("notes"):
            pricing_context += f"Notas: {pricing_table['notes']}\n"

    interactions_block = ""
    if interactions_context:
        interactions_block = (
            "\nHISTÓRICO DO QUE JÁ FOI TRATADO COM ESTE LEAD:\n"
            f"{interactions_context}\n"
            "Use isso para NÃO repetir perguntas ou propostas já feitas e manter continuidade.\n"
        )

    tool_rules = """
---
REGRAS DE USO DAS FERRAMENTAS (obrigatórias):
- get_pricing_table → use para confirmar se há atualizações na tabela.
- update_lead_status → atualize conforme o progresso (qualificado → proposta_enviada → negociando)
- consult_supervisor → use para desconto, parcelamento especial, serviço fora da tabela
- convert_to_client → ao fechar negócio confirmado pelo cliente
- mark_lost → ao confirmar definitivamente que o cliente não tem interesse
- escalate_to_human → último recurso quando nem a IA nem o supervisor conseguem resolver
"""
    return f"{header}{context}{pricing_context}{interactions_block}\n{instructions}\n{tool_rules}"


async def _load_lead_interactions_context(db: AsyncSession, lead_id) -> str:
    """Build a concise text context from the most recent lead interactions."""
    result = await db.execute(
        select(LeadInteraction)
        .where(LeadInteraction.lead_id == lead_id)
        .order_by(LeadInteraction.interacted_at.desc())
        .limit(MAX_INTERACTIONS_CONTEXT)
    )
    interactions = list(result.scalars().all())
    if not interactions:
        return ""

    lines: list[str] = []
    for i in reversed(interactions):
        when = i.interacted_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        note = (i.content or "").strip().replace("\n", " ")
        if len(note) > 280:
            note = note[:277] + "..."
        lines.append(f"- [{when}] ({i.type}) {note}")
    return "\n".join(lines)


async def process_lead_message(
    db: AsyncSession,
    lead: Lead,
    conversation: LeadConversation,
    user_text: str,
) -> str:
    """Process an incoming lead message and return the AI response."""
    ai_config = await load_ai_config(db)

    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "firm_info")
    )
    row = result.scalar_one_or_none()
    firm_cfg = row.value if row and row.value else {}

    agent_config = await load_agent_config(db, lead.status)

    client = _get_client(ai_config)
    model = _get_model(ai_config)
    max_tool_calls = 5
    temperature = 0.3

    # Fetch pricing table to inject into prompt
    price_result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_pricing")
    )
    price_row = price_result.scalar_one_or_none()
    pricing_table = price_row.value if price_row else None

    history = await _load_conversation_history(conversation)
    interactions_context = await _load_lead_interactions_context(db, lead.id)
    system_prompt = _build_system_prompt(
        agent_config,
        lead,
        firm_name=firm_cfg.get("name", ""),
        firm_timezone=firm_cfg.get("timezone", settings.FIRM_TIMEZONE),
        pricing_table=pricing_table,
        interactions_context=interactions_context,
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

                    result_str = await execute_lead_tool(tool_name, args, db, lead, conversation, agent_config)

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
        select(SystemConfig).where(SystemConfig.key == "firm_info")
    )
    row = result.scalar_one_or_none()
    firm_cfg = row.value if row and row.value else {}

    agent_config = await load_agent_config(db, lead.status)
    client = _get_client(ai_config)
    model = _get_model(ai_config)

    history = await _load_conversation_history(conversation)
    interactions_context = await _load_lead_interactions_context(db, lead.id)
    system_prompt = _build_system_prompt(
        agent_config,
        lead,
        firm_name=firm_cfg.get("name", ""),
        firm_timezone=firm_cfg.get("timezone", settings.FIRM_TIMEZONE),
        interactions_context=interactions_context,
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


def _clean_phone(phone: str) -> str:
    """Strip channel prefix (e.g. 'whatsapp:', 'telegram:') from a phone/chat_id."""
    for prefix in ("whatsapp:", "telegram:", "whatsapp_", "telegram_"):
        if phone.startswith(prefix):
            return phone[len(prefix):]
    return phone


async def send_proactive_message(
    db: AsyncSession,
    lead: Lead,
    agent_config: LeadAgentConfig,
) -> bool:
    """
    Invoke the LLM to generate an intelligent first message for the lead,
    then send it via WhatsApp/Telegram.

    The `initial_message` field in the config is used as an instruction hint
    for the AI (e.g. "apresente o escritório e pergunte sobre o interesse").
    If it's empty, fall back to a default instruction.
    """
    channel = lead.channel if lead.channel in ("whatsapp", "telegram") else "whatsapp"
    clean_phone = _clean_phone(lead.phone)

    conversation = await get_or_create_lead_conversation(db, lead, channel, clean_phone)

    # --- Build the LLM prompt ---
    ai_config = await load_ai_config(db)

    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "firm_info")
    )
    row = result.scalar_one_or_none()
    firm_cfg = row.value if row and row.value else {}

    price_result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_pricing")
    )
    price_row = price_result.scalar_one_or_none()
    pricing_table = price_row.value if price_row else None

    system_prompt = _build_system_prompt(
        agent_config,
        lead,
        firm_name=firm_cfg.get("name", ""),
        firm_timezone=firm_cfg.get("timezone", settings.FIRM_TIMEZONE),
        pricing_table=pricing_table,
        interactions_context=await _load_lead_interactions_context(db, lead.id),
    )

    # The initial_message is the instruction for the AI's first outreach
    hint = (agent_config.initial_message or "").strip()
    if not hint:
        hint = (
            "Faça o primeiro contato com este lead de forma acolhedora. "
            "Apresente-se, mencione o escritório e pergunte como pode ajudar."
        )

    user_instruction = (
        f"[INSTRUÇÃO DO SISTEMA — NÃO MOSTRAR AO CLIENTE]\n"
        f"Este é o primeiro contato com o lead. Gere uma mensagem inicial "
        f"para enviar pelo WhatsApp seguindo esta instrução:\n\n"
        f"{hint}\n\n"
        f"Regras:\n"
        f"- Fale como se estivesse mandando uma mensagem natural no WhatsApp\n"
        f"- Seja breve e acolhedor (máximo 3-4 linhas)\n"
        f"- Use o nome do lead se disponível\n"
        f"- NÃO inclua [INSTRUÇÃO DO SISTEMA] na resposta\n"
        f"- Responda APENAS com o texto da mensagem a ser enviada"
    )

    messages_for_llm: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_instruction},
    ]

    client = _get_client(ai_config)
    model = _get_model(ai_config)

    try:
        completion = await client.chat.completions.create(
            model=model,
            messages=messages_for_llm,
            temperature=0.5,
            max_tokens=300,
        )
        generated_text = (completion.choices[0].message.content or "").strip()
    except Exception:
        logger.exception("LLM error generating proactive message for lead %s", lead.id)
        # Fall back to the static initial_message if LLM fails
        generated_text = agent_config.initial_message or ""

    if not generated_text:
        logger.warning("Empty proactive message for lead %s, skipping", lead.code)
        return False

    from app.modules.messaging.gateway import send_message
    ok = await send_message(channel, clean_phone, generated_text)
    if ok:
        now = datetime.now(timezone.utc)
        db.add(LeadMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=generated_text,
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
        logger.info(
            "Proactive LLM message sent to lead %s via %s (%s)",
            lead.code, channel, clean_phone,
        )
    else:
        logger.error(
            "Proactive message FAILED for lead %s via %s (%s)",
            lead.code, channel, clean_phone,
        )
    return ok
