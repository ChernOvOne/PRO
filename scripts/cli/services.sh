#!/bin/bash
# hy services
set -euo pipefail
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${BLU:=}"

SERVICES=(postgres redis backend frontend bot nginx updater certbot)

status_all() {
  echo -e "${BOLD}Состояние контейнеров HIDEYOU:${NC}"
  docker ps -a --filter name=hideyou_ --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
}

restart_service() {
  local s="${1:-}"
  [ -z "$s" ] && {
    echo "Доступные: ${SERVICES[*]}"
    read -p "Сервис: " s
  }
  cd "$LKHY_ROOT" && docker compose restart "$s"
  echo -e "${GRN}✓ $s перезапущен${NC}"
}

logs() {
  local s="${1:-}"
  local lines="${2:-100}"
  [ -z "$s" ] && { read -p "Сервис: " s; }
  docker logs --tail "$lines" -f "hideyou_$s"
}

resource_usage() {
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}' \
    | grep -E "NAME|hideyou_"
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── Сервисы и логи ──${NC}"
    echo
    echo "  1) Статус всех контейнеров"
    echo "  2) Перезапустить сервис"
    echo "  3) Показать логи"
    echo "  4) Использование ресурсов (CPU/RAM)"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) status_all; read -p "Enter..." ;;
      2) restart_service; read -p "Enter..." ;;
      3) logs; ;;
      4) resource_usage; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu) menu ;;
  status)  status_all ;;
  restart) restart_service "${2:-}" ;;
  logs)    logs "${2:-}" "${3:-100}" ;;
  usage)   resource_usage ;;
  *)       echo "usage: hy services {status|restart <svc>|logs <svc>|usage}"; exit 1 ;;
esac
