# RC-09 Pre-release Checklist (0.9.0-rc.1 WEB_RC)

Do not record secret values. Operator checks boxes after overnight restart.

## Git / identity

- [ ] `main` HEAD is `296e6d8c148eb77df16b5fc18b709262cf197009`
- [ ] Tag `v0.9.0-rc.1` points at the same commit (local and `origin`)
- [ ] `.env` is not tracked; no dumps / `dump.rdb` / embedded Postgres `.tgz` in git

## Builds

- [ ] `npm run build -w frontend` PASS
- [ ] `npm run build -w backend` PASS
- [ ] `final-ui-regression` PASS (optional before launch)

## Local runtime (start in order)

1. PostgreSQL: `npm run db:local:start` (or Docker `npm run db:up`)
2. Confirm Redis `127.0.0.1:6379`
3. `npx prisma migrate status --schema database/prisma/schema.prisma` CLEAN (do not reset)
4. Backend: `npm run start:prod -w backend` (port 3001)
5. Worker: `npm run start -w workers` (one process)
6. Frontend: `npx next start -p 3010` from `apps/frontend` (or equivalent)

Then:

- [ ] `GET http://127.0.0.1:3001/health` → 200
- [ ] Database reachable
- [ ] Migrations CLEAN
- [ ] Redis reachable
- [ ] Worker running (single instance)
- [ ] Frontend reachable (3010 or documented port)
- [ ] FFmpeg available (`ffmpeg -version`)

## Environment (names present)

- [ ] `DATABASE_URL`
- [ ] `REDIS_URL`
- [ ] `JWT_ACCESS_SECRET`
- [ ] `CORS_ORIGIN` (if not local-only)
- [ ] `MEDIA_STORAGE_ROOT` (production-like)
- [ ] Model / TTS / image provider vars as used
- [ ] `MEDIA_COMPOSE_PROVIDER=ffmpeg` for real compose

## Secrets

- [ ] No secrets committed
- [ ] Douyin `CLIENT_SECRET` rotated before any real OAuth
- [ ] JWT / provider / `PLATFORM_SECRET_MASTER_KEY` reviewed if exposing the host

## Product smoke (frozen 9 routes)

- [ ] Dashboard / project overview
- [ ] Positioning
- [ ] Content plans
- [ ] Scripts
- [ ] Videos
- [ ] Publish (manual)
- [ ] Performance / monitoring (manual metrics)
- [ ] Manual publication works
- [ ] Manual metrics works
- [ ] AI review / accepted-only handoff works
- [ ] Current-cycle vs historical isolation still holds

## Explicitly not required for this WEB_RC

- Official Douyin auto-publish
- Auto metrics fetch
- Platform verification
- Tauri / desktop installer
- Production GA / multi-region cloud
