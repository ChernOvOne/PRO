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
ENV_EXAMPLE=".env.example"
LOG_FILE="./hideyou-install.log"

log()     { echo -e "${DIM}[$(date '+%H:%M:%S')]${RESET} $*" | tee -a "$LOG_FILE"; }
ok()      { echo -e "${GREEN}${BOLD}  ✓${RESET}  $*"; log "ОК: $*"; }
warn()    { echo -e "${YELLOW}${BOLD}  ⚠${RESET}  $*"; log "ВНИМАНИЕ: $*"; }
err()     { echo -e "${RED}${BOLD}  ✗${RESET}  $*"; log "ОШИБКА: $*"; }
info()    { echo -e "${CYAN}  →${RESET}  $*"; }
step()    { echo -e "\n${BLUE}${BOLD}══ $* ${RESET}"; }
ask()     { echo -e "${YELLOW}${BOLD}  ?${RESET}  $*"; }
sep()     { echo -e "  ${DIM}─────────────────────────────────────────────────${RESET}"; }

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

version_gte() { [ "$(printf '%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release; OS_NAME="$ID"; OS_VERSION="$VERSION_ID"
  else
    OS_NAME="unknown"
  fi
}

# ── Проверка зависимостей ────────────────────────────────────
check_docker() {
  if ! command -v docker &>/dev/null; then return 1; fi
  local ver; ver=$(docker version --format '{{.Server.Version}}' 2>/dev/null | sed 's/-.*//')
  ok "Docker $ver найден"; return 0
}

check_compose() {
  if docker compose version &>/dev/null 2>&1; then
    ok "Docker Compose найден"; return 0
  fi; return 1
}

check_git() {
  if command -v git &>/dev/null; then ok "Git найден"; return 0; fi; return 1
}

# ── Установка Docker ─────────────────────────────────────────
install_docker() {
  step "Установка Docker"
  detect_os
  info "Определена ОС: $OS_NAME $OS_VERSION"
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
      command -v dnf &>/dev/null && dnf install -y -q docker docker-compose-plugin \
        || yum install -y -q docker docker-compose-plugin
      ;;
    *)
      err "Неподдерживаемая ОС: $OS_NAME"
      info "Установи Docker вручную: https://docs.docker.com/engine/install/"
      exit 1 ;;
  esac
  systemctl enable docker --quiet && systemctl start docker
  [[ -n "${SUDO_USER:-}" ]] && usermod -aG docker "$SUDO_USER" \
    && info "Пользователь $SUDO_USER добавлен в группу docker"
  ok "Docker установлен"
}

# ── Настройка .env ───────────────────────────────────────────
create_env_template() {
  cat > "$ENV_FILE" << 'ENVEOF'
# HIDEYOU — Конфигурация
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
    ask "Перезаписать? [д/Н]"
    read -r ans
    [[ "$ans" =~ ^[дДyY]$ ]] || { info "Оставляю существующий .env"; return 0; }
  fi

  create_env_template
  info "Создан .env из встроенного шаблона"
  echo ""
  echo -e "  ${BOLD}Заполни настройки${RESET} (Enter — оставить значение по умолчанию):"
  echo ""

  put() {
    local key="$1" prompt="$2" default="$3" secret="${4:-false}"
    local cur; cur=$(grep "^${key}=" "$ENV_FILE" | cut -d= -f2- || echo "$default")
    printf "  ${CYAN}%-42s${RESET}" "$prompt"
    if [[ "$secret" == "true" ]]; then read -rs v; echo ""; else read -r v; fi
    v="${v:-$cur}"
    local esc; esc=$(printf '%s\n' "$v" | sed 's/[[\.*^$()+?{|]/\\&/g')
    sed -i "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE"
  }

  put "DOMAIN"              "Домен (например hideyou.app): "         ""
  put "REMNAWAVE_URL"       "URL панели REMNAWAVE: "                  "http://localhost:3000"
  put "REMNAWAVE_TOKEN"     "Токен API REMNAWAVE: "                   "" "true"
  put "POSTGRES_PASSWORD"   "Пароль PostgreSQL: "                     "$(openssl rand -hex 16)" "true"
  put "REDIS_PASSWORD"      "Пароль Redis: "                          "$(openssl rand -hex 16)" "true"
  put "JWT_SECRET"          "JWT секрет (пусто = авто): "             "$(openssl rand -hex 32)" "true"
  put "YUKASSA_SHOP_ID"     "ID магазина ЮKassa: "                    ""
  put "YUKASSA_SECRET_KEY"  "Секретный ключ ЮKassa: "                 "" "true"
  put "CRYPTOPAY_API_TOKEN" "Токен CryptoPay (@CryptoBot): "          "" "true"
  put "TELEGRAM_BOT_TOKEN"  "Токен Telegram-бота (@BotFather): "      "" "true"
  put "TELEGRAM_BOT_NAME"   "Username бота (без @): "                 ""

  sed -i "s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -hex 32)|"           "$ENV_FILE"
  sed -i "s|^REDIS_SESSION_SECRET=.*|REDIS_SESSION_SECRET=$(openssl rand -hex 16)|" "$ENV_FILE"
  ok "Файл .env настроен"
}

# ── SSL ──────────────────────────────────────────────────────
# ── Освободить порт 80 ───────────────────────────────────────
free_port_80() {
  if ss -tlnp 2>/dev/null | grep -q ':80 ' || lsof -i :80 2>/dev/null | grep -q LISTEN; then
    info "Порт 80 занят — освобождаю..."
    systemctl stop nginx   2>/dev/null || true
    systemctl stop apache2 2>/dev/null || true
    systemctl stop httpd   2>/dev/null || true
    docker compose stop nginx 2>/dev/null || true
    sleep 1
    # Принудительно если всё ещё занят
    if ss -tlnp 2>/dev/null | grep -q ':80 ' || lsof -i :80 2>/dev/null | grep -q LISTEN; then
      fuser -k 80/tcp 2>/dev/null || true
      sleep 1
    fi
    ok "Порт 80 освобождён"
  else
    ok "Порт 80 свободен"
  fi
}

# ── Проверка DNS ──────────────────────────────────────────────
check_dns() {
  local domain="$1"
  local server_ip
  # Принудительно получаем IPv4
  server_ip=$(curl -4 -s --max-time 5 ifconfig.me 2>/dev/null     || curl -4 -s --max-time 5 icanhazip.com 2>/dev/null     || curl -4 -s --max-time 5 api.ipify.org 2>/dev/null     || curl -4 -s --max-time 5 ipv4.icanhazip.com 2>/dev/null     || echo "")

  echo ""
  echo -e "  ${YELLOW}${BOLD}Проверка DNS-записей${RESET}"

  if [[ -z "$server_ip" ]]; then
    warn "Не удалось определить внешний IP сервера"
    server_ip="<IP сервера>"
  else
    info "IP этого сервера: ${BOLD}${server_ip}${RESET}"
  fi

  echo ""
  echo -e "  В DNS должны быть три A-записи:"
  echo -e "  ${CYAN}${domain}${RESET}        →  ${server_ip}"
  echo -e "  ${CYAN}api.${domain}${RESET}    →  ${server_ip}"
  echo -e "  ${CYAN}admin.${domain}${RESET}  →  ${server_ip}"
  echo ""

  # Проверяем резолвинг каждого домена
  local all_ok=true
  for subdomain in "" "api." "admin."; do
    local fqdn="${subdomain}${domain}"
    local resolved
    resolved=$(dig +short -4 "$fqdn" A 2>/dev/null | grep -E '^[0-9]+\.' | head -1       || host -t A "$fqdn" 2>/dev/null | awk '/has address/{print $NF}' | head -1       || echo "")
    if [[ -n "$resolved" ]]; then
      if [[ "$resolved" == "$server_ip" ]]; then
        ok "${fqdn} → ${resolved} ✓"
      else
        warn "${fqdn} → ${resolved} (ожидался ${server_ip})"
        all_ok=false
      fi
    else
      warn "${fqdn} — не резолвится (нет DNS-записи)"
      all_ok=false
    fi
  done

  echo ""
  if [[ "$all_ok" == "false" ]]; then
    echo -e "  ${YELLOW}Некоторые домены не настроены. Добавь A-записи и подожди 5-10 минут.${RESET}"
    ask "Всё равно продолжить? [д/Н]"
    read -r dns_ans
    [[ "$dns_ans" =~ ^[дДyY]$ ]] || return 1
  fi
  return 0
}

setup_ssl() {
  step "SSL-сертификаты (Let's Encrypt)"
  local domain; domain=$(grep "^DOMAIN=" "$ENV_FILE" | cut -d= -f2)
  [[ -z "$domain" ]] && { warn "DOMAIN не задан в .env — пропускаю"; return; }

  # Устанавливаем certbot если нет
  command -v certbot &>/dev/null || {
    info "Устанавливаю certbot..."
    detect_os
    case "$OS_NAME" in
      ubuntu|debian) apt-get install -y -qq certbot ;;
      *) dnf install -y -q certbot 2>/dev/null || yum install -y -q certbot ;;
    esac
  }

  # Устанавливаем dig для проверки DNS
  command -v dig &>/dev/null || apt-get install -y -qq dnsutils 2>/dev/null || true

  # Показываем DNS инструкцию и проверяем
  check_dns "$domain" || return

  ask "Выпустить сертификат Let's Encrypt для ${domain}? [д/Н]"
  read -r ans
  [[ "$ans" =~ ^[дДyY]$ ]] || { info "Пропускаю SSL — настрой позже через пункт [3]"; return; }

  printf "  ${CYAN}%-42s${RESET}" "Email для Let's Encrypt: "; read -r email

  # Освобождаем порт 80 ПЕРЕД запуском certbot
  free_port_80

  # Выпускаем сертификат для всех трёх доменов
  info "Выпускаю сертификат..."
  certbot certonly --standalone     -d "$domain" -d "api.$domain" -d "admin.$domain"     --email "$email" --agree-tos --non-interactive 2>&1 | tee -a "$LOG_FILE"

  if [[ ${PIPESTATUS[0]} -eq 0 ]]; then
    sed -i "s|DOMAIN_PLACEHOLDER|${domain}|g" nginx/nginx.conf
    ok "SSL-сертификат выпущен для ${domain} и поддоменов"
  else
    warn "Не удалось выпустить сертификат для всех поддоменов."
    ask "Выпустить только для ${domain} (без api и admin)? [д/Н]"
    read -r ans2
    if [[ "$ans2" =~ ^[дДyY]$ ]]; then
      free_port_80
      certbot certonly --standalone         -d "$domain"         --email "$email" --agree-tos --non-interactive 2>&1 | tee -a "$LOG_FILE"
      sed -i "s|DOMAIN_PLACEHOLDER|${domain}|g" nginx/nginx.conf
      ok "SSL выпущен для ${domain}"
      warn "Добавь DNS для api.${domain} и admin.${domain}, потом повтори пункт [3]"
    fi
  fi
}

# ── Управление контейнерами ───────────────────────────────────
pull_images()   { step "Скачивание образов";   docker compose pull 2>&1 | tee -a "$LOG_FILE"; ok "Образы скачаны"; }
build_services(){ step "Сборка сервисов";       docker compose build --no-cache 2>&1 | tee -a "$LOG_FILE"; ok "Сборка завершена"; }
start_all()     { step "Запуск сервисов";       docker compose up -d 2>&1 | tee -a "$LOG_FILE"; ok "Сервисы запущены"; }
stop_all()      { step "Остановка сервисов";    docker compose down 2>&1 | tee -a "$LOG_FILE"; ok "Сервисы остановлены"; }

run_migrations() {
  step "Миграции базы данных"
  info "Ожидаю PostgreSQL..."
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
  ok "База заполнена начальными данными"
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
  printf "  Чьи логи смотреть? [все] "; read -r svc; svc="${svc:-все}"
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

# ── Обновление ───────────────────────────────────────────────
do_update() {
  step "Обновление HIDEYOU"
  git status --porcelain 2>/dev/null | grep -q . && {
    warn "Есть несохранённые изменения"
    ask "Продолжить? .env будет сохранён. [д/Н]"; read -r ans
    [[ "$ans" =~ ^[дДyY]$ ]] || return
  }

  info "Получаю последний код..."
  local before after
  before=$(git rev-parse HEAD 2>/dev/null)
  git fetch origin && git pull origin "$(git rev-parse --abbrev-ref HEAD)" 2>&1 | tee -a "$LOG_FILE"
  after=$(git rev-parse HEAD 2>/dev/null)

  # Проверяем обновился ли install.sh
  local script_changed=false
  if [[ "$before" != "$after" ]]; then
    if git diff --name-only "$before" "$after" 2>/dev/null | grep -q "install.sh"; then
      script_changed=true
    fi
  fi

  info "Пересобираю Docker-образы..."
  docker compose build 2>&1 | tee -a "$LOG_FILE"

  info "Применяю миграции..."
  docker compose up -d postgres 2>&1 | tee -a "$LOG_FILE"; sleep 5
  docker compose exec -T backend npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE" || true

  info "Перезапускаю сервисы..."
  docker compose up -d 2>&1 | tee -a "$LOG_FILE"

  # Переустанавливаем команду lk с новым скриптом
  install_lk_command 2>/dev/null || true

  ok "Обновлено до $(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)"

  # Если install.sh изменился — перезапускаем скрипт с новой версией
  if [[ "$script_changed" == "true" ]]; then
    echo ""
    warn "Скрипт install.sh был обновлён!"
    echo -e "  ${GREEN}Перезапускаю меню с новой версией...${RESET}"
    sleep 2
    exec bash "$(realpath "$0")"
  fi
}

# ── Резервное копирование ────────────────────────────────────
do_backup() {
  step "Резервная копия"
  local ts; ts=$(date '+%Y%m%d_%H%M%S')
  mkdir -p ./backups
  local f="./backups/hideyou_${ts}.sql.gz"
  docker compose exec -T postgres pg_dump -U hideyou hideyou 2>/dev/null | gzip > "$f"
  ok "Сохранено: $f  ($(du -sh "$f" | cut -f1))"
}

do_restore() {
  step "Восстановление базы"
  [[ -z "$(ls ./backups/*.sql.gz 2>/dev/null)" ]] && { warn "Резервных копий нет в ./backups/"; return; }
  echo ""; echo -e "  ${BOLD}Доступные резервные копии:${RESET}"
  local i=1; declare -a files
  while IFS= read -r f; do
    echo -e "  ${CYAN}[$i]${RESET} $(basename "$f")  $(du -sh "$f" | cut -f1)"
    files[$i]="$f"; i=$((i+1))
  done < <(ls -t ./backups/*.sql.gz)
  printf "\n  Выбери [1]: "; read -r c; c="${c:-1}"
  local sel="${files[$c]:-}"; [[ -z "$sel" ]] && { err "Неверный выбор"; return; }
  warn "Это ПЕРЕЗАПИШЕТ текущую базу!"; ask "Точно? [д/Н]"; read -r ans
  [[ "$ans" =~ ^[дДyY]$ ]] || return
  gunzip -c "$sel" | docker compose exec -T postgres psql -U hideyou -d hideyou 2>&1 | tee -a "$LOG_FILE"
  ok "База восстановлена"
}

# ── Прочие утилиты ───────────────────────────────────────────
create_admin() {
  step "Создание администратора"
  printf "  ${CYAN}Email: ${RESET}"; read -r email
  printf "  ${CYAN}Пароль: ${RESET}"; read -rs pwd; echo ""
  docker compose exec -T backend node dist/scripts/create-admin.js \
    --email "$email" --password "$pwd" 2>&1 | tee -a "$LOG_FILE"
  ok "Администратор создан: $email"
}

import_users() {
  step "Импорт пользователей"
  info "Положи файл в ./data/import.csv или ./data/import.json"
  info "Формат CSV: email,telegram_id"
  ask "Запустить импорт? [д/Н]"; read -r ans
  [[ "$ans" =~ ^[дДyY]$ ]] || return
  [[ ! -f "./data/import.csv" && ! -f "./data/import.json" ]] && {
    err "Файл импорта не найден"; return
  }
  docker compose exec -T backend node dist/scripts/import-users.js 2>&1 | tee -a "$LOG_FILE"
  ok "Импорт завершён — проверь логи"
}

full_reset() {
  step "Полный сброс"
  warn "Это удалит ВСЕ данные включая базу!"
  echo -e "  ${RED}Введи СБРОС для подтверждения:${RESET} "; read -r c
  [[ "$c" == "СБРОС" || "$c" == "RESET" ]] || { info "Отменено"; return; }
  docker compose down -v --remove-orphans 2>&1 | tee -a "$LOG_FILE"
  ok "Всё удалено. Запусти установку заново."
}


# ── Установка команды lk ─────────────────────────────────────
install_lk_command() {
  local project_dir
  project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local lk_path="/usr/local/bin/lk"

  cat > "$lk_path" << LKEOF
#!/bin/bash
cd "${project_dir}" && bash install.sh "\$@"
LKEOF

  chmod +x "$lk_path"
  ok "Команда lk установлена → запускай из любого места: lk"
}

# ── Полная установка ─────────────────────────────────────────
full_install() {
  banner
  step "Полная установка HIDEYOU"
  info "Лог: $LOG_FILE"; echo ""

  [[ $EUID -ne 0 ]] && warn "Запущено не от root. Некоторые шаги могут потребовать sudo."

  step "Проверка зависимостей"
  check_docker || {
    ask "Docker не найден. Установить? [Д/н]"; read -r ans
    [[ "$ans" =~ ^[нНnN]$ ]] && { err "Docker обязателен. Выход."; exit 1; }
    install_docker
  }
  check_compose || { err "Docker Compose не найден"; exit 1; }
  check_git || { ask "Git не найден. Установить? [Д/н]"; read -r ans
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
  echo -e "  ${BOLD}Адреса доступа:${RESET}"
  echo -e "  ${GREEN}Лендинг:${RESET}        https://${domain}"
  echo -e "  ${GREEN}Личный кабинет:${RESET} https://${domain}/dashboard"
  echo -e "  ${GREEN}Админ-панель:${RESET}   https://admin.${domain}"
  echo -e "  ${GREEN}API:${RESET}            https://api.${domain}"
  echo ""
  echo -e "  ${BOLD}Что делать дальше:${RESET}"
  echo -e "  ${CYAN}1.${RESET} Создай аккаунт администратора → пункт меню [9]"
  echo -e "  ${CYAN}2.${RESET} Импортируй существующих пользователей → пункт [10]"
  echo -e "  ${CYAN}3.${RESET} Настрой тарифы и инструкции в админ-панели"
  echo ""
  echo -e "  ${GREEN}${BOLD}Теперь управляй сервисом командой:${RESET}  ${BOLD}lk${RESET}"
  echo -e "  ${DIM}Работает из любой папки на сервере${RESET}"
  echo ""
  ask "Создать администратора прямо сейчас? [Д/н]"; read -r ans
  [[ ! "$ans" =~ ^[нНnN]$ ]] && create_admin
}

# ── Главное меню ─────────────────────────────────────────────
main_menu() {
  # Автоматически регистрируем команду lk при первом запуске
  if [[ ! -f "/usr/local/bin/lk" ]] && [[ $EUID -eq 0 ]]; then
    install_lk_command 2>/dev/null || true
  fi
  while true; do
    banner

    echo -e "  ${BOLD}Главное меню${RESET}\n"

    echo -e "  ${CYAN}${BOLD}── Установка ─────────────────────────${RESET}"
    echo -e "  ${BOLD}[1]${RESET}  Полная установка (с нуля)"
    echo -e "  ${BOLD}[2]${RESET}  Настроить / перенастроить .env"
    echo -e "  ${BOLD}[3]${RESET}  Настроить SSL-сертификаты"

    echo ""
    echo -e "  ${CYAN}${BOLD}── Управление сервисами ──────────────${RESET}"
    echo -e "  ${BOLD}[4]${RESET}  Запустить все сервисы"
    echo -e "  ${BOLD}[5]${RESET}  Остановить все сервисы"
    echo -e "  ${BOLD}[6]${RESET}  Перезапустить сервис"
    echo -e "  ${BOLD}[7]${RESET}  Статус сервисов"
    echo -e "  ${BOLD}[8]${RESET}  Просмотр логов"

    echo ""
    echo -e "  ${CYAN}${BOLD}── Данные и аккаунты ─────────────────${RESET}"
    echo -e "  ${BOLD}[9]${RESET}  Создать аккаунт администратора"
    echo -e "  ${BOLD}[10]${RESET} Импортировать базу пользователей"
    echo -e "  ${BOLD}[11]${RESET} Применить миграции БД"
    echo -e "  ${BOLD}[12]${RESET} Создать резервную копию"
    echo -e "  ${BOLD}[13]${RESET} Восстановить из резервной копии"

    echo ""
    echo -e "  ${CYAN}${BOLD}── Обслуживание ──────────────────────${RESET}"
    echo -e "  ${BOLD}[14]${RESET} Обновить HIDEYOU"
    echo -e "  ${BOLD}[15]${RESET} Пересобрать Docker-образы"
    echo -e "  ${BOLD}[16]${RESET} Полный сброс ${RED}(⚠ удаляет все данные)${RESET}"
    echo ""
    echo -e "  ${CYAN}${BOLD}── Команда lk ────────────────────────${RESET}"
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

    echo ""; printf "  ${DIM}Нажми Enter для возврата в меню...${RESET}"; read -r
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
    echo "               $0 [установить|обновить|запустить|остановить|статус|логи|резерв|миграции|сброс]"
    exit 1 ;;
esac
