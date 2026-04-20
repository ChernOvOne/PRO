#!/bin/bash
#
# Creates full platform backup: db + uploads + env + nginx conf.d + letsencrypt
# Usage: ./backup.sh <output_tar_path> <git_sha> [git_tag]
#
# Exit codes: 0 ok, non-zero failure.

set -euo pipefail

OUT_TAR="${1:?output tar path required}"
GIT_SHA="${2:-unknown}"
GIT_TAG="${3:-}"

REPO_DIR="/repo"
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

echo "[backup] staging to $WORK_DIR"

# 1. DB dump (custom format for faster restore)
echo "[backup] pg_dump..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h postgres -U hideyou -d hideyou \
  -Fc -f "$WORK_DIR/db.sql"

# 2. Uploads (from named docker volume, mounted to /uploads)
if [ -d /uploads ] && [ "$(ls -A /uploads 2>/dev/null)" ]; then
  echo "[backup] uploads..."
  cp -r /uploads "$WORK_DIR/uploads"
fi

# 3. .env
if [ -f "$REPO_DIR/.env" ]; then
  echo "[backup] .env..."
  cp "$REPO_DIR/.env" "$WORK_DIR/env"
fi

# 4. nginx dynamic configs
if [ -d "$REPO_DIR/nginx/conf.d" ]; then
  echo "[backup] nginx/conf.d..."
  cp -r "$REPO_DIR/nginx/conf.d" "$WORK_DIR/nginx.conf.d"
fi

# 5. Let's Encrypt live certs (if mounted)
if [ -d /letsencrypt/live ]; then
  echo "[backup] letsencrypt/live..."
  mkdir -p "$WORK_DIR/letsencrypt"
  cp -rL /letsencrypt/live "$WORK_DIR/letsencrypt/live" 2>/dev/null || true
  cp -rL /letsencrypt/archive "$WORK_DIR/letsencrypt/archive" 2>/dev/null || true
  cp -rL /letsencrypt/renewal "$WORK_DIR/letsencrypt/renewal" 2>/dev/null || true
fi

# 6. Meta
cat > "$WORK_DIR/meta.json" <<EOF
{
  "git_sha": "$GIT_SHA",
  "git_tag": "$GIT_TAG",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_version": "1"
}
EOF

# 7. Pack
echo "[backup] creating tarball..."
cd "$WORK_DIR"
tar -czf "$OUT_TAR" .

SIZE=$(stat -c%s "$OUT_TAR")
echo "[backup] done: $OUT_TAR ($SIZE bytes)"
