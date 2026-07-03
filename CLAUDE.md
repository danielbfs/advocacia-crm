# CLAUDE.md — AdvocacIA CRM

Instruções para agentes de IA trabalhando neste repositório.

## O que é este projeto

**AdvocacIA CRM** — gestão comercial (leads, pipeline de vendas, atendimento IA) para escritórios de advocacia. O código está **em transformação** a partir da base Open Clinic AI (CRM de clínicas): a terminologia clínica (`patient`, `doctor`, `specialty`, `appointment`, `clinic`) ainda existe no código e será renomeada para o domínio jurídico (`client`, `lawyer`, `practice_area`, `consultation`, `firm`).

**Antes de programar qualquer alteração, leia:**

1. `docs/10-transformation-plan.md` — plano-mestre: fases, dicionário canônico de renomes (§3), critérios de aceite. **É a fonte de verdade da transformação.**
2. `docs/11-design-system.md` — identidade visual "Cartório Noturno" (tokens exatos, login, app shell). Não invente cores/estilos fora dela.
3. `docs/12-cicd-pipeline.md` — CI/CD e deploy automático.

Os docs `00`–`09` descrevem o **estado-alvo** do sistema, não necessariamente o código atual.

## Regras críticas

- O `origin` deste repositório é `https://github.com/danielbfs/advocacia-crm` (push liberado). **NUNCA aponte o remote de volta para `danielbfs/openclinic`** — esse é o produto de clínicas em produção; confira com `git remote -v` em caso de dúvida.
- Todo rename de domínio deve seguir o dicionário de `docs/10-transformation-plan.md` §3 — não crie sinônimos próprios.
- A IA Comercial NUNCA pode dar aconselhamento jurídico, prometer resultado ou citar honorários não configurados (compliance OAB — ver `docs/06-ai-design.md`).
- Banco de dados de produção é novo (Neon, database `advocacia_crm`) — nunca apontar para o banco do openclinic.
- Idioma da UI e da documentação: português do Brasil.

## Stack e comandos

- Backend: FastAPI (Python 3.12) + Celery + SQLAlchemy/Alembic — `backend/`
- Frontend: Next.js 14 App Router + TypeScript + Tailwind — `frontend/`
- Dev local: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` (backend :8000, frontend :3000)
- Migrations: `docker compose exec backend alembic upgrade head`
- Build frontend: `cd frontend && npm run build`; typecheck: `npx tsc --noEmit`
