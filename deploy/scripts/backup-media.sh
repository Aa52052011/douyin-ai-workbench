#!/usr/bin/env bash
# Local tar archive of MEDIA_STORAGE_ROOT. Do not echo secrets.
set -euo pipefail

ENV_FILE="${ACF_ENV_FILE:-/opt/ai-content-factory/shared/.env.production}"
BACKUP_DIR="${ACF_MEDIA_BACKUP_DIR:-/opt/ai-content-factory/shared/backups/media}"
RETENTION_DAYS="${ACF_MEDIA_BACKUP_RETENTION_DAYS:-7}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file missing" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

MEDIA_ROOT="${MEDIA_STORAGE_ROOT:-/opt/ai-content-factory/shared/media}"
if [[ ! -d "$MEDIA_ROOT" ]]; then
  echo "media directory missing" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || true

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
outfile="${BACKUP_DIR}/acf_media_${stamp}.tar.gz"

if ! tar -C "$(dirname "$MEDIA_ROOT")" -czf "$outfile" "$(basename "$MEDIA_ROOT")"; then
  echo "media archive failed" >&2
  rm -f "$outfile"
  exit 1
fi

sha256sum "$outfile" > "${outfile}.sha256"

find "$BACKUP_DIR" -type f -name 'acf_media_*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -type f -name 'acf_media_*.tar.gz.sha256' -mtime "+${RETENTION_DAYS}" -delete

echo "media backup ok"
