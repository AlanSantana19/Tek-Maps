#!/usr/bin/env bash
# =============================================================================
# Tek-Map — Instalador para Debian / Ubuntu
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Cores
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[AVISO]${RESET} $*"; }
error()   { echo -e "${RED}[ERRO]${RESET}  $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }

# ---------------------------------------------------------------------------
# Root check
# ---------------------------------------------------------------------------
[[ $EUID -eq 0 ]] || error "Execute como root: sudo bash install.sh"

# ---------------------------------------------------------------------------
# Detectar distro
# ---------------------------------------------------------------------------
step "Detectando sistema operacional"
if [[ -f /etc/os-release ]]; then
  source /etc/os-release
  DISTRO="${ID:-unknown}"
  DISTRO_VERSION="${VERSION_ID:-0}"
  info "Sistema: $PRETTY_NAME"
else
  error "Não foi possível detectar o sistema operacional."
fi

case "$DISTRO" in
  debian|ubuntu|linuxmint|pop) ;;
  *) error "Distro '$DISTRO' não suportada. Use Debian ou Ubuntu." ;;
esac

# ---------------------------------------------------------------------------
# Variáveis configuráveis
# ---------------------------------------------------------------------------
INSTALL_DIR="${INSTALL_DIR:-/opt/tek-map}"
APP_USER="${APP_USER:-tekmap}"
DB_NAME="${DB_NAME:-tekmap}"
DB_USER="${DB_USER:-tekmap}"
DB_PASS="${DB_PASS:-$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)}"
APP_PORT="${APP_PORT:-80}"
API_PORT="${API_PORT:-4000}"
REPO_URL="${REPO_URL:-https://github.com/AlanSantana19/Tek-Maps.git}"

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════╗"
echo "  ║       Tek-Map  Instalador        ║"
echo "  ╚══════════════════════════════════╝"
echo -e "${RESET}"
echo -e "  Diretório : ${CYAN}${INSTALL_DIR}${RESET}"
echo -e "  Usuário   : ${CYAN}${APP_USER}${RESET}"
echo -e "  Banco     : ${CYAN}${DB_NAME}${RESET}"
echo -e "  Porta web : ${CYAN}${APP_PORT}${RESET}"
echo ""
read -r -p "  Continuar? [S/n] " CONFIRM
[[ "${CONFIRM,,}" =~ ^(s|sim|y|yes|)$ ]] || { info "Instalação cancelada."; exit 0; }

# ---------------------------------------------------------------------------
# 1. Atualizar pacotes
# ---------------------------------------------------------------------------
step "Atualizando lista de pacotes"
apt-get update -qq
success "Lista atualizada"

# ---------------------------------------------------------------------------
# 2. Dependências do sistema
# ---------------------------------------------------------------------------
step "Instalando dependências do sistema"
apt-get install -y -qq \
  curl wget gnupg ca-certificates lsb-release \
  git build-essential \
  nginx \
  openssl \
  sudo
success "Dependências instaladas"

# ---------------------------------------------------------------------------
# 3. Node.js 20
# ---------------------------------------------------------------------------
step "Instalando Node.js 20"
if command -v node &>/dev/null && [[ "$(node -e 'console.log(process.version.split(".")[0].slice(1))')" -ge 20 ]]; then
  success "Node.js $(node -v) já instalado"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
  success "Node.js $(node -v) instalado"
fi

# ---------------------------------------------------------------------------
# 4. PostgreSQL
# ---------------------------------------------------------------------------
step "Instalando PostgreSQL"
if command -v psql &>/dev/null; then
  success "PostgreSQL $(psql --version | awk '{print $3}') já instalado"
else
  # Repositório oficial do PostgreSQL para versão mais recente
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
  echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq postgresql
  systemctl enable --now postgresql
  success "PostgreSQL instalado"
fi

# ---------------------------------------------------------------------------
# 5. PM2
# ---------------------------------------------------------------------------
step "Instalando PM2"
if command -v pm2 &>/dev/null; then
  success "PM2 $(pm2 -v) já instalado"
else
  npm install -g pm2 --silent
  success "PM2 instalado"
fi

# ---------------------------------------------------------------------------
# 6. Usuário do sistema
# ---------------------------------------------------------------------------
step "Criando usuário do sistema: ${APP_USER}"
if id "$APP_USER" &>/dev/null; then
  warn "Usuário $APP_USER já existe"
else
  useradd --system --create-home --shell /bin/bash "$APP_USER"
  success "Usuário $APP_USER criado"
fi

# ---------------------------------------------------------------------------
# 7. Clonar / atualizar repositório
# ---------------------------------------------------------------------------
step "Clonando repositório em ${INSTALL_DIR}"
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  warn "Diretório já existe — atualizando com git pull"
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$INSTALL_DIR"
success "Código disponível em $INSTALL_DIR"

# ---------------------------------------------------------------------------
# 8. Banco de dados
# ---------------------------------------------------------------------------
step "Configurando banco de dados PostgreSQL"

# Garantir que o postgres está rodando
systemctl start postgresql

PG_MAJOR=$(psql --version | grep -oP '\d+' | head -1)

# Criar usuário e banco (ignora erro se já existirem)
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >/dev/null

# Aplicar schema
sudo -u postgres psql -d "$DB_NAME" \
  -f "${INSTALL_DIR}/server/src/db/schema.sql" >/dev/null 2>&1 || true

success "Banco '${DB_NAME}' pronto"

# ---------------------------------------------------------------------------
# 9. Arquivo .env do servidor
# ---------------------------------------------------------------------------
step "Gerando arquivo de configuração .env"
ENV_FILE="${INSTALL_DIR}/server/.env"

if [[ -f "$ENV_FILE" ]]; then
  warn ".env já existe — não sobrescrevendo (verifique manualmente)"
else
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=${API_PORT}
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
CORS_ORIGIN=*
EOF
  chown "$APP_USER":"$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  success ".env criado em $ENV_FILE"
fi

# ---------------------------------------------------------------------------
# 10. Build da aplicação
# ---------------------------------------------------------------------------
step "Instalando dependências npm"
sudo -u "$APP_USER" bash -c "cd ${INSTALL_DIR} && npm install --silent"
success "Dependências instaladas"

step "Compilando servidor (TypeScript)"
sudo -u "$APP_USER" bash -c "cd ${INSTALL_DIR} && npm run build --workspace server"
success "Servidor compilado"

step "Compilando cliente (React/Vite)"
sudo -u "$APP_USER" bash -c "cd ${INSTALL_DIR} && npm run build --workspace client"
success "Cliente compilado"

# ---------------------------------------------------------------------------
# 11. PM2 — configurar processo
# ---------------------------------------------------------------------------
step "Configurando PM2"

PM2_CONFIG="${INSTALL_DIR}/ecosystem.config.cjs"
cat > "$PM2_CONFIG" <<EOF
module.exports = {
  apps: [{
    name: 'tek-map-server',
    script: '${INSTALL_DIR}/server/dist/index.js',
    cwd: '${INSTALL_DIR}/server',
    user: '${APP_USER}',
    env_file: '${INSTALL_DIR}/server/.env',
    restart_delay: 3000,
    max_restarts: 10,
    watch: false,
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
EOF

chown "$APP_USER":"$APP_USER" "$PM2_CONFIG"

# Parar instância anterior se existir
pm2 delete tek-map-server 2>/dev/null || true

pm2 start "$PM2_CONFIG"
pm2 save

# Configurar startup do PM2 para o usuário root (que iniciou o pm2)
PM2_STARTUP=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo" | tail -1)
if [[ -n "$PM2_STARTUP" ]]; then
  eval "$PM2_STARTUP" >/dev/null 2>&1 || true
fi

success "PM2 configurado — API rodando na porta ${API_PORT}"

# ---------------------------------------------------------------------------
# 12. nginx
# ---------------------------------------------------------------------------
step "Configurando nginx"

NGINX_CONF="/etc/nginx/sites-available/tek-map"
cat > "$NGINX_CONF" <<EOF
server {
    listen ${APP_PORT};
    server_name _;

    root ${INSTALL_DIR}/client/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # Assets com hash — cache imutável
    location ~* ^/assets/.+\.(js|css|woff2?|png|jpg|svg|ico)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /ws {
        proxy_pass http://127.0.0.1:${API_PORT}/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate" always;
    }
}
EOF

# Remover default se existir
rm -f /etc/nginx/sites-enabled/default

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/tek-map

nginx -t
systemctl enable --now nginx
systemctl reload nginx

success "nginx configurado na porta ${APP_PORT}"

# ---------------------------------------------------------------------------
# 13. Resumo final
# ---------------------------------------------------------------------------
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗"
echo -e "║          Instalação concluída!               ║"
echo -e "╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}URL de acesso:${RESET}    http://${LOCAL_IP}:${APP_PORT}"
echo -e "  ${BOLD}Instalado em:${RESET}     ${INSTALL_DIR}"
echo -e "  ${BOLD}Banco de dados:${RESET}   ${DB_NAME} @ localhost:5432"
echo -e "  ${BOLD}Usuário DB:${RESET}       ${DB_USER}"
echo -e "  ${BOLD}Senha DB:${RESET}         ${DB_PASS}"
echo -e "  ${BOLD}API (interna):${RESET}    http://127.0.0.1:${API_PORT}"
echo ""
echo -e "  ${YELLOW}Guarde a senha do banco em local seguro!${RESET}"
echo ""
echo -e "  ${BOLD}Comandos úteis:${RESET}"
echo -e "    pm2 logs tek-map-server     # ver logs da API"
echo -e "    pm2 restart tek-map-server  # reiniciar API"
echo -e "    bash ${INSTALL_DIR}/install/update.sh  # atualizar"
echo ""
