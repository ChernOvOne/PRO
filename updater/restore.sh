#!/bin/bash
#
# Restores platform from full backup tarball.
# Usage: ./restore.sh <backup_tar_path>

set -euo pipefail

BACKUP_TAR="${1:?backup tar path required}"
REPO_DIR="/repo"
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

echo "[restore] unpacking..."
tar -xzf "$BACKUP_TAR" -C "$WORK_DIR"

META_SHA=$(cat "$WORK_DIR/meta.json" 2>/dev/null | grep -oE '"git_sha":"[^"]*"' | cut -d'"' -f4 || echo "")
echo "[restore] target git_sha: ${META_SHA:-unknown}"

# 1. Git reset to backup's SHA (if known)
if [ -n "$META_SHA" ] && [ "$META_SHA" != "unknown" ]; then
  cd "$REPO_DIR"
  echo "[restore] git fetch..."
  git fetch origin --tags --quiet
  echo "[restore] git reset --hard $META_SHA"
  git reset --hard "$META_SHA"
fi

# 2. Restore .env
if [ -f "$WORK_DIR/env" ]; then
  echo "[restore] .env"
  cp "$WORK_DIR/env" "$REPO_DIR/.env"
fi

# 3. Restore nginx conf.d
if [ -d "$WORK_DIR/nginx.conf.d" ]; then
  echo "[restore] nginx/conf.d"
  rm -rf "$REPO_DIR/nginx/conf.d"
  cp -r "$WORK_DIR/nginx.conf.d" "$REPO_DIR/nginx/conf.d"
fi

# 4. Restore uploads (target volume mounted at /uploads)
if [ -d "$WORK_DIR/uploads" ]; then
  echo "[restore] uploads"
  rm -rf /uploads/*
  cp -r "$WORK_DIR/uploads/"* /uploads/ 2>/dev/null || true
fi

# 5. Restore certs if present
if [ -d "$WORK_DIR/letsencrypt" ]; then
  echo "[restore] letsencrypt"
  cp -r "$WORK_DIR/letsencrypt/"* /letsencrypt/ 2>/dev/null || true
fi

# 6. Restore DB — drop + recreate schema, then pg_restore
if [ -f "$WORK_DIR/db.sql" ]; then
  echo "[restore] dropping & restoring database..."
  PGPASSWORD="$POSTGRES_PASSWORD" psql -h postgres -U hideyou -d hideyou <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO hideyou;
GRANT ALL ON SCHEMA public TO public;
SQL
  PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
    -h postgres -U hideyou -d hideyou \
    --no-owner --no-privileges \
    "$WORK_DIR/db.sql"
fi

echo "[restore] done"
