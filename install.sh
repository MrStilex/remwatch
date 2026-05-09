#!/bin/bash
set -euo pipefail

REPO_URL="https://raw.githubusercontent.com/YOUR_USER/remwatch/main"

# ─── helpers ──────────────────────────────────────────────────────────────────
info()  { echo -e "\e[32m[+]\e[0m $*"; }
warn()  { echo -e "\e[33m[!]\e[0m $*"; }
error() { echo -e "\e[31m[✗]\e[0m $*" >&2; exit 1; }
ask()   { read -rp "    $1: " "$2"; }

# ─── global checks ────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || error "Docker не найден. Установи Docker и попробуй снова."
command -v curl   >/dev/null 2>&1 || error "curl не найден."

echo ""
echo "  ┌──────────────────────────────────┐"
echo "  │         remwatch installer        │"
echo "  └──────────────────────────────────┘"
echo ""

# ─── installation type ────────────────────────────────────────────────────────
# Если NODE_NAME и LOKI_URL уже переданы через окружение — агентский режим без вопросов
if [ -n "${NODE_NAME:-}" ] && [ -n "${LOKI_URL:-}" ]; then
  INSTALL_TYPE="agent"
else
  echo "  Тип установки:"
  echo "    [1] central — Loki + Backend + Frontend (центральный сервер)"
  echo "    [2] agent   — только Vector (сервер с Remnawave)"
  echo ""
  ask "Выбор (1/2)" INSTALL_TYPE
fi

case "$INSTALL_TYPE" in

  # ════════════════════════════════════════════════════════════════════════════
  1|central)
    info "Настройка центрального сервера..."
    echo ""

    ask "Домен (например monitor.example.com)"  DOMAIN
    ask "Backend порт (по умолчанию: 3000)"     BACKEND_PORT
    ask "Loki порт (по умолчанию: 3100)"        LOKI_PORT
    ask "Хранить логи N дней (по умолчанию: 30)" LOKI_RETENTION_DAYS

    BACKEND_PORT="${BACKEND_PORT:-3000}"
    LOKI_PORT="${LOKI_PORT:-3100}"
    LOKI_RETENTION_DAYS="${LOKI_RETENTION_DAYS:-30}"
    LOKI_TOKEN="$(openssl rand -hex 32)"

    cat > .env <<EOF
DOMAIN=${DOMAIN}
BACKEND_PORT=${BACKEND_PORT}
LOKI_PORT=${LOKI_PORT}
LOKI_RETENTION_DAYS=${LOKI_RETENTION_DAYS}
LOKI_TOKEN=${LOKI_TOKEN}
EOF

    info "Скачиваю конфиги..."
    curl -fsSL "${REPO_URL}/docker-compose.central.yml" -o docker-compose.yml
    curl -fsSL "${REPO_URL}/loki/config.yml" --create-dirs -o loki/config.yml

    info "Запускаю контейнеры..."
    docker compose up -d

    echo ""
    info "Готово! Фронтенд: http://${DOMAIN}"
    info "Токен для агентов: ${LOKI_TOKEN}"
    ;;

  # ════════════════════════════════════════════════════════════════════════════
  2|agent)
    # ── параметры ноды (интерактивно только если не переданы через окружение) ──
    [ -z "${LOG_INGEST_URL:-}" ] && ask "Ingest URL (например http://monitor.example.com:3000/api/logs/ingest)" LOG_INGEST_URL
    [ -z "${SERVICE_TOKEN:-}" ] && ask "Service token" SERVICE_TOKEN
    [ -z "${NODE_NAME:-}" ] && ask "Имя ноды (например Germany #3)"                      NODE_NAME
    [ -z "${NODE_IP:-}"   ] && ask "IP ноды (например 1.2.3.4)"                          NODE_IP
    [ -z "${COUNTRY:-}"   ] && ask "Код страны (например DE)"                            COUNTRY

    export LOG_INGEST_URL SERVICE_TOKEN NODE_NAME NODE_IP COUNTRY
    curl -fsSL "${REPO_URL}/node-agent-install.sh" | bash
    ;;

  *)
    error "Неверный выбор."
    ;;
esac
