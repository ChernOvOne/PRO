#!/bin/bash
# hy domains — multi-domain TLS management
set -euo pipefail
source /dev/stdin <<< "$(declare -f ensure_running psql_exec redis_exec || true)"
: "${NC:=}"; : "${GRN:=}"; : "${YLW:=}"; : "${RED:=}"; : "${BOLD:=}"; : "${BLU:=}"

list_domains() {
  ensure_running
  psql_exec -c "
    SELECT domain, role, status,
           COALESCE(TO_CHAR(cert_expires_at, 'YYYY-MM-DD'), '—') AS expires,
           COALESCE(substr(last_error, 1, 40), '') AS last_error
    FROM setup_domains
    ORDER BY created_at DESC;
  "
}

add_domain() {
  local domain="${1:-}" role="${2:-app}"
  [ -z "$domain" ] && { read -p "Домен: " domain; read -p "Роль (landing/app/admin/api/webhook/payments/custom) [app]: " role; role="${role:-app}"; }

  ensure_running
  # Check DNS first
  echo "Проверяю DNS..."
  local resolved
  resolved=$(dig +short "$domain" A | head -1)
  local our_ip
  our_ip=$(curl -s https://api.ipify.org 2>/dev/null || echo "")
  echo "  DNS: $domain → ${resolved:-(не резолвится)}"
  echo "  Сервер: ${our_ip:-(не определён)}"
  if [ "$resolved" != "$our_ip" ]; then
    echo -e "${YLW}⚠ DNS не совпадает с IP сервера${NC}"
    read -p "Продолжить всё равно? (y/n): " ok
    [ "$ok" = "y" ] || { echo "Отменено"; return; }
  fi

  # Insert row
  local id
  id=$(psql_exec -c "INSERT INTO setup_domains (id, domain, role, status, updated_at) VALUES (gen_random_uuid()::text, '$domain', '$role', 'pending', NOW()) RETURNING id;" | head -1 | xargs)

  # Queue job
  redis_exec RPUSH cert:queue "$(printf '{"domain":"%s","role":"%s"}' "$domain" "$role")" >/dev/null
  echo -e "${GRN}✓ Домен $domain добавлен (id=$id), certbot выпускает TLS...${NC}"
  echo "Прогресс: docker logs -f hideyou_certbot"
}

remove_domain() {
  local id="${1:-}"
  [ -z "$id" ] && { list_domains; read -p "ID домена: " id; }
  ensure_running
  local domain
  domain=$(psql_exec -c "SELECT domain FROM setup_domains WHERE id = '$id';" | head -1 | xargs)
  [ -z "$domain" ] && { echo "Не найден"; return 1; }
  rm -f "$LKHY_ROOT/nginx/conf.d/$domain.conf"
  psql_exec -c "DELETE FROM setup_domains WHERE id = '$id';" >/dev/null
  docker exec hideyou_nginx nginx -s reload 2>/dev/null || true
  echo -e "${GRN}✓ Удалено: $domain${NC}"
}

menu() {
  while true; do
    clear
    echo -e "${BOLD}${BLU}── Домены и TLS ──${NC}"
    echo
    echo "  1) Список доменов"
    echo "  2) Добавить домен + выпустить TLS"
    echo "  3) Удалить домен"
    echo "  0) Назад"
    echo
    read -p "  > " c
    case "$c" in
      1) list_domains; read -p "Enter..." ;;
      2) add_domain; read -p "Enter..." ;;
      3) remove_domain; read -p "Enter..." ;;
      0|q) return ;;
    esac
  done
}

case "${1:-menu}" in
  menu)   menu ;;
  list)   list_domains ;;
  add)    add_domain "${2:-}" "${3:-}" ;;
  remove) remove_domain "${2:-}" ;;
  *)      echo "usage: hy domains {list|add <domain> <role>|remove <id>}"; exit 1 ;;
esac
