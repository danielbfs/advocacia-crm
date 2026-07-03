---
tags: [advocacia-crm, transformation, plan, spec]
created: 2026-07-02
status: aguardando-aprovacao
---

# Plano de Transformação — Open Clinic AI → AdvocacIA CRM

> **Este é o documento-mestre da transformação.** Ele foi escrito para que qualquer pessoa (ou IA) consiga executar as alterações sem contexto adicional. Os demais documentos em `docs/` descrevem o **estado-alvo** do sistema; este documento descreve o **delta** entre o código atual (Open Clinic AI) e o alvo (AdvocacIA CRM).

---

## 1. Visão

O código atual desta pasta é o **Open Clinic AI** (CRM comercial para clínicas, já deployado em produção em outro repositório/servidor). Ele será transformado no **AdvocacIA CRM** — o módulo de **gestão comercial (vendas, leads, pipeline)** da linhagem de produtos AdvocacIA:

| Produto | Pasta | Função |
|---|---|---|
| **AdvocacIA GED** | `D:\Projetos\AdvocacIA` | Gestão de documentos, processos e acesso (já existente) |
| **AdvocacIA CRM** | `D:\Projetos\Advocacia-crm` (esta pasta) | Vendas, leads, pipeline comercial, atendimento IA (este plano) |

Os dois produtos compartilham a **mesma identidade visual** ("Cartório Noturno" — ver [[11-design-system]]), a mesma marca (`AdvocaIA`) e o mesmo estilo de tela de login, diferenciando-se pelo sufixo do produto (`· CRM`) e pelos textos editoriais.

**O que muda:** identidade visual, marca, terminologia de domínio (clínica → escritório de advocacia), prompts de IA e infra de deploy (novo repositório + CI/CD automático).

**O que NÃO muda:** arquitetura (FastAPI + Celery + Next.js + PostgreSQL + Redis + Traefik), fluxos de negócio (lead → contato → proposta → conversão), mecanismos de SLA, follow-up, mensageria (Telegram/WhatsApp via Evolution API) e AI Engine.

---

## 2. Abordagens consideradas

| Abordagem | Descrição | Prós | Contras |
|---|---|---|---|
| **A. Rebranding de superfície** | Trocar apenas visual, labels e textos de UI; manter `patient/doctor/clinic` no código e banco | Rápido (2–3 dias); risco quase zero | Código mente sobre o domínio; toda manutenção futura (humana ou IA) tropeça em nomes errados; dívida permanente |
| **B. Transformação completa** ✅ | Renomear domínio de ponta a ponta: tabelas, models, endpoints, rotas, env vars, prompts | Codebase coerente; documentação = código; IAs futuras programam sem ambiguidade | Mais trabalho (1–2 semanas); exige migrations novas |
| **C. Híbrido congelado** | Visual agora, rename "um dia" | Entrega visual rápida | O "um dia" nunca chega; pior dos dois mundos |

**Decisão: Abordagem B, executada em fases incrementais** (o visual entrega valor primeiro, o rename vem logo em seguida — ver §5). Justificativa decisiva: este é um **produto novo, com repositório novo e banco de dados novo**. Não há dados de produção a migrar — o Open Clinic original continua vivo no repositório/servidor dele. Isso permite **resetar a cadeia de migrations** com uma migration inicial limpa já com os nomes novos, eliminando o maior custo da Abordagem B.

---

## 3. Mapeamento de domínio (dicionário canônico)

Toda alteração de nome deve seguir esta tabela. Ela é a **fonte única de verdade** para o rename.

### 3.1 Entidades

| Conceito clínica (atual) | Conceito advocacia (alvo) | Tabela atual → alvo | Model atual → alvo |
|---|---|---|---|
| Paciente | **Cliente** | `patients` → `clients` | `Patient` → `Client` |
| Contato do paciente | Contato do cliente | `patient_contacts` → `client_contacts` | `PatientContact` → `ClientContact` |
| Médico | **Advogado** | `doctors` → `lawyers` | `Doctor` → `Lawyer` |
| Especialidade | **Área de Atuação** | `specialties` → `practice_areas` | `Specialty` → `PracticeArea` |
| Consulta/Agendamento | **Consulta** (consulta jurídica/reunião) | `appointments` → `consultations` | `Appointment` → `Consultation` |
| Agenda do médico | Agenda do advogado | `doctor_schedules` → `lawyer_schedules` | `DoctorSchedule` → `LawyerSchedule` |
| Bloqueio de agenda | (igual) | `schedule_blocks` (mantém) | `ScheduleBlock` (mantém) |
| Lead | Lead (mantém) | `leads` (mantém) | `Lead` (mantém) |
| Clínica | **Escritório** | — | — |

Campos internos que mudam junto: `patient_id` → `client_id`, `doctor_id` → `lawyer_id`, `specialty_id` → `practice_area_id`, `appointment_id` → `consultation_id`, `converted_patient_id` → `converted_client_id`, `crm` (registro do médico) → `oab` (registro OAB do advogado), `patient_notes` → `client_notes`, `crm_status` → `client_status`.

### 3.2 Pipeline de vendas

A máquina de estados (`backend/app/modules/leads/pipeline.py`) mantém a estrutura; muda um estágio e os labels:

| Status atual | Status alvo | Label alvo |
|---|---|---|
| `novo` | `novo` | Novo |
| `em_contato` | `em_contato` | Em Contato |
| `qualificado` | `qualificado` | Qualificado |
| `orcamento_enviado` | `proposta_enviada` | Proposta de Honorários Enviada |
| `negociando` | `negociando` | Negociando |
| `convertido` | `convertido` | Cliente Fechado |
| `perdido` | `perdido` | Perdido |

Campo `quote_value` → `proposal_value` (valor da proposta de honorários).

Motivos de perda (`LOST_REASONS`) adaptados:

| value | label |
|---|---|
| `sem_resposta` | Sem resposta |
| `honorarios` | Honorários (preço) |
| `ja_tem_advogado` | Já tem advogado / contratou outro |
| `fora_de_area` | Fora das áreas de atuação |
| `sem_viabilidade` | Caso sem viabilidade jurídica |
| `mudou_de_ideia` | Mudou de ideia |
| `duplicado` | Lead duplicado |
| `outro` | Outro |

**Conversão:** lead `convertido` cria um `Client` e, opcionalmente, uma `Consultation` (consulta inicial com o advogado) — mesmo mecanismo atual de patient + appointment.

### 3.3 Roles e usuários

| Role atual | Role alvo | Label na UI |
|---|---|---|
| `admin` | `admin` (mantém) | Administrador |
| `secretary` | `secretary` (mantém a chave) | **Comercial** (equipe de vendas/recepção) |
| `doctor` | `lawyer` | Advogado |

> Manter as chaves `admin`/`secretary` evita tocar no fluxo de auth; apenas `doctor` → `lawyer` muda porque a rota `/doctor` do frontend vira `/lawyer`.

Usuários seed: `admin`/`admin` e `comercial`/`comercial` (substitui `secretaria`/`secretaria`).

### 3.4 Módulos backend

| Módulo atual | Módulo alvo | Observação |
|---|---|---|
| `modules/crm` | `modules/clients` | CRUD de clientes convertidos |
| `modules/scheduling` | `modules/scheduling` (mantém) | Renomeiam-se só os termos internos |
| `modules/leads` | `modules/leads` (mantém) | Renomeiam-se campos e labels |
| `modules/followup` | `modules/followup` (mantém) | Triggers `appointment_*` → `consultation_*` |
| `modules/messaging` | `modules/messaging` (mantém) | — |
| `modules/ai` | `modules/ai` (mantém) | Prompts reescritos (ver §5, Fase 4) |
| `modules/admin` | `modules/admin` (mantém) | Settings `clinic` → `firm` |
| `modules/auth` | `modules/auth` (mantém) | Só o role `doctor` → `lawyer` |

### 3.5 Rotas do frontend

| Rota atual | Rota alvo |
|---|---|
| `/admin/patients` | `/admin/clients` |
| `/admin/doctors` | `/admin/lawyers` |
| `/admin/specialties` | `/admin/practice-areas` |
| `/admin/appointments` | `/admin/consultations` |
| `/admin/calendar` | `/admin/calendar` (label: "Agenda do Escritório") |
| `/doctor/**` | `/lawyer/**` |
| `/secretary/**` | `/secretary/**` (labels: "Comercial") |
| demais | mantêm |

### 3.6 Variáveis de ambiente e infra

| Atual | Alvo |
|---|---|
| `CLINIC_TIMEZONE` | `FIRM_TIMEZONE` |
| `CLINIC_SLA_HOURS` | `FIRM_SLA_HOURS` |
| `CLINIC_NAME` (system_config) | `FIRM_NAME` |
| rede docker `openclinic_internal` | `advocacia_crm_internal` |
| imagens `ghcr.io/danielbfs/openclinic-*` | `ghcr.io/danielbfs/advocacia-crm-*` |
| `EVOLUTION_INSTANCE_NAME=openclinic` | `advocacia-crm` |
| repo `github.com/danielbfs/openclinic` | `github.com/danielbfs/advocacia-crm` |

> **Retrocompatibilidade de env:** no `config.py`, ler `FIRM_*` com fallback para `CLINIC_*` durante a transição, removendo o fallback na Fase 6.

### 3.7 Marca e textos

| Contexto | Texto |
|---|---|
| Nome do produto | **AdvocacIA CRM** |
| Logomarca (igual ao GED) | `Advoca` + `IA` em vermelho-carimbo, ícone `Scale` (lucide) em quadrado carimbo |
| Sufixo distintivo do produto | `· CRM` (o GED usa `· Gestão`) |
| Tagline do login | "Do primeiro contato ao contrato assinado." |
| Subtítulo do login | "Gestão comercial do escritório: leads, pipeline de vendas e atendimento com IA — nada escapa do funil." |
| Título da sidebar | `AdvocaIA · CRM` |
| `<title>` / metadata | `AdvocacIA CRM — Gestão Comercial` |

---

## 4. Identidade visual

A especificação completa (tokens, fontes, componentes, tela de login) está em [[11-design-system]]. Resumo do que será aplicado:

- **Tema "Cartório Noturno"** (dark): fundos tinta (`#16140f`), texto pergaminho (`#ede6d6`), acento vermelho-carimbo (`#d6492f`), dourado-selo (`#b8915a`).
- **Fontes:** Spectral (display/serif), Inter (texto), JetBrains Mono (código/etiquetas) — via `next/font/google`.
- **Login split-screen editorial** idêntico ao GED, com textos do CRM.
- **App shell**: sidebar de 15rem com borda `line`, item ativo com barra vermelha à esquerda, branding mono uppercase.

---

## 5. Fases de execução

Cada fase é um PR independente, com critérios de aceite verificáveis. Ordem pensada para entregar o visual primeiro (validação do usuário) e o rename depois.

### Fase 0 — Fundação do repositório (½ dia)

1. Criar repositório GitHub **`danielbfs/advocacia-crm`** (privado ou público, a decidir) e apontar o `origin` desta pasta para ele. **Não** fazer push para o repo `openclinic` — ele continua sendo o produto de clínicas em produção.
2. Renomear referências de infra: `docker-compose*.yml` (nomes de rede, labels traefik `openclinic-*` → `advocacia-crm-*`, comentários), `install*.sh`, `update*.sh`, `.env.example`, `.env.lightsail.example`.
3. Remover artefatos herdados que não pertencem ao novo produto: workflows `gemini-*.yml` e `.github/commands/` (a menos que se queira o triage Gemini no novo repo — decisão do usuário; default: remover), `check_db.py`, `debug_server.py`, `update_server.py` se não usados.
4. Atualizar `publish.yml` → renomear imagens para `advocacia-crm-backend`/`advocacia-crm-frontend` (será substituído pelo pipeline completo na Fase 5).

**Aceite:** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` sobe o sistema local sem qualquer referência a "openclinic" em nomes de containers/redes/imagens.

### Fase 1 — Design System "Cartório Noturno" (2–3 dias)

Somente frontend; zero mudança de backend. Seguir [[11-design-system]] à risca.

1. `frontend/src/app/layout.tsx`: carregar Spectral, Inter e JetBrains Mono via `next/font/google`; aplicar variáveis `--font-display`, `--font-sans`, `--font-mono`; metadata `AdvocacIA CRM`.
2. `frontend/tailwind.config.ts`: substituir a paleta atual (azul/cinza claro) pelos tokens Cartório Noturno (ver design system §2).
3. `frontend/src/app/globals.css`: fundo `ink`, texto `parchment`, `color-scheme: dark`, seleção carimbo, animação `rise`.
4. **Login** (`frontend/src/app/(auth)/login/page.tsx`): reescrever com o layout split-screen editorial do GED (design system §5) — coluna esquerda com tese editorial do CRM ("Do primeiro contato ao contrato assinado."), selo, linha vertical carimbo; coluna direita com formulário usuário/senha (mantém a lógica de auth atual, que usa username — não email).
5. **App shell**: reescrever `admin/layout.tsx`, `secretary/layout.tsx`, `doctor/layout.tsx` e `components/app-header.tsx` com o padrão do GED (sidebar escura com borda `line`, barra ativa carimbo, branding `AdvocaIA · CRM`).
6. Varredura de estilos nas páginas: substituir classes de tema claro (`bg-white`, `bg-gray-50`, `text-gray-900`, `shadow-sm`, `rounded-xl` etc.) pelos equivalentes do design system (`bg-ink-2`, `border-line`, `text-parchment`, `rounded-sm`). O design system §6 traz a tabela de conversão classe-a-classe.

**Aceite:** todas as telas renderizam no tema escuro sem regressão funcional; a tela de login é visualmente irmã da tela do GED, com textos do CRM; screenshot de login + kanban + dashboard aprovados pelo usuário.

### Fase 2 — Rebranding textual do frontend (1 dia)

1. Trocar todos os textos de UI conforme §3.7 e labels de navegação: "Agenda da Clínica" → "Agenda do Escritório", "Pacientes" → "Clientes", "Médicos" → "Advogados", "Especialidades" → "Áreas de Atuação", "Atendente IA" → "IA Comercial" (mantém), etc.
2. Renomear rotas do frontend conforme §3.5 (pastas em `src/app/`), com `redirect()` das rotas antigas durante a transição.
3. Tipos em `src/types/` e chamadas em `src/lib/` continuam apontando para a API antiga até a Fase 3 — criar camada fina de alias se necessário (ex.: `type Client = Patient`).

**Aceite:** nenhuma menção visível a clínica/paciente/médico na UI; navegação funciona nas rotas novas.

### Fase 3 — Rename de domínio no backend (3–4 dias)

O maior bloco. Executar módulo a módulo, na ordem abaixo, atualizando o frontend consumidor no mesmo PR de cada módulo. Seguir o dicionário §3.1–3.4.

1. **Reset de migrations:** apagar `backend/migrations/versions/*` e gerar uma migration inicial única `advocacia_crm_initial` com o schema alvo completo (ver [[03-database-schema]]). Banco novo — sem migração de dados.
2. `modules/admin`: settings `clinic` → `firm`; `config.py` com `FIRM_*` (fallback `CLINIC_*`).
3. `modules/crm` → `modules/clients`: model `Client`, endpoints `/api/v1/clients`.
4. `modules/scheduling`: `Doctor` → `Lawyer`, `Specialty` → `PracticeArea`, `Appointment` → `Consultation`; endpoints `/lawyers`, `/practice-areas`, `/consultations`, `/scheduling/*` (params `lawyer_id`, `practice_area_id`).
5. `modules/leads`: campos `specialty_id` → `practice_area_id`, `quote_value` → `proposal_value`, `converted_patient_id` → `converted_client_id`; pipeline §3.2; relatórios renomeados.
6. `modules/followup`: triggers `consultation_scheduled|confirmed|cancelled`, `no_show` (mantém).
7. `modules/ai` + `modules/messaging`: renomes de referência (`patient` → `client` nas sessões, tools — conteúdo dos prompts fica para a Fase 4).
8. `seed.py` / `seed_rules.py`: dados de exemplo advocatícios (áreas: Trabalhista, Cível, Família, Previdenciário, Tributário, Criminal; advogados fictícios com OAB).

**Aceite:** `alembic upgrade head` num banco vazio cria o schema alvo; `grep -ri "patient\|doctor\|specialty\|clinic" backend/app frontend/src` retorna zero ocorrências de domínio (exceto changelog/comentários históricos); fluxo e2e completo funciona: criar lead → contato → proposta → converter em cliente + consulta.

### Fase 4 — IA Comercial para advocacia (1–2 dias)

1. Reescrever `modules/ai/prompts.py`: o assistente é o **atendente comercial do escritório** — acolhe o lead, entende o caso em linhas gerais, coleta nome/contato/área, qualifica e agenda consulta com advogado. 
2. **Regras obrigatórias do prompt** (compliance OAB/LGPD):
   - NUNCA dar aconselhamento jurídico ou opinião sobre mérito/viabilidade do caso — sempre direcionar para a consulta com advogado.
   - NUNCA prometer resultado, prazo de êxito ou valor de indenização (vedação do Código de Ética e Provimento 205/2021 OAB sobre publicidade).
   - Não mencionar honorários específicos, salvo se configurado pelo escritório.
   - Tratar dados pessoais com sigilo (LGPD) e informar que a conversa é registrada.
   - Escalar para humano (`escalate_to_human`) diante de urgência (prisão em flagrante, prazo fatal, medida protetiva).
3. Tools renomeadas: `book_consultation`, `cancel_consultation`, `reschedule_consultation`, `get_client_consultations`, `check_availability(practice_area_id, ...)`.
4. Textos do módulo `ia-comercial` do admin ajustados para o contexto jurídico.

**Aceite:** conversa simulada no Telegram/WhatsApp qualifica um lead trabalhista e agenda consulta sem opinar sobre o caso.

### Fase 5 — CI/CD com deploy automático (1 dia)

Especificação completa em [[12-cicd-pipeline]]. Resumo: `ci.yml` (lint/build em PR) + `deploy.yml` (push em `main` → build/push imagens ghcr → SSH na VPS → `docker compose pull && up -d` + migrations + healthcheck).

**Aceite:** merge em `main` publica imagens e atualiza a VPS sem intervenção manual; healthcheck verde no final do workflow.

### Fase 6 — Limpeza e verificação final (½ dia)

1. Remover fallbacks `CLINIC_*`, redirects de rotas antigas e aliases de tipos.
2. Rodar checklist de verificação: build frontend sem warnings, `alembic upgrade head` limpo, e2e manual dos 3 perfis (admin, comercial, advogado), relatórios com dados seed.
3. Revisar documentação `docs/` contra o código final (os docs descrevem o alvo; nesta fase eles devem descrever a realidade).

---

## 6. Estimativa total

| Fase | Esforço |
|---|---|
| 0 — Fundação | 0,5 dia |
| 1 — Design system | 2–3 dias |
| 2 — Rebranding frontend | 1 dia |
| 3 — Rename backend | 3–4 dias |
| 4 — IA advocacia | 1–2 dias |
| 5 — CI/CD | 1 dia |
| 6 — Limpeza | 0,5 dia |
| **Total** | **9–12 dias úteis** |

---

## 7. Riscos específicos da transformação

| Risco | Mitigação |
|---|---|
| Rename parcial deixa código híbrido (patient + client convivendo) | Fases 3.x atômicas por módulo; critério de aceite com `grep` de varredura |
| Push acidental para o repo `openclinic` em produção | Fase 0 troca o `origin` antes de qualquer commit; conferir `git remote -v` |
| Tema escuro quebrar telas não mapeadas | Tabela de conversão classe-a-classe no design system + revisão visual tela a tela na Fase 1 |
| Migrations resetadas colidirem com banco existente | O CRM usa banco novo (Neon: criar database `advocacia_crm`); nunca apontar para o banco do openclinic |
| IA opinar juridicamente (risco OAB) | Regras obrigatórias no system prompt (Fase 4) + testes de conversa adversariais |

Riscos gerais do produto: [[09-risks]].

---

## 8. Aprovações pendentes (decisões do usuário)

1. **Nome do repositório GitHub**: sugerido `danielbfs/advocacia-crm`. Público ou privado?
2. **Domínio de produção** do CRM (ex.: `crm.advocacia.seudominio.com`) — necessário para o `.env` e o Traefik.
3. **Manter workflows Gemini** (`gemini-*.yml`) no novo repo? Default deste plano: remover.
4. **Servidor alvo do deploy automático**: mesma VPS Lightsail atual (novo conjunto de containers) ou VPS dedicada? Default deste plano: VPS dedicada (isolamento do openclinic em produção).
5. Aprovação dos textos de marca (§3.7) e dos estágios do pipeline (§3.2).

## Links

- [[00-overview]] — visão do produto alvo
- [[11-design-system]] — identidade visual Cartório Noturno
- [[12-cicd-pipeline]] — pipeline de deploy
- [[03-database-schema]] — schema alvo
