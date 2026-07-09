#!/usr/bin/env bash
# ============================================================
# AdvocacIA CRM — bootstrap idempotente da VPS (Lightsail)
#
# Rodado pelo pipeline a CADA deploy, via SSH. É seguro rodar
# várias vezes: só age no que ainda não existe. Prepara a máquina
# para receber os containers (Docker + swap + diretório da app).
#
# Pré-requisitos que o pipeline NÃO cobre (feitos 1x no console AWS):
#   - Instância Lightsail existindo, com SSH liberado (porta 22)
#   - Firewall Lightsail liberando portas 80 e 443
#   - Registro DNS A do domínio apontando para o IP da instância
# ============================================================
set -euo pipefail

APP_DIR="${DEPLOY_PATH:-/home/ubuntu/advocacia-crm}"

echo "==> bootstrap: verificando Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "    Docker ausente — instalando via get.docker.com"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$(whoami)" || true
else
  echo "    Docker já instalado: $(docker --version)"
fi

echo "==> bootstrap: verificando plugin docker compose"
if ! sudo docker compose version >/dev/null 2>&1; then
  echo "    plugin compose ausente — instalando docker-compose-plugin"
  sudo apt-get update -y && sudo apt-get install -y docker-compose-plugin
fi

echo "==> bootstrap: garantindo serviço docker ativo no boot"
sudo systemctl enable --now docker >/dev/null 2>&1 || true

echo "==> bootstrap: verificando swap (recomendado em instâncias de 1GB)"
if ! sudo swapon --show | grep -q .; then
  echo "    sem swap — criando /swapfile de 2GB"
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "    swap já ativo"
fi

echo "==> bootstrap: garantindo diretório da aplicação $APP_DIR"
mkdir -p "$APP_DIR"

echo "==> bootstrap: concluído"
