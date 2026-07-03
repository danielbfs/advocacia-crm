---
tags: [advocacia-crm, cicd, github-actions, deploy]
created: 2026-07-02
status: aguardando-aprovacao
---

# CI/CD — Deploy Automático via GitHub Actions — AdvocacIA CRM

Plano completo do pipeline: todo merge em `main` valida, publica imagens Docker no GitHub Container Registry (ghcr.io) e atualiza a VPS de produção automaticamente, com migrations e healthcheck.

---

## 1. Visão geral

```
Pull Request → [ci.yml]  lint + typecheck + build (bloqueia merge se falhar)
      │
   merge em main
      ▼
[deploy.yml]
  job 1: build-push   → imagens ghcr.io/danielbfs/advocacia-crm-{backend,frontend}
                        tags: latest + sha do commit
  job 2: deploy (needs: build-push)
          → SSH na VPS
          → docker compose pull && up -d
          → alembic upgrade head
          → healthcheck https://DOMAIN/health
          → falhou? rollback para a tag anterior
```

Princípio: **a VPS nunca compila nada** (as instâncias de 1 GB da Lightsail não aguentam build do Next.js). Quem compila é o runner do GitHub; a VPS só faz `pull` de imagens prontas. Isso substitui o fluxo atual de `git pull + docker compose build` dos scripts `update*.sh`.

---

## 2. Pré-requisitos (setup único)

### 2.1 Na VPS (Lightsail ou outra)

1. Docker + Docker Compose instalados; usuário `ubuntu` no grupo `docker`.
2. Diretório da aplicação: `/home/ubuntu/advocacia-crm` contendo apenas:
   - `docker-compose.prod.yml` (ver §4)
   - `.env` (a partir de `.env.lightsail.example`, com `DOMAIN`, `ACME_EMAIL`, `DATABASE_URL` do Neon etc.)
   - `traefik/dynamic/` (middlewares)
3. Login no ghcr (necessário apenas se o repositório for privado):
   ```bash
   echo $GHCR_PAT | docker login ghcr.io -u danielbfs --password-stdin
   ```
   Para repositório público com imagens públicas, o `pull` dispensa login.
4. Par de chaves SSH dedicado ao deploy (**não** reutilizar a chave pessoal):
   ```bash
   ssh-keygen -t ed25519 -C "github-deploy" -f deploy_key
   cat deploy_key.pub >> ~/.ssh/authorized_keys
   ```

### 2.2 Secrets no repositório GitHub (`Settings → Secrets and variables → Actions`)

| Secret | Conteúdo |
|---|---|
| `DEPLOY_HOST` | IP estático da VPS |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | Conteúdo de `deploy_key` (chave privada) |
| `DEPLOY_PATH` | `/home/ubuntu/advocacia-crm` |
| `DEPLOY_DOMAIN` | domínio de produção (para o healthcheck) |

`GITHUB_TOKEN` (automático) já basta para push no ghcr do próprio repo.

---

## 3. Workflows

### 3.1 `.github/workflows/ci.yml` (validação em PR)

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches-ignore: [main]

jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run build
        env: { NEXT_TELEMETRY_DISABLED: "1" }

  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: pip }
      - run: pip install -r requirements.txt
      - run: python -m compileall app  # substituir por ruff + pytest quando existirem
```

### 3.2 `.github/workflows/deploy.yml` (substitui o `publish.yml` atual)

```yaml
name: Deploy Produção

on:
  push:
    branches: [main]
  workflow_dispatch: {}   # deploy manual pelo botão "Run workflow"

concurrency:
  group: production-deploy
  cancel-in-progress: false   # nunca interromper um deploy no meio

jobs:
  build-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/setup-buildx-action@v3

      - name: Build & push backend
        uses: docker/build-push-action@v6
        with:
          context: ./backend
          push: true
          tags: |
            ghcr.io/danielbfs/advocacia-crm-backend:latest
            ghcr.io/danielbfs/advocacia-crm-backend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push frontend
        uses: docker/build-push-action@v6
        with:
          context: ./frontend
          push: true
          tags: |
            ghcr.io/danielbfs/advocacia-crm-frontend:latest
            ghcr.io/danielbfs/advocacia-crm-frontend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script_stop: true
          script: |
            cd ${{ secrets.DEPLOY_PATH }}
            export IMAGE_TAG=${{ github.sha }}

            # Guarda a tag atual para rollback
            docker compose -f docker-compose.prod.yml ps -q backend > /dev/null 2>&1 \
              && cp .image_tag .image_tag.previous 2>/dev/null || true
            echo "$IMAGE_TAG" > .image_tag

            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d --remove-orphans

            # Migrations
            docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head

            # Limpeza de imagens antigas
            docker image prune -f

      - name: Healthcheck
        run: |
          sleep 20
          for i in $(seq 1 10); do
            code=$(curl -s -o /dev/null -w "%{http_code}" "https://${{ secrets.DEPLOY_DOMAIN }}/health" || true)
            [ "$code" = "200" ] && echo "Saudável." && exit 0
            echo "Tentativa $i: HTTP $code — aguardando..."
            sleep 10
          done
          echo "::error::Healthcheck falhou após o deploy"
          exit 1

      - name: Rollback em caso de falha
        if: failure()
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd ${{ secrets.DEPLOY_PATH }}
            if [ -f .image_tag.previous ]; then
              export IMAGE_TAG=$(cat .image_tag.previous)
              docker compose -f docker-compose.prod.yml pull
              docker compose -f docker-compose.prod.yml up -d --remove-orphans
              echo "Rollback para $IMAGE_TAG concluído."
            else
              echo "Sem tag anterior registrada — rollback manual necessário."
            fi
```

---

## 4. `docker-compose.prod.yml` (novo arquivo na raiz)

Derivado do `docker-compose.lightsail.yml` atual com duas mudanças: serviços `backend`, `frontend`, `celery_worker` e `celery_beat` trocam `build:` por `image:` parametrizada, e os nomes/labels usam `advocacia-crm`:

```yaml
# Trecho — padrão que se repete nos 4 serviços de aplicação:
services:
  backend:
    image: ghcr.io/danielbfs/advocacia-crm-backend:${IMAGE_TAG:-latest}
    # ... (env, networks e labels iguais ao lightsail, com prefixo advocacia-crm)

  frontend:
    image: ghcr.io/danielbfs/advocacia-crm-frontend:${IMAGE_TAG:-latest}
    # ...
```

`IMAGE_TAG` é exportada pelo script de deploy (sha do commit); default `latest` para subida manual. Traefik, Redis e Evolution API permanecem como no compose da Lightsail (rede `advocacia_crm_internal`, banco no Neon).

O arquivo `docker-compose.lightsail.yml` (com `build:`) permanece como fallback para instalação inicial/manual; `install_lightsail.sh` passa a usar o `prod` com `latest`.

---

## 5. Estratégia de branch e releases

- `main` = produção. Todo push (merge) dispara deploy — manter `main` protegida (require PR + CI verde).
- Desenvolvimento em branches `feature/*`; PR roda `ci.yml`.
- Tags `v*` (ex.: `v1.0.0`): opcionalmente adicionar job de release notes; as imagens já ficam rastreáveis pelo sha.
- Deploy manual/emergencial: botão **Run workflow** (`workflow_dispatch`).

## 6. Observabilidade do deploy

- O job `deploy` usa o **environment `production`** do GitHub — histórico de deploys visível na aba Environments; opcionalmente exigir aprovação manual (required reviewers) antes do job rodar.
- Falha em qualquer passo (pull, migration, healthcheck) marca o workflow como falho e aciona rollback automático.
- Logs da aplicação continuam via `docker compose logs -f` na VPS.

## 7. Migração do fluxo atual

| Hoje (openclinic) | Depois (advocacia-crm) |
|---|---|
| `publish.yml` só publica imagens; deploy manual via SSH + `update_lightsail.sh` | `deploy.yml` publica **e** atualiza a VPS |
| VPS compila imagens (`docker compose build`, precisa de SWAP p/ Next.js) | VPS só faz `pull` — build no runner do GitHub |
| Sem healthcheck/rollback | Healthcheck + rollback automático por tag |
| `update_lightsail.sh` manual | Mantido apenas como contingência |

## 8. Checklist de implantação do pipeline

- [ ] Criar repo `danielbfs/advocacia-crm` e trocar `origin`
- [ ] Apagar `publish.yml` e workflows `gemini-*` (decisão pendente — ver [[10-transformation-plan]] §8)
- [ ] Commitar `ci.yml`, `deploy.yml`, `docker-compose.prod.yml`
- [ ] Gerar chave SSH de deploy na VPS e cadastrar os 5 secrets
- [ ] Proteger a branch `main` (require PR + status checks)
- [ ] Criar environment `production` (com aprovação manual, se desejado)
- [ ] Teste fim-a-fim: commit trivial em `main` → verificar imagens no ghcr → containers atualizados → healthcheck verde
- [ ] Teste de rollback: forçar healthcheck falho num deploy de teste e confirmar retorno à tag anterior
