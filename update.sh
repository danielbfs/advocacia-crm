#!/usr/bin/env bash
# ============================================================
# AdvocacIA CRM — Script de Atualização
# Puxa a versão mais recente do GitHub e reinicia os serviços
# ============================================================

set -e

GREEN='\033[0;32m'
NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       AdvocacIA CRM — Atualização         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

info "Puxando atualizações do GitHub..."
git pull origin main

info "Reconstruindo imagens Docker..."
docker compose build --no-cache

info "Reiniciando serviços (zero downtime para frontend/backend)..."
docker compose up -d --remove-orphans

info "Aguardando banco de dados..."
until docker compose exec -T db pg_isready -U advocacia_crm -q 2>/dev/null; do sleep 2; done

info "Rodando migrations..."
docker compose exec -T backend alembic upgrade head

info "Limpando imagens antigas..."
docker image prune -f

echo ""
info "Atualização concluída!"
