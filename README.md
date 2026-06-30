# Open Clinic AI

Sistema open-source para clínicas automatizarem comunicação com pacientes via IA, agendamento multi-médico, gestão de leads e follow-up automático.

> **Uma VPS por clínica. Deploy em 5 minutos.**

---

## Funcionalidades

- **Chatbot IA** via Telegram e WhatsApp — agendamento, cancelamento e remarcação automatizados
- **Agendamento multi-médico** com controle de disponibilidade e prevenção de conflitos
- **Gestão de Leads** com pipeline de conversão, SLA de retorno e integração com Google Ads / Meta Ads
- **Follow-up automático** — lembretes, confirmações e recuperação de no-show
- **Interface da Secretária** — calendário, kanban de leads e agendamento manual
- **Painel Administrativo** — setup wizard, configurações e relatórios
- **Relatórios** — funil de conversão, origem dos leads, SLA compliance, performance por campanha

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | FastAPI (Python 3.12) + Celery |
| Frontend | Next.js 14 + TypeScript + Shadcn/ui |
| Banco de dados | PostgreSQL 16 |
| Cache / Fila | Redis 7 |
| Proxy / SSL | Traefik v3 + Let's Encrypt |
| Deploy | Docker + Docker Compose |

---

## Opção A: Deploy Rápido (VPS Hostinger)

### Pré-requisitos

- VPS Hostinger com Docker (mínimo 2 vCPU / 4GB RAM)
- Domínio apontando para o IP da VPS (registro DNS tipo A)
- **Traefik ativo na Hostinger** — na seção Docker do painel, inicie o container de **Proxy Reverso / Balanceador de Carga** (é o Traefik da Hostinger). Ele gerencia o SSL (Let's Encrypt) e roteia o tráfego para os containers do Open Clinic.

### Passos

1. No painel Hostinger, vá em **VPS → Docker → Implantar** e aponte para o repositório GitHub (`https://github.com/danielbfs/openclinic`)
2. Configure as variáveis de ambiente (especialmente `DOMAIN`, `DB_PASSWORD`, `SECRET_KEY`) — veja `.env.example` para a lista completa
3. Implante o compose — a Hostinger executa `docker compose up -d` automaticamente
4. Via SSH, rode o script de pós-deploy (inicializa Git, migrations e admin):

```bash
cd /docker/openclinic
chmod +x install.sh update.sh
./install.sh
```

O `install.sh` faz automaticamente:
- Inicializa o repositório Git (a Hostinger não clona como repo Git)
- Roda as migrations do banco de dados
- Cria os usuários iniciais (admin e secretária)

Acesse `https://seu-dominio.com` — SSL provisionado automaticamente pelo Traefik da Hostinger.

> **Nota:** O Traefik da Hostinger roda em `network_mode: host`. Os containers do Open Clinic fazem bind em `127.0.0.1` e o Traefik os alcança via localhost, usando as labels configuradas no `docker-compose.yml`.

### Credenciais Iniciais

Após rodar `./install.sh`, os seguintes usuários são criados:

| Usuário | Senha | Role |
|---|---|---|
| `admin` | `admin` | admin |
| `secretaria` | `secretaria` | secretary |

> **IMPORTANTE:** Altere as senhas no primeiro acesso via menu "Alterar Senha".

### Atualizar para nova versão

Conecte-se via SSH na VPS e rode:

```bash
cd /docker/openclinic

# 1. Baixar código atualizado do GitHub
git pull origin main

# 2. Reconstruir imagens (sem cache para garantir código novo)
docker compose build --no-cache

# 3. Reiniciar serviços
docker compose up -d --remove-orphans

# 4. Rodar migrations (se houver alterações no banco)
docker compose exec -T backend alembic upgrade head

# 5. (Opcional) Limpar imagens antigas
docker image prune -f
```

> **Nota:** A Hostinger não puxa atualizações do GitHub automaticamente. O botão "Reimplantar" no painel recria os containers a partir do código já presente na VPS. Para obter o código novo, é necessário rodar `git pull` via SSH antes de reimplantar.

---

## Opção B: Deploy na AWS Lightsail + Neon DB

Esta opção utiliza uma VPS tradicional no AWS Lightsail (1 GB+ RAM com SWAP) e delega o banco de dados PostgreSQL para o **Neon DB**, economizando CPU/RAM na VPS. O SSL e proxy reverso são gerenciados localmente pelo Traefik rodando em container.

### Pré-requisitos

- Instância AWS Lightsail (Ubuntu 22.04 LTS, mínimo 1 GB RAM / 2 vCPU).
- Conta no [neon.tech](https://neon.tech/) com dois bancos criados: `openclinic` e `evolution`.
- Domínio apontando para o IP Estático da Lightsail (registro DNS tipo A).

### Passos

1. Na VPS Lightsail, instale o Docker e configure 4 GB de memória SWAP (obrigatório para compilar Next.js em instâncias de 1 GB RAM).
2. Clone o repositório e configure o `.env` baseado no `.env.lightsail.example`:
   ```bash
   git clone https://github.com/danielbfs/openclinic.git
   cd openclinic
   cp .env.lightsail.example .env
   nano .env # preencha DOMAIN, ACME_EMAIL, chaves de API e strings de conexão do Neon
   ```
3. Suba os containers usando o compose específico:
   ```bash
   docker compose -f docker-compose.lightsail.yml up -d
   ```
4. Rode o script de pós-deploy da Lightsail (inicializa Git, testa conexão com Neon, roda migrations e cria o admin):
   ```bash
   chmod +x install_lightsail.sh update_lightsail.sh
   ./install_lightsail.sh
   ```

Acesse `https://seu-dominio.com` — SSL provisionado automaticamente pelo Traefik interno do Docker.

### Credenciais Iniciais

Após rodar `./install_lightsail.sh`, as seguintes credenciais são criadas:

| Usuário | Senha | Role |
|---|---|---|
| `admin` | `admin` | admin |
| `secretaria` | `secretaria` | secretary |

> **IMPORTANTE:** Altere as senhas no primeiro acesso!

### Atualizar para nova versão

Conecte-se via SSH na VPS Lightsail e rode:

```bash
cd /home/ubuntu/openclinic
./update_lightsail.sh
```

---

## Desenvolvimento Local

```bash
# Clonar e entrar no diretório
git clone https://github.com/danielbfs/openclinic.git
cd openclinic

# Configurar ambiente
cp .env.example .env
# Editar .env com configurações locais (sem DOMAIN/ACME_EMAIL)

# Subir em modo dev (sem Traefik, com hot reload e portas expostas)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Backend: http://localhost:8000
# Frontend: http://localhost:3000
# API Docs: http://localhost:8000/docs
```

---

## Variáveis de Ambiente

Veja `.env.example` com todas as variáveis documentadas e comentadas.

Variáveis obrigatórias para produção:

| Variável | Descrição |
|---|---|
| `DOMAIN` | Domínio da clínica (ex: `clinica.seudominio.com`) |
| `ACME_EMAIL` | E-mail para o Let's Encrypt |
| `DB_PASSWORD` | Senha do PostgreSQL |
| `SECRET_KEY` | Chave secreta JWT (mín. 64 chars) |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram |
| `OPENAI_API_KEY` | Chave da API OpenAI |

---

## Documentação

A documentação completa está em [`docs/`](docs/) — formatada para Obsidian.

| Arquivo | Conteúdo |
|---|---|
| [00-overview.md](docs/00-overview.md) | Visão geral e objetivos |
| [01-architecture.md](docs/01-architecture.md) | Arquitetura e decisões técnicas |
| [02-modules.md](docs/02-modules.md) | Módulos e responsabilidades |
| [03-database-schema.md](docs/03-database-schema.md) | Schema do banco de dados |
| [04-scheduling-system.md](docs/04-scheduling-system.md) | Sistema de agendamento |
| [05-api-design.md](docs/05-api-design.md) | Design da API |
| [06-ai-design.md](docs/06-ai-design.md) | Engine de IA e function calling |
| [07-deployment.md](docs/07-deployment.md) | Deploy, Docker e Traefik |
| [08-roadmap.md](docs/08-roadmap.md) | Roadmap de desenvolvimento |
| [09-risks.md](docs/09-risks.md) | Riscos e mitigações |

---

## Contribuindo

Contribuições são bem-vindas! Por favor leia [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir um PR.

1. Fork o repositório
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Commit: `git commit -m 'feat: adiciona minha feature'`
4. Push: `git push origin feature/minha-feature`
5. Abra um Pull Request

---

## Licença

MIT License — veja [LICENSE](LICENSE) para detalhes.

---

> Desenvolvido para a comunidade de clínicas. Cada instância é independente — seus dados ficam na sua VPS.
