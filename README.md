# AdvocacIA CRM

CRM comercial para **escritórios de advocacia**: captação e gestão de leads, pipeline de vendas (funil de honorários), atendimento automatizado com IA via WhatsApp/Telegram, SLA de retorno e agenda de consultas com advogados.

> Parte da linhagem **AdvocacIA**: este repositório é o **CRM (gestão comercial)**; o **AdvocacIA GED** (gestão de documentos e processos) vive em repositório próprio. Os dois compartilham a mesma identidade visual ("Cartório Noturno") e a mesma marca.

> **Status:** projeto em transformação a partir da base Open Clinic AI. A estratégia completa, fase a fase, está em [`docs/10-transformation-plan.md`](docs/10-transformation-plan.md) — **leia esse documento antes de qualquer alteração de código.**

---

## Funcionalidades

- **IA Comercial** via WhatsApp e Telegram — acolhe o lead, qualifica o caso, agenda consulta com o advogado (sem jamais dar aconselhamento jurídico)
- **Pipeline de vendas** — kanban de leads: Novo → Em Contato → Qualificado → Proposta de Honorários → Negociando → Cliente Fechado
- **SLA de retorno** — nenhum lead fica sem resposta; alertas automáticos ao responsável
- **Origem rastreada** — UTMs de Google Ads / Meta Ads, relatórios de conversão por campanha
- **Agenda do escritório** — consultas multi-advogado, multi-área, sem conflitos de horário
- **Follow-up automático** — confirmações de consulta, recuperação de no-show, reengajamento
- **Painéis por perfil** — Administrador, Comercial e Advogado

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | FastAPI (Python 3.12) + Celery |
| Frontend | Next.js 14 + TypeScript + TailwindCSS |
| Banco de dados | PostgreSQL 16 (Neon DB em produção) |
| Cache / Fila | Redis 7 |
| WhatsApp | Evolution API |
| Proxy / SSL | Traefik v3 + Let's Encrypt |
| Deploy | Docker + GitHub Actions (CI/CD automático) |

## Identidade visual

Tema **"Cartório Noturno"** — o mesmo do AdvocacIA GED: fundos tinta, texto pergaminho, acento vermelho-carimbo e dourado-selo; tipografia Spectral (títulos), Inter (texto) e JetBrains Mono (etiquetas). Especificação completa com tokens e componentes em [`docs/11-design-system.md`](docs/11-design-system.md).

---

## Deploy em produção (AWS Lightsail + Neon DB)

O deploy é **automático**: merge em `main` → GitHub Actions constrói as imagens, publica no ghcr.io e atualiza a VPS via SSH, com migrations e healthcheck. Detalhes e setup inicial em [`docs/12-cicd-pipeline.md`](docs/12-cicd-pipeline.md).

### Instalação inicial da VPS (uma vez)

1. Instância Lightsail (Ubuntu 22.04, 1 GB+ RAM) com Docker e IP estático; domínio com registro A apontando para ela.
2. Bancos no [neon.tech](https://neon.tech/): `advocacia_crm` e `evolution`.
3. Na VPS:
   ```bash
   git clone https://github.com/danielbfs/advocacia-crm.git
   cd advocacia-crm
   cp .env.lightsail.example .env
   nano .env   # DOMAIN, ACME_EMAIL, chaves de API, strings do Neon
   docker compose -f docker-compose.prod.yml up -d
   ./install_lightsail.sh   # migrations + usuários iniciais
   ```
4. Cadastrar os secrets de deploy no GitHub (ver [`docs/12-cicd-pipeline.md`](docs/12-cicd-pipeline.md) §2.2). A partir daí, todo merge em `main` atualiza a produção sozinho.

### Credenciais iniciais

| Usuário | Senha | Role |
|---|---|---|
| `admin` | `admin` | admin |
| `comercial` | `comercial` | secretary (equipe comercial) |

> **IMPORTANTE:** altere as senhas no primeiro acesso.

---

## Desenvolvimento local

```bash
git clone https://github.com/danielbfs/advocacia-crm.git
cd advocacia-crm

cp .env.example .env
# Editar .env com configurações locais (sem DOMAIN/ACME_EMAIL)

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Backend:  http://localhost:8000
# Frontend: http://localhost:3000
# API Docs: http://localhost:8000/docs
```

## Variáveis de ambiente obrigatórias (produção)

| Variável | Descrição |
|---|---|
| `DOMAIN` | Domínio do CRM (ex: `crm.escritorio.adv.br`) |
| `ACME_EMAIL` | E-mail para o Let's Encrypt |
| `DATABASE_URL` | String de conexão do Neon DB |
| `SECRET_KEY` | Chave secreta JWT (mín. 64 chars) |
| `OPENAI_API_KEY` | Chave da API OpenAI (IA Comercial) |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram (opcional) |
| `FIRM_TIMEZONE` | Fuso do escritório (default `America/Sao_Paulo`) |
| `FIRM_SLA_HOURS` | SLA de retorno a leads, em horas (default 2) |

Lista completa comentada em `.env.example` / `.env.lightsail.example`.

---

## Documentação

A documentação completa está em [`docs/`](docs/) — formatada para Obsidian. Os docs 00–09 descrevem o **estado-alvo** do sistema; os docs 10–12 descrevem a **transformação** em andamento.

| Arquivo | Conteúdo |
|---|---|
| [00-overview.md](docs/00-overview.md) | Visão geral e objetivos |
| [01-architecture.md](docs/01-architecture.md) | Arquitetura e decisões técnicas |
| [02-modules.md](docs/02-modules.md) | Módulos e responsabilidades |
| [03-database-schema.md](docs/03-database-schema.md) | Schema do banco de dados |
| [04-scheduling-system.md](docs/04-scheduling-system.md) | Sistema de agenda de consultas |
| [05-api-design.md](docs/05-api-design.md) | Design da API |
| [06-ai-design.md](docs/06-ai-design.md) | IA Comercial e function calling |
| [07-deployment.md](docs/07-deployment.md) | Deploy, Docker e Traefik |
| [08-roadmap.md](docs/08-roadmap.md) | Roadmap de desenvolvimento |
| [09-risks.md](docs/09-risks.md) | Riscos e mitigações |
| [**10-transformation-plan.md**](docs/10-transformation-plan.md) | **Plano-mestre da transformação Open Clinic → AdvocacIA CRM** |
| [11-design-system.md](docs/11-design-system.md) | Design system "Cartório Noturno" |
| [12-cicd-pipeline.md](docs/12-cicd-pipeline.md) | CI/CD e deploy automático |

## Licença

MIT License — veja [LICENSE](LICENSE) para detalhes.

---

> Cada instância é independente — os dados do escritório ficam na infraestrutura dele.
