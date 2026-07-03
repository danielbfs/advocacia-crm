---
tags: [advocacia-crm, modules]
created: 2026-04-23
updated: 2026-07-02
status: alvo
---

# Módulos — AdvocacIA CRM

> Estado-alvo. Mapeamento dos módulos atuais → alvo em [[10-transformation-plan]] §3.4.

## Estrutura de Diretórios

```
backend/app/modules/
├── auth/           Autenticação e autorização
├── messaging/      Gateway de mensagens (Telegram, WhatsApp)
├── ai/             IA Comercial (LLM + function calling)
├── scheduling/     Agenda de consultas (abstração + adapters)
├── clients/        Clientes convertidos e histórico
├── leads/          Pipeline de vendas, SLA, relatórios
├── followup/       Follow-up automático (Celery tasks)
└── admin/          Configurações e setup wizard
```

---

## auth

**Responsabilidade:** Autenticação JWT, controle de acesso por role (RBAC).

| Arquivo | Função |
|---|---|
| `router.py` | Endpoints: `/auth/login`, `/auth/refresh`, `/auth/logout` |
| `service.py` | Geração e validação de JWT, hash de senha |
| `models.py` | `User` (id, username, full_name, role, is_active) |
| `schemas.py` | `LoginRequest`, `TokenResponse` |

**Roles:**
- `admin` — acesso total, incluindo setup e relatórios
- `secretary` (label "Comercial") — kanban de leads, agenda, caixa de WhatsApp
- `lawyer` — própria agenda e clientes

---

## messaging

**Responsabilidade:** Receber mensagens de canais externos, normalizar para formato interno, enviar respostas.

| Arquivo | Função |
|---|---|
| `router.py` | Webhooks: `POST /webhooks/telegram/{token}`, `POST /webhooks/whatsapp/{token}` |
| `gateway.py` | Roteamento: recebe `MessagePayload`, chama AI Engine, despacha resposta |
| `schemas.py` | `MessagePayload` — formato normalizado independente de canal |
| `adapters/base.py` | `AbstractMessagingAdapter` |
| `adapters/telegram.py` | Parsing de update Telegram, envio via Bot API |
| `adapters/evolution_api.py` | Integração com WhatsApp via Evolution API |

**Segurança:** Webhooks validados por `secret_token` (Telegram) ou HMAC (WhatsApp).

---

## ai

**Responsabilidade:** IA Comercial — sessão de conversa, LLM, tools (function calling). Ver [[06-ai-design]].

| Arquivo | Função |
|---|---|
| `engine.py` | Orquestrador: monta contexto, chama LLM, executa tools |
| `session.py` | Histórico de conversa no Redis (TTL 24h), fallback para DB |
| `tools.py` | Tools: qualificação, agenda de consulta, escalonamento |
| `prompts.py` | System prompt do atendente comercial (com regras OAB/LGPD) |
| `config_loader.py` | Carrega provider e configurações de `system_config` |

**Tools disponíveis para o LLM:**
- `check_availability(practice_area_id, date_from, date_to)`
- `book_consultation(lawyer_id, starts_at, client_notes)`
- `cancel_consultation(consultation_id)`
- `reschedule_consultation(consultation_id, new_starts_at)`
- `get_client_consultations()`
- `escalate_to_human(reason)`

---

## scheduling

**Responsabilidade:** Abstração da agenda de consultas — interface unificada independente do provider (Google Calendar ou banco local), por advogado.

| Arquivo | Função |
|---|---|
| `service.py` | `SchedulingService`: `get_available_slots()`, `book_consultation()`, `cancel_consultation()`, `reschedule_consultation()` |
| `router.py` | Endpoints de slots, calendário, bloqueios |
| `models.py` | `Lawyer`, `PracticeArea`, `Consultation`, `LawyerSchedule`, `ScheduleBlock` |
| `adapters/` | `AbstractSchedulingAdapter`, `google_calendar`, `local_db` |

---

## clients

**Responsabilidade:** Cadastro e histórico de clientes (leads já convertidos — fecharam contrato ou tiveram ao menos uma consulta).

| Arquivo | Função |
|---|---|
| `router.py` | CRUD de clientes, histórico de conversas e consultas |
| `service.py` | `get_or_create_client` (por telefone), atualização de status |
| `models.py` | `Client`, `ClientContact` |
| `schemas.py` | `ClientCreate`, `ClientUpdate`, `ClientResponse` |

---

## leads

**Responsabilidade:** Pipeline de vendas pré-contrato, SLA de retorno, interações da equipe, conversão, webhook de entrada externa, relatórios, IA de qualificação.

| Arquivo | Função |
|---|---|
| `router.py` | CRUD leads, ações de pipeline, interações, webhook inbound, relatórios |
| `service.py` | Regras de negócio: SLA, conversão lead→cliente, atribuição |
| `models.py` | `Lead`, `LeadInteraction` |
| `pipeline.py` | Máquina de estados do funil (transições válidas, motivos de perda) |
| `sla.py` | Celery task: verifica leads vencidos a cada 15 min, notifica responsável |
| `ai_engine.py` / `ai_tools.py` / `ai_tasks.py` | IA Comercial no contexto do lead |
| `schedule.py` | Agendamento de follow-ups de lead |

**Pipeline:** `novo → em_contato → qualificado → proposta_enviada → negociando → convertido | perdido`

---

## followup

**Responsabilidade:** Envio automático de mensagens baseado em eventos de consulta.

| Arquivo | Função |
|---|---|
| `tasks.py` | Celery tasks: `send_followup_message(job_id)` |
| `service.py` | Ao criar/alterar consulta, agenda jobs conforme regras |
| `router.py` | CRUD de regras e histórico de execuções |
| `models.py` | `FollowupRule`, `FollowupJob` |

**Triggers suportados:** `consultation_scheduled`, `consultation_confirmed`, `consultation_cancelled`, `no_show`

---

## admin

**Responsabilidade:** Setup wizard e configurações globais do sistema.

| Arquivo | Função |
|---|---|
| `router.py` | Endpoints de setup, settings, OAuth Google, audit logs |
| `setup_router.py` | Validação e persistência de cada etapa do wizard |
| `schemas.py` | Schemas de configuração por módulo |

**Configurações gerenciadas:**
- Informações do escritório (nome, timezone, SLA hours)
- Integração Telegram / WhatsApp (Evolution API)
- Provider de LLM (OpenAI ou Local)
- Provider de agenda (Google Calendar ou Local)
- Regras de follow-up
- API key para webhook de leads externos
