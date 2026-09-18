#!/usr/bin/env bash
# Daily PostgreSQL custom-format dump. Do not echo DATABASE_URL.
set -euo pipefail

ENV_FILE="${ACF_ENV_FILE:-/opt/ai-content-factory/shared/.env.production}"
BACKUP_DIR="${ACF_PG_BACKUP_DIR:-/opt/ai-content-factory/shared/backups/postgres}"
RETENTION_DAYS="${ACF_PG_BACKUP_RETENTION_DAYS:-7}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file missing" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL missing" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || true

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
outfile="${BACKUP_DIR}/acf_prod_${stamp}.dump"

if ! pg_dump -Fc --dbname="$DATABASE_URL" --file="$outfile"; then
  echo "pg_dump failed" >&2
  rm -f "$outfile"
  exit 1
fi

if ! sha256sum "$outfile" > "${outfile}.sha256"; then
  echo "checksum failed" >&2
  exit 1
fi

find "$BACKUP_DIR" -type f -name 'acf_prod_*.dump' -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -type f -name 'acf_prod_*.dump.sha256' -mtime "+${RETENTION_DAYS}" -delete

echo "postgres backup ok"
