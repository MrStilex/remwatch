#!/bin/bash
set -euo pipefail

info()  { echo -e "\e[32m[+]\e[0m $*"; }
warn()  { echo -e "\e[33m[!]\e[0m $*"; }
error() { echo -e "\e[31m[✗]\e[0m $*" >&2; exit 1; }
ask() {
  local prompt="$1"
  local ans=""
  if [ "${AUTO_YES:-0}" = "1" ]; then
    info "${prompt} -> yes (AUTO_YES=1)"
    return 0
  fi
  read -r -p "${prompt} [y/N]: " ans < /dev/tty || ans=""
  ans="$(printf '%s' "$ans" | tr -d '\r' | tr '[:upper:]' '[:lower:]')"
  [ "$ans" = "y" ] || [ "$ans" = "yes" ]
}

prompt_default() {
  local var_name="$1"
  local prompt="$2"
  local default_val="${3:-}"
  local current_val="${!var_name:-}"
  local input=""

  [ -n "$current_val" ] && return 0
  [ "${AUTO_YES:-0}" = "1" ] && [ -n "$default_val" ] && printf -v "$var_name" '%s' "$default_val" && return 0

  if [ -n "$default_val" ]; then
    read -r -p "${prompt} [${default_val}]: " input < /dev/tty || true
    input="${input:-$default_val}"
  else
    read -r -p "${prompt}: " input < /dev/tty || true
  fi

  [ -n "$input" ] || error "Поле '${var_name}' обязательно."
  printf -v "$var_name" '%s' "$input"
}

install_docker_if_missing() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi

  warn "Docker не найден."
  if ! ask "Установить Docker автоматически?"; then
    error "Docker обязателен для работы агента."
  fi

  [ -r /etc/os-release ] || error "Не удалось определить ОС (нет /etc/os-release)."
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-}"
  CODENAME="${VERSION_CODENAME:-}"

  if [ -z "$OS_ID" ]; then
    error "Не удалось определить ID ОС."
  fi

  if [ "$OS_ID" != "ubuntu" ] && [ "$OS_ID" != "debian" ]; then
    error "Автоустановка Docker поддерживается только для ubuntu/debian. Установи Docker вручную."
  fi

  if [ -z "$CODENAME" ] && [ -n "${VERSION_ID:-}" ]; then
    # fallback для старых систем
    CODENAME="$(lsb_release -cs 2>/dev/null || true)"
  fi
  [ -z "$CODENAME" ] && error "Не удалось определить codename дистрибутива."

  info "Устанавливаю Docker для ${OS_ID} (${CODENAME})..."
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${OS_ID} ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker

  command -v docker >/dev/null 2>&1 || error "Docker не установился корректно."
  docker compose version >/dev/null 2>&1 || error "Docker Compose plugin не установился."
  info "Docker установлен ✓"
}

[ -z "${REMWATCH_URL:-}" ] && error "REMWATCH_URL не задан."
REPO_URL="${REMWATCH_URL}"

command -v curl   >/dev/null 2>&1 || error "curl не найден."
install_docker_if_missing

echo ""
echo "  ┌────────────────────────────────────────────────────┐"
echo "  │      remwatch website/bot journal installer        │"
echo "  └────────────────────────────────────────────────────┘"
echo ""

prompt_default LOG_INGEST_URL "Logs ingest URL" "${REMWATCH_URL}/api/logs/ingest"
prompt_default SERVICE_TOKEN "Service ingest token"
prompt_default NODE_NAME "Node name" "my-server"
prompt_default NODE_IP "Node public IP" "1.2.3.4"
prompt_default COUNTRY "Country (ISO2)" "XX"
prompt_default SERVICE_NAME "Service name label" "website-bot"

if [ -z "${SERVICE_UNIT:-}" ] && [ -z "${LOG_PATH:-}" ]; then
  mode_default="1"
  if [ "${AUTO_YES:-0}" != "1" ]; then
    read -r -p "Источник логов: 1) systemd unit  2) file path [1/2]: " mode_default < /dev/tty || true
    mode_default="${mode_default:-1}"
  fi
  if [ "$mode_default" = "2" ]; then
    prompt_default LOG_PATH "Path to log file (glob allowed)" "/var/log/mybot/*.log"
  else
    prompt_default SERVICE_UNIT "Systemd unit name" "my-bot.service"
  fi
fi

if [ -n "${SERVICE_UNIT:-}" ] && [ -n "${LOG_PATH:-}" ]; then
  warn "Указаны и SERVICE_UNIT и LOG_PATH. Будет использован SERVICE_UNIT."
fi

info "Параметры:"
echo "  LOG_INGEST_URL=${LOG_INGEST_URL}"
echo "  NODE_NAME=${NODE_NAME}"
echo "  NODE_IP=${NODE_IP}"
echo "  COUNTRY=${COUNTRY}"
echo "  SERVICE_NAME=${SERVICE_NAME}"
if [ -n "${SERVICE_UNIT:-}" ]; then
  echo "  SOURCE=systemd (${SERVICE_UNIT})"
else
  echo "  SOURCE=file (${LOG_PATH})"
fi
if ! ask "Продолжить установку?"; then
  error "Установка отменена пользователем."
fi

if docker ps -a --format '{{.Names}}' | grep -Eq '^remwatch-vector$|^remwatch-node-exporter$'; then
  warn "Найдены существующие контейнеры агента remwatch."
  if ask "Остановить и удалить старые контейнеры?"; then
    docker stop remwatch-vector        2>/dev/null || true
    docker rm   remwatch-vector        2>/dev/null || true
    docker stop remwatch-node-exporter 2>/dev/null || true
    docker rm   remwatch-node-exporter 2>/dev/null || true
    info "Старые контейнеры удалены."
  else
    error "Установка остановлена: пользователь отменил удаление старых контейнеров."
  fi
fi

EXPORTER_PROFILE=""
if curl -sf --max-time 3 "http://localhost:9100/metrics" >/dev/null 2>&1; then
  info "Node Exporter уже работает на порту 9100 ✓"
else
  if ss -tlnp 2>/dev/null | grep -q ':9100 '; then
    PORT_LINE="$(ss -tlnp 2>/dev/null | grep ':9100 ' | head -1 || true)"
    warn "Порт 9100 занят: ${PORT_LINE}"
    if ask "Попробовать освободить порт 9100 (stop node_exporter/kill pid)?"; then
      systemctl stop node_exporter    2>/dev/null || true
      systemctl disable node_exporter 2>/dev/null || true
      PORT_PID=$(ss -tlnp 2>/dev/null | grep ':9100 ' | grep -oP 'pid=\K[0-9]+' | head -1)
      [ -n "$PORT_PID" ] && kill -9 "$PORT_PID" 2>/dev/null || true
      sleep 1
    else
      warn "Оставляю порт 9100 как есть. Встроенный node-exporter запущен не будет."
      EXPORTER_PROFILE=""
    fi
  fi
  if ! curl -sf --max-time 3 "http://localhost:9100/metrics" >/dev/null 2>&1; then
    EXPORTER_PROFILE="--profile with-exporter"
    info "Node Exporter будет установлен."
  else
    info "Порт 9100 уже обслуживается, используем существующий exporter."
  fi
fi

info "Скачиваю docker-compose..."
curl -fsSL "${REPO_URL}/docker-compose.agent.yml" -o docker-compose.yml
mkdir -p vector

if [ -n "${SERVICE_UNIT:-}" ]; then
  info "Режим логов: systemd (${SERVICE_UNIT})"
  curl -fsSL "${REPO_URL}/vector/vector-service-systemd.yaml" -o vector/vector.yaml
else
  info "Режим логов: file (${LOG_PATH})"
  curl -fsSL "${REPO_URL}/vector/vector-service-file.yaml" -o vector/vector.yaml
fi

cat > .env <<EOF
LOG_INGEST_URL=${LOG_INGEST_URL}
SERVICE_TOKEN=${SERVICE_TOKEN}
NODE_NAME=${NODE_NAME}
NODE_IP=${NODE_IP}
COUNTRY=${COUNTRY}
ENVIRONMENT=production
SERVICE_NAME=${SERVICE_NAME}
SERVICE_UNIT=${SERVICE_UNIT:-}
LOG_PATH=${LOG_PATH:-}
EOF

info "Запускаю агент..."
# shellcheck disable=SC2086
docker compose $EXPORTER_PROFILE up -d

echo ""
info "Жду запуск контейнеров (10 сек)..."
sleep 10

if docker ps --format '{{.Names}}' | grep -q "remwatch-vector"; then
  info "Vector запущен ✓"
else
  warn "Vector не запустился. Логи: docker logs remwatch-vector"
fi

if curl -sf --max-time 3 "http://localhost:9100/metrics" >/dev/null 2>&1; then
  info "Node Exporter доступен на 9100 ✓"
else
  warn "Node Exporter недоступен на 9100."
fi

INGEST_RESP=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${SERVICE_TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST "${LOG_INGEST_URL}" \
  -d '{"message":"installer-heartbeat","level":"info","source_type":"heartbeat"}' 2>/dev/null || echo "")

if [ "$INGEST_RESP" = "204" ]; then
  info "Backend ingest принимает логи ✓"
else
  warn "Не удалось проверить backend ingest по адресу ${LOG_INGEST_URL} (HTTP ${INGEST_RESP:-n/a})"
fi

echo ""
info "Готово. Сервис ${SERVICE_NAME} подключён."
