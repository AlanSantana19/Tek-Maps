#!/usr/bin/env bash
# =============================================================================
# Tek-Map — Script de atualização (sem Docker)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
error()   { echo -e "${RED}[ERRO]${RESET}  $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }

[[ $EUID -eq 0 ]] || error "Execute como root: sudo bash update.sh"

INSTALL_DIR="${INSTALL_DIR:-/opt/tek-map}"
APP_USER="${APP_USER:-tekmap}"

[[ -d "${INSTALL_DIR}/.git" ]] || error "Diretório $INSTALL_DIR não encontrado. Execute install.sh primeiro."

step "Baixando atualizações"
sudo -u "$APP_USER" git -C "$INSTALL_DIR" pull --ff-only
success "Código atualizado"

step "Compilando servidor"
sudo -u "$APP_USER" bash -c "cd ${INSTALL_DIR} && npm install --silent && npm run build --workspace server"
success "Servidor compilado"

step "Compilando cliente"
sudo -u "$APP_USER" bash -c "cd ${INSTALL_DIR} && npm run build --workspace client"
success "Cliente compilado"

step "Aplicando migrações de banco"
DB_URL=$(grep DATABASE_URL "${INSTALL_DIR}/server/.env" | cut -d= -f2-)
sudo -u postgres psql "$DB_URL" -f "${INSTALL_DIR}/server/src/db/schema.sql" >/dev/null 2>&1 || true
success "Schema verificado"

step "Reiniciando servidor"
pm2 restart tek-map-server
success "Servidor reiniciado"

step "Recarregando nginx"
nginx -t && systemctl reload nginx
success "nginx recarregado"

echo ""
echo -e "${BOLD}${GREEN}Atualização concluída!${RESET}"
pm2 list
