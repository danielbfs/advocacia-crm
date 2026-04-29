"""
Seed data for Followup Rules based on Flowchart.
Run from backend/ directory: python seed_rules.py
"""
import asyncio
from sqlalchemy import select

from app.database import AsyncSessionLocal, init_db
from app.modules.followup.models import FollowupRule

RULES = [
    # ── Inatividade (Passo 4.1, 4.2, 4.3) ──────────────────────
    {
        "name": "Inatividade 24h",
        "trigger_event": "inactivity",
        "offset_minutes": 1440,
        "message_template": "Olá {patient_name}, notei que você não respondeu minha última mensagem. Posso te ajudar com alguma dúvida sobre a consulta?",
        "channel": "whatsapp",
    },
    {
        "name": "Inatividade 48h",
        "trigger_event": "inactivity",
        "offset_minutes": 2880,
        "message_template": "Oi {patient_name}! Ainda tem interesse em agendar sua avaliação conosco? Nossos horários para essa semana estão acabando.",
        "channel": "whatsapp",
    },
    {
        "name": "Inatividade 72h",
        "trigger_event": "inactivity",
        "offset_minutes": 4320,
        "message_template": "Olá {patient_name}, essa é minha última tentativa de contato por aqui. Caso queira agendar depois, é só me chamar!",
        "channel": "whatsapp",
    },
    # ── Lembretes Pré-Consulta (Passo 6.1, 6.2) ────────────────
    {
        "name": "Lembrete 24h",
        "trigger_event": "appointment_scheduled",
        "offset_minutes": -1440,
        "message_template": "Olá {patient_name}, lembrando da sua consulta amanhã às {appointment_date} com {doctor_name} ({specialty}). Confirma sua presença?",
        "channel": "whatsapp",
    },
    {
        "name": "Lembrete 2h",
        "trigger_event": "appointment_scheduled",
        "offset_minutes": -120,
        "message_template": "Oi {patient_name}, sua consulta com {doctor_name} é daqui a pouco às {appointment_date}! Estamos te esperando.",
        "channel": "whatsapp",
    },
    # ── Retomada Pós No-Show (Passo 7.2) ───────────────────────
    {
        "name": "No-Show 24h",
        "trigger_event": "no_show",
        "offset_minutes": 1440,
        "message_template": "Olá {patient_name}, sentimos sua falta ontem na consulta. Aconteceu algum imprevisto? Vamos remarcar?",
        "channel": "whatsapp",
    },
    # ── Boas Vindas / Tratamento Aprovado (Passo 10) ───────────
    {
        "name": "Boas-vindas Paciente",
        "trigger_event": "lead_converted",
        "offset_minutes": 0,
        "message_template": "Olá {patient_name}! Seja muito bem-vindo(a) à nossa clínica. Ficamos muito felizes que você aprovou o tratamento. Qualquer dúvida, estou por aqui!",
        "channel": "whatsapp",
    },
    # ── Pós-Venda / Tratamento Não Aprovado (Passo 11) ─────────
    {
        "name": "Pós-Venda 24h",
        "trigger_event": "lead_lost",
        "offset_minutes": 1440,
        "message_template": "Olá {patient_name}, tudo bem? Gostaria de saber o que achou da nossa avaliação de ontem e se ficou alguma dúvida sobre o orçamento.",
        "channel": "whatsapp",
    },
    {
        "name": "Pós-Venda 48h",
        "trigger_event": "lead_lost",
        "offset_minutes": 2880,
        "message_template": "Oi {patient_name}! Pensou sobre a avaliação? Estamos com uma condição especial para quem iniciar o tratamento essa semana.",
        "channel": "whatsapp",
    },
    {
        "name": "Pós-Venda 1 Semana",
        "trigger_event": "lead_lost",
        "offset_minutes": 10080,
        "message_template": "Olá {patient_name}! Já faz uma semana da sua avaliação. Gostaria de retomar as conversas sobre o seu tratamento?",
        "channel": "whatsapp",
    },
]


async def seed_rules() -> None:
    await init_db()

    async with AsyncSessionLocal() as db:
        # Check if rules already exist to avoid duplication
        existing = await db.execute(select(FollowupRule))
        existing_names = {r.name for r in existing.scalars().all()}

        count = 0
        for data in RULES:
            if data["name"] not in existing_names:
                rule = FollowupRule(**data)
                db.add(rule)
                count += 1

        if count > 0:
            await db.commit()
            print(f"Sucesso! {count} regras do fluxograma inseridas no banco de dados.")
        else:
            print("As regras já estavam cadastradas no banco de dados. Nenhuma alteração feita.")


if __name__ == "__main__":
    asyncio.run(seed_rules())
