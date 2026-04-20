#!/bin/bash
# hy system
set -euo pipefail
source /dev/stdin <<< "$(declare -f ensure_running psql_exec current_version || true)"
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${BLU:=}"; : "${DIM:=}"

info() {
  echo -e "${BOLD}HIDEYOU System Info${NC}"
  echo
  echo -e "  Версия:    $(current_version)"
  echo -e "  Путь:      $LKHY_ROOT"
  echo -e "  Хост:      $(hostname) / $(uname -sr)"
  echo -e "  IP:        $(curl -s https://api.ipify.org 2>/dev/null || echo 'н/д')"
  echo -e "  Docker:    $(docker version -f '{{.Server.Version}}' 2>/dev/null || echo 'н/д')"
  echo
}

disk_usage() {
  echo -e "${BOLD}Диск:${NC}"
  df -h "$LKHY_ROOT" | tail -1 | awk '{printf "  Корень:    %s из %s (%s)\n", $3, $2, $5}'
  echo -e "  Репозиторий: $(du -sh "$LKHY_ROOT" 2>/dev/null | cut -f1)"
  echo -e "  Бэкапы:      $(du -sh "$LKHY_ROOT/data/backups" 2>/dev/null | cut -f1 || echo '—')"
  echo -e "  Uploads:     $(docker exec hideyou_backend du -sh /app/uploads 2>/dev/null | cut -f1 || echo '—')"
  echo
  echo -e "${BOLD}Docker volumes:${NC}"
  docker system df -v 2>/dev/null | grep -E "postgres|redis|uploads|certbot" | head -10
}

health() {
  ensure_running
  local rpw
  rpw=$(grep '^REDIS_PASSWORD=' "$LKHY_ROOT/.env" 2>/dev/null | cut -d= -f2- || echo '')
  echo -ne "  Postgres:  "; docker exec hideyou_postgres pg_isready -U hideyou -d hideyou 2>&1 | head -1
  echo -ne "  Redis:     "
  if [ -n "$rpw" ]; then
    docker exec hideyou_redis redis-cli -a "$rpw" --no-auth-warning ping 2>/dev/null || echo "FAIL"
  else
    docker exec hideyou_redis redis-cli ping 2>/dev/null || echo "FAIL"
  fi
  echo -ne "  Backend:   "; curl -sk --resolve localhost:443:127.0.0.1 https://localhost/api/health 2>/dev/null | head -c 100; echo
  echo -ne "  Frontend:  "; curl -sk -o /dev/null -w "HTTP %{http_code}" https://localhost/ 2>/dev/null; echo
}

github_latest() {
  echo -e "${BOLD}Последний релиз на GitHub:${NC}"
  curl -s 'https://api.github.com/repos/ChernOvOne/PRO/releases/latest' \
    | grep -E '"(tag_name|name|published_at)"' | head -3
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── Система и диагностика ──${NC}"
    echo
    echo "  1) Общая информация"
    echo "  2) Использование диска"
    echo "  3) Health-check всех сервисов"
    echo "  4) Последний релиз на GitHub"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) info; read -p "Enter..." ;;
      2) disk_usage; read -p "Enter..." ;;
      3) health; read -p "Enter..." ;;
      4) github_latest; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu)   menu ;;
  info)   info ;;
  disk)   disk_usage ;;
  health) health ;;
  latest) github_latest ;;
  *)      echo "usage: hy system {info|disk|health|latest}"; exit 1 ;;
esac
