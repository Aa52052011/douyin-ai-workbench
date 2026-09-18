# RC-09 Release Preparation and Deployment Readiness

Date: 2026-09-18
Mode: read-only audit. No `.env` / schema / git / business changes.

## 1. Identity

| Field | Value |
| --- | --- |
| RC | 0.9.0-rc.1 |
| Type | WEB_RC |
| Repo | `D:\project\ai-content-factory` |
| Remote | `git@github.com:Aa52052011/douyin-ai-workbench.git` |
| Baseline | `296e6d8c148eb77df16b5fc18b709262cf197009` / tag `v0.9.0-rc.1` |
| UI_UX | FROZEN_PASS, 9/9 frozen routes |

Primary Release Target: **WEB_RC**
Desktop/Tauri: **DEFERRED**
Production GA: **NOT_YET**

## 2. Live machine this morning (after overnight shutdown)

| Check | Result |
| --- | --- |
| Frontend production build | PASS (`next build`) |
| Backend production build | PASS (`nest build`) |
| `GET http://127.0.0.1:3001/health` | FAIL (nothing listening) |
| PostgreSQL `127.0.0.1:55432` | UNREACHABLE |
| Prisma migrate status | FAILED (P1001, cannot reach DB) |
| Redis `127.0.0.1:6379` | REACHABLE (TCP) |
| Worker `dist\worker.js` | NOT_RUNNING |
| FFmpeg | Available (`ffmpeg version 9.0.1-full_build`) |
| final-ui-regression | PASS (static selfcheck) |

This is **operator startup**, not a frozen-product defect.

## 3. Frontend production

- Build: `npm run build -w frontend` / `next build` — PASS
- Start: `npm run start -w frontend` → `next start` (Next default **3000**)
- Local RC convention in audits/scripts: **3010** (`next start -p 3010` or `PORT=3010`)
- 3010 is **not** hard-coded in `package.json`; it is the local RC habit vs README `localhost:3000`
- API: rewrite `/api/*` → `BACKEND_URL` default `http://localhost:3001`
- Static assets: READY (Next production output)

Frontend Production Port: **3000 default; local RC 3010**
Production Base URL Strategy: **PARTIAL** (`BACKEND_URL` / `NEXT_PUBLIC_API_BASE` overridable; defaults localhost)

## 4. Backend production

- Build: `npm run build -w backend`
- Start: `npm run start:prod -w backend` → `node dist/main`
- Port: `process.env.PORT ?? 3001`
- Health: `GET /health` → `{ service, status }` — READY in code
- Production bootstrap: validate env, Prisma `$connect`, Redis ping (`runtime-env.ts` / `main.ts`)
- Logs: Nest console logger (no dedicated file/log aggregator in RC)

## 5. Worker

- Dev: `npm run dev:worker` → backend `start:worker:dev`
- Prod: `npm run start -w workers` → `node ../apps/backend/dist/worker.js` (requires prior `nest build`)
- Redis Required: **YES** (`REDIS_URL`)
- Also needs `DATABASE_URL` and same media/FFmpeg env as backend
- Concurrency: BullMQ `concurrency: 2`
- Single Worker Guard: **LIMITATION** (no file lock / singleton; two workers can run)
- Duplicate backend `start:worker` vs `workers` package — same entry

## 6. PostgreSQL

Current: embedded/local cluster via `scripts/local-postgres.mjs` on **127.0.0.1:55432** (`acf_dev`). Docker Compose alternative: postgres:16 on **5432**.

Current DB Strategy: **local embedded Postgres for Windows dev (not a packaged production DB)**
Recommended Web RC DB Strategy: **keep local/embedded or Docker Postgres on this machine for LOCAL_WINDOWS_WEB_RC**; do not ship the `.tgz` binary as a product
Production DB Ready: **PARTIAL** (code + `prisma migrate deploy` exist; no hosted DB)
Migration Command (do not run here): `npm run db:migrate:deploy`

## 7. Redis

`REDIS_URL` (local `redis://127.0.0.1:6379`). Compose file includes `redis:7-alpine`. This host: port 6379 open; no Windows service named Redis/Memurai matched this morning.

Current Redis Strategy: **local Redis-compatible listener on 6379**
Production Redis Ready: **PARTIAL**

## 8. FFmpeg

Required: **YES** for real compose (`MEDIA_COMPOSE_PROVIDER=ffmpeg`)
Available: **YES** (9.0.1 on PATH; also `FFMPEG_PATH` / `FFPROBE_PATH` in local env names)
Deployment Strategy: **PARTIAL** (host install, not bundled)

## 9. Environment matrix (names only)

Root `.env.example` is **empty**. `database/.env.example` only documents `DATABASE_URL`. Runtime keys exist in local `.env` (values not listed).

**REQUIRED_FOR_WEB_RC:** `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `CORS_ORIGIN` (production), `MEDIA_STORAGE_ROOT` (production), `COOKIE_SECURE` (HTTPS)
**REQUIRED_FOR_DB:** `DATABASE_URL`
**REQUIRED_FOR_REDIS:** `REDIS_URL`
**REQUIRED_FOR_AUTH:** `JWT_ACCESS_SECRET`, `COOKIE_SECURE`
**REQUIRED_FOR_AI:** `MODEL_PROVIDER`, `MODEL_API_KEY`, `MODEL_BASE_URL`, `MODEL_NAME`, `MEDIA_IMAGE_PROVIDER`, `WANX_*`, `MEDIA_TTS_PROVIDER`, `MINIMAX_TTS_*`
**OPTIONAL:** `AI_ENGINE_URL`, `AI_ENGINE_SECRET`, `AGENT_DEBUG_PROMPTS`, `PORT`, `BACKEND_URL`, `NEXT_PUBLIC_API_BASE`, `FFMPEG_PATH`, `FFPROBE_PATH`, circuit-breaker vars
**FUTURE_DOUYIN:** `DOUYIN_CLIENT_KEY`, `DOUYIN_CLIENT_SECRET`, `DOUYIN_REDIRECT_URI`, `PLATFORM_SECRET_MASTER_KEY`

Environment Matrix: **PARTIAL**
Missing Documented Vars: root `.env.example` does not describe the matrix (treat as documentation gap, not live secret leak)

## 10. Secret rotation

Douyin Secret Rotation Before Real OAuth: **REQUIRED**
Also rotate before any shared/public host: `JWT_ACCESS_SECRET`, provider API keys, `PLATFORM_SECRET_MASTER_KEY`
Do not print values.

## 11. Douyin

Official Auto Publish: DEFERRED
Auto Metrics Fetch: DEFERRED
Platform Verification: NOT_VERIFIED
Manual Publish / Registration / Manual Metrics: READY (product)
OAuth vars present as **names** locally; callback is a tunnel-style HTTPS URI in prior audits — not a stable production domain.

Douyin OAuth: **PARTIAL / DEFERRED** for official flows
OAuth Callback Strategy: **PARTIAL** (needs stable HTTPS redirect matching Douyin console)

## 12. Auth / CORS / URLs

- Access token: in-memory on the client (`auth-session.ts`)
- Refresh: **httpOnly cookie**, `sameSite=lax`, `secure` iff `COOKIE_SECURE=true`
- Logout / logout-all routes exist
- Production CORS: `CORS_ORIGIN` required
- Dev CORS default: `http://localhost:3000` (drift vs RC frontend **3010**)

Auth Production Readiness: **PARTIAL** (works locally; HTTPS + COOKIE_SECURE + CORS_ORIGIN needed for public Web)
Hardcoded Localhost Risk: **yes, defaults** (`localhost:3001` rewrite, CORS 3000) — overridable
Production Base URL Strategy: **PARTIAL**

## 13. Media storage

`MEDIA_STORAGE_ROOT` or `./storage` (gitignored). Local filesystem provider only (`local://` keys).

Media Storage Strategy: **LOCAL_ONLY**
Persistence Risk: DB restore without media directory loses videos; two machines do not share files

## 14. Backup

Documented in `docs/release-web-v1.md` (`pg_dump` / `scripts/rc-pg-backup.mjs` + media root).
Backup Procedure Documented: **YES**
Rollback Data Strategy: **PARTIAL** (documented; not exercised this phase; live DB was down)

## 15. Logging / recovery

Logging: Nest/Next console — **PARTIAL**
Monitoring: product “monitoring” is **manual metrics**, not APM — **NOT_IN_RC**
Error recovery: job lease/heartbeat, user retry creates new Job, enqueue fail → FAILED — **PARTIAL**
Known Operational Risks: overnight stop of embedded Postgres; duplicate workers; no singleton; Redis required; FFmpeg host-dependent

## 16. Startup / shutdown

Startup Order:

1. PostgreSQL (`npm run db:local:start` or Docker `npm run db:up`)
2. Redis (already on 6379 this morning)
3. `npm run db:migrate:deploy` only if pending (do not reset)
4. Backend `npm run start:prod -w backend`
5. Worker `npm run start -w workers`
6. Frontend `npm run start -w frontend -- -p 3010` (or `next start -p 3010`)

Shutdown Order: Frontend → Worker → Backend → Redis (optional) → PostgreSQL

## 17. Clean machine

Node 22.19.0 / npm 10.9.3 / Git 2.55 / OpenSSH present / FFmpeg 9.0.1 on this PC.

Clean Machine Reproducibility: **PARTIAL**
Missing: filled root `.env.example`; one documented frontend port; Docker vs embedded Postgres choice; FFmpeg install; Redis install; Windows `ssh-agent` Disabled

## 18. Tauri

No `src-tauri`. Tauri RC: **NOT_READY** (not a Web RC blocker)

## 19. Deployment options

| Option | Status |
| --- | --- |
| A Local Windows Web RC | **READY** after starting local stack |
| B Single VPS Web RC | **PARTIAL** (env/CORS/HTTPS/storage/Postgres/Redis/FFmpeg must be provisioned) |
| C Cloud multi-service | **NOT_READY** |

Recommended Deployment Mode: **LOCAL_WINDOWS_WEB_RC**
Reason: frozen Web loop, local filesystem media, embedded/dev Postgres, HTTPS/OAuth/domain not production-ready. Most conservative.

## 20. Blockers (release-prep only)

| Severity | Count | Notes |
| --- | --- | --- |
| P0 | 0 | No product P0. Live DB/backend/worker down is operational. |
| P1 | 0 | |
| P2 | 4 | Empty `.env.example`; CORS 3000 vs UI 3010; no worker singleton; localhost URL defaults |
| P3 | 2 | Root README still “V1.0 MVP”; workspace package versions ≠ 0.9.0-rc.1 |

Deferred Douyin official publish is **not** a blocker.

## 21. Gates

LOCAL_WEB_RC_READY: **YES** (code/build/docs) / live stack **NO** until started
REMOTE_WEB_RC_READY: **PARTIAL**
TAURI_RC_READY: **NO**
PRODUCTION_GA_READY: **NO**

## 22. Git mutation

NO. This report and the checklist are working-tree only.

## 23. Gate this phase

**RC_09_BLOCKED** until PostgreSQL, backend health, migrations, and worker are running again on this machine (expected after shutdown). Re-run health after `db:local:start` + backend + worker; do not treat as a product regression.
