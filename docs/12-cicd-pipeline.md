---
tags: [advocacia-crm, cicd, github-actions, deploy, lightsail, neon]
created: 2026-07-02
updated: 2026-07-09
status: implementado
---

# CI/CD — Deploy Automático Zero-Touch (Lightsail + Neon) — AdvocacIA CRM

Pipeline completo de implantação. **Único pré-requisito manual:** a instância Lightsail existir, o SSH liberado e os secrets cadastrados no GitHub. Todo o resto — Docker, swap, `.env`, Traefik/SSL, migrations, seed — o pipeline provisiona sozinho a cada `push` na `main`.

Arquivos que implementam isto (já no repo):
- `.github/workflows/ci.yml` — validação em PR (build do frontend + import do backend).
- `.github/workflows/deploy.yml` — build/push das imagens + deploy SSH auto-provisionado.
- `docker-compose.prod.yml` — serviços com imagens do ghcr (a VPS nunca compila).
- `deploy/bootstrap.sh` — provisionamento idempotente da máquina.
- `traefik/traefik.yml` + `traefik/dynamic/` — proxy/SSL e middlewares.

---

## 1. Ambiente-alvo (concreto)

| Item | Valor |
|---|---|
| VPS | AWS Lightsail — Ubuntu, IP **54.232.3.5**, usuário **ubuntu**, auth por chave (`advocacia-crm.pem`) |
| Domínio | **advocacia-crm.sigame.tec.br** → 54.232.3.5 (registro A já criado) |
| Banco | **Neon DB** — database `advocacia-crm` (app) + database `evolution` (WhatsApp) |
| Registry | `ghcr.io/danielbfs/advocacia-crm-backend` e `-frontend` |
| Diretório na VPS | `/home/ubuntu/advocacia-crm` |

---

## 2. Fluxo

```
Pull Request → [ci.yml] frontend build + backend import (bloqueia merge se falhar)
      │
   merge/push em main
      ▼
[deploy.yml]
  job build-push  → constrói imagens no runner e publica no ghcr (tags latest + sha)
      │
      ▼  ⏸ APROVAÇÃO MANUAL (environment "production") — antes de QUALQUER SSH
  job deploy
      → scp: envia compose.prod.yml + traefik/ + bootstrap.sh para a VPS
      → ssh:
          1. bootstrap idempotente (instala Docker/compose/swap se faltarem)
          2. gera .env a partir dos GitHub Secrets
          3. docker login ghcr + pull das imagens (tag = sha do commit)
          4. docker compose up -d
          5. alembic upgrade head (migrations)
          6. seed 1x (marcador .seeded; ou force_seed manual)
          7. prune de imagens antigas
      → healthcheck público https://DOMÍNIO/health (12 tentativas)
      → falhou? rollback automático para a imagem anterior
```

**Princípio:** a VPS **nunca compila** (instâncias de 1 GB não aguentam build do Next.js). Quem compila é o runner do GitHub; a VPS só faz `pull` de imagens prontas.

---

## 3. Aprovação manual antes do SSH (obrigatório configurar 1x)

O job `deploy` declara `environment: production`. Para que ele **pause pedindo sua aprovação** logo após o build e **antes de tocar na VPS**, configure o environment uma vez:

1. GitHub → repositório → **Settings → Environments → New environment** → nome exatamente **`production`**.
2. Marque **Required reviewers** e adicione **você mesmo** (danielbfs). Salve.

Resultado: todo deploy roda o `build-push` livremente, e então **espera seu clique em "Review deployments → Approve"** para executar o scp/ssh. É exatamente **uma** aprovação, no ponto do envio de dados via SSH. O `build-push` (que não acessa a VPS) nunca pede aprovação.

> Opcional: em Environments você também pode restringir a branch `main` e adicionar um "wait timer".

---

## 4. Secrets a cadastrar (GitHub → Settings → Secrets and variables → Actions → New repository secret)

### SSH / infra
| Secret | Valor |
|---|---|
| `DEPLOY_HOST` | `54.232.3.5` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | conteúdo COMPLETO do arquivo `advocacia-crm.pem` (da linha `-----BEGIN...` até `-----END...`) |
| `DEPLOY_PATH` | `/home/ubuntu/advocacia-crm` |

### Aplicação / banco
| Secret | Valor |
|---|---|
| `DOMAIN` | `advocacia-crm.sigame.tec.br` |
| `ACME_EMAIL` | seu e-mail (Let's Encrypt) |
| `DATABASE_URL` | `postgresql+asyncpg://neondb_owner:...@ep-...-pooler.../advocacia-crm` (formato asyncpg, sem `channel_binding`) |
| `ALEMBIC_DATABASE_URL` | `postgresql+psycopg2://neondb_owner:...@ep-.../advocacia-crm?sslmode=require` (Alembic/sync) |
| `SECRET_KEY` | chave JWT forte (≥64 chars aleatórios) |
| `EVOLUTION_DATABASE_URL` | connection string do database `evolution` no Neon |
| `EVOLUTION_API_KEY` | chave da Evolution API (defina uma) |
| `OPENAI_API_KEY` | chave OpenAI (IA Comercial) |

### Opcionais (deixe vazios se não usar — têm default no compose)
`OPENAI_MODEL`, `TELEGRAM_BOT_TOKEN`, `EVOLUTION_INSTANCE_NAME`, `FIRM_TIMEZONE`, `FIRM_SLA_HOURS`, `LEADS_WEBHOOK_API_KEY`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

> `GITHUB_TOKEN` é automático — usado para publicar e puxar as imagens do ghcr (inclusive em repositório privado, durante o run). Não precisa criar.

---

## 5. Pré-requisitos manuais (feitos 1x no console AWS — o pipeline não cobre)

O pipeline faz tudo por SSH, mas três coisas vivem fora do alcance do SSH:

1. **Instância Lightsail criada** com a chave `advocacia-crm.pem` (✅ já feito).
2. **Firewall Lightsail** (aba *Networking* da instância) liberando **80/tcp** e **443/tcp** (além do 22). Sem isso o Let's Encrypt (desafio HTTP-01) e o HTTPS não funcionam.
3. **DNS** do domínio apontando para o IP (✅ `advocacia-crm.sigame.tec.br` → 54.232.3.5).

Tudo o mais (Docker, swap, `.env`, Traefik, migrations, seed) é automático.

---

## 6. Primeira execução

1. Configure o environment `production` com Required reviewers (§3).
2. Cadastre os secrets (§4).
3. Confirme o firewall Lightsail (§5.2).
4. Faça `push` na `main` (ou **Actions → Deploy Produção → Run workflow**).
5. Aprove o deployment quando o GitHub pedir (⏸ antes do SSH).
6. Acompanhe os logs do job. Ao final, o healthcheck valida `https://advocacia-crm.sigame.tec.br/health`.
7. Acesse o sistema e faça login com `admin` / `admin` (criado pelo seed) — **troque a senha no primeiro acesso**.

O `.seeded` na VPS garante que o seed roda **só na primeira vez**. Para re-semear: **Run workflow** com `force_seed = true`.

> **Nota sobre o seed:** o `backend/seed.py` atual inclui dados de demonstração (leads/clientes de exemplo). Para um ambiente de produção limpo, edite `seed.py` para manter apenas usuários (admin/comercial), áreas de atuação e advogados reais antes do primeiro deploy — ou rode o deploy, faça login e limpe os dados demo.

---

## 7. Rollback

Automático: se o healthcheck falhar após o deploy, o pipeline reimplanta a imagem anterior (`.image_tag.prev`) e marca o workflow como falho. Manual, se necessário, via SSH:

```bash
cd /home/ubuntu/advocacia-crm
sudo docker compose -f docker-compose.prod.yml logs --tail=100 backend
# apontar IMAGE_TAG no .env para um sha anterior e:
sudo docker compose -f docker-compose.prod.yml pull
sudo docker compose -f docker-compose.prod.yml up -d
```

---

## 8. Operação do dia a dia

- **Atualizar produção:** basta `merge`/`push` na `main` e aprovar o deploy. Sem SSH manual.
- **Ver logs:** `sudo docker compose -f docker-compose.prod.yml logs -f backend` (ou `celery_worker`).
- **Status:** `sudo docker compose -f docker-compose.prod.yml ps`.
- **Migrations avulsas:** já rodam a cada deploy (`alembic upgrade head`, idempotente).
- **WhatsApp (Evolution):** primeira conexão via QR code após o serviço subir.

---

## 9. Segurança

- Nenhum secret fica no repositório: o `.env` é gerado na VPS a cada deploy a partir dos GitHub Secrets (permissão `umask 077`).
- O SSH usa a chave privada (`DEPLOY_SSH_KEY`); recomenda-se uma chave dedicada ao deploy, não a pessoal.
- Aprovação manual (§3) impede deploys não intencionais na produção.
- Portas de banco/Redis não são expostas (só 80/443 pelo Traefik).
- **Rotacione** qualquer credencial que tenha trafegado fora do cofre de secrets (ex.: a senha do Neon compartilhada em texto).

---

## 10. Checklist de implantação

- [ ] Environment `production` criado com Required reviewers (§3)
- [ ] Secrets SSH cadastrados (`DEPLOY_HOST/USER/SSH_KEY/PATH`)
- [ ] Secrets de app/banco cadastrados (`DOMAIN`, `DATABASE_URL`, `ALEMBIC_DATABASE_URL`, `SECRET_KEY`, `ACME_EMAIL`, `EVOLUTION_DATABASE_URL`, `EVOLUTION_API_KEY`, `OPENAI_API_KEY`)
- [ ] Firewall Lightsail liberando 80/443 (§5.2)
- [ ] DNS apontando (✅)
- [ ] Primeiro deploy aprovado e healthcheck verde
- [ ] Login `admin`/`admin` e troca de senha
- [ ] (Produção) Ajuste do seed para remover dados demo
