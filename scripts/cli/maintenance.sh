#!/bin/bash
# hy maintenance
set -euo pipefail
source /dev/stdin <<< "$(declare -f ensure_running psql_exec || true)"
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${BLU:=}"

set_maintenance() {
  local on="$1" msg="${2:-}"
  ensure_running
  psql_exec -c "
    INSERT INTO settings (key, value, updated_at) VALUES ('maintenance_mode', '$on', NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
  " >/dev/null
  if [ -n "$msg" ]; then
    psql_exec -c "
      INSERT INTO settings (key, value, updated_at) VALUES ('maintenance_message', \$m\$$msg\$m\$, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    " >/dev/null
  fi
  echo -e "${GRN}✓ Режим обслуживания: $( [ "$on" = "1" ] && echo 'ВКЛЮЧЁН' || echo 'ВЫКЛЮЧЕН')${NC}"
}

status() {
  ensure_running
  psql_exec -c "SELECT key, value FROM settings WHERE key IN ('maintenance_mode', 'maintenance_message');"
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── Режим обслуживания ──${NC}"
    echo
    status
    echo
    echo "  1) Включить"
    echo "  2) Выключить"
    echo "  3) Изменить сообщение"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) set_maintenance 1; read -p "Enter..." ;;
      2) set_maintenance 0; read -p "Enter..." ;;
      3) read -p "Сообщение: " m; set_maintenance 1 "$m"; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu)   menu ;;
  on)     set_maintenance 1 "${2:-}" ;;
  off)    set_maintenance 0 ;;
  status) status ;;
  *)      echo "usage: hy maintenance {on|off|status}"; exit 1 ;;
esac
