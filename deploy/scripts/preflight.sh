#!/usr/bin/env bash
# Read-only preflight. Does not change the host.
set -euo pipefail

fail=0
need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "MISSING command: $1" >&2
    fail=1
  fi
}

need_cmd node
need_cmd npm
need_cmd psql
need_cmd pg_dump
need_cmd pg_isready
need_cmd redis-cli
need_cmd ffmpeg
need_cmd ffprobe
need_cmd nginx
need_cmd git
need_cmd openssl

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$node_major" -lt 20 ]]; then
    echo "Node >= 20 required" >&2
    fail=1
  fi
fi

ENV_FILE="${ACF_ENV_FILE:-/opt/ai-content-factory/shared/.env.production}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "MISSING env file" >&2
  fail=1
else
  mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%OLp' "$ENV_FILE")"
  if [[ "$mode" != "600" && "$mode" != "400" ]]; then
    echo "env file mode should be 600" >&2
    fail=1
  fi
fi

MEDIA_DIR="${MEDIA_STORAGE_ROOT:-/opt/ai-content-factory/shared/media}"
for d in /opt/ai-content-factory /opt/ai-content-factory/shared "$MEDIA_DIR" /opt/ai-content-factory/shared/backups; do
  if [[ ! -d "$d" ]]; then
    echo "MISSING directory: $d" >&2
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  exit 1
fi
echo "preflight ok"
