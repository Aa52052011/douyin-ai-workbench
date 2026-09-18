#!/usr/bin/env bash
# Loopback health. Prints no secrets.
set -euo pipefail
fail=0

check_http() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
  if [[ "$code" != "200" ]]; then
    echo "FAIL $url status=${code:-none}" >&2
    fail=1
  else
    echo "OK $url"
  fi
}

check_http "http://127.0.0.1:3001/health"
check_http "http://127.0.0.1:3010"

if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli -h 127.0.0.1 ping >/dev/null 2>&1; then
    echo "OK redis"
  else
    echo "FAIL redis" >&2
    fail=1
  fi
fi

if command -v pg_isready >/dev/null 2>&1; then
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    echo "OK postgres"
  else
    echo "FAIL postgres" >&2
    fail=1
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  for u in acf-backend acf-worker acf-frontend; do
    if systemctl is-active --quiet "$u"; then
      echo "OK $u"
    else
      echo "FAIL $u" >&2
      fail=1
    fi
  done
fi

if [[ $fail -ne 0 ]]; then
  exit 1
fi
echo "health-check ok"
