---
tags: [advocacia-crm, overview]
created: 2026-04-23
updated: 2026-07-02
status: alvo
---

# AdvocacIA CRM — Visão Geral

> Este documento descreve o **estado-alvo** do produto. O código atual ainda está em transformação a partir da base Open Clinic AI — ver [[10-transformation-plan]].

## O que é

AdvocacIA CRM é o sistema de **gestão comercial para escritórios de advocacia**: captação de leads, pipeline de vendas de honorários, atendimento automatizado com IA e agenda de consultas com advogados.

É o segundo produto da **linhagem AdvocacIA**:

| Produto | Função | Repositório |
|---|---|---|
| **AdvocacIA GED** | Gestão de documentos, processos e controle de acesso | repositório próprio (`AdvocacIA`) |
| **AdvocacIA CRM** | Vendas, leads, pipeline comercial e atendimento IA | este repositório |

Ambos compartilham a identidade visual **"Cartório Noturno"** ([[11-design-system]]) e a marca `AdvocaIA` — o CRM se identifica pelo sufixo `· CRM`.

**Modelo de deploy:** uma instância por escritório (isolamento total de dados). Cada escritório roda sua própria instância.

## Problema que resolve

Escritórios de advocacia perdem clientes potenciais por:
- Demora no retorno a interessados (WhatsApp, Instagram, Google)
- Nenhum controle do funil: quem pediu proposta? quem está negociando? por que perdeu?
- Falta de follow-up (proposta enviada e esquecida; consulta desmarcada sem remarcação)
- Nenhuma rastreabilidade de origem dos leads (Google Ads, Meta Ads, indicação)
- Agenda de consultas iniciais desorganizada entre advogados e áreas

## Funcionalidades principais

| Módulo | Descrição |
|---|---|
| **IA Comercial** | Atendimento via WhatsApp e Telegram — qualifica o lead e agenda consulta; nunca dá aconselhamento jurídico |
| **Pipeline de Vendas** | Kanban: Novo → Em Contato → Qualificado → Proposta de Honorários → Negociando → Cliente Fechado / Perdido |
| **SLA de Retorno** | Prazo máximo de resposta a cada lead, com alertas ao responsável |
| **Agenda** | Consultas multi-advogado, multi-área de atuação, com bloqueio de conflitos |
| **Follow-up** | Lembretes automáticos de consulta, recuperação de no-show, reengajamento de propostas paradas |
| **Interface Comercial** | Calendário, kanban de leads, caixa compartilhada de WhatsApp, agendamento manual |
| **Painel Admin** | Setup wizard, cadastros (advogados, áreas, usuários), configurações e relatórios |
| **Relatórios** | Funil de vendas, origem dos leads, SLA, performance por campanha, honorários estimados no pipeline |

## Público-alvo

- Escritórios de advocacia de pequeno e médio porte (1 a 30 advogados)
- Áreas com alto volume de captação digital: trabalhista, previdenciário, cível, família, tributário
- Equipe comercial/recepção que faz o primeiro atendimento

## Perfis de usuário

| Role | Quem é | O que vê |
|---|---|---|
| `admin` | Sócio/gestor | Tudo: cadastros, relatórios, configurações |
| `secretary` (label "Comercial") | Equipe de vendas/recepção | Kanban de leads, agenda, caixa de WhatsApp |
| `lawyer` | Advogado | Própria agenda e clientes |

## Links desta documentação

- [[01-architecture]] — Arquitetura técnica
- [[02-modules]] — Módulos e responsabilidades
- [[03-database-schema]] — Schema do banco de dados
- [[04-scheduling-system]] — Sistema de agenda
- [[05-api-design]] — Design da API
- [[06-ai-design]] — IA Comercial
- [[07-deployment]] — Deploy e infraestrutura
- [[08-roadmap]] — Roadmap
- [[09-risks]] — Riscos e mitigações
- [[10-transformation-plan]] — **Plano-mestre da transformação**
- [[11-design-system]] — Design system Cartório Noturno
- [[12-cicd-pipeline]] — CI/CD e deploy automático
