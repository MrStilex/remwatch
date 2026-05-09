#!/bin/bash
set -euo pipefail

info()  { echo -e "\e[32m[+]\e[0m $*"; }
warn()  { echo -e "\e[33m[!]\e[0m $*"; }

INSTALL_DIR="/opt/remwatch-node-agent"

if docker ps -a --format '{{.Names}}' | grep -Eq '^remwatch-vector$|^remwatch-node-exporter$'; then
  docker stop remwatch-vector 2>/dev/null || true
  docker rm remwatch-vector 2>/dev/null || true
  docker stop remwatch-node-exporter 2>/dev/null || true
  docker rm remwatch-node-exporter 2>/dev/null || true
fi

rm -rf "$INSTALL_DIR"
info "Нодовый агент удалён."
