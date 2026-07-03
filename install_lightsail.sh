#!/usr/bin/env bash
# ============================================================
# AdvocacIA CRM — Script de Pós-Deploy (AWS Lightsail + Neon DB)
# Executar APÓS: docker compose -f docker-compose.lightsail.yml up -d
# Inicializa Git, roda migrations e cria o admin inicial.
# ============================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  AdvocacIA CRM — Lightsail Post-Deploy    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Verificar pré-requisitos
command -v docker >/dev/null 2>&1 || error "Docker não encontrado."
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 não encontrado."

# Inicializar repositório Git (caso não esteja configurado)
if [ ! -d ".git" ]; then
    info "Inicializando repositório Git..."
    git init
    git remote add origin https://github.com/danielbfs/advocacia-crm.git
    git fetch origin main
    git reset --hard origin/main
    info "Repositório Git configurado."
else
    info "Repositório Git já configurado."
fi

# Aguardar banco de dados (Neon DB) respondendo através do backend
info "Aguardando banco de dados (Neon DB) ficar pronto..."
RETRIES=30
until docker compose -f docker-compose.lightsail.yml exec -T backend python -c "
import asyncio
import sys
from app.database import engine
from sqlalchemy import text
async def test():
    async with engine.connect() as conn:
        await conn.execute(text('SELECT 1'))
try:
    asyncio.run(test())
    sys.exit(0)
except Exception as e:
    print(f'Database not ready yet: {e}', file=sys.stderr)
    sys.exit(1)
" >/dev/null 2>&1; do
    RETRIES=$((RETRIES-1))
    if [ $RETRIES -eq 0 ]; then
        error "O banco de dados não respondeu ou as credenciais estão incorretas no arquivo .env."
    fi
    sleep 2
done
info "Conexão com o banco de dados Neon estabelecida com sucesso!"

# Migrations
info "Rodando migrations do banco de dados (Alembic)..."
docker compose -f docker-compose.lightsail.yml exec -T backend alembic upgrade head

# Criar usuário administrador
info "Criando usuário administrador inicial..."
docker compose -f docker-compose.lightsail.yml exec -T backend python -m app.scripts.create_admin

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        Instalação concluída!             ║"
echo "╚══════════════════════════════════════════╝"
echo ""
info "O Traefik local configurado gerencia o SSL via Let's Encrypt."
info "Verifique se o seu domínio está apontando para o IP público deste Lightsail."
echo ""
warning "Credenciais iniciais: admin/admin e secretaria/secretaria"
warning "Altere as senhas no primeiro acesso!"
