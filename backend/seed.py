"""
Seed data de desenvolvimento para o AdvocacIA CRM.
Rodar a partir de backend/:  python seed.py

Cria: áreas de atuação, advogados (com agenda seg-sex), usuários
(admin/comercial/advogado), clientes, consultas e leads distribuídos
pelo pipeline comercial.
"""
import asyncio
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select

from app.core.security import hash_password
from app.database import AsyncSessionLocal, init_db
from app.modules.admin.models import PracticeArea
from app.modules.auth.models import User
from app.modules.clients.models import Client
from app.modules.leads.models import Lead
from app.modules.scheduling.models import Consultation, Lawyer, LawyerSchedule


async def seed() -> None:
    await init_db()

    async with AsyncSessionLocal() as db:
        if (await db.execute(select(PracticeArea))).scalars().first():
            print("Seed data already present — skipping.")
            return

        now = datetime.now(timezone.utc)
        sla_default = now + timedelta(hours=2)

        # ── Áreas de atuação ───────────────────────────────────────
        trabalhista = PracticeArea(
            name="Trabalhista",
            description="Direito do trabalho: rescisões, verbas, assédio, acidentes de trabalho",
            is_active=True,
        )
        civel = PracticeArea(
            name="Cível",
            description="Contratos, indenizações, cobranças e responsabilidade civil",
            is_active=True,
        )
        familia = PracticeArea(
            name="Família e Sucessões",
            description="Divórcio, guarda, pensão alimentícia, inventário e partilha",
            is_active=True,
        )
        previdenciario = PracticeArea(
            name="Previdenciário",
            description="Aposentadorias, benefícios do INSS e revisões",
            is_active=True,
        )
        tributario = PracticeArea(
            name="Tributário",
            description="Planejamento tributário, defesas fiscais e recuperação de créditos",
            is_active=True,
        )
        criminal = PracticeArea(
            name="Criminal",
            description="Defesa criminal, inquéritos e audiências",
            is_active=True,
        )
        db.add_all([trabalhista, civel, familia, previdenciario, tributario, criminal])
        await db.flush()

        # ── Advogados ──────────────────────────────────────────────
        dr_carlos = Lawyer(
            full_name="Dr. Carlos Ferreira",
            oab="OAB/SP 123.456",
            practice_area_id=trabalhista.id,
            scheduling_provider="local_db",
            slot_duration_minutes=30,
            is_active=True,
        )
        dra_ana = Lawyer(
            full_name="Dra. Ana Lima",
            oab="OAB/SP 234.567",
            practice_area_id=familia.id,
            scheduling_provider="local_db",
            slot_duration_minutes=30,
            is_active=True,
        )
        dr_bruno = Lawyer(
            full_name="Dr. Bruno Martins",
            oab="OAB/RJ 345.678",
            practice_area_id=civel.id,
            scheduling_provider="local_db",
            slot_duration_minutes=45,
            is_active=True,
        )
        db.add_all([dr_carlos, dra_ana, dr_bruno])
        await db.flush()

        # ── Agenda semanal (Seg–Sex, 09:00–18:00) ──────────────────
        sched_rows = []
        for law in [dr_carlos, dra_ana, dr_bruno]:
            for dow in range(5):  # 0=Seg … 4=Sex
                sched_rows.append(
                    LawyerSchedule(
                        lawyer_id=law.id,
                        day_of_week=dow,
                        start_time=time(9, 0),
                        end_time=time(18, 0),
                        is_active=True,
                    )
                )
        db.add_all(sched_rows)
        await db.flush()

        # ── Usuários ────────────────────────────────────────────────
        admin = User(
            username="admin",
            full_name="Administrador",
            password_hash=hash_password("admin"),
            role="admin",
            must_change_password=True,
        )
        comercial = User(
            username="comercial",
            full_name="Equipe Comercial",
            password_hash=hash_password("comercial"),
            role="secretary",
            must_change_password=True,
        )
        user_dr_carlos = User(
            username="carlos.ferreira",
            full_name="Dr. Carlos Ferreira",
            password_hash=hash_password("advogado"),
            role="lawyer",
            lawyer_id=dr_carlos.id,
            must_change_password=True,
        )
        db.add_all([admin, comercial, user_dr_carlos])
        await db.flush()

        # ── Clientes ───────────────────────────────────────────────
        c1 = Client(full_name="Maria da Silva",  phone="11999991001", email="maria@email.com")
        c2 = Client(full_name="João Souza",       phone="11999992002", email="joao@email.com")
        c3 = Client(full_name="Ana Oliveira",     phone="11999993003")
        c4 = Client(full_name="Pedro Costa",      phone="11999994004", email="pedro@email.com")
        c5 = Client(full_name="Fernanda Lima",    phone="11999995005", email="fernanda@email.com")
        db.add_all([c1, c2, c3, c4, c5])
        await db.flush()

        # ── Consultas (semana atual + próxima) ─────────────────────
        today = date.today()
        mon = today - timedelta(days=today.weekday())  # segunda desta semana

        def consult(law: Lawyer, cli: Client, d: date, h: int, m: int = 0) -> Consultation:
            starts = datetime(d.year, d.month, d.day, h, m, tzinfo=timezone.utc)
            return Consultation(
                client_id=cli.id,
                lawyer_id=law.id,
                practice_area_id=law.practice_area_id,
                starts_at=starts,
                ends_at=starts + timedelta(minutes=law.slot_duration_minutes),
                status="scheduled",
                source="secretary",
            )

        db.add_all([
            consult(dr_carlos, c1, mon,                9,  0),
            consult(dra_ana,   c2, mon,               10,  0),
            consult(dr_bruno,  c3, mon + timedelta(1), 11,  0),
            consult(dra_ana,   c4, mon + timedelta(1), 14,  0),
            consult(dr_carlos, c5, mon + timedelta(2), 11,  0),
            consult(dra_ana,   c1, mon + timedelta(2),  9,  0),
            consult(dr_bruno,  c2, mon + timedelta(3), 15,  0),
            consult(dra_ana,   c3, mon + timedelta(4), 10, 30),
            consult(dr_carlos, c4, mon + timedelta(7),  9,  0),
            consult(dra_ana,   c5, mon + timedelta(8), 14,  0),
        ])
        await db.flush()

        # ── Leads (pipeline comercial) ───────────────────────────────
        db.add_all([
            Lead(
                code="L-2026-00001", full_name="Lucas Pereira", phone="11988881001",
                channel="whatsapp", status="novo", sla_deadline=sla_default,
                practice_area_id=trabalhista.id,
                utm_source="google", utm_medium="cpc", utm_campaign="trabalhista-rescisao",
                description="Foi demitido sem justa causa e não recebeu verbas rescisórias.",
            ),
            Lead(
                code="L-2026-00002", full_name="Paula Rodrigues", phone="11988882002",
                channel="instagram", status="em_contato",
                sla_deadline=now - timedelta(hours=1), contacted_at=now - timedelta(hours=3),
                practice_area_id=familia.id,
                utm_source="instagram", utm_medium="social", utm_campaign="familia-divorcio",
                description="Deseja iniciar processo de divórcio consensual.",
            ),
            Lead(
                code="L-2026-00003", full_name="Rafael Santos", phone="11988883003",
                channel="google_ads", status="qualificado", sla_deadline=sla_default,
                practice_area_id=previdenciario.id,
                utm_source="google", utm_medium="cpc", utm_campaign="previdenciario-aposentadoria",
                utm_content="anuncio-1", description="Quer revisar cálculo de aposentadoria.",
            ),
            Lead(
                code="L-2026-00004", full_name="Juliana Alves", phone="11988884004",
                channel="telegram", status="proposta_enviada", sla_deadline=sla_default,
                proposal_value=3500.00, practice_area_id=civel.id,
                utm_source="site", utm_medium="organic",
                description="Cobrança de dívida contratual — proposta de honorários enviada.",
            ),
            Lead(
                code="L-2026-00005", full_name="Marcos Oliveira", phone="11988885005",
                channel="meta_ads", status="negociando", sla_deadline=sla_default,
                proposal_value=5000.00, practice_area_id=tributario.id,
                utm_source="facebook", utm_medium="cpc", utm_campaign="tributario-recuperacao",
                description="Negociando honorários para recuperação de créditos tributários.",
            ),
            Lead(
                code="L-2026-00006", full_name="Cláudia Ferreira", phone="11988886006",
                channel="site", status="convertido", sla_deadline=sla_default,
                converted_at=now - timedelta(days=1), converted_client_id=c3.id,
                practice_area_id=familia.id, utm_source="site", utm_medium="organic",
                description="Contratou serviços de inventário e partilha.",
            ),
            Lead(
                code="L-2026-00007", full_name="Roberto Lima", phone="11988887007",
                channel="whatsapp", status="perdido", sla_deadline=sla_default,
                lost_reason="honorarios", practice_area_id=criminal.id,
                utm_source="indicacao",
                description="Não fechou por divergência de valores dos honorários.",
            ),
            Lead(
                code="L-2026-00008", full_name="Tatiana Costa", phone="11988888008",
                channel="indicacao", status="novo", sla_deadline=sla_default,
                practice_area_id=criminal.id,
                description="Indicação de cliente atual — precisa de defesa criminal.",
            ),
            Lead(
                code="L-2026-00009", full_name="André Gomes", phone="11988889009",
                channel="outro", status="em_contato", sla_deadline=sla_default,
                contacted_at=now - timedelta(hours=1), practice_area_id=trabalhista.id,
                description="Assédio moral no ambiente de trabalho.",
            ),
            Lead(
                code="L-2026-00010", full_name="Carolina Souza", phone="11988880010",
                channel="whatsapp", status="qualificado", sla_deadline=sla_default,
                practice_area_id=civel.id, utm_source="whatsapp", utm_medium="direct",
                description="Indenização por danos morais e materiais em acidente de trânsito.",
            ),
        ])

        await db.commit()
        print("Seed criado com sucesso:")
        print("  · 6 áreas de atuação: Trabalhista, Cível, Família e Sucessões, "
              "Previdenciário, Tributário, Criminal")
        print("  · 3 advogados: Dr. Carlos Ferreira, Dra. Ana Lima, Dr. Bruno Martins")
        print("  · 3 usuários: admin/admin (admin), comercial/comercial (secretary), "
              "carlos.ferreira/advogado (lawyer)")
        print("  · 5 clientes")
        print("  · 10 consultas (semana atual + próxima)")
        print("  · 10 leads em vários estágios do pipeline")


if __name__ == "__main__":
    asyncio.run(seed())
