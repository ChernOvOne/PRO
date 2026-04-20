#!/bin/bash
# hy wizard — setup wizard controls
set -euo pipefail
source /dev/stdin <<< "$(declare -f ensure_running psql_exec || true)"
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${BLU:=}"

reset_flag() {
  ensure_running
  psql_exec -c "DELETE FROM settings WHERE key IN ('setup_completed', 'setup_progress');" >/dev/null
  echo -e "${GRN}✓ Флаг setup_completed сброшен. Визард откроется при следующем входе в /admin${NC}"
}

show_status() {
  ensure_running
  echo -e "${BOLD}Статус визарда:${NC}"
  psql_exec -c "SELECT key, value FROM settings WHERE key IN ('setup_completed', 'buh_setup_completed');"
}

open_url() {
  local url
  url=$(grep '^DOMAIN=' "$LKHY_ROOT/.env" 2>/dev/null | cut -d= -f2 || echo "")
  if [ -n "$url" ]; then
    echo "Открой в браузере: https://$url/admin/setup"
  else
    echo "Открой в браузере: /admin/setup"
  fi
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── Визард настройки ──${NC}"
    echo
    echo "  1) Показать статус"
    echo "  2) Сбросить флаг (запустить визард заново)"
    echo "  3) Показать URL визарда"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) show_status; read -p "Enter..." ;;
      2) reset_flag; read -p "Enter..." ;;
      3) open_url; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu)   menu ;;
  reset)  reset_flag ;;
  status) show_status ;;
  *)      echo "usage: hy wizard {reset|status}"; exit 1 ;;
esac
