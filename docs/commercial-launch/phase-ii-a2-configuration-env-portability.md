# Phase II-A.2 Configuration and Env Portability

Date: 2026-09-18

Git: not staged, not committed.

## 1. Phase

II-A.2_CONFIGURATION_AND_ENV_PORTABILITY

Baseline HEAD: `4f716c0409d373d1379287edf1d2a4515099dd49` (unchanged)

## 2. Original problems

- Root `.env.example` was empty
- Production CORS/cookie gaps (`COOKIE_SECURE` warning-only; CORS default `localhost:3000`)
- Nest `listen(PORT)` with no host (all interfaces)
- Next `start` default port 3000 / all interfaces; rewrite `BACKEND_URL` silent localhost fallback
- Shared `.env` `PORT` would collide with Next if both used `PORT`

## 3. Env variable matrix

Names only. Values never copied from the local `.env`.

### Frontend

`NEXT_PUBLIC_API_BASE`, `BACKEND_URL`, `FRONTEND_HOST`, `FRONTEND_PORT`, `NODE_ENV`

### Backend

`NODE_ENV`, `BACKEND_HOST`, `BACKEND_PORT`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_SEC`, `JWT_REFRESH_EXPIRES_SEC`, `CORS_ORIGIN`, `CORS_ORIGINS`, `COOKIE_SECURE`, `MEDIA_STORAGE_ROOT`, `MEDIA_MAX_UPLOAD_BYTES`, `MEDIA_COMPOSE_PROVIDER`, `MEDIA_IMAGE_PROVIDER`, `MEDIA_TTS_PROVIDER`, `MEDIA_DIGITAL_HUMAN_PROVIDER`, `MEDIA_VOICE_CLONE_PROVIDER`, `MODEL_PROVIDER`, `MODEL_API_KEY`, `MODEL_BASE_URL`, `MODEL_NAME`, `MODEL_FALLBACK_1_NAME`, `MODEL_CIRCUIT_*`, `WANX_*`, `MINIMAX_TTS_*`, `TTS_*`, `FFMPEG_*`, `FFPROBE_PATH`, `ACF_JOB_QUEUE_NAME`, `JOB_LEASE_TIMEOUT_MS`, `JOB_HEARTBEAT_INTERVAL_MS`, `DOUYIN_*`, `PLATFORM_SECRET_MASTER_KEY`, `AI_ENGINE_URL`, `AI_ENGINE_SECRET`, `CROP_REVIEW_REPO_ROOT`

No `JWT_REFRESH_SECRET` exists. Refresh is DB + cookie `acf_rt`.

### Worker

Same file/process env as backend. No extra host bind. `validateRuntimeEnvironment({ role: 'worker' })`.

### Database

`DATABASE_URL` (`database/.env.example` still documents the Compose URL shape)

### Shared

`NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, provider keys, `MEDIA_STORAGE_ROOT`

Required Env Vars (boot + typical real providers, documented in root example): **24** assigned placeholders in `.env.example` (plus optional commented names).

## 4. .env.example changes

Root `.env.example` filled with sections: Runtime, Frontend, Backend, Database, Redis, Authentication, AI/Model, Media, Jobs, Douyin (Deferred), Platform Security.

Placeholders only (`USERNAME:PASSWORD`, `CHANGE_ME_*`). Postgres/Redis loopback notes included.

`.env.example`: **COMPLETE**

## 5. Frontend config

Frontend API Base URL Strategy: **SAME_DOMAIN_PATH_BASED** — browser `NEXT_PUBLIC_API_BASE` default `/api`; Next rewrites to `BACKEND_URL`.

Production `next start`: `BACKEND_URL` required (fail-fast in `start-prod.mjs` and in rewrite helper when argv includes `start`).

`next build` may use compile dummy `http://127.0.0.1:3001` only when `BACKEND_URL` is unset (not a browser URL).

## 6. Backend host/port

`resolveBackendListen()`: `BACKEND_PORT` ?? `PORT` ?? 3001.

Production default host: `127.0.0.1`. Development: no host (previous all-interfaces behavior). Explicit `BACKEND_HOST` always wins.

Backend Bind Configurable: **YES**

## 7. Frontend host/port

Next does not read `FRONTEND_*` natively. `apps/frontend/scripts/start-prod.mjs` runs `next start -H FRONTEND_HOST -p FRONTEND_PORT` with defaults `127.0.0.1` / `3010`. Does **not** use `PORT` (avoids colliding with backend).

`next dev` unchanged (port 3000) for local development compatibility.

Frontend Bind Configurable: **YES**

## 8. CORS

`CORS_ORIGIN` or `CORS_ORIGINS`, comma-separated. `credentials: true`. Wildcard `*` rejected in all environments.

Production missing origin: fail-fast. Development unset: `http://localhost:3000` (existing `next dev` default).

CORS Production Configurable: **YES**

Wildcard: **NO**

## 9. Cookie Secure enforcement

Refresh cookie `acf_rt` is httpOnly, `sameSite=lax`, `secure` iff `COOKIE_SECURE=true`.

`NODE_ENV=production` and `COOKIE_SECURE !== true` → `COOKIE_SECURE must be true in production`.

Cookie Secure Production Enforcement: **PASS**

## 10. Provider configuration

Unchanged Router One / OpenAI-compatible `MODEL_*`, Wanx, MiniMax. Production still requires keys when those providers are selected. No hardcoded keys added.

## 11. Douyin deferred

Listed in `.env.example` as comments. Boot tests delete Douyin + `PLATFORM_SECRET_MASTER_KEY` and still pass.

## 12. Worker env alignment

Worker bootstrap uses the same `validateRuntimeEnvironment`. No worker-specific localhost production bind.

Worker Env Alignment: **PASS**

## 13. Fail-fast validation

Covered in `runtime-env.ts` + vitest: missing DB/CORS/Redis/JWT/media, wildcard CORS, insecure cookie, valid production config, Douyin not required.

Production Fail-fast: **PASS**

## 14. Localhost re-scan

Production Blocker: **0**

Remaining localhost/port hits are DEV_DEFAULT, TEST_ONLY, compile dummy, or configurable loopback (`BACKEND_URL=http://127.0.0.1:3001` is correct behind Nginx).

## 15. Build results

- Frontend production build: **PASS**
- Backend `nest build`: **PASS** (worker artifact `dist/worker.js`)
- Config tests: 36 passed
- `backend-rewrite-url.selfcheck`: **PASS**

## 16. Local runtime regression

Did not restart Postgres/Redis. Did not mutate DB.

Restarted Frontend only onto `start-prod.mjs` (`127.0.0.1:3010`). Backend PID 15088 and Worker PID 12512 left running (`--env-file=.env`).

| Check | Result |
| --- | --- |
| `GET http://127.0.0.1:3001/health` | 200 |
| Frontend `http://127.0.0.1:3010` | 200 |
| Postgres `127.0.0.1:55432` | REACHABLE |
| Redis `127.0.0.1:6379` | REACHABLE |
| Worker `dist/worker.js` | 1 |

Local Runtime Regression: **PASS**

## 17. Production config simulation

Placeholder env via vitest `productionBase()` — no production database connection.

- valid production env: pass
- missing critical env: fail
- `COOKIE_SECURE=false`: fail
- HTTPS CORS origin: pass

Production Config Simulation: **PASS**

## 18. Secret scan

Tracked Secret: **0**

Real Credential: **0**

Private Key: **0**

`.env`: **NOT_TRACKED**

`.env.example`: **SAFE**

## 19. Modified files

1. `.env.example`
2. `apps/backend/src/config/runtime-env.ts`
3. `apps/backend/src/config/runtime-env.spec.ts`
4. `apps/backend/src/config/cors-origin.ts` (new)
5. `apps/backend/src/config/cors-origin.spec.ts` (new)
6. `apps/backend/src/config/listen-config.ts` (new)
7. `apps/backend/src/config/listen-config.spec.ts` (new)
8. `apps/backend/src/configure-app.ts`
9. `apps/backend/src/main.ts`
10. `apps/frontend/next.config.ts`
11. `apps/frontend/package.json`
12. `apps/frontend/scripts/start-prod.mjs` (new)
13. `apps/frontend/src/lib/backend-rewrite-url.ts` (new)
14. `apps/frontend/src/lib/backend-rewrite-url.selfcheck.ts` (new)
15. `docs/commercial-launch/phase-ii-a2-configuration-env-portability.md` (this file)

Modified Files: **15**

No other product files.

## 20. DB mutation

Schema Change: **NO**

Migration: **NO**

Business Data Mutation: **NO**

## 21. Git mutation

Not staged. Not committed. Not pushed.

Git Mutation: **NO**

## 22. Remaining VPS blockers

P0: Nginx+HTTPS, systemd auto-start, live VPS env/firewall (compose must not publish PG/Redis)

P1: `trust proxy`, worker process singleton, scheduled backup, production migrate-deploy rehearsal

P2: CORS multi-host ops, readiness health, structured logs, upload RAM, crop-review cwd

## 23. Gate

CONFIGURATION_AND_ENV_PORTABILITY_READY
