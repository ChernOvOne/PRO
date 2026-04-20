#!/bin/bash
# hy users
set -euo pipefail
source /dev/stdin <<< "$(declare -f ensure_running psql_exec || true)"
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${BLU:=}"

list_admins() {
  ensure_running
  psql_exec -c "SELECT id, email, telegram_id, role, created_at::date FROM users WHERE role IN ('ADMIN', 'EDITOR') ORDER BY created_at;"
}

create_admin() {
  ensure_running
  read -p "Email нового админа: " email
  read -s -p "Пароль (мин. 8): " pwd; echo
  [ ${#pwd} -lt 8 ] && { echo -e "${RED}Пароль короткий${NC}"; return 1; }
  docker exec hideyou_backend node dist/scripts/create-admin.js --email "$email" --password "$pwd" 2>/dev/null \
    || docker exec hideyou_backend npx tsx src/scripts/create-admin.ts --email "$email" --password "$pwd"
  echo -e "${GRN}✓ Админ создан${NC}"
}

reset_password() {
  local email="${1:-}"
  [ -z "$email" ] && { read -p "Email: " email; }
  ensure_running
  read -s -p "Новый пароль: " pwd; echo
  [ ${#pwd} -lt 8 ] && { echo "Пароль короткий"; return 1; }
  # Hash with bcryptjs inline via node in backend container
  local hash
  hash=$(docker exec hideyou_backend node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" "$pwd")
  psql_exec -c "UPDATE users SET password_hash = '$hash', password_set_at = NOW() WHERE email = '$email';" >/dev/null
  echo -e "${GRN}✓ Пароль обновлён${NC}"
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── Пользователи и админы ──${NC}"
    echo
    echo "  1) Список админов"
    echo "  2) Создать админа"
    echo "  3) Сбросить пароль"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) list_admins; read -p "Enter..." ;;
      2) create_admin; read -p "Enter..." ;;
      3) reset_password; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu) menu ;;
  list-admins)      list_admins ;;
  create-admin)     create_admin ;;
  reset-password)   reset_password "${2:-}" ;;
  *)                echo "usage: hy users {list-admins|create-admin|reset-password <email>}"; exit 1 ;;
esac
