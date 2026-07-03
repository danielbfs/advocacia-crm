#!/usr/bin/env bash
# ============================================================
# AdvocacIA CRM — Script de Atualização (AWS Lightsail)
# Puxa a versão mais recente do GitHub e reinicia os serviços
# ============================================================

set -e

GREEN='\033[0;32m'
NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     AdvocacIA CRM — Lightsail Update      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

info "Puxando atualizações do GitHub..."
git pull origin main

info "Reconstruindo imagens Docker..."
docker compose -f docker-compose.lightsail.yml build --no-cache

info "Reiniciando serviços..."
docker compose -f docker-compose.lightsail.yml up -d --remove-orphans

info "Aguardando banco de dados (Neon DB)..."
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
except Exception:
    sys.exit(1)
" >/dev/null 2>&1; do sleep 2; done

info "Rodando migrations..."
docker compose -f docker-compose.lightsail.yml exec -T backend alembic upgrade head

info "Limpando imagens antigas..."
docker image prune -f

echo ""
info "Atualização no Lightsail concluída com sucesso!"
