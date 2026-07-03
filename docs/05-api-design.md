---
tags: [advocacia-crm, api]
created: 2026-04-23
updated: 2026-07-02
status: alvo
---

# Design da API — AdvocacIA CRM

> Estado-alvo. Endpoints atuais → alvo seguem o dicionário de [[10-transformation-plan]] §3.

## Convenções

- Base URL: `/api/v1/`
- Autenticação: `Authorization: Bearer {access_token}` (JWT)
- Formato: JSON
- Paginação: `?page=1&page_size=20`

### Padrão de Resposta

```json
// Sucesso (lista)
{
  "data": [...],
  "meta": {"page": 1, "page_size": 20, "total": 150}
}

// Sucesso (item)
{
  "data": {...}
}

// Erro
{
  "error": {
    "code": "SLOT_NOT_AVAILABLE",
    "message": "O horário selecionado não está mais disponível.",
    "detail": {}
  }
}
```

---

## Auth

```
POST /auth/login
  Body: {username, password}
  Returns: {access_token, refresh_token, user: {id, name, role}}

POST /auth/refresh
  Body: {refresh_token}
  Returns: {access_token}

POST /auth/logout
  Body: {refresh_token}
  Returns: 204 No Content
```

---

## Webhooks (sem auth — validados por token/signature)

```
POST /webhooks/telegram/{bot_token}
  Header: X-Telegram-Bot-Api-Secret-Token: {secret}
  Body: Telegram Update object

POST /webhooks/whatsapp/{token}
  Header: X-Hub-Signature-256: sha256={hmac}
  Body: Evolution API webhook payload
```

---

## Clients

```
GET    /clients
  Params: status, phone, name, page, page_size
  Auth: admin | secretary

GET    /clients/{id}
GET    /clients/{id}/conversations
GET    /clients/{id}/consultations

PATCH  /clients/{id}
  Body: {client_status?, notes?}
```

---

## Leads

```
GET    /leads
  Params: status, channel, assigned_to, is_overdue,
          practice_area_id, created_from, created_to,
          utm_campaign, utm_source, page, page_size

POST   /leads
  Body: {full_name, phone, email?, channel, practice_area_id?,
         description?, utm_source?, utm_medium?, utm_campaign?,
         utm_content?, utm_term?, assigned_to?}

GET    /leads/{id}
PATCH  /leads/{id}
  Body: {status?, assigned_to?, next_followup_at?,
         proposal_value?, description?, lost_reason?}

DELETE /leads/{id}    (admin only — soft delete)

# Ações de pipeline
POST   /leads/{id}/contact
  Body: {note?}                    → seta contacted_at, status → em_contato

POST   /leads/{id}/convert
  Body: {lawyer_id, starts_at, notes?}   → cria client + consultation

PATCH  /leads/{id}/assign
  Body: {user_id}

POST   /leads/{id}/lost
  Body: {reason}                   (obrigatório)

# Interações
GET    /leads/{id}/interactions
POST   /leads/{id}/interactions
  Body: {type, content, next_action?}

# Entrada externa (Google Ads, Meta Ads, formulário do site)
POST   /leads/webhook/inbound
  Header: X-API-Key: {LEADS_WEBHOOK_API_KEY}
  Body: {name, phone, email?, utm_source?, utm_medium?,
         utm_campaign?, utm_content?, utm_term?, practice_area?, message?}
  Returns: {lead_id, status: "created"}
```

---

## Relatórios

```
GET /reports/leads/funnel
  Params: date_from, date_to
  Returns: [{status, total}]

GET /reports/leads/by-source
  Params: date_from, date_to
  Returns: [{channel, utm_campaign, total_leads, converted, conversion_rate}]

GET /reports/leads/conversion
  Params: period (7d|30d|90d|custom), date_from?, date_to?
  Returns: {total, converted, rate, by_channel: [...]}

GET /reports/leads/sla
  Params: date_from, date_to
  Returns: {total, within_sla, overdue, sla_rate}

GET /reports/leads/time-to-contact
  Params: date_from, date_to
  Returns: [{channel, avg_hours, contacted, overdue_total}]

GET /reports/leads/campaigns
  Params: date_from, date_to
  Returns: [{utm_campaign, utm_source, leads, converted, rate}]

GET /reports/leads/by-user
  Params: date_from, date_to
  Returns: [{assignee, total_leads, converted, avg_contact_hours}]

GET /reports/leads/timeline
  Params: date_from, date_to
  Returns: [{day, new_leads, converted}]

GET /reports/consultations/overview
  Params: date_from, date_to, lawyer_id?
  Returns: {total, by_status: {...}, by_lawyer: [...]}

GET /reports/revenue/estimates
  Params: date_from, date_to
  Returns: [{channel, converted_value, pipeline_value}]
  # valores = propostas de honorários (proposal_value)
```

**Export CSV:** todos os endpoints de relatório aceitam `?format=csv` → retorna `Content-Type: text/csv`.

---

## Consultations

```
GET    /consultations
  Params: lawyer_id, date_from, date_to, status, client_id

POST   /consultations
  Body: {client_id, lawyer_id, practice_area_id, starts_at, ends_at, notes?, source?}

GET    /consultations/{id}
PATCH  /consultations/{id}
  Body: {status?, notes?}

DELETE /consultations/{id}    → cancela (status = cancelled)
```

---

## Scheduling

```
GET  /scheduling/slots
  Params: lawyer_id | practice_area_id, date_from, date_to
  Returns: [{starts_at, ends_at, lawyer_id, lawyer_name, is_available}]

GET  /scheduling/calendar
  Params: date_from, date_to
  Returns: visão consolidada de todos os advogados

POST /scheduling/blocks
  Body: {lawyer_id, starts_at, ends_at, reason?}

DELETE /scheduling/blocks/{id}
```

---

## Lawyers

```
GET    /lawyers
POST   /lawyers
  Body: {full_name, oab?, practice_area_id, scheduling_provider,
         provider_config?, slot_duration_minutes?}
GET    /lawyers/{id}
PATCH  /lawyers/{id}
DELETE /lawyers/{id}    (soft delete — is_active = false)
GET    /lawyers/{id}/schedule    → regras de disponibilidade
PUT    /lawyers/{id}/schedule    → substituir regras
  Body: [{day_of_week, start_time, end_time}]
```

---

## Practice Areas

```
GET    /practice-areas
POST   /practice-areas
PATCH  /practice-areas/{id}
DELETE /practice-areas/{id}
```

---

## Follow-up Rules

```
GET    /followup/rules
POST   /followup/rules
PATCH  /followup/rules/{id}
DELETE /followup/rules/{id}
GET    /followup/jobs
  Params: status, date_from, date_to
```

---

## Admin / Setup

```
GET  /admin/setup/status
  Returns: {messaging: bool, ai: bool, scheduling: bool, firm_info: bool}

POST /admin/setup/messaging
  Body: {provider: "telegram"|"whatsapp", config: {...}}

POST /admin/setup/ai
  Body: {provider: "openai"|"local_llm", config: {model, api_key_ref?, base_url?}}

POST /admin/setup/scheduling
  Body: {default_provider: "local_db"|"google_calendar"}

GET  /admin/settings
PATCH /admin/settings/firm
  Body: {name, timezone, sla_hours, leads_webhook_api_key?}

POST /admin/google/oauth      → inicia fluxo OAuth
GET  /admin/google/callback   → callback OAuth (redirect)

GET  /admin/audit-logs
  Params: user_id, action, entity_type, date_from, date_to
```
