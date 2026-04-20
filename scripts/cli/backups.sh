#!/bin/bash
# hy backups
set -euo pipefail
source /dev/stdin <<< "$(declare -f ensure_running psql_exec redis_exec || true)"
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${BLU:=}"

BACKUPS_DIR="$LKHY_ROOT/data/backups"

list_backups() {
  ensure_running
  echo -e "${BOLD}Локальные файлы в $BACKUPS_DIR:${NC}"
  ls -lh "$BACKUPS_DIR"/*.tar.gz 2>/dev/null | awk '{print "  " $9 "  " $5 "  " $6 " " $7 " " $8}' || echo "  (пусто)"
  echo
  echo -e "${BOLD}Записи в БД:${NC}"
  psql_exec -c "
    SELECT TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS created,
           filename,
           pg_size_pretty(size_bytes) AS size,
           COALESCE(git_tag, substr(git_sha, 1, 7)) AS version,
           CASE WHEN uploaded_to_tg THEN '✓ TG' ELSE '' END AS tg,
           reason
    FROM backups
    ORDER BY created_at DESC
    LIMIT 20;
  "
}

create_backup() {
  ensure_running
  echo "Запускаю создание полного бэкапа..."
  local eventId
  eventId=$(psql_exec -c "INSERT INTO update_events (id, status, started_at) VALUES (gen_random_uuid()::text, 'pending', NOW()) RETURNING id;" | head -1 | xargs)
  redis_exec RPUSH update:queue "$(printf '{"type":"backup","reason":"manual","eventId":"%s"}' "$eventId")" >/dev/null
  echo -e "${GRN}✓ Бэкап запущен, eventId: $eventId${NC}"
  echo "Прогресс: docker logs -f hideyou_updater"
}

restore_backup() {
  local ref="${1:-}"
  if [ -z "$ref" ]; then
    list_backups
    echo
    read -p "Введи ID бэкапа из БД или имя файла: " ref
  fi
  ensure_running

  # Try as DB ID first
  local backupId
  backupId=$(psql_exec -c "SELECT id FROM backups WHERE id = '$ref' OR filename = '$ref' LIMIT 1;" | head -1 | xargs)
  if [ -z "$backupId" ]; then
    echo -e "${RED}Не найден бэкап: $ref${NC}"
    return 1
  fi

  echo -e "${YLW}⚠ Будет выполнен откат к бэкапу. Все данные после него потеряются.${NC}"
  read -p "Введи 'УДАЛИТЬ' для подтверждения: " ok
  [ "$ok" = "УДАЛИТЬ" ] || { echo "Отменено"; return; }

  local eventId
  eventId=$(psql_exec -c "INSERT INTO update_events (id, status, is_rollback, backup_id, started_at) VALUES (gen_random_uuid()::text, 'pending', true, '$backupId', NOW()) RETURNING id;" | head -1 | xargs)
  redis_exec RPUSH update:queue "$(printf '{"type":"rollback","backupId":"%s","eventId":"%s"}' "$backupId" "$eventId")" >/dev/null
  echo -e "${GRN}✓ Откат запущен, eventId: $eventId${NC}"
}

delete_backup() {
  local id="${1:-}"
  [ -z "$id" ] && { read -p "ID бэкапа: " id; }
  ensure_running
  local filename
  filename=$(psql_exec -c "SELECT filename FROM backups WHERE id = '$id';" | head -1 | xargs)
  [ -z "$filename" ] && { echo "Не найден"; return 1; }
  rm -f "$BACKUPS_DIR/$filename"
  psql_exec -c "DELETE FROM backups WHERE id = '$id';" >/dev/null
  echo -e "${GRN}✓ Удалено: $filename${NC}"
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── Бэкапы и восстановление ──${NC}"
    echo
    echo "  1) Список бэкапов"
    echo "  2) Создать бэкап сейчас"
    echo "  3) Восстановиться из бэкапа"
    echo "  4) Удалить бэкап"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) list_backups; read -p "Enter..." ;;
      2) create_backup; read -p "Enter..." ;;
      3) restore_backup; read -p "Enter..." ;;
      4) delete_backup; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu)    menu ;;
  list)    list_backups ;;
  create)  create_backup ;;
  restore) restore_backup "${2:-}" ;;
  delete)  delete_backup "${2:-}" ;;
  *)       echo "usage: hy backups {list|create|restore <id>|delete <id>}"; exit 1 ;;
esac
