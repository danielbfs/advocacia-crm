---
tags: [advocacia-crm, scheduling]
created: 2026-04-23
updated: 2026-07-02
status: alvo
---

# Sistema de Agenda — AdvocacIA CRM

> Estado-alvo. Mecânica idêntica à herdada do Open Clinic; muda a terminologia (médico → advogado, consulta médica → consulta jurídica).

## Visão Geral

O `SchedulingService` é uma camada de abstração que oferece interface unificada para agendamento de consultas, independentemente do provider configurado por advogado.

Cada advogado tem:
- `scheduling_provider`: `google_calendar` ou `local_db`
- `provider_config`: JSON com configurações específicas do provider
- `slot_duration_minutes`: duração padrão de cada consulta

---

## Interface Abstrata

```python
class AbstractSchedulingAdapter:
    async def get_availability(self, date_from, date_to) -> list[TimeRange]: ...
    async def get_booked_slots(self, date_from, date_to) -> list[TimeRange]: ...
    async def create_event(self, client_id, starts_at, ends_at, notes) -> ExternalEvent: ...
    async def cancel_event(self, external_event_id) -> None: ...
    async def reschedule_event(self, external_event_id, new_starts_at, new_ends_at) -> None: ...
```

---

## Algoritmo de Disponibilidade

```
Entrada: lawyer_id, date_from, date_to, slot_duration (minutos)

1. Busca regras recorrentes (lawyer_schedules)
   → Expande para lista de janelas no período: [(seg 09:00, seg 18:00), ...]

2. Gera todos os slots possíveis dentro das janelas
   → Intervalo de slot_duration_minutes: 09:00, 09:30, 10:00 ...

3. Remove bloqueios (schedule_blocks) que sobrepõem ao slot

4. Remove consultas existentes com status != 'cancelled'
   → Busca no DB (local_db) ou via freebusy API (Google Calendar)

5. Remove slots no passado

6. Retorna: list[TimeSlot{starts_at, ends_at, is_available: True}]
```

---

## Prevenção de Conflitos

### Nível Banco de Dados
```sql
-- Constraint EXCLUDE previne overlap em nível de DB
CONSTRAINT no_overlap EXCLUDE USING gist (
    lawyer_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
) WHERE (status NOT IN ('cancelled'))
```

### Nível Aplicação (Race Condition)
```python
async def book_consultation(self, lawyer_id, starts_at, ends_at, ...):
    async with db.begin():
        # SELECT FOR UPDATE — bloqueia a linha durante a transação
        existing = await db.execute(
            select(Consultation)
            .where(Consultation.lawyer_id == lawyer_id)
            .where(Consultation.starts_at < ends_at)
            .where(Consultation.ends_at > starts_at)
            .where(Consultation.status != 'cancelled')
            .with_for_update()
        )
        if existing.scalar():
            raise SlotNotAvailableError("Horário já ocupado")
        # Cria a consulta
        ...
```

### Cache de Slots (Redis)
- Slot exibido para o lead/cliente: reservado em cache Redis por 5 minutos
- Chave: `slot_lock:{lawyer_id}:{starts_at_iso}`
- Se expirado antes da confirmação: slot liberado automaticamente

---

## Google Calendar Adapter

### Fluxo OAuth
```
Admin acessa /admin/google/oauth
  → Redirect para Google OAuth consent screen
  → Callback em /admin/google/callback?code=...
    → Troca code por access_token + refresh_token
    → Salva criptografado no DB (key: env ENCRYPTION_KEY)
    → Associa credentials ao lawyer.provider_config
```

### Leitura de Disponibilidade
```python
# Mais eficiente que listar todos os eventos
response = calendar_service.freebusy().query({
    "timeMin": date_from.isoformat(),
    "timeMax": date_to.isoformat(),
    "items": [{"id": lawyer.provider_config["calendar_id"]}]
}).execute()

busy_slots = response["calendars"][calendar_id]["busy"]
```

### Criação de Evento
```python
event = {
    "summary": f"Consulta — {client.full_name}",
    "start": {"dateTime": starts_at.isoformat(), "timeZone": FIRM_TIMEZONE},
    "end":   {"dateTime": ends_at.isoformat(),   "timeZone": FIRM_TIMEZONE},
    "extendedProperties": {
        "private": {
            "advocacia_crm_consultation_id": str(consultation_id),
            "advocacia_crm_client_phone": client.phone
        }
    }
}
```

---

## Local DB Adapter

```python
# Busca diretamente nas tabelas lawyer_schedules e consultations
schedules = await db.execute(
    select(LawyerSchedule)
    .where(LawyerSchedule.lawyer_id == lawyer_id)
    .where(LawyerSchedule.is_active == True)
)

booked = await db.execute(
    select(Consultation)
    .where(Consultation.lawyer_id == lawyer_id)
    .where(Consultation.starts_at >= date_from)
    .where(Consultation.ends_at <= date_to)
    .where(Consultation.status != 'cancelled')
)
```

---

## Endpoints

```
GET /api/v1/scheduling/slots
  Params: lawyer_id | practice_area_id, date_from, date_to
  Returns: list[{starts_at, ends_at, lawyer_id, lawyer_name}]

GET /api/v1/scheduling/calendar
  Params: date_from, date_to
  Returns: visão consolidada de todos os advogados

POST /api/v1/scheduling/blocks
  Body: {lawyer_id, starts_at, ends_at, reason}

DELETE /api/v1/scheduling/blocks/{id}
```
