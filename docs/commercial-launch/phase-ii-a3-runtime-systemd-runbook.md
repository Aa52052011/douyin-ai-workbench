# Phase II-A.3 Runtime systemd runbook

Single VPS layout (templates only; this phase does not install units):

```
/opt/ai-content-factory/
  current/                 # app checkout + build output
  shared/
    .env.production        # secrets, mode 0600, owner acf
    media/                 # MEDIA_STORAGE_ROOT
```

Linux service user: `acf` / `acf` (create on the VPS later; not in this phase).

## Enable at boot

```
sudo systemctl enable postgresql redis-server acf-backend acf-worker acf-frontend
```

Debian/Ubuntu Redis unit is often `redis-server`. RHEL/Fedora is often `redis`. PostgreSQL may be `postgresql` or `postgresql@16-main`. Application units use `After=network-online.target` only so a wrong distro name does not block enable.

## Start order

1. Postgres package service
2. Redis package service
3. `acf-backend`, `acf-worker`, `acf-frontend` (no Requires= between app units)

`After=` is ordering, not readiness. If Redis/Postgres is still starting, the app exits and `Restart=on-failure` retries (`RestartSec=5`).

## Restart policy

`Restart=on-failure` on all three app units. Do not use `Restart=always` (a clean `systemctl stop` must stay stopped).

`KillSignal=SIGTERM`. Backend/Worker `TimeoutStopSec=200` (FFmpeg compose can run up to 180s). Frontend `TimeoutStopSec=60`.

## Logging (journald)

```
journalctl -u acf-backend -e
journalctl -u acf-worker -e
journalctl -u acf-frontend -e
```

No extra file logger. stdout/stderr → journald.

## Health checks

```
curl -sS http://127.0.0.1:3001/health
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3010
sudo -u postgres psql -c 'SELECT 1'
redis-cli ping
systemctl status acf-backend acf-worker acf-frontend
```

Worker startup line: `Job worker started`. Duplicate instance: `Worker instance lock already held` then non-zero exit.

## Network

App units set `BACKEND_HOST=127.0.0.1`, `FRONTEND_HOST=127.0.0.1`. Postgres and Redis must not be published on public interfaces. Nginx (later) is the only public HTTP(S) entry.

## Writable paths

`MEDIA_STORAGE_ROOT=/opt/ai-content-factory/shared/media` plus OS temp (`PrivateTmp=true`). Units `ReadWritePaths` cover `/opt/ai-content-factory/shared` and `/tmp`.
