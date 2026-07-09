"""
Seed data para Follow-up Rules do AdvocacIA CRM.
Rodar a partir de backend/: python seed_rules.py

Triggers válidos (docs/03-database-schema.md):
  consultation_scheduled, consultation_confirmed,
  consultation_cancelled, no_show
"""
import asyncio
from sqlalchemy import select

from app.database import AsyncSessionLocal, init_db
from app.modules.followup.models import FollowupRule

RULES = [
    # ── Confirmação após agendamento ────────────────────────────
    {
        "name": "Lembrete 24h antes da consulta",
        "trigger_event": "consultation_scheduled",
        "offset_minutes": -1440,
        "message_template": (
            "Olá {client_name}, lembrando da sua consulta amanhã às "
            "{consultation_date} com {lawyer_name} ({practice_area}). "
            "Você confirma sua presença?"
        ),
        "channel": "whatsapp",
    },
    {
        "name": "Lembrete 2h antes da consulta",
        "trigger_event": "consultation_scheduled",
        "offset_minutes": -120,
        "message_template": (
            "Oi {client_name}, sua consulta com {lawyer_name} é daqui a pouco "
            "às {consultation_date}! Estamos te esperando."
        ),
        "channel": "whatsapp",
    },
    # ── Após confirmação do cliente ─────────────────────────────
    {
        "name": "Agradecimento pela confirmação",
        "trigger_event": "consultation_confirmed",
        "offset_minutes": 0,
        "message_template": (
            "Obrigado por confirmar, {client_name}! Sua consulta com "
            "{lawyer_name} está garantida para {consultation_date}."
        ),
        "channel": "whatsapp",
    },
    {
        "name": "Preparação para consulta confirmada",
        "trigger_event": "consultation_confirmed",
        "offset_minutes": -60,
        "message_template": (
            "Olá {client_name}, sua consulta com {lawyer_name} começa em 1 hora. "
            "Separe os documentos relacionados ao seu caso, se possível."
        ),
        "channel": "whatsapp",
    },
    # ── Cancelamento ─────────────────────────────────────────────
    {
        "name": "Aviso de cancelamento",
        "trigger_event": "consultation_cancelled",
        "offset_minutes": 0,
        "message_template": (
            "Olá {client_name}, sua consulta com {lawyer_name} em "
            "{consultation_date} foi cancelada. Deseja remarcar?"
        ),
        "channel": "whatsapp",
    },
    # ── Retomada pós no-show ─────────────────────────────────────
    {
        "name": "Retomada após no-show",
        "trigger_event": "no_show",
        "offset_minutes": 1440,
        "message_template": (
            "Olá {client_name}, sentimos sua falta ontem na consulta com "
            "{lawyer_name}. Aconteceu algum imprevisto? Vamos remarcar?"
        ),
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
            print(f"Sucesso! {count} regras de follow-up inseridas no banco de dados.")
        else:
            print("As regras já estavam cadastradas no banco de dados. Nenhuma alteração feita.")


if __name__ == "__main__":
    asyncio.run(seed_rules())
