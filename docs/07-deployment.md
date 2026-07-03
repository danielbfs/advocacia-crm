---
tags: [advocacia-crm, deployment, docker, traefik]
created: 2026-04-23
updated: 2026-07-02
status: alvo
---

# Deploy — AdvocacIA CRM

> Estado-alvo. O deploy contínuo (CI/CD) está especificado em [[12-cicd-pipeline]]; este documento cobre a infraestrutura e a instalação inicial.

## Estratégia

- **Produção (recomendado):** AWS Lightsail + Neon DB + `docker-compose.prod.yml` com imagens prontas do ghcr.io — atualização automática via GitHub Actions.
- **Alternativa:** qualquer VPS Docker (Hostinger etc.) com `docker-compose.yml` (build local).
- **Dev local:** `docker-compose.yml` + `docker-compose.dev.yml` (hot reload, portas expostas, sem Traefik).
- **SSL:** Traefik v3 + Let's Encrypt (HTTP-01 challenge automático).

---

## Serviços Docker (produção Lightsail)

| Serviço | Imagem | Função |
|---|---|---|
| `traefik` | traefik:latest | Reverse proxy + SSL automático |
| `redis` | redis:7-alpine | Cache de sessão + fila Celery |
| `backend` | ghcr.io/danielbfs/advocacia-crm-backend | FastAPI API |
| `frontend` | ghcr.io/danielbfs/advocacia-crm-frontend | Next.js UI |
| `celery_worker` | (mesma do backend) | Workers assíncronos |
| `celery_beat` | (mesma do backend) | Cron scheduler |
| `evolution_api` | evoapicloud/evolution-api | WhatsApp |

Banco de dados: **Neon DB** (PostgreSQL serverless) — sem container local, economizando RAM da VPS. Databases: `advocacia_crm` e `evolution`.

## Redes Docker

| Rede | Serviços | Descrição |
|---|---|---|
| `advocacia_crm_internal` | todos | Comunicação interna + tráfego Traefik |

Redis **não tem portas expostas** em produção.

---

## Passo a passo: instalação inicial (Lightsail)

### 1. Criar instância
- Ubuntu 22.04 LTS, mínimo 1 GB RAM / 2 vCPU, IP estático
- SWAP de 4 GB apenas se for usar o compose com `build:` local (o fluxo normal usa imagens prontas e dispensa SWAP grande)

### 2. Configurar DNS
- Registro A: `crm.seudominio.adv.br` → IP estático da instância

### 3. Instalar Docker
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
```

### 4. Firewall (Lightsail Networking)
```
80/tcp  → Allow (Let's Encrypt challenge)
443/tcp → Allow (HTTPS)
22/tcp  → Allow (SSH — restrinja ao seu IP se possível)
```

### 5. Neon DB
- Criar projeto no neon.tech com databases `advocacia_crm` e `evolution`
- Copiar as connection strings (com `sslmode=require`)

### 6. Clonar e configurar
```bash
git clone https://github.com/danielbfs/advocacia-crm.git
cd advocacia-crm

cp .env.lightsail.example .env
nano .env
# Preencher: DOMAIN, ACME_EMAIL, SECRET_KEY, DATABASE_URL (Neon),
#            EVOLUTION_DATABASE_URL (Neon), OPENAI_API_KEY, TELEGRAM_BOT_TOKEN
```

### 7. Subir e instalar
```bash
docker compose -f docker-compose.prod.yml up -d
./install_lightsail.sh   # testa conexão Neon, roda migrations, cria admin/comercial
```

### 8. Verificar SSL
```bash
curl -I https://crm.seudominio.adv.br   # HTTP/2 200
```

### 9. Ativar o deploy automático
Cadastrar os secrets no GitHub e proteger `main` — checklist completo em [[12-cicd-pipeline]] §8. A partir daí não há mais atualização manual.

---

## Roteamento (Traefik)

| URL | Destino |
|---|---|
| `http://DOMAIN/*` | Redireciona para HTTPS |
| `https://DOMAIN/api/*` | backend:8000 |
| `https://DOMAIN/webhooks/*` | backend:8000 |
| `https://DOMAIN/health` | backend:8000 |
| `https://DOMAIN/*` | frontend:3000 |

Middlewares (`traefik/dynamic/middlewares.yml`): `security-headers`, `webhook-ratelimit`, `api-ratelimit`.

---

## Atualização

- **Normal:** automática — merge em `main` ([[12-cicd-pipeline]]).
- **Contingência manual:**
```bash
cd /home/ubuntu/advocacia-crm
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head
```

---

## Desenvolvimento Local

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Backend com hot reload: http://localhost:8000
# Frontend: http://localhost:3000
# API Docs: http://localhost:8000/docs
# Redis: localhost:6379
```

---

## Monitoramento

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f celery_worker
docker compose -f docker-compose.prod.yml ps
docker stats
```

---

## Backup do Banco

Neon DB mantém point-in-time restore no plano pago; adicionalmente:

```bash
# Dump manual (da VPS ou de qualquer máquina com acesso)
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql
```

Recomendação: cron diário na VPS enviando o dump criptografado para um bucket S3.
