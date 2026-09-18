# Phase II-A.5 Single VPS deployment runbook

Do not execute against a real VPS in this phase. Replace `YOUR_DOMAIN`.

Commercial Release Tag: **NOT_CREATED_YET**. Do **not** `checkout v0.9.0-rc.1` for Phase II-A code (env, worker lock, systemd). Deploy a **new** commit/tag after Phase II-A acceptance.

Deployment Build Strategy: **on-server git clone + `npm ci` + workspace builds + `prisma migrate deploy` + systemd**. Lowest operational complexity for this monorepo (`argon2` native build on the host).

Layout:

```
/opt/ai-content-factory/
  current/          # checked-out release
  releases/         # optional extra checkouts
  shared/
    .env.production # mode 600, owner acf
    media/          # MEDIA_STORAGE_ROOT
    backups/postgres/
    backups/media/
```

User/group: `acf` / `acf`. Nginx does not read `.env.production`.

## 1. Provision VPS

Ubuntu 24.04 LTS. 2+ vCPU, 4+ GB RAM recommended (FFmpeg + Node). Disk for media.

## 2. Create app user

```
sudo useradd --system --create-home --home-dir /opt/ai-content-factory --shell /usr/sbin/nologin acf
```

SSH: prefer key auth. Do not copy workstation private keys into the repo or `/opt`. Do not automatically disable password auth in this phase.

## 3. Install dependencies

- Node.js **20 LTS** (engines: `>=20`)
- npm
- build-essential (argon2)
- git, curl, openssl
- nginx
- postgresql-16, redis
- ffmpeg + ffprobe (`ffmpeg -version`, `ffprobe -version`)
- ufw

## 4. PostgreSQL

See `phase-ii-a5-postgresql-vps-runbook.md`. Localhost only.

## 5. Redis

See `phase-ii-a5-redis-vps-runbook.md`. Localhost only, AOF on.

## 6. FFmpeg

`sudo apt-get install -y ffmpeg` and confirm both binaries on PATH. Not bundled.

## 7. Clone / copy application

```
sudo mkdir -p /opt/ai-content-factory/{current,releases,shared/media,shared/backups/postgres,shared/backups/media}
# clone the Phase II commercial tag (once it exists) into current/
sudo chown -R acf:acf /opt/ai-content-factory
```

## 8. Production env

Copy `deploy/env/.env.production.example` → `/opt/ai-content-factory/shared/.env.production`. Fill placeholders. `chmod 600`.

Must include: `NODE_ENV=production`, loopback hosts/ports, `COOKIE_SECURE=true`, `CORS_ORIGIN=https://YOUR_DOMAIN`, `BACKEND_URL=http://127.0.0.1:3001`, `NEXT_PUBLIC_API_BASE=/api`, `MEDIA_STORAGE_ROOT=/opt/ai-content-factory/shared/media`.

Douyin vars stay optional.

## 9. npm ci

As `acf`, from `current/`: `npm ci`.

## 10. build

```
npm run build -w frontend
npm run build -w backend
```

Worker uses `apps/backend/dist/worker.js`.

## 11. backup

Run `deploy/scripts/backup-postgres.sh` (empty DB is still a baseline). Enable `acf-backup.timer` after first success.

Off-server: daily `rsync`/`scp` of `shared/backups/` to another machine or disk. Not automated to a vendor in this package.

## 12. migrate deploy

`npm run db:migrate:deploy` only. No `migrate dev` / `db push` / reset / seed.

## 13. install systemd units

Copy `deploy/systemd/acf-*.service` and `acf-backup.timer` to `/etc/systemd/system/`. `daemon-reload`.

## 14. start services

```
sudo systemctl enable --now postgresql redis-server acf-backend acf-worker acf-frontend acf-backup.timer
```

Adjust postgres/redis unit names per distro.

## 15. Nginx

Install `deploy/nginx/ai-content-factory.conf` as `/etc/nginx/sites-available/ai-content-factory` and enable. Replace `YOUR_DOMAIN`. `nginx -t` && reload.

Public `/api/` is stripped to Nest (no `/api` prefix on the app). Pages go to Next `:3010`. Next rewrite is unused for Internet traffic.

## 16. DNS

Point `YOUR_DOMAIN` A record at the VPS. Not done in this phase.

## 17. Certbot

See `phase-ii-a5-certbot-https-runbook.md`.

## 18. firewall (UFW)

```
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do **not** allow 3001, 3010, 5432, 6379.

Public Ports: 22, 80, 443

Private-only Ports: 3001, 3010, 5432, 6379

## 19. health verification

`deploy/scripts/preflight.sh`

`deploy/scripts/health-check.sh`

`curl -sS http://127.0.0.1:3001/health`

`curl -sS https://YOUR_DOMAIN/api/health`

`journalctl -u acf-worker | grep 'Job worker started'`

## 20. browser smoke

HTTPS origin only: login, dashboard, one existing project. No HTTP login.
