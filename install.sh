#!/bin/bash
# ============================================================
#  HIDEYOU — Скрипт установки и управления
#  https://github.com/ChernOvOne/LKHY
# ============================================================

set -euo pipefail

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
create_env_template() {
  cat > "$ENV_FILE" << 'ENVEOF'
NODE_ENV=production
DOMAIN=
APP_URL=
APP_SECRET=
JWT_SECRET=
JWT_EXPIRES_IN=30d
COOKIE_SECRET=
REMNAWAVE_URL=http://localhost:3000
REMNAWAVE_TOKEN=
POSTGRES_PASSWORD=
DATABASE_URL=postgresql://hideyou:POSTGRES_PASSWORD@postgres:5432/hideyou
REDIS_PASSWORD=
REDIS_SESSION_SECRET=
REDIS_URL=redis://:REDIS_PASSWORD@redis:6379
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_NAME=HideYouBot
TELEGRAM_LOGIN_BOT_TOKEN=
YUKASSA_SHOP_ID=
YUKASSA_SECRET_KEY=
YUKASSA_RETURN_URL=
YUKASSA_WEBHOOK_SECRET=
CRYPTOPAY_API_TOKEN=
CRYPTOPAY_NETWORK=mainnet
REFERRAL_BONUS_DAYS=30
REFERRAL_MIN_DAYS=30
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
FEATURE_CRYPTO_PAYMENTS=true
FEATURE_REFERRAL=true
FEATURE_EMAIL_AUTH=true
FEATURE_TELEGRAM_AUTH=true
FEATURE_TRIAL=false
TRIAL_DAYS=3
LOG_LEVEL=info
ENVEOF
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
  echo -e "  ${BOLD}Заполни настройки${RESET} (Enter — оставить по умолчанию):"
  echo ""
  put() {
    local key="$1" prompt="$2" default="$3" secret="${4:-false}"
    local cur; cur=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "$default")
    printf "  ${CYAN}%-42s${RESET}" "$prompt"
    if [[ "$secret" == "true" ]]; then read -rs v; echo ""; else read -r v; fi
    v="${v:-$cur}"
    local esc; esc=$(printf '%s\n' "$v" | sed 's/[[\.*^$()+?{|]/\\&/g')
    sed -i "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE"
  }
  put "DOMAIN"              "Домен (например hideyou.app): "      ""
  put "REMNAWAVE_URL"       "URL панели REMNAWAVE: "               "http://localhost:3000"
  put "REMNAWAVE_TOKEN"     "Токен API REMNAWAVE: "                "" "true"
  put "POSTGRES_PASSWORD"   "Пароль PostgreSQL: "                  "$(openssl rand -hex 16)" "true"
  put "REDIS_PASSWORD"      "Пароль Redis: "                       "$(openssl rand -hex 16)" "true"
  put "JWT_SECRET"          "JWT секрет (пусто = авто): "          "$(openssl rand -hex 32)" "true"
  put "YUKASSA_SHOP_ID"     "ID магазина ЮKassa: "                 ""
  put "YUKASSA_SECRET_KEY"  "Секретный ключ ЮKassa: "              "" "true"
  put "CRYPTOPAY_API_TOKEN" "Токен CryptoPay (@CryptoBot): "       "" "true"
  put "TELEGRAM_BOT_TOKEN"  "Токен Telegram-бота (@BotFather): "   "" "true"
  put "TELEGRAM_BOT_NAME"   "Username бота (без @): "              ""
  # Auto-generate secrets
  sed -i "s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -hex 32)|" "$ENV_FILE"
  sed -i "s|^COOKIE_SECRET=.*|COOKIE_SECRET=$(openssl rand -hex 32)|" "$ENV_FILE"
  sed -i "s|^REDIS_SESSION_SECRET=.*|REDIS_SESSION_SECRET=$(openssl rand -hex 16)|" "$ENV_FILE"

  # Auto-set APP_URL from DOMAIN
  local domain; domain=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d= -f2)
  if [[ -n "$domain" ]]; then
    sed -i "s|^APP_URL=.*|APP_URL=https://${domain}|" "$ENV_FILE"
    sed -i "s|^YUKASSA_RETURN_URL=.*|YUKASSA_RETURN_URL=https://${domain}/dashboard/payment-success|" "$ENV_FILE"
  fi

  # Auto-update DATABASE_URL and REDIS_URL with actual passwords
  local pg_pass; pg_pass=$(grep "^POSTGRES_PASSWORD=" "$ENV_FILE" | cut -d= -f2-)
  local rd_pass; rd_pass=$(grep "^REDIS_PASSWORD=" "$ENV_FILE" | cut -d= -f2-)
  if [[ -n "$pg_pass" ]]; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://hideyou:${pg_pass}@postgres:5432/hideyou|" "$ENV_FILE"
  fi
  if [[ -n "$rd_pass" ]]; then
    sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://:${rd_pass}@redis:6379|" "$ENV_FILE"
  fi

  ok "Файл .env настроен"
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
  # Принудительно только IPv4
  curl -4 -s --max-time 5 https://api.ipify.org      2>/dev/null | grep -E '^[0-9]+\.' | head -1 || \
  curl -4 -s --max-time 5 https://ipv4.icanhazip.com 2>/dev/null | grep -E '^[0-9]+\.' | head -1 || \
  curl -4 -s --max-time 5 http://ifconfig.me         2>/dev/null | grep -E '^[0-9]+\.' | head -1 || \
  echo ""
}

check_dns() {
  local domain="$1"
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
  echo -e "  В DNS нужны три A-записи (тип A, не AAAA):"
  echo -e "  ${CYAN}${domain}${RESET}        →  ${server_ip}"
  echo -e "  ${CYAN}api.${domain}${RESET}    →  ${server_ip}"
  echo -e "  ${CYAN}admin.${domain}${RESET}  →  ${server_ip}"
  echo ""

  # Проверяем резолвинг
  command -v dig &>/dev/null || apt-get install -y -qq dnsutils 2>/dev/null || true

  local all_ok=true
  for sub in "" "api." "admin."; do
    local fqdn="${sub}${domain}"
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
  local domain; domain=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d= -f2)
  [[ -z "$domain" ]] && { warn "DOMAIN не задан в .env"; return; }

  command -v certbot &>/dev/null || {
    info "Устанавливаю certbot..."
    detect_os
    case "$OS_NAME" in
      ubuntu|debian) apt-get install -y -qq certbot ;;
      *) dnf install -y -q certbot 2>/dev/null || yum install -y -q certbot ;;
    esac
  }

  check_dns "$domain" || return

  ask "Выпустить сертификат Let's Encrypt для ${domain}? [д/Н]"
  read -r ans
  [[ "$ans" =~ ^[дДyY]$ ]] || { info "Пропускаю SSL — настрой позже через пункт [3]"; return; }

  printf "  ${CYAN}%-42s${RESET}" "Email для Let's Encrypt: "; read -r email

  free_port_80

  info "Выпускаю сертификат для ${domain}, api.${domain}, admin.${domain}..."
  certbot certonly --standalone \
    -d "$domain" -d "api.$domain" -d "admin.$domain" \
    --email "$email" --agree-tos --non-interactive 2>&1 | tee -a "$LOG_FILE"

  if [[ ${PIPESTATUS[0]} -eq 0 ]]; then
    sed -i "s|DOMAIN_PLACEHOLDER|${domain}|g" nginx/nginx.conf
    ok "SSL-сертификат выпущен!"
  else
    warn "Не удалось выпустить для всех поддоменов."
    ask "Выпустить только для ${domain}? [д/Н]"; read -r ans2
    if [[ "$ans2" =~ ^[дДyY]$ ]]; then
      free_port_80
      certbot certonly --standalone -d "$domain" \
        --email "$email" --agree-tos --non-interactive 2>&1 | tee -a "$LOG_FILE"
      sed -i "s|DOMAIN_PLACEHOLDER|${domain}|g" nginx/nginx.conf
      ok "SSL выпущен для ${domain}"
      warn "Добавь DNS api.${domain} и admin.${domain}, потом повтори пункт [3]"
    fi
  fi
}

# ── Контейнеры ────────────────────────────────────────────────
pull_images()    { step "Скачивание образов";  docker compose pull 2>&1 | tee -a "$LOG_FILE"; ok "Готово"; }
build_services() { step "Сборка сервисов";      docker compose build --no-cache 2>&1 | tee -a "$LOG_FILE"; ok "Собрано"; }
start_all()      { step "Запуск сервисов";      docker compose up -d 2>&1 | tee -a "$LOG_FILE"; ok "Запущено"; }
stop_all()       { step "Остановка сервисов";   docker compose down 2>&1 | tee -a "$LOG_FILE"; ok "Остановлено"; }

run_migrations() {
  step "Миграции БД"
  info "Жду PostgreSQL..."
  local n=30
  while ! docker compose exec -T postgres pg_isready -U hideyou &>/dev/null; do
    sleep 2; n=$((n-1)); [[ $n -le 0 ]] && { err "PostgreSQL не запустился"; exit 1; }; printf "."
  done; echo ""
  docker compose exec -T backend npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE"
  ok "Миграции применены"
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

  info "Получаю информацию из git..."
  git fetch --all --tags 2>&1 | tee -a "$LOG_FILE"

  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  local current_commit
  current_commit=$(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)

  echo ""
  info "Текущая ветка: ${BOLD}${current_branch}${RESET}"
  info "Текущая версия: ${BOLD}${current_commit}${RESET}"
  echo ""

  # Collect available tags
  local tags=()
  while IFS= read -r tag; do
    [[ -n "$tag" ]] && tags+=("$tag")
  done < <(git tag --sort=-version:refname 2>/dev/null | head -20)

  # Collect available branches
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

  local target_ref=""
  local target_desc=""

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
    warn "Неизвестный выбор: $ver_choice — использую последнюю версию"
    target_ref="origin/${current_branch}"
    target_desc="последняя версия ветки ${current_branch}"
  fi

  echo ""
  info "Обновляюсь до: ${BOLD}${target_desc}${RESET}"

  local before
  before=$(git rev-parse HEAD 2>/dev/null || echo "")

  # Сохраняем .env
  local env_backup="/tmp/hideyou_env_backup_$(date +%s)"
  [[ -f "$ENV_FILE" ]] && cp "$ENV_FILE" "$env_backup" && info ".env сохранён во временный файл"

  # Принудительно сбрасываем все локальные изменения и берём нужную версию
  git reset --hard "$target_ref" 2>&1 | tee -a "$LOG_FILE"
  git clean -fd --exclude=".env" --exclude="backups/" --exclude="data/" 2>&1 | tee -a "$LOG_FILE"

  # Восстанавливаем .env
  if [[ -f "$env_backup" ]]; then
    cp "$env_backup" "$ENV_FILE"
    rm -f "$env_backup"
    ok ".env восстановлен"
  fi

  local after
  after=$(git rev-parse HEAD 2>/dev/null || echo "")

  # Проверяем изменился ли install.sh
  local script_changed=false
  if [[ -n "$before" && "$before" != "$after" ]]; then
    git diff --name-only "$before" "$after" 2>/dev/null | grep -q "install.sh" && script_changed=true
  fi

  info "Пересобираю Docker-образы..."
  docker compose build 2>&1 | tee -a "$LOG_FILE"

  info "Применяю миграции..."
  docker compose up -d postgres 2>&1 | tee -a "$LOG_FILE"
  sleep 5
  docker compose exec -T backend npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE" || true

  info "Перезапускаю сервисы..."
  docker compose up -d 2>&1 | tee -a "$LOG_FILE"

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

# ── Администратор / Импорт ────────────────────────────────────
create_admin() {
  step "Создание администратора"

  # Ensure services are running
  if ! docker compose ps backend 2>/dev/null | grep -q "Up"; then
    info "Backend не запущен — запускаю..."
    docker compose up -d 2>&1 | tee -a "$LOG_FILE"
    info "Жду готовности backend..."
    local n=30
    while ! docker compose exec -T backend curl -sf http://localhost:4000/health &>/dev/null; do
      sleep 2; n=$((n-1))
      [[ $n -le 0 ]] && { err "Backend не запустился. Проверь: docker compose logs backend"; return 1; }
      printf "."
    done
    echo ""
    ok "Backend готов"
  fi

  printf "  ${CYAN}Email: ${RESET}"; read -r email
  printf "  ${CYAN}Пароль: ${RESET}"; read -rs pwd; echo ""

  if [[ -z "$email" || -z "$pwd" ]]; then
    err "Email и пароль обязательны"
    return 1
  fi

  docker compose exec -T backend node dist/scripts/create-admin.js \
    --email "$email" --password "$pwd" 2>&1 | tee -a "$LOG_FILE"
  ok "Администратор создан: $email"
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
  ok "Команда lk установлена"
}

# ── Полная установка ──────────────────────────────────────────
full_install() {
  banner
  step "Полная установка HIDEYOU"
  info "Лог: $LOG_FILE"; echo ""
  [[ $EUID -ne 0 ]] && warn "Запущено не от root"

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

  setup_env
  setup_ssl
  pull_images
  build_services
  start_all
  sleep 8
  run_migrations
  seed_db
  install_lk_command

  echo ""; sep; ok "HIDEYOU успешно установлен!"; sep; echo ""
  local domain; domain=$(grep "^DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "IP-сервера")
  echo -e "  ${BOLD}Адреса:${RESET}"
  echo -e "  ${GREEN}Лендинг:${RESET}        https://${domain}"
  echo -e "  ${GREEN}Кабинет:${RESET}        https://${domain}/dashboard"
  echo -e "  ${GREEN}Админ-панель:${RESET}   https://admin.${domain}"
  echo ""
  echo -e "  ${GREEN}${BOLD}Управление:${RESET}  ${BOLD}lk${RESET}  (из любой папки)"
  echo ""
  ask "Создать администратора прямо сейчас? [Д/н]"; read -r ans
  [[ ! "$ans" =~ ^[нНnN]$ ]] && create_admin
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
    echo -e "  ${BOLD}[2]${RESET}  Настроить .env"
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
  reset|сброс)          full_reset ;;
  menu|меню|"")         main_menu ;;
  *)
    echo "Использование: $0 [install|update|start|stop|status|logs|backup|migrate|reset]"
    exit 1 ;;
esac
