#!/bin/bash
set -euo pipefail

info()  { echo -e "\e[32m[+]\e[0m $*"; }
warn()  { echo -e "\e[33m[!]\e[0m $*"; }
error() { echo -e "\e[31m[✗]\e[0m $*" >&2; exit 1; }

INSTALL_DIR="/opt/remwatch-node-agent"
REPO_URL="${REMWATCH_URL:-}"

[ -n "$REPO_URL" ]        || error "REMWATCH_URL не задан."
[ -n "${LOKI_URL:-}" ]    || error "LOKI_URL не задан."
[ -n "${NODE_NAME:-}" ]   || error "NODE_NAME не задан."
[ -n "${NODE_IP:-}" ]     || error "NODE_IP не задан."
[ -n "${COUNTRY:-}" ]     || error "COUNTRY не задан."

command -v docker >/dev/null 2>&1 || error "Docker не найден. Установи Docker и попробуй снова."
command -v curl   >/dev/null 2>&1 || error "curl не найден."

echo ""
echo "  ┌──────────────────────────────────────┐"
echo "  │    remwatch node agent installer     │"
echo "  └──────────────────────────────────────┘"
echo ""

# ─── удалить старые контейнеры ────────────────────────────────────────────────
if docker ps -a --format '{{.Names}}' | grep -Eq '^remwatch-vector$|^remwatch-node-exporter$'; then
  warn "Найдены старые контейнеры. Удаляю..."
  docker stop remwatch-vector        2>/dev/null || true
  docker rm   remwatch-vector        2>/dev/null || true
  docker stop remwatch-node-exporter 2>/dev/null || true
  docker rm   remwatch-node-exporter 2>/dev/null || true
fi

# ─── node-exporter ────────────────────────────────────────────────────────────
EXPORTER_PROFILE=""
if curl -sf --max-time 3 "http://localhost:9100/metrics" >/dev/null 2>&1; then
  info "Node Exporter уже работает на порту 9100 ✓"
else
  if ss -tlnp 2>/dev/null | grep -q ':9100 '; then
    warn "Порт 9100 занят, встроенный exporter запускать не буду."
  else
    EXPORTER_PROFILE="--profile with-exporter"
    info "Будет установлен встроенный Node Exporter."
  fi
fi

# ─── скачать конфиги ──────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/vector"
cd "$INSTALL_DIR"

info "Скачиваю конфиги..."
curl -fsSL "${REPO_URL}/docker-compose.agent.yml"          -o docker-compose.yml
curl -fsSL "${REPO_URL}/vector/vector-node-agent.yaml"     -o vector/vector.yaml

# ─── .env ─────────────────────────────────────────────────────────────────────
cat > .env <<ENVEOF
LOKI_URL=${LOKI_URL}
NODE_NAME=${NODE_NAME}
NODE_IP=${NODE_IP}
COUNTRY=${COUNTRY}
ENVIRONMENT=production
ENVEOF

# ─── запуск ───────────────────────────────────────────────────────────────────
info "Запускаю node-agent..."
# shellcheck disable=SC2086
docker compose $EXPORTER_PROFILE up -d

echo ""
info "Жду запуск контейнеров (10 сек)..."
sleep 10

if docker ps --format '{{.Names}}' | grep -q '^remwatch-vector$'; then
  info "Vector запущен ✓"
else
  warn "Vector не запустился. Логи: docker logs remwatch-vector"
fi

if curl -sf --max-time 3 "http://localhost:9100/metrics" >/dev/null 2>&1; then
  info "Node Exporter доступен на порту 9100 ✓"
else
  warn "Node Exporter недоступен на порту 9100."
fi

echo ""
info "Готово. Агент установлен в ${INSTALL_DIR}"
