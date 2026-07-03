---
tags: [advocacia-crm, architecture]
created: 2026-04-23
updated: 2026-07-02
status: alvo
---

# Arquitetura — AdvocacIA CRM

> Estado-alvo. A arquitetura é herdada do Open Clinic AI sem mudanças estruturais — muda a terminologia de domínio ([[10-transformation-plan]] §3).

## Decisões de Stack

### Backend: FastAPI (Python 3.12)
- Ecossistema AI nativo (OpenAI SDK, Ollama, LangChain)
- `async/await` nativo — essencial para webhooks e filas
- Pydantic v2 para validação e schemas tipados
- OpenAPI auto-gerado (docs sempre atualizados)
- Celery integrado naturalmente

### Frontend: Next.js 14 + TypeScript
- App Router com React Server Components
- TailwindCSS com o design system "Cartório Noturno" ([[11-design-system]])
- Roles: `admin`, `secretary` (Comercial) e `lawyer`, com rotas protegidas

### Infra
- **PostgreSQL 16** — dados primários (Neon DB em produção)
- **Redis 7** — fila Celery + cache de sessão de conversa (TTL 24h)
- **Celery** — workers assíncronos + beat scheduler
- **Traefik v3** — reverse proxy + SSL automático via Let's Encrypt
- **Docker + Docker Compose** — deploy em VPS, imagens via ghcr.io ([[12-cicd-pipeline]])

---

## Diagrama de Alto Nível

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENTES EXTERNOS                          │
│   Lead/Cliente                Admin / Comercial / Advogado        │
│ [Telegram] [WhatsApp]         [Browser → Next.js]                │
└──────┬──────────┬──────────────────────┬───────────────────────┘
       │          │                      │
       ▼          ▼                      ▼
┌──────────────────────┐      ┌────────────────────────────────────┐
│  MESSAGING GATEWAY    │      │      Traefik (Reverse Proxy)       │
│  Telegram / WA       │      │  :80 → redirect :443               │
│  Adapters            │      │  :443 → backend /api + /webhooks   │
└──────────┬───────────┘      │         frontend /                 │
           │                  └────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (port 8000)                    │
│                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────────┐   │
│  │ Messaging  │  │ AI Engine  │  │    SchedulingService      │   │
│  │  Module    │→ │  Module    │→ │  (Abstraction Layer)      │   │
│  └────────────┘  └────────────┘  │  ┌────────┐ ┌─────────┐ │   │
│                                  │  │ GCal   │ │ LocalDB │ │   │
│  ┌────────────┐  ┌────────────┐  │  │ Adapter│ │ Adapter │ │   │
│  │  Clients   │  │  Leads     │  │  └────────┘ └─────────┘ │   │
│  │   Module   │  │  Module    │  └──────────────────────────┘   │
│  └────────────┘  └────────────┘                                  │
│                                  ┌──────────────────────────┐   │
│  ┌────────────┐  ┌────────────┐  │   Auth + Audit Module    │   │
│  │  Follow-up │  │  Reports   │  │   JWT + RBAC + Logs      │   │
│  │   Module   │  │   Module   │  └──────────────────────────┘   │
│  └────────────┘  └────────────┘                                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
           ┌───────────────────┼────────────────────┐
           ▼                   ▼                    ▼
   ┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐
   │ PostgreSQL   │   │    Redis     │   │   APIs Externas        │
   │ (Neon/local) │   │  Queue+Cache │   │   Google Calendar      │
   └──────────────┘   └──────────────┘   │   OpenAI / Local LLM  │
                               │          │   Meta Ads / Google Ads│
                     ┌─────────┴───────┐  └───────────────────────┘
                     ▼                 ▼
             ┌─────────────┐  ┌──────────────┐
             │Celery Worker│  │ Celery Beat  │
             │ (followup,  │  │ (cron tasks) │
             │  leads SLA) │  └──────────────┘
             └─────────────┘
```

---

## Fluxo Principal: Lead → Consulta agendada (via IA)

```
[Interessado envia mensagem no WhatsApp]
  → Webhook POST /api/v1/webhooks/whatsapp/{token}
    → MessagingGateway normaliza para MessagePayload
      → Lead criado/atualizado no pipeline
        → Sessão de conversa carregada do Redis
          → AI Engine: histórico + nova mensagem → LLM
            → LLM qualifica (área de atuação, resumo do caso)
              → tool: check_availability(practice_area_id)
                → SchedulingService → Adapter → slots livres
              → LLM oferece horários de consulta
          → Resposta enviada via WhatsApp
          → Conversa salva no Redis (TTL 24h) e PostgreSQL
```

## Fluxo Principal: Lead → Conversão (pipeline comercial)

```
[Lead entra via Google Ads]
  → POST /api/v1/leads/webhook/inbound (X-API-Key)
    → Lead criado com status "novo"
    → SLA calculado (created_at + FIRM_SLA_HOURS)
    → Equipe comercial notificada
      → Comercial acessa Kanban → abre lead → registra contato
        → status: "em_contato" → contacted_at registrado
          → Envia proposta de honorários → status: "proposta_enviada"
            → Lead aceita → Convert Lead
              → Client criado → Consultation agendada
                → status: "convertido" → KPI atualizado
```
