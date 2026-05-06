#!/bin/bash
set -euo pipefail

# ─── helpers ──────────────────────────────────────────────────────────────────
info()  { echo -e "\e[32m[+]\e[0m $*"; }
warn()  { echo -e "\e[33m[!]\e[0m $*"; }
error() { echo -e "\e[31m[✗]\e[0m $*" >&2; exit 1; }

[ -z "${REMWATCH_URL:-}" ] && error "REMWATCH_URL не задан."
REPO_URL="${REMWATCH_URL}"

echo ""
echo "  ┌──────────────────────────────────┐"
echo "  │      remwatch agent installer     │"
echo "  └──────────────────────────────────┘"
echo ""

# ─── проверки ─────────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || error "Docker не найден. Установи Docker и попробуй снова."
command -v curl   >/dev/null 2>&1 || error "curl не найден."

[ -z "${LOKI_URL:-}"  ] && error "LOKI_URL не задан."
[ -z "${NODE_NAME:-}" ] && error "NODE_NAME не задан."
[ -z "${NODE_IP:-}"   ] && error "NODE_IP не задан."
[ -z "${COUNTRY:-}"   ] && error "COUNTRY не задан."

# ─── проверка конфликтов ───────────────────────────────────────────────────────
CONFLICT=""

if systemctl list-units --type=service --all 2>/dev/null | grep -q "vector.service"; then
  CONFLICT="systemd"
elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "remwatch-vector"; then
  CONFLICT="docker"
fi

if [ -n "$CONFLICT" ]; then
  echo ""
  warn "Обнаружен уже установленный агент (${CONFLICT})."
  warn "Удаляю старые контейнеры..."

  if [ "$CONFLICT" = "systemd" ]; then
    systemctl stop vector    2>/dev/null || true
    systemctl disable vector 2>/dev/null || true
  elif [ "$CONFLICT" = "docker" ]; then
    docker stop remwatch-vector       2>/dev/null || true
    docker rm   remwatch-vector       2>/dev/null || true
    docker stop remwatch-node-exporter 2>/dev/null || true
    docker rm   remwatch-node-exporter 2>/dev/null || true
  fi

  info "Старые контейнеры удалены."
fi

# ─── установка ────────────────────────────────────────────────────────────────
info "Скачиваю конфиги..."
curl -fsSL "${REPO_URL}/docker-compose.agent.yml" -o docker-compose.yml
mkdir -p vector
curl -fsSL "${REPO_URL}/vector/vector.yaml" -o vector/vector.yaml

cat > .env <<EOF
LOKI_URL=${LOKI_URL}
NODE_NAME=${NODE_NAME}
NODE_IP=${NODE_IP}
COUNTRY=${COUNTRY}
ENVIRONMENT=production
EOF

info "Запускаю Vector и Node Exporter..."
docker compose up -d

# ─── проверка доставки логов ───────────────────────────────────────────────────
echo ""
info "Жду запуска контейнеров (10 сек)..."
sleep 10

if docker ps --format '{{.Names}}' | grep -q "remwatch-vector"; then
  info "Vector контейнер запущен ✓"
else
  warn "Vector контейнер не запустился."
  warn "Логи: docker logs remwatch-vector"
fi

if docker ps --format '{{.Names}}' | grep -q "remwatch-node-exporter"; then
  info "Node Exporter запущен ✓  (порт 9100)"
else
  warn "Node Exporter не запустился."
  warn "Логи: docker logs remwatch-node-exporter"
fi

LOKI_RESP=$(curl -s --max-time 5 \
  "${LOKI_URL}/loki/api/v1/query" \
  --data-urlencode "query={node_name=\"${NODE_NAME}\"}" \
  --data-urlencode "limit=1" 2>/dev/null || echo "")

if echo "$LOKI_RESP" | grep -q '"status":"success"'; then
  if echo "$LOKI_RESP" | grep -q '"result":\[\]'; then
    warn "Loki доступен, логи с этой ноды ещё не пришли (нормально при старте)."
    warn "Проверь через минуту: docker logs remwatch-vector"
  else
    info "Логи доходят до Loki ✓"
  fi
else
  warn "Не удалось опросить Loki по адресу ${LOKI_URL}"
  warn "Проверь что центральный сервер доступен и Loki запущен."
fi

echo ""
info "Готово. Нода ${NODE_NAME} подключена к ${LOKI_URL}"
