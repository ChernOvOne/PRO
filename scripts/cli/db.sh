#!/bin/bash
# hy db
set -euo pipefail
source /dev/stdin <<< "$(declare -f ensure_running psql_exec || true)"
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${BLU:=}"

db_backup() {
  local out="${1:-$LKHY_ROOT/data/backups/db-manual-$(date +%Y%m%d-%H%M%S).sql}"
  ensure_running
  local pw
  pw=$(grep '^POSTGRES_PASSWORD=' "$LKHY_ROOT/.env" | cut -d= -f2-)
  docker exec -e PGPASSWORD="$pw" hideyou_postgres pg_dump -U hideyou -d hideyou -Fc > "$out"
  echo -e "${GRN}✓ БД сохранена в $out ($(stat -c%s "$out") байт)${NC}"
}

db_restore() {
  local file="${1:-}"
  [ -z "$file" ] && { read -p "Путь к .sql: " file; }
  [ -f "$file" ] || { echo -e "${RED}Файл не найден${NC}"; return 1; }
  ensure_running
  echo -e "${YLW}⚠ БД будет полностью перезаписана из $file${NC}"
  read -p "Введи 'УДАЛИТЬ' для подтверждения: " ok
  [ "$ok" = "УДАЛИТЬ" ] || { echo "Отменено"; return; }
  local pw
  pw=$(grep '^POSTGRES_PASSWORD=' "$LKHY_ROOT/.env" | cut -d= -f2-)
  docker exec -e PGPASSWORD="$pw" hideyou_postgres psql -U hideyou -d hideyou -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
  cat "$file" | docker exec -i -e PGPASSWORD="$pw" hideyou_postgres pg_restore -U hideyou -d hideyou --no-owner --no-privileges
  echo -e "${GRN}✓ БД восстановлена${NC}"
}

db_migrate() {
  ensure_running
  docker exec hideyou_backend npx prisma migrate deploy
}

db_shell() {
  ensure_running
  docker exec -it hideyou_postgres psql -U hideyou -d hideyou
}

db_size() {
  ensure_running
  psql_exec -c "
    SELECT
      (SELECT pg_size_pretty(pg_database_size('hideyou'))) AS total_size,
      (SELECT COUNT(*) FROM users) AS users_count,
      (SELECT COUNT(*) FROM payments) AS payments_count,
      (SELECT COUNT(*) FROM tickets) AS tickets_count,
      (SELECT COUNT(*) FROM buh_transactions) AS buh_tx_count
  "
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── База данных ──${NC}"
    echo
    echo "  1) Бэкап БД"
    echo "  2) Восстановить БД"
    echo "  3) Применить миграции"
    echo "  4) psql shell"
    echo "  5) Размер БД + счётчики"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) db_backup; read -p "Enter..." ;;
      2) db_restore; read -p "Enter..." ;;
      3) db_migrate; read -p "Enter..." ;;
      4) db_shell ;;
      5) db_size; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu) menu ;;
  backup)  db_backup "${2:-}" ;;
  restore) db_restore "${2:-}" ;;
  migrate) db_migrate ;;
  shell)   db_shell ;;
  size)    db_size ;;
  *)       echo "usage: hy db {backup|restore <file>|migrate|shell|size}"; exit 1 ;;
esac
