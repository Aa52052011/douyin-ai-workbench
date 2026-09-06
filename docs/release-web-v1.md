# Web V1 Release Runbook

Version target: **0.1.0-rc.1** (Web V1 Release Candidate)  
Scope: Web (Next.js frontend + NestJS backend + worker). **Tauri/Desktop is out of scope.**

Do not put real secrets in this document. Use environment variables / placeholders only.

---

## 1. Prerequisites

- Feature Freeze preserved (no new agents/UI/providers/product flows for this RC)
- Node.js `>=20` (see root `package.json` engines)
- PostgreSQL **16** reachable via `DATABASE_URL`
- Redis / Memurai reachable via `REDIS_URL` (worker + job queue)
- FFmpeg + FFprobe on `PATH` or via `FFMPEG_PATH` / `FFPROBE_PATH`
- Writable `MEDIA_STORAGE_ROOT` (default `./storage`)

## 2. Node version

```bash
node -v   # must be >= 20
npm -v
```

## 3. PostgreSQL

- Engine: PostgreSQL 16
- Apply schema with deploy migrations only in production-like environments:

```bash
npm run db:migrate:deploy
# or: npx prisma migrate deploy --schema database/prisma/schema.prisma
```

Never `prisma migrate reset` / drop production data as part of release.

## 4. Redis / Memurai

- Worker and backend job enqueue require Redis.
- Prefer an isolated Redis DB index for acceptance / RC smoke (example: `/15`).

## 5. FFmpeg

```bash
ffmpeg -version
ffprobe -version
```

Production compose provider must be `MEDIA_COMPOSE_PROVIDER=ffmpeg` (mock forbidden in production).

## 6. Required env (presence only — never log values)

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_ACCESS_SECRET` | Long random secret |
| `REDIS_URL` | Queue / worker |
| `CORS_ORIGIN` | Exact frontend origin in PUBLIC_HTTPS |
| `COOKIE_SECURE` | See deployment profiles |
| `MEDIA_STORAGE_ROOT` | Local object storage root |
| `MODEL_PROVIDER` | production: `real` or `router-one` (not `mock`) |
| `MODEL_API_KEY` / `MODEL_BASE_URL` / `MODEL_NAME` | required when real |
| `MEDIA_IMAGE_PROVIDER` | `color-background` or `wanx` (+ WANX_* if wanx) |
| `MEDIA_TTS_PROVIDER` | `openai-tts` or `minimax-tts` (+ keys) |
| `MEDIA_COMPOSE_PROVIDER` | `ffmpeg` |

## 7. Secret handling

- Never commit `.env`, API keys, JWT secrets, or dump Authorization headers into reports/git.
- Verify presence only: YES/NO.
- Rotate any secret that was ever printed or committed.

## 8. Install

```bash
npm ci
# or: npm install
npm run db:generate
```

## 9. Migration

```bash
npx prisma migrate status --schema database/prisma/schema.prisma
npm run db:migrate:deploy
```

Gate: **MIGRATIONS = CLEAN** (no pending, no unexpected drift). If pending → **STOP** (RC blocker).

## 10–12. Builds

```bash
npm run build -w frontend
npm run build -w backend
npm run build -w workers   # if workspace script present; else workers package build
```

## 13–14. Start order

1. PostgreSQL + Redis up  
2. Migrations applied  
3. Backend production: `NODE_ENV=production` + `node apps/backend/dist/main.js` (or workspace start)  
4. Worker production: same env family, isolated queue DB preferred  
5. Frontend: `npm run start -w frontend` (after `next build`)

## 15. Health checks

- `GET /health` → 200  
- Frontend `/login` → 200  
- Protected routes redirect/unauth as designed  
- Legacy debug routes under `/dashboard/agents|content-planning|scripts|videos|assets` → **404 in production**

## 16. Storage permissions

- `MEDIA_STORAGE_ROOT` must be writable by backend/worker processes.
- Default when unset: `./storage` **resolved relative to process cwd**.
  - Nest workspace starts from `apps/backend` → files land in `apps/backend/storage/` (gitignored).
  - Prefer an **absolute** path in PUBLIC_HTTPS / production profiles.
- Subdirs / object keys / temp `.part` files are created on write (`mkdir` recursive). Pre-create root if OS policy requires.
- Do **not** ship local generated media in the release git bundle.
- **Backup:** PostgreSQL dump does **not** include media; also back up the configured `MEDIA_STORAGE_ROOT`.

## 17. Backup before deployment

See § Backup below. Always backup **PostgreSQL + MEDIA_STORAGE_ROOT** before migrate/deploy.

## 18. Rollback procedure

1. Stop frontend / backend / worker.  
2. Restore PostgreSQL from last known-good `pg_dump` / custom dump.  
3. Restore `MEDIA_STORAGE_ROOT` from filesystem backup (DB restore alone is insufficient).  
4. Redeploy previous RC artifact / git tag.  
5. Re-check `/health`, login shell, one existing video preview/export.  
6. Do **not** re-run paid providers as part of rollback verification unless explicitly approved.

## 19. Log locations

- Process stdout/stderr (service manager / terminal)
- Optional local acceptance logs under `.local/` (gitignored)
- Application must not log full prompts/API keys when `AGENT_DEBUG_PROMPTS=false`

## 20. Known limitations

See `docs/web-v1-rc-checklist.md` § Known Limitations.

## 21. Provider readiness

- Production fail-closed: mock providers forbidden where runtime-env enforces.
- RC smoke / gate steps must **not** call paid Router One / Wanx / MiniMax unless a later step explicitly authorizes.

## 22. PUBLIC_HTTPS cookie requirements

| Profile | `COOKIE_SECURE` | `CORS_ORIGIN` |
| --- | --- | --- |
| **LOCAL_RC** | `false` | `http://localhost:3000` (or local frontend origin) |
| **PUBLIC_HTTPS** | `true` | Exact `https://…` frontend origin (**not** `*`) |

Refresh token is HttpOnly cookie; Secure flag must match transport.

---

## Backup (PostgreSQL 16)

Placeholders only:

```bash
# Backup (custom format recommended — requires PostgreSQL client tools)
mkdir -p backups
pg_dump --format=custom --file=backups/acf_web_v1_rc.dump "$DATABASE_URL"

# List archive (no restore)
pg_restore --list backups/acf_web_v1_rc.dump

# Restore into TEMP database only (never overwrite acf_dev casually)
createdb acf_rc_restore_test
pg_restore --dbname="$DATABASE_URL_RESTORE_TEST" backups/acf_web_v1_rc.dump
# verify _prisma_migrations + sample counts, then drop temp DB
dropdb acf_rc_restore_test
```

If `pg_dump` is not on PATH (embedded Postgres server-only install), install PostgreSQL 16 client tools, or use the RC helper:

```bash
node scripts/rc-pg-backup.mjs
# optional follow-up: node scripts/rc-restore-validate.mjs
```

**Note:** plain-SQL helper is for RC smoke of key tables (`users` / `projects` / `videos` / `_prisma_migrations`). Production backups should use `pg_dump -Fc` of the full database.
**Media:** DB dump does **not** include files under `MEDIA_STORAGE_ROOT`. Production backup = PostgreSQL **+** media root (V1 local storage). Future S3 = separate object-storage policy.

---

## Runtime directories

| Question | Rule |
| --- | --- |
| Auto-create? | Yes on put (`mkdir` parent of key); ensure root exists/writable |
| Pre-create? | Recommended for production mount; not strictly required if process can mkdir |
| Writable? | Required (P1 if not) |
| gitignore? | `/storage`, `apps/backend/storage/`, `uploads/`, `exports/`, `.local/`, `*.part` |
| Backup? | Entire `MEDIA_STORAGE_ROOT` |
| Release bundle? | Must **not** include local generated media |
