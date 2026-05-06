#!/bin/bash
set -euo pipefail

info()  { echo -e "\e[32m[+]\e[0m $*"; }
warn()  { echo -e "\e[33m[!]\e[0m $*"; }
error() { echo -e "\e[31m[✗]\e[0m $*" >&2; exit 1; }

[ -z "${REMWATCH_URL:-}" ] && error "REMWATCH_URL не задан."
REPO_URL="${REMWATCH_URL}"

echo ""
echo "  ┌──────────────────────────────────┐"
echo "  │    remwatch panel installer       │"
echo "  └──────────────────────────────────┘"
echo ""

command -v docker >/dev/null 2>&1 || error "Docker не найден."
command -v curl   >/dev/null 2>&1 || error "curl не найден."

[ -z "${LOKI_URL:-}"    ] && error "LOKI_URL не задан."
[ -z "${PANEL_NAME:-}"  ] && error "PANEL_NAME не задан."
[ -z "${NODE_IP:-}"     ] && error "NODE_IP не задан."
[ -z "${COUNTRY:-}"     ] && error "COUNTRY не задан."

# ─── очистка старых контейнеров ───────────────────────────────────────────────
for name in remwatch-vector-panel remwatch-node-exporter; do
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
    warn "Удаляю старый контейнер ${name}..."
    docker stop "$name" 2>/dev/null || true
    docker rm   "$name" 2>/dev/null || true
  fi
done

# ─── скачиваем конфиги ────────────────────────────────────────────────────────
info "Скачиваю конфиги..."
curl -fsSL "${REPO_URL}/docker-compose.panel.yml" -o docker-compose.yml
mkdir -p vector
curl -fsSL "${REPO_URL}/vector/vector-panel.yaml" -o vector/vector-panel.yaml

cat > .env <<EOF
LOKI_URL=${LOKI_URL}
PANEL_NAME=${PANEL_NAME}
NODE_IP=${NODE_IP}
COUNTRY=${COUNTRY}
EOF

# ─── запуск ───────────────────────────────────────────────────────────────────
info "Запускаю Vector и Node Exporter..."
docker compose up -d

echo ""
info "Жду запуска контейнеров (10 сек)..."
sleep 10

if docker ps --format '{{.Names}}' | grep -q "remwatch-vector-panel"; then
  info "Vector запущен ✓"
else
  warn "Vector не запустился. Логи: docker logs remwatch-vector-panel"
fi

if docker ps --format '{{.Names}}' | grep -q "remwatch-node-exporter"; then
  info "Node Exporter запущен ✓  (порт 9100)"
else
  warn "Node Exporter не запустился. Логи: docker logs remwatch-node-exporter"
fi

# ─── проверка Loki ────────────────────────────────────────────────────────────
echo ""
LOKI_RESP=$(curl -s --max-time 5 \
  "${LOKI_URL}/loki/api/v1/query" \
  --data-urlencode "query={node_name=\"${PANEL_NAME}\"}" \
  --data-urlencode "limit=1" 2>/dev/null || echo "")

if echo "$LOKI_RESP" | grep -q '"status":"success"'; then
  if echo "$LOKI_RESP" | grep -q '"result":\[\]'; then
    warn "Loki доступен, логи ещё не пришли (нормально — подождите минуту)."
  else
    info "Логи уже поступают в Loki ✓"
  fi
else
  warn "Не удалось опросить Loki: ${LOKI_URL}"
  warn "Проверь что центральный сервер доступен."
fi

echo ""
info "Готово. Панель \"${PANEL_NAME}\" подключена к ${LOKI_URL}"
info "Добавь карточку «Логи панели» в дашборд с именем: ${PANEL_NAME}"
