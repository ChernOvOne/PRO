#!/bin/bash
# hy updates — GitHub release management via updater sidecar
set -euo pipefail
source /dev/stdin <<< "$(declare -f ensure_running psql_exec redis_exec current_version || true)"
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${DIM:=}"; : "${BLU:=}"

queue_job() {
  local json="$1"
  redis_exec RPUSH update:queue "$json" >/dev/null
}

check_releases() {
  ensure_running
  echo "Проверяю релизы на GitHub..."
  queue_job '{"type":"check"}'
  sleep 2
  # Fetch via GitHub API directly for display
  local json
  json=$(curl -s "https://api.github.com/repos/ChernOvOne/PRO/releases?per_page=10" 2>/dev/null || echo '[]')
  local current_tag
  current_tag=$(cd "$LKHY_ROOT" && git describe --tags --abbrev=0 2>/dev/null || echo "")
  echo
  echo -e "${BOLD}Текущая версия:${NC} ${current_tag:-unknown}"
  echo
  echo -e "${BOLD}Последние релизы:${NC}"
  echo "$json" | python3 -c '
import sys, json
data = json.load(sys.stdin)
for r in data[:10]:
    tag = r.get("tag_name","")
    name = r.get("name","")
    pub = r.get("published_at","")[:10]
    pre = " [pre]" if r.get("prerelease") else ""
    print(f"  {tag:12s}  {pub}  {name[:60]}{pre}")
' 2>/dev/null || echo "$json" | grep tag_name | head -10
}

install_release() {
  local tag="${1:-}"
  if [ -z "$tag" ]; then
    read -p "Введи тег (например v5.7.0): " tag
  fi
  ensure_running
  echo -e "${YLW}⚠ Будет создан полный бэкап и установлена версия $tag${NC}"
  read -p "Продолжить? (yes/no): " ok
  [ "$ok" = "yes" ] || { echo "Отменено"; return; }

  # Create event row via SQL
  local eventId
  eventId=$(psql_exec -c "INSERT INTO update_events (id, status, to_tag, started_at) VALUES (gen_random_uuid()::text, 'pending', '$tag', NOW()) RETURNING id;" | head -1 | xargs)
  queue_job "$(printf '{"type":"install","tag":"%s","eventId":"%s"}' "$tag" "$eventId")"
  echo -e "${GRN}✓ Задача поставлена в очередь, eventId: $eventId${NC}"
  echo "Следи за логами: docker logs -f hideyou_updater"
}

show_history() {
  ensure_running
  echo -e "${BOLD}История обновлений (последние 20):${NC}"
  psql_exec -c "
    SELECT TO_CHAR(started_at, 'YYYY-MM-DD HH24:MI') AS \"When\",
           COALESCE(from_tag, '?') || ' → ' || COALESCE(to_tag, '?') AS \"Migration\",
           status,
           COALESCE(substr(error_message, 1, 60), '') AS \"Error\"
    FROM update_events
    ORDER BY started_at DESC
    LIMIT 20;
  "
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── Обновления и версии ──${NC}"
    echo
    echo "  1) Проверить доступные релизы"
    echo "  2) Установить релиз"
    echo "  3) История обновлений"
    echo "  4) Текущая версия"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) check_releases; read -p "Enter..." ;;
      2) install_release; read -p "Enter..." ;;
      3) show_history; read -p "Enter..." ;;
      4) current_version; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu)    menu ;;
  check)   check_releases ;;
  install) install_release "${2:-}" ;;
  history) show_history ;;
  *)       echo "usage: hy updates {check|install <tag>|history}"; exit 1 ;;
esac
