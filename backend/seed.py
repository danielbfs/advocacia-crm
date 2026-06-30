"""
Seed data for development and testing.
Run from backend/ directory:  python seed.py
Or inside Docker:  docker compose exec backend python seed.py
"""
import asyncio
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal, init_db
from app.modules.admin.models import Specialty
from app.modules.crm.models import Patient
from app.modules.leads.models import Lead
from app.modules.scheduling.models import Appointment, Doctor, DoctorSchedule


async def seed() -> None:
    await init_db()

    async with AsyncSessionLocal() as db:
        if (await db.execute(select(Specialty))).scalars().first():
            print("Seed data already present — skipping.")
            return

        now = datetime.now(timezone.utc)
        sla_default = now + timedelta(hours=2)

        # ── Especialidades ─────────────────────────────────────────
        cardio = Specialty(
            name="Cardiologia",
            description="Doenças do coração e sistema circulatório",
            is_active=True,
        )
        dermato = Specialty(
            name="Dermatologia",
            description="Doenças da pele, cabelos e unhas",
            is_active=True,
        )
        db.add_all([cardio, dermato])
        await db.flush()

        # ── Médicos ────────────────────────────────────────────────
        dr_carlos = Doctor(
            full_name="Dr. Carlos Ferreira",
            crm="CRM-SP 12345",
            specialty_id=cardio.id,
            slot_duration_minutes=30,
            is_active=True,
        )
        dra_ana = Doctor(
            full_name="Dra. Ana Lima",
            crm="CRM-SP 67890",
            specialty_id=dermato.id,
            slot_duration_minutes=30,
            is_active=True,
        )
        db.add_all([dr_carlos, dra_ana])
        await db.flush()

        # ── Agenda semanal (Seg–Sex, dois blocos por dia) ──────────
        sched_rows = []
        for doc in [dr_carlos, dra_ana]:
            for dow in range(5):  # 0=Seg … 4=Sex
                sched_rows.append(
                    DoctorSchedule(
                        doctor_id=doc.id,
                        day_of_week=dow,
                        start_time=time(8, 0),
                        end_time=time(12, 0),
                        is_active=True,
                    )
                )
                sched_rows.append(
                    DoctorSchedule(
                        doctor_id=doc.id,
                        day_of_week=dow,
                        start_time=time(14, 0),
                        end_time=time(18, 0),
                        is_active=True,
                    )
                )
        db.add_all(sched_rows)
        await db.flush()

        # ── Pacientes ──────────────────────────────────────────────
        p1 = Patient(full_name="Maria da Silva",  phone="11999991001", email="maria@email.com")
        p2 = Patient(full_name="João Souza",       phone="11999992002", email="joao@email.com")
        p3 = Patient(full_name="Ana Oliveira",     phone="11999993003")
        p4 = Patient(full_name="Pedro Costa",      phone="11999994004", email="pedro@email.com")
        p5 = Patient(full_name="Fernanda Lima",    phone="11999995005", email="fernanda@email.com")
        db.add_all([p1, p2, p3, p4, p5])
        await db.flush()

        # ── Agendamentos (semana atual + próxima) ─────────────────
        today = date.today()
        mon = today - timedelta(days=today.weekday())  # segunda desta semana

        def appt(doc: Doctor, pat: Patient, d: date, h: int, m: int = 0) -> Appointment:
            starts = datetime(d.year, d.month, d.day, h, m, tzinfo=timezone.utc)
            return Appointment(
                patient_id=pat.id,
                doctor_id=doc.id,
                specialty_id=doc.specialty_id,
                starts_at=starts,
                ends_at=starts + timedelta(minutes=doc.slot_duration_minutes),
                status="scheduled",
                source="secretary",
            )

        db.add_all([
            appt(dr_carlos, p1, mon,                9,  0),
            appt(dra_ana,   p2, mon,               10,  0),
            appt(dr_carlos, p3, mon + timedelta(1), 8, 30),
            appt(dra_ana,   p4, mon + timedelta(1), 14,  0),
            appt(dr_carlos, p5, mon + timedelta(2), 11,  0),
            appt(dra_ana,   p1, mon + timedelta(2),  9,  0),
            appt(dr_carlos, p2, mon + timedelta(3), 15,  0),
            appt(dra_ana,   p3, mon + timedelta(4), 10, 30),
            appt(dr_carlos, p4, mon + timedelta(7),  9,  0),
            appt(dra_ana,   p5, mon + timedelta(8), 14,  0),
        ])
        await db.flush()

        # ── Leads ──────────────────────────────────────────────────
        db.add_all([
            Lead(code="L-2026-00001", full_name="Lucas Pereira",    phone="11988881001", channel="whatsapp",   status="novo",              sla_deadline=sla_default, specialty_id=cardio.id),
            Lead(code="L-2026-00002", full_name="Paula Rodrigues",  phone="11988882002", channel="instagram",  status="em_contato",        sla_deadline=now - timedelta(hours=1), contacted_at=now - timedelta(hours=3)),
            Lead(code="L-2026-00003", full_name="Rafael Santos",    phone="11988883003", channel="google_ads", status="qualificado",       sla_deadline=sla_default, utm_campaign="cardio-q1"),
            Lead(code="L-2026-00004", full_name="Juliana Alves",    phone="11988884004", channel="telegram",   status="orcamento_enviado", sla_deadline=sla_default, quote_value=350.00, specialty_id=dermato.id),
            Lead(code="L-2026-00005", full_name="Marcos Oliveira",  phone="11988885005", channel="meta_ads",   status="negociando",        sla_deadline=sla_default, quote_value=500.00),
            Lead(code="L-2026-00006", full_name="Cláudia Ferreira", phone="11988886006", channel="site",       status="convertido",        sla_deadline=sla_default, converted_at=now - timedelta(days=1), converted_patient_id=p3.id),
            Lead(code="L-2026-00007", full_name="Roberto Lima",     phone="11988887007", channel="whatsapp",   status="perdido",           sla_deadline=sla_default, lost_reason="preco"),
            Lead(code="L-2026-00008", full_name="Tatiana Costa",    phone="11988888008", channel="indicacao",  status="novo",              sla_deadline=sla_default, specialty_id=dermato.id),
            Lead(code="L-2026-00009", full_name="André Gomes",      phone="11988889009", channel="outro",      status="em_contato",        sla_deadline=sla_default, contacted_at=now - timedelta(hours=1)),
            Lead(code="L-2026-00010", full_name="Carolina Souza",   phone="11988880010", channel="whatsapp",   status="qualificado",       sla_deadline=sla_default, specialty_id=cardio.id, description="Check-up cardíaco de rotina"),
        ])

        await db.commit()
        print("Seed criado com sucesso:")
        print(f"  · 2 especialidades: Cardiologia, Dermatologia")
        print(f"  · 2 médicos: Dr. Carlos Ferreira, Dra. Ana Lima")
        print(f"  · 5 pacientes")
        print(f"  · 10 agendamentos (semana atual + próxima)")
        print(f"  · 10 leads em vários estágios do pipeline")


if __name__ == "__main__":
    asyncio.run(seed())
