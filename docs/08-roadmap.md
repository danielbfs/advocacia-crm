---
tags: [advocacia-crm, roadmap]
created: 2026-04-27
updated: 2026-07-02
status: ativo
version: 1.0
---

# Roadmap — AdvocacIA CRM

## Phase 0 — Transformação (em andamento)

Execução do [[10-transformation-plan]]:

- [ ] Fase 0 — Fundação do repositório (`advocacia-crm`, renomes de infra)
- [ ] Fase 1 — Design system "Cartório Noturno" ([[11-design-system]])
- [ ] Fase 2 — Rebranding textual do frontend
- [ ] Fase 3 — Rename de domínio no backend (clients, lawyers, practice_areas, consultations)
- [ ] Fase 4 — IA Comercial para advocacia (prompts + compliance OAB/LGPD)
- [ ] Fase 5 — CI/CD com deploy automático ([[12-cicd-pipeline]])
- [ ] Fase 6 — Limpeza e verificação final

### Herdado e já funcional (da base Open Clinic)
- [x] Scaffold completo (Docker, FastAPI, Next.js, PostgreSQL, Redis, Traefik)
- [x] Migrations com Alembic
- [x] Auth (JWT, roles)
- [x] CRUD de contatos convertidos e histórico
- [x] Cadastro de profissionais e áreas
- [x] SchedulingService — adapter `local_db`, disponibilidade, conflitos
- [x] Leads — CRUD, pipeline, interações, kanban
- [x] SLA de leads — Celery Beat + notificações
- [x] Webhook de entrada de leads externos (UTMs)
- [x] AI Engine — function calling + controle humano/IA por lead
- [x] Follow-up automático via Celery
- [x] WhatsApp via Evolution API + caixa compartilhada
- [x] Relatórios de funil, origem, SLA e campanhas

---

## Phase 1 — Consolidação comercial (pós-transformação)

**Objetivo:** o CRM redondo para a rotina de vendas do escritório.

- [ ] Dashboard comercial: propostas paradas, leads vencendo SLA, consultas do dia
- [ ] Modelos de proposta de honorários (templates por área) com envio pelo WhatsApp
- [ ] Motivo de perda obrigatório + relatório de perdas por motivo/área
- [ ] Metas mensais por usuário comercial (leads contatados, conversões)
- [ ] Importação de leads via CSV

## Phase 2 — Inteligência de captação

**Objetivo:** aumentar conversão e ROI de campanhas.

- [ ] Qualificação automática por IA: resumo do caso + área sugerida no cartão do lead
- [ ] Reengajamento automático de propostas sem resposta (cadência configurável)
- [ ] Recuperação de no-show de consultas
- [ ] Relatórios de ROI: custo por lead/consulta por campanha (UTMs)
- [ ] Alertas críticos: lead quente sem contato humano > 30 min

## Phase 3 — Ecossistema AdvocacIA

**Objetivo:** integrar a linhagem.

- [ ] **Integração com AdvocacIA GED:** cliente fechado no CRM → cria cliente/pasta no GED
- [ ] Contrato de honorários: geração assistida + assinatura eletrônica
- [ ] Pagamentos (Asaas/Stripe): entrada de honorários no fechamento
- [ ] Google Calendar Adapter — sincronia bidirecional para advogados
- [ ] App mobile (PWA) para notificações da equipe comercial
- [ ] Suporte a Local LLM para escritórios com exigência de privacidade total
