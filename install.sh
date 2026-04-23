#!/bin/bash
# ============================================================
#  HIDEYOU — Скрипт установки и управления
#  https://github.com/ChernOvOne/PRO
# ============================================================

set -euo pipefail

# Canonical upstream. Servers that were initially installed from the old
# "LKHY" repo name get auto-migrated to "PRO" on first update — otherwise
# `git fetch --tags` won't show the newer v5.x tags.
HIDEYOU_REPO_URL="https://github.com/ChernOvOne/PRO.git"

RED='\033[0;31m';  GREEN='\033[0;32m';  YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m';  BOLD='\033[1m'
DIM='\033[2m';     RESET='\033[0m'

ENV_FILE=".env"
LOG_FILE="./hideyou-install.log"

log()  { echo -e "${DIM}[$(date '+%H:%M:%S')]${RESET} $*" | tee -a "$LOG_FILE"; }
ok()   { echo -e "${GREEN}${BOLD}  ✓${RESET}  $*"; log "ОК: $*"; }
warn() { echo -e "${YELLOW}${BOLD}  ⚠${RESET}  $*"; log "ВНИМАНИЕ: $*"; }
err()  { echo -e "${RED}${BOLD}  ✗${RESET}  $*"; log "ОШИБКА: $*"; }
info() { echo -e "${CYAN}  →${RESET}  $*"; }
step() { echo -e "\n${BLUE}${BOLD}══ $* ${RESET}"; }
ask()  { echo -e "${YELLOW}${BOLD}  ?${RESET}  $*"; }
sep()  { echo -e "  ${DIM}─────────────────────────────────────────────────${RESET}"; }

banner() {
  clear
  echo -e "${CYAN}${BOLD}"
  cat << 'EOF'

  ██╗  ██╗██╗██████╗ ███████╗██╗   ██╗ ██████╗ ██╗   ██╗
  ██║  ██║██║██╔══██╗██╔════╝╚██╗ ██╔╝██╔═══██╗██║   ██║
  ███████║██║██║  ██║█████╗   ╚████╔╝ ██║   ██║██║   ██║
  ██╔══██║██║██║  ██║██╔══╝    ╚██╔╝  ██║   ██║██║   ██║
  ██║  ██║██║██████╔╝███████╗   ██║   ╚██████╔╝╚██████╔╝
  ╚═╝  ╚═╝╚═╝╚═════╝ ╚══════╝   ╚═╝    ╚═════╝  ╚═════╝
EOF
  echo -e "${RESET}"
  echo -e "  ${DIM}VPN-платформа на базе REMNAWAVE${RESET}"
  echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
}

detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release; OS_NAME="$ID"; OS_VERSION="${VERSION_ID:-}"
  else
    OS_NAME="unknown"
  fi
}

# ── Зависимости ───────────────────────────────────────────────
check_docker() {
  command -v docker &>/dev/null || return 1
  ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null | sed 's/-.*//') найден"
}
check_compose() {
  docker compose version &>/dev/null 2>&1 || return 1
  ok "Docker Compose найден"
}
check_git() {
  command -v git &>/dev/null || return 1
  ok "Git найден"
}

install_docker() {
  step "Установка Docker"
  detect_os
  case "$OS_NAME" in
    ubuntu|debian|raspbian)
      apt-get update -qq
      apt-get install -y -qq ca-certificates curl gnupg lsb-release
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL "https://download.docker.com/linux/$OS_NAME/gpg" \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/$OS_NAME $(lsb_release -cs) stable" \
        | tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
      ;;
    centos|rhel|fedora|rocky|almalinux)
      command -v dnf &>/dev/null \
        && dnf install -y -q docker docker-compose-plugin \
        || yum install -y -q docker docker-compose-plugin
      ;;
    *) err "Неподдерживаемая ОС: $OS_NAME"; exit 1 ;;
  esac
  systemctl enable docker --quiet && systemctl start docker
  [[ -n "${SUDO_USER:-}" ]] && usermod -aG docker "$SUDO_USER"
  ok "Docker установлен"
}

# ── .env ─────────────────────────────────────────────────────
# Все токены необязательных сервисов можно заполнить позже через меню [18]
create_env_template() {
  cat > "$ENV_FILE" << 'ENVEOF'
NODE_ENV=production

# ── Домены (задаются при установке) ──────────────────────────
DOMAIN=
ADMIN_DOMAIN=
API_DOMAIN=
APP_URL=

# ── Безопасность (генерируются автоматически) ─────────────────
APP_SECRET=
JWT_SECRET=
JWT_EXPIRES_IN=30d
COOKIE_SECRET=

# ── База данных ───────────────────────────────────────────────
POSTGRES_PASSWORD=
DATABASE_URL=postgresql://hideyou:POSTGRES_PASSWORD@postgres:5432/hideyou

# ── Redis ─────────────────────────────────────────────────────
REDIS_PASSWORD=
REDIS_SESSION_SECRET=
REDIS_URL=redis://:REDIS_PASSWORD@redis:6379

# ── REMNAWAVE ─────────────────────────────────────────────────
REMNAWAVE_URL=http://localhost:3000
REMNAWAVE_TOKEN=

# ── Telegram (можно задать позже: меню [18]) ──────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_NAME=HideYouBot
TELEGRAM_LOGIN_BOT_TOKEN=

# ── ЮKassa (можно задать позже: меню [18]) ────────────────────
YUKASSA_SHOP_ID=
YUKASSA_SECRET_KEY=
YUKASSA_RETURN_URL=
YUKASSA_WEBHOOK_SECRET=

# ── CryptoPay (можно задать позже: меню [18]) ─────────────────
CRYPTOPAY_API_TOKEN=
CRYPTOPAY_NETWORK=mainnet

# ── Email / SMTP (можно задать позже: меню [18]) ──────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# ── Реферальная система ───────────────────────────────────────
REFERRAL_BONUS_DAYS=30
REFERRAL_MIN_DAYS=30
REFERRAL_REWARD_TYPE=days
REFERRAL_REWARD_AMOUNT=100

# ── Функции ───────────────────────────────────────────────────
FEATURE_CRYPTO_PAYMENTS=true
FEATURE_REFERRAL=true
FEATURE_EMAIL_AUTH=true
FEATURE_TELEGRAM_AUTH=true
FEATURE_TRIAL=false
TRIAL_DAYS=3
FEATURE_GIFTS=true
FEATURE_BALANCE=true
FEATURE_BOT=true

GIFT_CODE_EXPIRY_DAYS=30
VERIFICATION_CODE_TTL=600

# ── Карты (опционально, можно оставить пустыми) ───────────────
# MapTiler: https://cloud.maptiler.com/  | Яндекс.Карты: https://developer.tech.yandex.ru/
MAPTILER_KEY=
YANDEX_MAPS_KEY=

# ── Telegram backup bot (опционально) ─────────────────────────
# Бот в который updater-сервис присылает бэкапы БД
TG_BACKUP_TOKEN=
TG_BACKUP_CHAT=

LOG_LEVEL=info
ENVEOF
}

# Записать/обновить ключ в .env.
# ИСПРАВЛЕНО: использует $default если значение в файле пустое и пользователь нажал Enter.
put() {
  local key="$1" prompt="$2" default="${3:-}" secret="${4:-false}"
  # Читаем текущее значение из файла
  local cur
  cur=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")
  # Если в файле пусто — берём дефолт (это исправляет баг с JWT_SECRET)
  [[ -z "$cur" ]] && cur="$default"

  printf "  ${CYAN}%-42s${RESET}" "$prompt"
  local v
  if [[ "$secret" == "true" ]]; then read -rs v; echo ""; else read -r v; fi
  # Если пользователь ничего не ввёл — оставляем cur (который уже включает default)
  v="${v:-$cur}"

  # Экранируем для sed (символы |, /, \, ^, $, ., *, +, ?, (, ), {, [)
  local esc
  esc=$(printf '%s\n' "$v" | sed 's/[[\.*^$()+?{|]/\\&/g; s|/|\\/|g')

  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE"
  else
    echo "${key}=${v}" >> "$ENV_FILE"
  fi
}

# Обновить один ключ (используется в configure_tokens)
put_key() {
  local key="$1" prompt="$2" default="${3:-}" secret="${4:-false}"
  local cur
  cur=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")

  if [[ "$secret" == "true" ]]; then
    local masked
    masked=$([ -n "$cur" ] && echo "●●●●●●●●" || echo "не задан")
    printf "  ${CYAN}%-38s${RESET}${DIM}[%s]${RESET} " "$prompt" "$masked"
    local v; read -rs v; echo ""
    v="${v:-${cur:-$default}}"
  else
    printf "  ${CYAN}%-38s${RESET}${DIM}[%s]${RESET} " "$prompt" "${cur:-не задан}"
    local v; read -r v
    v="${v:-${cur:-$default}}"
  fi

  local esc
  esc=$(printf '%s\n' "$v" | sed 's/[[\.*^$()+?{|]/\\&/g; s|/|\\/|g')

  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE"
  else
    echo "${key}=${v}" >> "$ENV_FILE"
  fi
}

setup_env() {
  step "Настройка окружения"
  if [[ -f "$ENV_FILE" ]]; then
    warn "Файл .env уже существует"
    ask "Перезаписать? [д/Н]"; read -r ans
    [[ "$ans" =~ ^[дДyY]$ ]] || { info "Оставляю существующий .env"; return 0; }
  fi
  create_env_template
  info "Создан .env"
  echo ""
  echo -e "  ${BOLD}Настройка доменов${RESET}"
  echo -e "  ${DIM}Каждый домен задаётся отдельно. Пример: lk.example.com / admin.example.com${RESET}"
  echo ""

  put "DOMAIN"       "Основной домен (лендинг/кабинет): "  ""
  put "ADMIN_DOMAIN" "Домен панели администратора: "        ""
  put "API_DOMAIN"   "Домен API (для вебхуков и прочего): " ""

  echo ""
  echo -e "  ${BOLD}REMNAWAVE${RESET}"
  echo ""
  put "REMNAWAVE_URL"   "URL панели REMNAWAVE: "               "http://localhost:3000"
  put "REMNAWAVE_TOKEN" "Токен API REMNAWAVE (Enter = позже): " "" "true"

  echo ""
  echo -e "  ${BOLD}Telegram${RESET} ${DIM}(Enter = пропустить, настроить позже через [18])${RESET}"
  echo ""
  put "TELEGRAM_BOT_TOKEN" "Токен Telegram-бота: "  "" "true"
  put "TELEGRAM_BOT_NAME"  "Username бота (без @): " ""

  echo ""
  ask "Запустить Telegram-бот для VPN? [Д/н]"
  read -r INSTALL_BOT
  if [[ "$INSTALL_BOT" =~ ^[нНnN]$ ]]; then
    sed -i "s|^FEATURE_BOT=.*|FEATURE_BOT=false|" "$ENV_FILE"
    if ! grep -q "^FEATURE_BOT=" "$ENV_FILE"; then
      echo "FEATURE_BOT=false" >> "$ENV_FILE"
    fi
  else
    sed -i "s|^FEATURE_BOT=.*|FEATURE_BOT=true|" "$ENV_FILE"
    if ! grep -q "^FEATURE_BOT=" "$ENV_FILE"; then
      echo "FEATURE_BOT=true" >> "$ENV_FILE"
    fi
  fi

  echo ""
  echo -e "  ${BOLD}База данных и безопасность${RESET}"
  echo ""
  put "POSTGRES_PASSWORD" "Пароль PostgreSQL (Enter = авто): " "$(openssl rand -hex 16)" "true"
  put "REDIS_PASSWORD"    "Пароль Redis (Enter = авто): "      "$(openssl rand -hex 16)" "true"

  # JWT_SECRET — всегда генерируем автоматически если пустой
  local jwt_cur
  jwt_cur=$(grep "^JWT_SECRET=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")
  if [[ -z "$jwt_cur" ]]; then
    local jwt_new; jwt_new="$(openssl rand -hex 32)"
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_new}|" "$ENV_FILE"
    ok "JWT_SECRET сгенерирован автоматически (64 символа)"
  fi

  # Генерация остальных секретов
  sed -i "s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -hex 32)|"                     "$ENV_FILE"
  sed -i "s|^COOKIE_SECRET=.*|COOKIE_SECRET=$(openssl rand -hex 32)|"               "$ENV_FILE"
  sed -i "s|^REDIS_SESSION_SECRET=.*|REDIS_SESSION_SECRET=$(openssl rand -hex 16)|" "$ENV_FILE"

  # APP_URL из основного домена
  local domain; domain=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d= -f2)
  if [[ -n "$domain" ]]; then
    sed -i "s|^APP_URL=.*|APP_URL=https://${domain}|" "$ENV_FILE"
    sed -i "s|^YUKASSA_RETURN_URL=.*|YUKASSA_RETURN_URL=https://${domain}/dashboard/payment-success|" "$ENV_FILE"
  fi

  # DATABASE_URL и REDIS_URL с реальными паролями
  local pg_pass; pg_pass=$(grep "^POSTGRES_PASSWORD=" "$ENV_FILE" | cut -d= -f2-)
  local rd_pass; rd_pass=$(grep "^REDIS_PASSWORD=" "$ENV_FILE" | cut -d= -f2-)
  if [[ -n "$pg_pass" ]]; then
    local pg_esc; pg_esc=$(printf '%s\n' "$pg_pass" | sed 's/[[\.*^$()+?{|]/\\&/g; s|/|\\/|g')
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://hideyou:${pg_esc}@postgres:5432/hideyou|" "$ENV_FILE"
  fi
  if [[ -n "$rd_pass" ]]; then
    local rd_esc; rd_esc=$(printf '%s\n' "$rd_pass" | sed 's/[[\.*^$()+?{|]/\\&/g; s|/|\\/|g')
    sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://:${rd_esc}@redis:6379|" "$ENV_FILE"
  fi

  echo ""
  ok "Файл .env настроен"
  echo -e "  ${DIM}Токены ЮKassa, CryptoPay, SMTP — настрой позже через меню [18]${RESET}"
}

# ── Настройка токенов из CLI ───────────────────────────────────
configure_tokens() {
  step "Настройка токенов и внешних сервисов"

  if [[ ! -f "$ENV_FILE" ]]; then
    err ".env не найден. Сначала запусти [1] Полную установку или [2] Настройку окружения"
    return 1
  fi

  show_token_status() {
    local key="$1" label="$2"
    local val; val=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")
    if [[ -n "$val" ]]; then
      echo -e "  ${GREEN}●${RESET}  ${label}"
    else
      echo -e "  ${DIM}○  ${YELLOW}${label}${RESET} ${DIM}(не задан)${RESET}"
    fi
  }

  while true; do
    echo ""
    echo -e "  ${BOLD}Состояние токенов:${RESET}  ${DIM}● задан  ○ не задан${RESET}"
    echo ""
    echo -e "  ${CYAN}${BOLD}── REMNAWAVE ─────────────────────────────────${RESET}"
    show_token_status "REMNAWAVE_URL"   "REMNAWAVE URL"
    show_token_status "REMNAWAVE_TOKEN" "REMNAWAVE Token"
    echo ""
    echo -e "  ${CYAN}${BOLD}── Telegram ──────────────────────────────────${RESET}"
    show_token_status "TELEGRAM_BOT_TOKEN"       "Bot Token"
    show_token_status "TELEGRAM_LOGIN_BOT_TOKEN" "Login Bot Token (доп.)"
    show_token_status "TELEGRAM_BOT_NAME"        "Bot Username"
    echo ""
    echo -e "  ${CYAN}${BOLD}── Платёжные системы ─────────────────────────${RESET}"
    show_token_status "YUKASSA_SHOP_ID"        "ЮKassa Shop ID"
    show_token_status "YUKASSA_SECRET_KEY"     "ЮKassa Secret Key"
    show_token_status "YUKASSA_WEBHOOK_SECRET" "ЮKassa Webhook Secret"
    show_token_status "CRYPTOPAY_API_TOKEN"    "CryptoPay API Token"
    echo ""
    echo -e "  ${CYAN}${BOLD}── Email / SMTP ──────────────────────────────${RESET}"
    show_token_status "SMTP_HOST" "SMTP Host"
    show_token_status "SMTP_USER" "SMTP User"
    show_token_status "SMTP_PASS" "SMTP Password"
    echo ""
    echo -e "  ${CYAN}${BOLD}── Безопасность ──────────────────────────────${RESET}"
    show_token_status "JWT_SECRET" "JWT Secret"
    echo ""
    sep
    echo -e "  ${BOLD}Что настроить?${RESET}"
    echo ""
    echo -e "  ${CYAN}[1]${RESET}  REMNAWAVE (URL + токен)"
    echo -e "  ${CYAN}[2]${RESET}  Telegram Bot"
    echo -e "  ${CYAN}[3]${RESET}  ЮKassa"
    echo -e "  ${CYAN}[4]${RESET}  CryptoPay"
    echo -e "  ${CYAN}[5]${RESET}  Email / SMTP"
    echo -e "  ${CYAN}[6]${RESET}  JWT и секреты безопасности"
    echo -e "  ${CYAN}[7]${RESET}  Домены"
    echo -e "  ${CYAN}[0]${RESET}  Назад в главное меню"
    echo ""
    printf "  ${BOLD}Выбор:${RESET} "; read -r tok_choice

    local changed=false
    case "$tok_choice" in
      1)
        echo ""
        put_key "REMNAWAVE_URL"   "REMNAWAVE URL: "      "http://localhost:3000"
        put_key "REMNAWAVE_TOKEN" "REMNAWAVE Token: "    "" "true"
        changed=true
        ;;
      2)
        echo ""
        put_key "TELEGRAM_BOT_TOKEN"       "Bot Token (@BotFather): "       "" "true"
        put_key "TELEGRAM_LOGIN_BOT_TOKEN" "Login Bot Token (если другой): " "" "true"
        put_key "TELEGRAM_BOT_NAME"        "Bot Username (без @): "         ""
        changed=true
        ;;
      3)
        echo ""
        put_key "YUKASSA_SHOP_ID"        "ЮKassa Shop ID: "         ""
        put_key "YUKASSA_SECRET_KEY"     "ЮKassa Secret Key: "      "" "true"
        put_key "YUKASSA_WEBHOOK_SECRET" "ЮKassa Webhook Secret: "  "" "true"
        # Авто RETURN_URL если домен задан
        local yd; yd=$(grep "^DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "")
        local yr; yr=$(grep "^YUKASSA_RETURN_URL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")
        if [[ -n "$yd" && -z "$yr" ]]; then
          sed -i "s|^YUKASSA_RETURN_URL=.*|YUKASSA_RETURN_URL=https://${yd}/dashboard/payment-success|" "$ENV_FILE"
        fi
        changed=true
        ;;
      4)
        echo ""
        put_key "CRYPTOPAY_API_TOKEN" "CryptoPay API Token: "     "" "true"
        put_key "CRYPTOPAY_NETWORK"   "Сеть (mainnet/testnet): "  "mainnet"
        changed=true
        ;;
      5)
        echo ""
        put_key "SMTP_HOST" "SMTP Host: "       ""
        put_key "SMTP_PORT" "SMTP Port: "       "587"
        put_key "SMTP_USER" "SMTP User: "       ""
        put_key "SMTP_PASS" "SMTP Password: "   "" "true"
        put_key "SMTP_FROM" "From Address: "    ""
        changed=true
        ;;
      6)
        echo ""
        echo -e "  ${DIM}Пусто = сгенерировать новый${RESET}"
        local new_jwt; new_jwt="$(openssl rand -hex 32)"
        put_key "JWT_SECRET" "JWT Secret: " "$new_jwt" "true"
        ask "Регенерировать APP_SECRET и COOKIE_SECRET тоже? [д/Н]"; read -r regen
        if [[ "$regen" =~ ^[дДyY]$ ]]; then
          sed -i "s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -hex 32)|"       "$ENV_FILE"
          sed -i "s|^COOKIE_SECRET=.*|COOKIE_SECRET=$(openssl rand -hex 32)|" "$ENV_FILE"
          ok "APP_SECRET и COOKIE_SECRET обновлены"
        fi
        changed=true
        ;;
      7)
        echo ""
        put_key "DOMAIN"       "Основной домен: "          ""
        put_key "ADMIN_DOMAIN" "Домен панели администратора: " ""
        put_key "API_DOMAIN"   "Домен API: "               ""
        # Обновляем APP_URL
        local d7; d7=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d= -f2)
        [[ -n "$d7" ]] && sed -i "s|^APP_URL=.*|APP_URL=https://${d7}|" "$ENV_FILE"
        changed=true
        ;;
      0) break ;;
      *) warn "Неизвестный пункт: $tok_choice"; continue ;;
    esac

    if [[ "$changed" == "true" ]]; then
      echo ""
      ok "Настройки записаны в .env"
      ask "Перезапустить сервисы для применения? [Д/н]"; read -r rs
      if [[ ! "$rs" =~ ^[нНnN]$ ]]; then
        docker compose up -d 2>&1 | tee -a "$LOG_FILE"
        ok "Сервисы перезапущены"
      fi
    fi
  done
}

# ── SSL ───────────────────────────────────────────────────────
free_port_80() {
  if ss -tlnp 2>/dev/null | grep -q ':80 ' || lsof -i :80 2>/dev/null | grep -q LISTEN; then
    info "Порт 80 занят — освобождаю..."
    systemctl stop nginx   2>/dev/null || true
    systemctl stop apache2 2>/dev/null || true
    systemctl stop httpd   2>/dev/null || true
    docker compose stop nginx 2>/dev/null || true
    sleep 1
    if ss -tlnp 2>/dev/null | grep -q ':80 ' || lsof -i :80 2>/dev/null | grep -q LISTEN; then
      fuser -k 80/tcp 2>/dev/null || true
      sleep 1
    fi
    ok "Порт 80 освобождён"
  else
    ok "Порт 80 свободен"
  fi
}

get_ipv4() {
  curl -4 -s --max-time 5 https://api.ipify.org      2>/dev/null | grep -E '^[0-9]+\.' | head -1 || \
  curl -4 -s --max-time 5 https://ipv4.icanhazip.com 2>/dev/null | grep -E '^[0-9]+\.' | head -1 || \
  curl -4 -s --max-time 5 http://ifconfig.me         2>/dev/null | grep -E '^[0-9]+\.' | head -1 || \
  echo ""
}

check_dns() {
  local main_domain="$1"
  local admin_domain="$2"
  local api_domain="$3"
  local server_ip
  server_ip=$(get_ipv4)

  echo ""
  echo -e "  ${YELLOW}${BOLD}Проверка DNS-записей${RESET}"
  if [[ -z "$server_ip" ]]; then
    warn "Не удалось определить IPv4 сервера"
    server_ip="<IPv4 сервера>"
  else
    info "IPv4 этого сервера: ${BOLD}${server_ip}${RESET}"
  fi

  echo ""
  echo -e "  Нужны A-записи (тип A, не AAAA):"
  echo -e "  ${CYAN}${main_domain}${RESET}    →  ${server_ip}"
  echo -e "  ${CYAN}${admin_domain}${RESET}   →  ${server_ip}"
  echo -e "  ${CYAN}${api_domain}${RESET}     →  ${server_ip}"
  echo ""

  command -v dig &>/dev/null || apt-get install -y -qq dnsutils 2>/dev/null || true

  local all_ok=true
  for fqdn in "$main_domain" "$admin_domain" "$api_domain"; do
    local resolved
    resolved=$(dig +short "$fqdn" A 2>/dev/null | grep -E '^[0-9]+\.' | head -1 || \
               host -t A "$fqdn" 2>/dev/null | awk '/has address/{print $NF}' | head -1 || \
               echo "")
    if [[ -n "$resolved" ]]; then
      if [[ "$resolved" == "$server_ip" ]]; then
        ok "${fqdn} → ${resolved} ✓"
      else
        warn "${fqdn} → ${resolved} (ожидался ${server_ip})"
        all_ok=false
      fi
    else
      warn "${fqdn} — не резолвится"
      all_ok=false
    fi
  done

  echo ""
  if [[ "$all_ok" == "false" ]]; then
    echo -e "  ${YELLOW}Добавь A-записи в DNS и подожди 5-10 минут.${RESET}"
    ask "Всё равно продолжить? [д/Н]"; read -r dns_ans
    [[ "$dns_ans" =~ ^[дДyY]$ ]] || return 1
  fi
  return 0
}

setup_ssl() {
  step "SSL-сертификаты (Let's Encrypt)"

  local main_domain;  main_domain=$(grep  "^DOMAIN="       "$ENV_FILE" | cut -d= -f2)
  local admin_domain; admin_domain=$(grep "^ADMIN_DOMAIN=" "$ENV_FILE" | cut -d= -f2)
  local api_domain;   api_domain=$(grep   "^API_DOMAIN="   "$ENV_FILE" | cut -d= -f2)

  if [[ -z "$main_domain" ]]; then
    warn "DOMAIN не задан в .env. Задай домены через [2] или [18]→[7]"
    return
  fi
  if [[ -z "$admin_domain" || -z "$api_domain" ]]; then
    warn "ADMIN_DOMAIN или API_DOMAIN не заданы в .env"
    ask "Продолжить используя только ${main_domain}? [д/Н]"; read -r only_main
    [[ "$only_main" =~ ^[дДyY]$ ]] || return
    admin_domain="$main_domain"
    api_domain="$main_domain"
  fi

  command -v certbot &>/dev/null || {
    info "Устанавливаю certbot..."
    detect_os
    case "$OS_NAME" in
      ubuntu|debian) apt-get install -y -qq certbot ;;
      *) dnf install -y -q certbot 2>/dev/null || yum install -y -q certbot ;;
    esac
  }

  check_dns "$main_domain" "$admin_domain" "$api_domain" || return

  ask "Выпустить сертификат Let's Encrypt? [д/Н]"
  read -r ans
  [[ "$ans" =~ ^[дДyY]$ ]] || { info "Пропускаю SSL — настрой позже через пункт [3]"; return; }

  printf "  ${CYAN}%-42s${RESET}" "Email для Let's Encrypt: "; read -r email

  free_port_80

  # Уникальные домены для certbot
  local -a cert_domains=("$main_domain")
  [[ "$admin_domain" != "$main_domain" ]] && cert_domains+=("$admin_domain")
  [[ "$api_domain" != "$main_domain" && "$api_domain" != "$admin_domain" ]] && cert_domains+=("$api_domain")

  local certbot_d_args=""
  for d in "${cert_domains[@]}"; do
    certbot_d_args="$certbot_d_args -d $d"
  done

  info "Выпускаю сертификат для: ${cert_domains[*]}..."
  # shellcheck disable=SC2086
  certbot certonly --standalone \
    $certbot_d_args \
    --cert-name "$main_domain" \
    --email "$email" --agree-tos --non-interactive 2>&1 | tee -a "$LOG_FILE"

  if [[ ${PIPESTATUS[0]} -eq 0 ]]; then
    ok "SSL-сертификат выпущен для: ${cert_domains[*]}"
    apply_nginx_conf
    docker compose restart nginx 2>/dev/null || true
  else
    warn "Не удалось выпустить сертификат для всех доменов."
    ask "Выпустить только для ${main_domain}? [д/Н]"; read -r ans2
    if [[ "$ans2" =~ ^[дДyY]$ ]]; then
      free_port_80
      certbot certonly --standalone -d "$main_domain" \
        --cert-name "$main_domain" \
        --email "$email" --agree-tos --non-interactive 2>&1 | tee -a "$LOG_FILE"
      ok "SSL выпущен для ${main_domain}"
      apply_nginx_conf
      docker compose restart nginx 2>/dev/null || true
      warn "Добавь DNS для ${admin_domain} и ${api_domain}, затем повтори пункт [3]"
    fi
  fi
}

# ── Контейнеры ────────────────────────────────────────────────
pull_images()    { step "Скачивание образов";  docker compose pull 2>&1 | tee -a "$LOG_FILE"; ok "Готово"; }
build_services() {
  step "Сборка сервисов"
  docker compose build --no-cache 2>&1 | tee -a "$LOG_FILE"
  ok "Собрано"
  # После пересборки контейнеры получают новые IP — nginx кешировал старые.
  # Перезапускаем nginx чтобы он переразрешил имена через Docker DNS.
  if docker compose ps nginx 2>/dev/null | grep -q "Up\|running"; then
    info "Перезапускаю nginx (обновляю DNS-кеш после пересборки)..."
    docker compose restart nginx 2>&1 | tee -a "$LOG_FILE"
    ok "nginx перезапущен"
  fi
}

# ── Генерация nginx.conf из шаблона ──────────────────────────
# Если SSL-сертификат существует — SSL-конфиг.
# Если нет — HTTP-only конфиг (работает до получения сертификата).
apply_nginx_conf() {
  if [[ ! -f "$ENV_FILE" ]]; then return; fi

  local main_domain;  main_domain=$(grep  "^DOMAIN="       "$ENV_FILE" | cut -d= -f2)
  local admin_domain; admin_domain=$(grep "^ADMIN_DOMAIN=" "$ENV_FILE" | cut -d= -f2)
  local api_domain;   api_domain=$(grep   "^API_DOMAIN="   "$ENV_FILE" | cut -d= -f2)

  if [[ -z "$main_domain" ]]; then
    warn "DOMAIN не задан — nginx.conf не обновлён"
    return
  fi

  [[ -z "$admin_domain" ]] && admin_domain="$main_domain"
  [[ -z "$api_domain"   ]] && api_domain="$main_domain"

  local cert_path="/etc/letsencrypt/live/${main_domain}/fullchain.pem"

  if [[ -f "$cert_path" ]]; then
    if [[ ! -f "nginx/nginx.conf.template" ]]; then
      warn "nginx/nginx.conf.template не найден"
      return
    fi
    cp "nginx/nginx.conf.template" "nginx/nginx.conf"
    sed -i "s|MAIN_DOMAIN|${main_domain}|g"   "nginx/nginx.conf"
    sed -i "s|ADMIN_DOMAIN|${admin_domain}|g" "nginx/nginx.conf"
    sed -i "s|API_DOMAIN|${api_domain}|g"     "nginx/nginx.conf"
    sed -i "s|CERT_DOMAIN|${main_domain}|g"   "nginx/nginx.conf"
    ok "nginx.conf: SSL-режим (${main_domain}, ${admin_domain}, ${api_domain})"
  else
    if [[ -f "nginx/nginx.conf.nossl" ]]; then
      cp "nginx/nginx.conf.nossl" "nginx/nginx.conf"
      ok "nginx.conf: HTTP-only режим (SSL не настроен — запусти пункт [3])"
    else
      warn "nginx/nginx.conf.nossl не найден"
    fi
  fi
}

start_all() {
  step "Запуск сервисов"
  apply_nginx_conf
  local bot_flag=""
  local feat_bot; feat_bot=$(grep "^FEATURE_BOT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2)
  if [[ "$feat_bot" == "false" ]]; then
    bot_flag="--scale bot=0"
  fi
  docker compose up -d $bot_flag 2>&1 | tee -a "$LOG_FILE"
  ok "Запущено"
}
stop_all()       { step "Остановка сервисов";   docker compose down 2>&1 | tee -a "$LOG_FILE"; ok "Остановлено"; }

# ── Дозалить шаблоны конструктора бота / воронок ─────────────
# Safe to call anytime — the SQL uses ON CONFLICT (id) DO NOTHING so existing
# rows are kept untouched and only missing templates get added.
reseed_bot_templates() {
  step "Дозагрузка шаблонов бота и воронок"

  if ! docker compose ps backend 2>/dev/null | grep -q "Up\|running"; then
    info "Запускаю backend (нужен для seed-файла)..."
    docker compose up -d backend 2>&1 | tee -a "$LOG_FILE"
    sleep 5
  fi

  local tmp=/tmp/hideyou-bot-templates-$$.sql
  info "Копирую SQL из образа backend..."
  if ! docker compose cp backend:/app/dist/services/seed-data/bot-templates-raw.sql "$tmp" 2>&1 | tee -a "$LOG_FILE"; then
    err "Не нашёл seed-файл в образе. Вероятно установлена старая версия (< v5.9.3)."
    ask "Попробовать скачать из GitHub (ветка main)? [д/Н]"; read -r a
    if [[ "$a" =~ ^[дДyY]$ ]]; then
      curl -sfL "https://raw.githubusercontent.com/ChernOvOne/PRO/main/backend/src/services/seed-data/bot-templates-raw.sql" -o "$tmp" \
        || { err "Не удалось скачать. Проверь интернет."; return 1; }
    else
      return 1
    fi
  fi

  info "Применяю к базе данных..."
  if cat "$tmp" | docker compose exec -T postgres psql -U hideyou -d hideyou 2>&1 | tee -a "$LOG_FILE"; then
    ok "Шаблоны дозалиты"
  else
    err "Ошибки при применении SQL (подробности в логе)"
  fi

  rm -f "$tmp"

  # Report the result
  info "Текущее состояние:"
  docker compose exec -T postgres psql -U hideyou -d hideyou -c "
    SELECT 'bot_block_groups' AS table_name, COUNT(*) FROM bot_block_groups
    UNION ALL SELECT 'bot_blocks', COUNT(*) FROM bot_blocks
    UNION ALL SELECT 'bot_buttons', COUNT(*) FROM bot_buttons
    UNION ALL SELECT 'bot_triggers', COUNT(*) FROM bot_triggers
    UNION ALL SELECT 'funnels', COUNT(*) FROM funnels
    UNION ALL SELECT 'funnel_nodes', COUNT(*) FROM funnel_nodes;" 2>&1 | tee -a "$LOG_FILE"
}

# ── Миграции БД ───────────────────────────────────────────────
# ИСПРАВЛЕНО:
#  1. Prisma теперь перенесён в dependencies (не devDependencies) — доступен в проде
#  2. Используем `docker compose run --rm --no-deps` — не требует работающего backend
#  3. Ждём postgres через healthcheck
run_migrations() {
  step "Миграции БД"

  # Запускаем postgres если не запущен
  if ! docker compose ps postgres 2>/dev/null | grep -q "Up\|running"; then
    info "Запускаю PostgreSQL..."
    docker compose up -d postgres 2>&1 | tee -a "$LOG_FILE"
  fi

  info "Жду готовности PostgreSQL..."
  local n=40
  until docker compose exec -T postgres pg_isready -U hideyou -d hideyou &>/dev/null; do
    sleep 3; n=$((n-1))
    [[ $n -le 0 ]] && { err "PostgreSQL не запустился. Проверь: docker compose logs postgres"; return 1; }
    printf "."
  done
  echo ""
  ok "PostgreSQL готов"

  info "Синхронизирую схему БД (Prisma)..."
  local db_url
  db_url=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d= -f2-)

  # Используем prisma db push — синхронизирует всю схему (включая Buh* таблицы
  # бухгалтерии) одним шагом, идемпотентно. Работает на чистой БД и при обновлении.
  docker compose run --rm --no-deps \
    -e DATABASE_URL="$db_url" \
    backend \
    npx prisma db push --skip-generate --accept-data-loss 2>&1 | tee -a "$LOG_FILE"

  local exit_code=${PIPESTATUS[0]}
  if [[ $exit_code -ne 0 ]]; then
    warn "run --rm завершился с кодом $exit_code. Пробую exec если backend уже запущен..."
    docker compose exec -T backend npx prisma db push --skip-generate --accept-data-loss 2>&1 | tee -a "$LOG_FILE" || {
      err "Синхронизация схемы не прошла. Проверь логи: docker compose logs backend"
      return 1
    }
  fi

  ok "Схема БД синхронизирована"
}

seed_db() {
  step "Начальные данные"
  docker compose exec -T backend node dist/scripts/seed.js 2>&1 | tee -a "$LOG_FILE"
  ok "База заполнена"
}

show_status() {
  step "Статус сервисов"
  docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
    $(docker compose ps -q 2>/dev/null) 2>/dev/null || true
}

show_logs() {
  echo ""
  echo -e "  Сервисы: ${CYAN}backend frontend nginx postgres redis bot все${RESET}"
  printf "  Чьи логи? [все] "; read -r svc; svc="${svc:-все}"
  echo ""
  if [[ "$svc" == "все" || "$svc" == "all" ]]; then
    docker compose logs --tail=100 -f
  else
    docker compose logs --tail=200 -f "$svc"
  fi
}

restart_svc() {
  echo ""
  echo -e "  Сервисы: ${CYAN}backend frontend nginx postgres redis bot${RESET}"
  printf "  Какой перезапустить? "; read -r svc
  docker compose restart "$svc" 2>&1 | tee -a "$LOG_FILE"
  ok "Сервис $svc перезапущен"
}

# ── Обновление ────────────────────────────────────────────────
do_update() {
  step "Обновление HIDEYOU"

  # Migrate old servers from the deprecated "LKHY" remote to the canonical "PRO"
  local current_origin
  current_origin=$(git remote get-url origin 2>/dev/null || echo "")
  if [[ "$current_origin" == *"/LKHY"* ]] || [[ "$current_origin" == *"/LKHY.git" ]]; then
    info "Обновляю remote: $current_origin → $HIDEYOU_REPO_URL"
    git remote set-url origin "$HIDEYOU_REPO_URL" 2>&1 | tee -a "$LOG_FILE" || true
  fi

  info "Получаю информацию из git..."
  git fetch --all --tags --prune --prune-tags 2>&1 | tee -a "$LOG_FILE"

  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  local current_commit
  current_commit=$(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)

  echo ""
  info "Текущая ветка: ${BOLD}${current_branch}${RESET}"
  info "Текущая версия: ${BOLD}${current_commit}${RESET}"
  echo ""

  local tags=()
  while IFS= read -r tag; do
    [[ -n "$tag" ]] && tags+=("$tag")
  done < <(git tag --sort=-version:refname 2>/dev/null | head -20)

  local branches=()
  while IFS= read -r br; do
    br="${br#origin/}"
    [[ -n "$br" && "$br" != "HEAD" ]] && branches+=("$br")
  done < <(git branch -r --format='%(refname:short)' 2>/dev/null | head -10)

  echo -e "  ${BOLD}Выберите версию для обновления:${RESET}"
  echo ""
  echo -e "  ${CYAN}[1]${RESET} Последняя версия ветки ${BOLD}${current_branch}${RESET} (по умолчанию)"

  local idx=2
  declare -A choices

  if [[ ${#tags[@]} -gt 0 ]]; then
    echo ""
    echo -e "  ${CYAN}${BOLD}── Релизы (теги) ─────────────────${RESET}"
    for tag in "${tags[@]}"; do
      echo -e "  ${CYAN}[$idx]${RESET} $tag"
      choices[$idx]="tag:$tag"
      idx=$((idx + 1))
      [[ $idx -gt 11 ]] && break
    done
  fi

  if [[ ${#branches[@]} -gt 1 ]]; then
    echo ""
    echo -e "  ${CYAN}${BOLD}── Ветки ─────────────────────────${RESET}"
    for br in "${branches[@]}"; do
      [[ "$br" == "$current_branch" ]] && continue
      echo -e "  ${CYAN}[$idx]${RESET} ветка: $br"
      choices[$idx]="branch:$br"
      idx=$((idx + 1))
      [[ $idx -gt 16 ]] && break
    done
  fi

  echo ""
  printf "  ${BOLD}Выбери [1]:${RESET} "
  read -r ver_choice
  ver_choice="${ver_choice:-1}"

  local target_ref="" target_desc=""

  if [[ "$ver_choice" == "1" ]]; then
    target_ref="origin/${current_branch}"
    target_desc="последняя версия ветки ${current_branch}"
  elif [[ -n "${choices[$ver_choice]:-}" ]]; then
    local choice="${choices[$ver_choice]}"
    local type="${choice%%:*}"
    local value="${choice#*:}"
    if [[ "$type" == "tag" ]]; then
      target_ref="$value"
      target_desc="релиз $value"
    else
      target_ref="origin/$value"
      target_desc="ветка $value"
      git checkout "$value" 2>/dev/null || git checkout -b "$value" "origin/$value" 2>/dev/null
    fi
  else
    warn "Неизвестный выбор — использую последнюю версию"
    target_ref="origin/${current_branch}"
    target_desc="последняя версия ветки ${current_branch}"
  fi

  echo ""
  info "Обновляюсь до: ${BOLD}${target_desc}${RESET}"

  local before
  before=$(git rev-parse HEAD 2>/dev/null || echo "")

  local env_backup="/tmp/hideyou_env_backup_$(date +%s)"
  [[ -f "$ENV_FILE" ]] && cp "$ENV_FILE" "$env_backup" && info ".env сохранён"

  git reset --hard "$target_ref" 2>&1 | tee -a "$LOG_FILE"
  git clean -fd --exclude=".env" --exclude="backups/" --exclude="data/" 2>&1 | tee -a "$LOG_FILE"

  if [[ -f "$env_backup" ]]; then
    cp "$env_backup" "$ENV_FILE"
    rm -f "$env_backup"
    ok ".env восстановлен"
  fi

  local after
  after=$(git rev-parse HEAD 2>/dev/null || echo "")

  local script_changed=false
  if [[ -n "$before" && "$before" != "$after" ]]; then
    git diff --name-only "$before" "$after" 2>/dev/null | grep -q "install.sh" && script_changed=true
  fi

  info "Пересобираю Docker-образы..."
  docker compose build 2>&1 | tee -a "$LOG_FILE"

  info "Применяю миграции..."
  run_migrations

  info "Перезапускаю сервисы..."
  apply_nginx_conf
  docker compose up -d 2>&1 | tee -a "$LOG_FILE"
  # Перезапускаем nginx чтобы сбросить DNS-кеш после смены IP контейнеров
  sleep 3
  docker compose restart nginx 2>&1 | tee -a "$LOG_FILE"

  install_lk_command 2>/dev/null || true

  ok "Обновлено до $(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)"

  if [[ "$script_changed" == "true" ]]; then
    echo ""
    warn "Скрипт install.sh обновлён — перезапускаю с новой версией..."
    sleep 2
    exec bash "$(realpath "$0")"
  fi
}

# ── Резервное копирование ─────────────────────────────────────
do_backup() {
  step "Резервная копия"
  mkdir -p ./backups
  local f="./backups/hideyou_$(date '+%Y%m%d_%H%M%S').sql.gz"
  docker compose exec -T postgres pg_dump -U hideyou hideyou 2>/dev/null | gzip > "$f"
  ok "Сохранено: $f  ($(du -sh "$f" | cut -f1))"
}

do_restore() {
  step "Восстановление базы"
  [[ -z "$(ls ./backups/*.sql.gz 2>/dev/null)" ]] && { warn "Резервных копий нет"; return; }
  echo ""; local i=1; declare -a files
  while IFS= read -r f; do
    echo -e "  ${CYAN}[$i]${RESET} $(basename "$f")  $(du -sh "$f" | cut -f1)"
    files[$i]="$f"; i=$((i+1))
  done < <(ls -t ./backups/*.sql.gz)
  printf "\n  Выбери [1]: "; read -r c; c="${c:-1}"
  local sel="${files[$c]:-}"; [[ -z "$sel" ]] && { err "Неверный выбор"; return; }
  warn "Это ПЕРЕЗАПИШЕТ базу!"; ask "Точно? [д/Н]"; read -r ans
  [[ "$ans" =~ ^[дДyY]$ ]] || return
  gunzip -c "$sel" | docker compose exec -T postgres psql -U hideyou -d hideyou 2>&1 | tee -a "$LOG_FILE"
  ok "База восстановлена"
}

# ── Администратор ─────────────────────────────────────────────
# ИСПРАВЛЕНО:
#  1. Проверяем JWT_SECRET перед стартом (без него backend не запустится)
#  2. Ждём healthcheck backend-а перед созданием
#  3. Запускаем миграции если ещё не применены
create_admin() {
  step "Создание администратора"

  # JWT_SECRET обязателен (min 32 символа), без него backend падает сразу
  local jwt
  jwt=$(grep "^JWT_SECRET=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")
  if [[ ${#jwt} -lt 32 ]]; then
    warn "JWT_SECRET не задан или короче 32 символов — генерирую новый..."
    local new_jwt; new_jwt="$(openssl rand -hex 32)"
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${new_jwt}|" "$ENV_FILE"
    ok "JWT_SECRET обновлён в .env"
  fi

  # Убеждаемся что БД и миграции готовы
  if ! docker compose ps postgres 2>/dev/null | grep -q "Up\|running"; then
    info "Запускаю PostgreSQL и Redis..."
    docker compose up -d postgres redis 2>&1 | tee -a "$LOG_FILE"
    sleep 5
    run_migrations
  fi

  # Запускаем backend если не запущен
  if ! docker compose ps backend 2>/dev/null | grep -q "Up\|running"; then
    info "Запускаю backend..."
    docker compose up -d backend 2>&1 | tee -a "$LOG_FILE"
  fi

  info "Жду готовности backend (health check)..."
  local n=40
  until docker compose exec -T backend curl -sf http://localhost:4000/health &>/dev/null; do
    sleep 3; n=$((n-1))
    if [[ $n -le 0 ]]; then
      err "Backend не отвечает. Проверь: docker compose logs backend"
      ask "Попробовать создать администратора всё равно? [д/Н]"; read -r force
      [[ "$force" =~ ^[дДyY]$ ]] || return 1
      break
    fi
    printf "."
  done
  echo ""

  printf "  ${CYAN}Email: ${RESET}";  read -r admin_email
  printf "  ${CYAN}Пароль: ${RESET}"; read -rs admin_pwd; echo ""

  if [[ -z "$admin_email" || -z "$admin_pwd" ]]; then
    err "Email и пароль обязательны"
    return 1
  fi

  docker compose exec -T backend node dist/scripts/create-admin.js \
    --email "$admin_email" --password "$admin_pwd" 2>&1 | tee -a "$LOG_FILE"

  if [[ ${PIPESTATUS[0]} -eq 0 ]]; then
    ok "Администратор создан: $admin_email"
  else
    err "Не удалось создать администратора. Проверь: docker compose logs backend"
    return 1
  fi
}

import_users() {
  step "Импорт пользователей"
  info "Файл: ./data/import.csv или ./data/import.json"
  info "Формат CSV: email,telegram_id"
  ask "Запустить? [д/Н]"; read -r ans
  [[ "$ans" =~ ^[дДyY]$ ]] || return
  [[ ! -f "./data/import.csv" && ! -f "./data/import.json" ]] && { err "Файл не найден"; return; }
  docker compose exec -T backend node dist/scripts/import-users.js 2>&1 | tee -a "$LOG_FILE"
  ok "Импорт завершён"
}

full_reset() {
  step "Полный сброс"
  warn "Удалит ВСЕ данные!"
  echo -e "  ${RED}Введи СБРОС для подтверждения:${RESET} "; read -r c
  [[ "$c" == "СБРОС" || "$c" == "RESET" ]] || { info "Отменено"; return; }
  docker compose down -v --remove-orphans 2>&1 | tee -a "$LOG_FILE"
  ok "Всё удалено"
}

# ── Команда lk ────────────────────────────────────────────────
install_lk_command() {
  local project_dir
  project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cat > /usr/local/bin/lk << LKEOF
#!/bin/bash
cd "${project_dir}" && bash install.sh "\$@"
LKEOF
  chmod +x /usr/local/bin/lk
  ok "Команда lk установлена (доступна из любой папки)"
}

# ── Полная установка ──────────────────────────────────────────
full_install() {
  banner
  step "Полная установка HIDEYOU"
  info "Лог: $LOG_FILE"; echo ""
  [[ $EUID -ne 0 ]] && warn "Запущено не от root — некоторые шаги могут не работать"

  step "Проверка зависимостей"
  check_docker || {
    ask "Docker не найден. Установить? [Д/н]"; read -r ans
    [[ "$ans" =~ ^[нНnN]$ ]] && { err "Docker обязателен"; exit 1; }
    install_docker
  }
  check_compose || { err "Docker Compose не найден"; exit 1; }
  check_git || {
    ask "Git не найден. Установить? [Д/н]"; read -r ans
    [[ ! "$ans" =~ ^[нНnN]$ ]] && { detect_os; apt-get install -y -qq git 2>/dev/null || true; }
  }

  # Установка московского часового пояса
  step "Настройка часового пояса"
  if timedatectl show 2>/dev/null | grep -q "Timezone=Europe/Moscow"; then
    ok "Часовой пояс уже Europe/Moscow"
  else
    timedatectl set-timezone Europe/Moscow 2>/dev/null && ok "Часовой пояс установлен: Europe/Moscow (MSK)" || warn "Не удалось установить часовой пояс автоматически"
  fi

  setup_env
  setup_ssl
  pull_images
  build_services

  # БД первой — затем миграции — затем всё остальное
  step "Запуск базы данных"
  docker compose up -d postgres redis 2>&1 | tee -a "$LOG_FILE"
  sleep 8

  run_migrations

  step "Запуск всех сервисов"
  apply_nginx_conf
  local bot_flag=""
  local feat_bot; feat_bot=$(grep "^FEATURE_BOT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2)
  if [[ "$feat_bot" == "false" ]]; then
    bot_flag="--scale bot=0"
  fi
  docker compose up -d $bot_flag 2>&1 | tee -a "$LOG_FILE"
  sleep 10

  install_lk_command

  echo ""; sep; ok "HIDEYOU успешно установлен!"; sep; echo ""

  local domain;       domain=$(grep "^DOMAIN="       "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "IP-сервера")
  local admin_domain; admin_domain=$(grep "^ADMIN_DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "")
  local api_domain;   api_domain=$(grep   "^API_DOMAIN="   "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "")

  echo -e "  ${BOLD}Адреса:${RESET}"
  echo -e "  ${GREEN}Лендинг / Кабинет:${RESET}  https://${domain}"
  [[ -n "$admin_domain" ]] && echo -e "  ${GREEN}Админ-панель:${RESET}       https://${admin_domain}"
  [[ -n "$api_domain"   ]] && echo -e "  ${GREEN}API:${RESET}                https://${api_domain}"
  echo ""
  echo -e "  ${GREEN}${BOLD}Управление:${RESET}  ${BOLD}lk${RESET}  (из любой папки)"
  echo ""

  # Проверка наличия важных токенов
  local remna_token; remna_token=$(grep "^REMNAWAVE_TOKEN=" "$ENV_FILE" | cut -d= -f2-)
  local tg_token;    tg_token=$(grep "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" | cut -d= -f2-)
  if [[ -z "$remna_token" || -z "$tg_token" ]]; then
    warn "Некоторые токены не заданы — сервис запущен, но часть функций недоступна."
    info "Заполни токены через меню [18] после создания администратора."
    echo ""
  fi

  ask "Создать администратора прямо сейчас? [Д/н]"; read -r ans
  [[ ! "$ans" =~ ^[нНnN]$ ]] && create_admin
}

# ── Включить/выключить Telegram-бот ──────────────────────────
toggle_bot() {
  step "Telegram-бот"
  if [[ ! -f "$ENV_FILE" ]]; then
    err ".env не найден"; return 1
  fi
  local cur; cur=$(grep "^FEATURE_BOT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2)
  if [[ "$cur" == "false" ]]; then
    info "Telegram-бот сейчас: ${RED}выключен${RESET}"
    ask "Включить? [Д/н]"; read -r ans
    if [[ ! "$ans" =~ ^[нНnN]$ ]]; then
      sed -i "s|^FEATURE_BOT=.*|FEATURE_BOT=true|" "$ENV_FILE"
      if ! grep -q "^FEATURE_BOT=" "$ENV_FILE"; then
        echo "FEATURE_BOT=true" >> "$ENV_FILE"
      fi
      ok "Telegram-бот включён"
      docker compose up -d 2>&1 | tee -a "$LOG_FILE"
      ok "Сервисы перезапущены"
    fi
  else
    info "Telegram-бот сейчас: ${GREEN}включён${RESET}"
    ask "Выключить? [д/Н]"; read -r ans
    if [[ "$ans" =~ ^[дДyY]$ ]]; then
      sed -i "s|^FEATURE_BOT=.*|FEATURE_BOT=false|" "$ENV_FILE"
      if ! grep -q "^FEATURE_BOT=" "$ENV_FILE"; then
        echo "FEATURE_BOT=false" >> "$ENV_FILE"
      fi
      ok "Telegram-бот выключен"
      docker compose up -d --scale bot=0 2>&1 | tee -a "$LOG_FILE"
      ok "Сервисы перезапущены"
    fi
  fi
}

# ── Главное меню ──────────────────────────────────────────────
main_menu() {
  if [[ ! -f "/usr/local/bin/lk" ]] && [[ $EUID -eq 0 ]]; then
    install_lk_command 2>/dev/null || true
  fi
  while true; do
    banner
    echo -e "  ${BOLD}Главное меню${RESET}\n"
    echo -e "  ${CYAN}${BOLD}── Установка ─────────────────────────${RESET}"
    echo -e "  ${BOLD}[1]${RESET}  Полная установка (с нуля)"
    echo -e "  ${BOLD}[2]${RESET}  Настроить .env (домены, пароли)"
    echo -e "  ${BOLD}[3]${RESET}  Настроить SSL"
    echo ""
    echo -e "  ${CYAN}${BOLD}── Управление сервисами ──────────────${RESET}"
    echo -e "  ${BOLD}[4]${RESET}  Запустить"
    echo -e "  ${BOLD}[5]${RESET}  Остановить"
    echo -e "  ${BOLD}[6]${RESET}  Перезапустить сервис"
    echo -e "  ${BOLD}[7]${RESET}  Статус"
    echo -e "  ${BOLD}[8]${RESET}  Логи"
    echo ""
    echo -e "  ${CYAN}${BOLD}── Данные ────────────────────────────${RESET}"
    echo -e "  ${BOLD}[9]${RESET}  Создать администратора"
    echo -e "  ${BOLD}[10]${RESET} Импортировать пользователей"
    echo -e "  ${BOLD}[11]${RESET} Миграции БД"
    echo -e "  ${BOLD}[12]${RESET} Резервная копия"
    echo -e "  ${BOLD}[13]${RESET} Восстановить БД"
    echo -e "  ${BOLD}[20]${RESET} Дозалить шаблоны бота/воронок ${DIM}(если конструктор пуст)${RESET}"
    echo ""
    echo -e "  ${CYAN}${BOLD}── Токены / Интеграции ───────────────${RESET}"
    echo -e "  ${BOLD}[18]${RESET} ${GREEN}Настроить токены${RESET} ${DIM}(REMNAWAVE, Telegram, ЮKassa, CryptoPay, SMTP...)${RESET}"
    echo -e "  ${BOLD}[19]${RESET} Включить/выключить Telegram-бот"
    echo ""
    echo -e "  ${CYAN}${BOLD}── Обслуживание ──────────────────────${RESET}"
    echo -e "  ${BOLD}[14]${RESET} Обновить HIDEYOU"
    echo -e "  ${BOLD}[15]${RESET} Пересобрать образы"
    echo -e "  ${BOLD}[16]${RESET} Полный сброс ${RED}(⚠ удаляет всё)${RESET}"
    echo -e "  ${BOLD}[17]${RESET} Переустановить команду lk"
    echo -e "  ${BOLD}[0]${RESET}  Выход"
    echo ""; sep
    printf "  ${BOLD}Выбери пункт:${RESET} "
    read -r choice
    case "$choice" in
      1)  full_install ;;
      2)  setup_env ;;
      3)  setup_ssl ;;
      4)  start_all ;;
      5)  stop_all ;;
      6)  restart_svc ;;
      7)  show_status ;;
      8)  show_logs ;;
      9)  create_admin ;;
      10) import_users ;;
      11) run_migrations ;;
      12) do_backup ;;
      13) do_restore ;;
      14) do_update ;;
      15) build_services ;;
      16) full_reset ;;
      17) install_lk_command ;;
      18) configure_tokens ;;
      19) toggle_bot ;;
      20) reseed_bot_templates ;;
      0)  echo ""; info "До свидания!"; echo ""; exit 0 ;;
      *)  warn "Неизвестный пункт: $choice" ;;
    esac
    echo ""; printf "  ${DIM}Нажми Enter для возврата...${RESET}"; read -r
  done
}

# ── Точка входа ───────────────────────────────────────────────
case "${1:-menu}" in
  install|установить)   full_install ;;
  update|обновить)      do_update ;;
  start|запустить)      start_all ;;
  stop|остановить)      stop_all ;;
  status|статус)        show_status ;;
  logs|логи)            show_logs ;;
  backup|резерв)        do_backup ;;
  migrate|миграции)     run_migrations ;;
  tokens|токены)        configure_tokens ;;
  reset|сброс)          full_reset ;;
  menu|меню|"")         main_menu ;;
  *)
    echo "Использование: $0 [install|update|start|stop|status|logs|backup|migrate|tokens|reset]"
    exit 1 ;;
esac
