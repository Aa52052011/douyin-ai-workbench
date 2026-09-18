#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
"$ROOT/backup-postgres.sh"
"$ROOT/backup-media.sh"
echo "backup-all ok"
