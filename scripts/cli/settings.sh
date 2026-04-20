#!/bin/bash
# hy settings
set -euo pipefail
source /dev/stdin <<< "$(declare -f ensure_running psql_exec || true)"
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${BLU:=}"

get_setting() {
  local key="${1:-}"
  [ -z "$key" ] && { read -p "Ключ: " key; }
  ensure_running
  local val
  val=$(psql_exec -c "SELECT value FROM settings WHERE key = '$key';" | head -1)
  if [ -z "$val" ]; then
    echo -e "${DIM}(не задан)${NC}"
  else
    echo "$val"
  fi
}

set_setting() {
  local key="${1:-}" value="${2:-}"
  [ -z "$key" ] && { read -p "Ключ: " key; }
  [ -z "$value" ] && { read -p "Значение: " value; }
  ensure_running
  psql_exec -c "
    INSERT INTO settings (key, value, updated_at) VALUES ('$key', \$val\$$value\$val\$, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
  " >/dev/null
  echo -e "${GRN}✓ $key = $value${NC}"
}

list_settings() {
  ensure_running
  local filter="${1:-}"
  if [ -n "$filter" ]; then
    psql_exec -c "SELECT key, CASE WHEN length(value) > 60 THEN substr(value, 1, 57) || '...' ELSE value END FROM settings WHERE key ILIKE '%$filter%' ORDER BY key;"
  else
    psql_exec -c "SELECT key, CASE WHEN length(value) > 60 THEN substr(value, 1, 57) || '...' ELSE value END FROM settings ORDER BY key;"
  fi
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── Настройки ──${NC}"
    echo
    echo "  1) Все настройки"
    echo "  2) Поиск по ключу"
    echo "  3) Получить значение"
    echo "  4) Установить значение"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) list_settings; read -p "Enter..." ;;
      2) read -p "Фильтр: " f; list_settings "$f"; read -p "Enter..." ;;
      3) get_setting; read -p "Enter..." ;;
      4) set_setting; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu) menu ;;
  get)  get_setting "${2:-}" ;;
  set)  set_setting "${2:-}" "${3:-}" ;;
  list) list_settings "${2:-}" ;;
  *)    echo "usage: hy settings {get <key>|set <key> <val>|list [filter]}"; exit 1 ;;
esac
