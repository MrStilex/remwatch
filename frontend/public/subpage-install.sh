#!/bin/bash
set -euo pipefail

info()  { echo -e "\e[32m[+]\e[0m $*"; }
warn()  { echo -e "\e[33m[!]\e[0m $*"; }
error() { echo -e "\e[31m[✗]\e[0m $*" >&2; exit 1; }

echo ""
echo "  ┌──────────────────────────────────────┐"
echo "  │   remwatch subpage agent installer    │"
echo "  └──────────────────────────────────────┘"
echo ""

command -v docker >/dev/null 2>&1 || error "Docker не найден."
command -v curl   >/dev/null 2>&1 || error "curl не найден."

[ -z "${LOKI_URL:-}"      ] && error "LOKI_URL не задан."
[ -z "${SERVICE_NAME:-}"  ] && error "SERVICE_NAME не задан."
[ -z "${REMWATCH_URL:-}"  ] && error "REMWATCH_URL не задан."

# Проверка — есть ли нужный контейнер
if ! docker ps --format '{{.Names}}' | grep -q "remnawave-subscription-page"; then
  warn "Контейнер remnawave-subscription-page не найден."
  warn "Убедись что страница подписки запущена на этом сервере."
fi

# Удаляем старый агент если есть
if docker ps -a --format '{{.Names}}' | grep -q "remwatch-vector-subpage"; then
  warn "Найден старый агент, удаляю..."
  docker stop remwatch-vector-subpage 2>/dev/null || true
  docker rm   remwatch-vector-subpage 2>/dev/null || true
fi

info "Скачиваю конфиги..."
mkdir -p /opt/remwatch-subpage/vector

curl -fsSL "${REMWATCH_URL}/docker-compose.subpage.yml" \
  -o /opt/remwatch-subpage/docker-compose.yml

curl -fsSL "${REMWATCH_URL}/vector/vector-subpage.yaml" \
  -o /opt/remwatch-subpage/vector/vector-subpage.yaml

cat > /opt/remwatch-subpage/.env <<EOF
LOKI_URL=${LOKI_URL}
SERVICE_NAME=${SERVICE_NAME}
EOF

info "Запускаю агент..."
cd /opt/remwatch-subpage
docker compose up -d

sleep 5

if docker ps --format '{{.Names}}' | grep -q "remwatch-vector-subpage"; then
  info "Агент запущен ✓"
else
  warn "Агент не запустился. Логи: docker logs remwatch-vector-subpage"
  exit 1
fi

# Проверка связи с Loki
LOKI_RESP=$(curl -s --max-time 5 \
  "${LOKI_URL}/loki/api/v1/query" \
  --data-urlencode "query={service_name=\"${SERVICE_NAME}\"}" \
  --data-urlencode "limit=1" 2>/dev/null || echo "")

if echo "$LOKI_RESP" | grep -q '"status":"success"'; then
  info "Loki доступен ✓"
else
  warn "Не удалось опросить Loki: ${LOKI_URL}"
fi

echo ""
info "Готово. Сервис ${SERVICE_NAME} подключён к ${LOKI_URL}"
