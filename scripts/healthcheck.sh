#!/bin/bash
# ============================================================
#  HIDEYOU — Health Check
#  Checks all services and reports their status.
#  Can be used with monitoring systems (Uptime Kuma, Zabbix, etc.)
#
#  Exit codes: 0 = healthy, 1 = degraded, 2 = critical
# ============================================================

BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RESET='\033[0m'
ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
fail() { echo -e "  ${RED}✗${RESET}  $*"; }

ISSUES=0
CRITICAL=0

check_http() {
  local name="$1" url="$2" expected="${3:-200}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expected" ]]; then
    ok "$name (HTTP $code)"
  elif [[ "$code" == "000" ]]; then
    fail "$name — unreachable"
    CRITICAL=$((CRITICAL + 1))
  else
    warn "$name (HTTP $code, expected $expected)"
    ISSUES=$((ISSUES + 1))
  fi
}

check_container() {
  local name="$1"
  if docker compose ps "$name" 2>/dev/null | grep -q "Up"; then
    local status
    status=$(docker compose ps "$name" --format "{{.Status}}" 2>/dev/null)
    if echo "$status" | grep -q "healthy"; then
      ok "Container $name — healthy"
    else
      ok "Container $name — running"
    fi
  else
    fail "Container $name — not running"
    CRITICAL=$((CRITICAL + 1))
  fi
}

check_disk() {
  local pct
  pct=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
  if [[ $pct -lt 80 ]]; then
    ok "Disk usage ${pct}%"
  elif [[ $pct -lt 90 ]]; then
    warn "Disk usage ${pct}% (approaching limit)"
    ISSUES=$((ISSUES + 1))
  else
    fail "Disk usage ${pct}% (critical!)"
    CRITICAL=$((CRITICAL + 1))
  fi
}

check_memory() {
  local used_pct
  used_pct=$(free | awk 'NR==2 {printf "%.0f", $3/$2*100}')
  if [[ $used_pct -lt 85 ]]; then
    ok "Memory usage ${used_pct}%"
  else
    warn "Memory usage ${used_pct}%"
    ISSUES=$((ISSUES + 1))
  fi
}

echo ""
echo "  HIDEYOU Health Check — $(date '+%Y-%m-%d %H:%M:%S')"
echo "  ─────────────────────────────────────────────────────"
echo ""

echo "  [Services]"
check_container backend
check_container frontend
check_container bot
check_container postgres
check_container redis
check_container nginx

echo ""
echo "  [Endpoints]"
check_http "Backend /health"  "${BACKEND_URL}/health"
check_http "Frontend"          "${FRONTEND_URL}"
check_http "API tariffs"       "${BACKEND_URL}/api/public/tariffs"

echo ""
echo "  [System]"
check_disk
check_memory

echo ""
echo "  ─────────────────────────────────────────────────────"

if [[ $CRITICAL -gt 0 ]]; then
  echo -e "  ${RED}CRITICAL${RESET} — $CRITICAL critical, $ISSUES warning(s)"
  exit 2
elif [[ $ISSUES -gt 0 ]]; then
  echo -e "  ${YELLOW}DEGRADED${RESET} — $ISSUES warning(s)"
  exit 1
else
  echo -e "  ${GREEN}HEALTHY${RESET} — All systems operational"
  exit 0
fi
