# Phase II-A.5 VPS rollback runbook

Destructive restore requires **explicit human authorization**. Prefer a **new** database for restore verification.

Commercial Release Tag: **NOT_CREATED_YET**. Keep previous `current/` as `releases/<stamp>` before each deploy.

## Bad app release

1. `systemctl stop acf-frontend acf-backend acf-worker`
2. Point `current` at the last known-good checkout (or copy from `releases/`)
3. `npm ci` + builds if artifacts missing
4. Start units. Do **not** run migrate down.

## Failed migration

1. Keep apps stopped.
2. Do **not** `prisma migrate down` as routine.
3. Restore the pre-deploy `-Fc` dump into a **new** database, verify, then retarget `DATABASE_URL` after authorization.
4. Re-deploy the previous application tree that matches that dump.

## Frontend failure

`journalctl -u acf-frontend`. Confirm `FRONTEND_HOST=127.0.0.1` and port 3010. Nginx `location /` → 3010. Rollback app tree if the build is broken.

## Backend failure

`journalctl -u acf-backend`. `/health` on 3001. Production env fail-fast: `COOKIE_SECURE`, `CORS_ORIGIN`, `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `MEDIA_STORAGE_ROOT`.

## Worker failure

Duplicate instance logs `Worker instance lock already held`. Wait 30s after a crash for lock TTL. One `acf-worker` unit only.

## Nginx config failure

`nginx -t` before reload. Revert to previous site file in `/etc/nginx`. Apps can keep running on loopback.

## Certificate problems

Keep port 80 for HTTP-01. `certbot renew`. Temporary HTTP-only proxy is for bring-up only — not for production login.

## Database recovery

Restore dump to a new DB name. Application switch is a `DATABASE_URL` change + restart. Never overwrite the live cluster as the default path.
