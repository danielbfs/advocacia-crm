"""AI Engine — orchestrates LLM conversations with function calling."""
import json
import logging

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.admin.models import Specialty
from app.modules.ai.config_loader import load_ai_config, load_chatbot_config, load_clinic_config
from app.modules.ai.prompts import build_system_prompt
from app.modules.ai.session import load_session, save_session
from app.modules.ai.tools import TOOL_DEFINITIONS, execute_tool
from app.modules.crm.models import Patient
from app.modules.followup.service import schedule_event_followups, cancel_event_followups
from app.modules.scheduling.models import Doctor

logger = logging.getLogger(__name__)


async def _load_catalog(db: AsyncSession) -> tuple[list[dict], list[dict]]:
    """Load active specialties and doctors so the LLM can pick the right UUIDs."""
    spec_result = await db.execute(
        select(Specialty).where(Specialty.is_active == True).order_by(Specialty.name)
    )
    specialties = [
        {"id": str(s.id), "name": s.name} for s in spec_result.scalars().all()
    ]

    doc_result = await db.execute(
        select(Doctor).where(Doctor.is_active == True).order_by(Doctor.full_name)
    )
    doctors = []
    for d in doc_result.scalars().unique().all():
        doctors.append(
            {
                "id": str(d.id),
                "full_name": d.full_name,
                "specialty_name": d.specialty.name if d.specialty else None,
            }
        )
    return specialties, doctors


def _get_client(ai_config: dict) -> AsyncOpenAI:
    """Get the appropriate LLM client. Admin's DB config takes precedence over env."""
    if ai_config.get("use_local_llm"):
        url = ai_config.get("local_llm_url") or settings.LOCAL_LLM_BASE_URL
        if url:
            return AsyncOpenAI(base_url=url, api_key="not-needed")
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY or "missing")


def _get_model(ai_config: dict) -> str:
    if ai_config.get("use_local_llm"):
        return ai_config.get("local_llm_model") or settings.LOCAL_LLM_MODEL
    return ai_config.get("model") or settings.OPENAI_MODEL


async def process_message(
    db: AsyncSession,
    patient: Patient,
    user_text: str,
) -> str:
    """Process an incoming patient message and return the AI response."""
    # Cancela mensagens de inatividade pendentes já que o usuário respondeu
    await cancel_event_followups(db, "inactivity", patient_id=patient.id)

    if not settings.OPENAI_API_KEY and not settings.LOCAL_LLM_BASE_URL:
        # Also check DB config
        ai_config = await load_ai_config(db)
        if not ai_config.get("use_local_llm") or not ai_config.get("local_llm_url"):
            logger.warning("No LLM configured (OPENAI_API_KEY or LOCAL_LLM_BASE_URL)")
            return (
                "O assistente virtual está temporariamente indisponível. "
                "Por favor, entre em contato pelo telefone da clínica."
            )
    else:
        ai_config = await load_ai_config(db)

    chatbot_config = await load_chatbot_config(db)
    clinic_config = await load_clinic_config(db)
    specialties, doctors = await _load_catalog(db)

    client = _get_client(ai_config)
    model = _get_model(ai_config)
    max_tool_calls = chatbot_config.get("max_tool_calls", 3)
    temperature = chatbot_config.get("temperature", 0.3)

    # Load conversation history
    history = await load_session(patient.id)

    # Build messages
    system_prompt = build_system_prompt(
        custom_prompt=chatbot_config.get("system_prompt", ""),
        clinic_name=clinic_config.get("name", ""),
        clinic_timezone=clinic_config.get("timezone", settings.CLINIC_TIMEZONE),
        specialties=specialties,
        doctors=doctors,
    )
    patient_context = (
        f"Paciente atual: {patient.full_name or 'nome não informado'} "
        f"(ID: {patient.id})"
    )

    messages = [
        {"role": "system", "content": f"{system_prompt}\n\n{patient_context}"},
    ]
    messages.extend(history)
    messages.append({"role": "user", "content": user_text})

    # LLM loop with tool calls
    tool_calls_count = 0
    response_text = ""

    try:
        while tool_calls_count <= max_tool_calls:
            completion = await client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                temperature=temperature,
                max_tokens=1000,
            )

            choice = completion.choices[0]
            assistant_message = choice.message

            if assistant_message.tool_calls:
                # Add assistant message with tool calls
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

                # Execute each tool call
                for tc in assistant_message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}

                    logger.info(
                        "Tool call: %s(%s) for patient %s",
                        tool_name, args, patient.id,
                    )

                    result = await execute_tool(tool_name, args, db, patient.id)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    })

                tool_calls_count += 1
            else:
                # Final text response
                response_text = assistant_message.content or ""
                break
        else:
            response_text = (
                "Desculpe, estou tendo dificuldades para processar seu pedido. "
                "Vou encaminhar para a secretária."
            )

    except Exception:
        logger.exception("LLM API error for patient %s", patient.id)
        return (
            "Desculpe, ocorreu um erro ao processar sua mensagem. "
            "Por favor, tente novamente."
        )

    # Save updated history (keep only user/assistant messages for storage)
    session_messages = _extract_storable_messages(history, user_text, response_text)
    await save_session(patient.id, session_messages)

    # Agenda follow-ups de inatividade caso o paciente pare de responder
    await schedule_event_followups(db, "inactivity", patient_id=patient.id)

    return response_text


def _extract_storable_messages(
    history: list[dict],
    user_text: str,
    assistant_text: str,
) -> list[dict]:
    """Keep only user/assistant turns for Redis storage (no system/tool messages)."""
    storable = [
        msg for msg in history
        if msg.get("role") in ("user", "assistant") and "tool_calls" not in msg
    ]
    storable.append({"role": "user", "content": user_text})
    if assistant_text:
        storable.append({"role": "assistant", "content": assistant_text})
    return storable
