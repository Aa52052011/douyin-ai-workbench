# Phase II-A.1 Single VPS Production Gap Audit

Date: 2026-09-18

Mode: read-only. No source, env, DB, Git, or VPS mutation.

## 0. Frozen baseline

| Field | Value |
| --- | --- |
| Repository | `D:\project\ai-content-factory` |
| Current main HEAD | `4f716c0409d373d1379287edf1d2a4515099dd49` |
| Product Baseline | `296e6d8c148eb77df16b5fc18b709262cf197009` |
| Product Tag | `v0.9.0-rc.1` → product baseline |
| Release Class | `LOCAL_WINDOWS_WEB_RC` **ACCEPTED** |
| Target | `SINGLE_VPS_WEB_RC` (one VPS, one domain, HTTPS, FE+BE+Worker+PG+Redis+FFmpeg+disk media) |
| Out of scope | K8s, multi-region, HA, Tauri, official Douyin auto-publish, auto metrics |

## 1. Architecture fit

Current product already runs as three Node processes plus Postgres plus Redis plus host FFmpeg. That maps to a single VPS without a rewrite.

Recommended topology (matches existing Next `/api` rewrite and httpOnly cookie `path=/`):

**SAME_DOMAIN_PATH_BASED**

- `https://app.example.com` → Next.js frontend
- `https://app.example.com/api/` → Nest backend (`BACKEND_URL=http://127.0.0.1:3001`)
- Browser keeps `NEXT_PUBLIC_API_BASE=/api` (default)
- Refresh cookie `acf_rt` remains first-party same-site `Lax`

Subdomains (`app.` + `api.`) are **less compatible**: no `COOKIE_DOMAIN`, CORS credentials required, cookie will not be sent cross-subdomain without extra code.

## 3. Frontend production audit

- Build: `npm run build -w frontend` (`next build`) — exists and was used in RC.
- Start: `npm run start -w frontend` → `next start` (default port **3000**, not 3010).
- Host: Next binds all interfaces by default; no `-H 127.0.0.1` in scripts.
- API: `next.config.ts` rewrites `/api/:path*` → `process.env.BACKEND_URL ?? "http://localhost:3001"`. On a same-VPS path-based proxy, leaving `BACKEND_URL=http://127.0.0.1:3001` is correct (loopback, not public).
- Client API: `NEXT_PUBLIC_API_BASE` defaults to `/api` with `credentials: "include"` + Bearer access token in memory (`apps/frontend/src/lib/api.ts`, `auth-session.ts`). Access token is **not** in localStorage.
- Headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options DENY`, `Permissions-Policy`.
- Body/timeout for rewrite: `proxyClientMaxBodySize: 128mb`, `proxyTimeout: 240000` (needed for uploads and long agent POSTs).

Frontend hardcoded localhost in `apps/frontend` (runtime, not docs): **1** (`next.config.ts` default `BACKEND_URL`).

Frontend Production Start: **PARTIAL** (build/start exist; port/host/BACKEND_URL must be set for VPS)

Frontend Host Binding: **PARTIAL** (all interfaces unless Nginx + firewall)

Frontend Base URL Configuration: **PARTIAL** (overridable; defaults are local)

Frontend Hardcoded Localhost Count: **1**

## 4. Backend production audit

- Build: `npm run build -w backend`
- Start: `npm run start:prod -w backend` → `node dist/main`
- Production bootstrap (`main.ts`): `validateRuntimeEnvironment`, `enableShutdownHooks`, Prisma `$connect`, Redis ping, then `listen(PORT ?? 3001)` — **no HOST argument** (listens on all interfaces).
- CORS: `configure-app.ts` — production uses `CORS_ORIGIN` (required by validator); non-production defaults `http://localhost:3000`; `credentials: true`.
- `trust proxy`: **not set**. Login IP uses `x-forwarded-for` first (`auth.controller.ts`) — spoofable until Nginx + `trust proxy` are aligned.
- JSON body: Nest/Express default (~100kb) for JSON; uploads use Multer memory with `MEDIA_MAX_UPLOAD_BYTES` default **128MB**.
- Media: not static-dir listing. Bytes served through authenticated asset/video APIs (`local://` keys, not public URLs).
- Health: `GET /health` → `{ service: "backend", status: "ok" }` — liveness only (no DB/Redis check).
- Graceful shutdown: `enableShutdownHooks()` present; no extra drain timeout documented.

Backend Production Start: **PARTIAL**

Backend Host Binding: **PARTIAL**

CORS: **PARTIAL** (configurable; single origin; hardcoded dev default)

Health Endpoint: **READY** (liveness)

Graceful Shutdown: **PARTIAL**

## 5. CORS exact audit

Current allowed origins:

- Production: **only** `process.env.CORS_ORIGIN` (string, not array). Missing → process refuses to start.
- Non-production default: `http://localhost:3000` (not 3010).

Production Origin Configurable: **YES**

Hardcoded Dev Origin: **YES** (`http://localhost:3000`)

Required Change: set `CORS_ORIGIN=https://<public-host>` (no trailing path). Prefer same-domain so browser calls `/api` same-origin and CORS is backup only. If both apex and `www` are needed, **code change** (array/split) — not required if DNS is a single host.

## 6. Environment variable audit

Root `.env.example`: **empty (0 bytes)**. `database/.env.example` documents only `DATABASE_URL` (Compose `localhost:5432` / local cluster `55432`).

Production validator (`runtime-env.ts`) **requires** when `NODE_ENV=production`:

- `JWT_ACCESS_SECRET`
- `DATABASE_URL`
- `CORS_ORIGIN`
- `REDIS_URL`
- `MEDIA_STORAGE_ROOT`

Also required by provider selection (typical paid VPS RC):

- `MODEL_PROVIDER=real` → `MODEL_API_KEY`, `MODEL_BASE_URL` (https), `MODEL_NAME`
- `MEDIA_IMAGE_PROVIDER=wanx` → `WANX_API_KEY`, `WANX_BASE_URL` (https)
- `MEDIA_TTS_PROVIDER=minimax-tts` → `MINIMAX_TTS_API_KEY`, `MINIMAX_TTS_VOICE`, `MINIMAX_TTS_BASE_URL` (https)
- `MEDIA_COMPOSE_PROVIDER=ffmpeg` (+ host ffmpeg/ffprobe)
- `COOKIE_SECURE=true` — **warning only**, not a hard fail
- Production forbids `MEDIA_*_PROVIDER=mock` for compose / digital-human / voice-clone mocks

Optional / feature-gated (not SINGLE_VPS paid-web blockers):

- Douyin OAuth: `DOUYIN_CLIENT_KEY`, `DOUYIN_CLIENT_SECRET`, `DOUYIN_REDIRECT_URI` (https), `DOUYIN_OAUTH_*`
- `PLATFORM_SECRET_MASTER_KEY` (32-byte base64) — required to **store** platform secrets; not required for email/password login + manual publication
- `AI_ENGINE_URL` / `AI_ENGINE_SECRET` (external agent engine)

### Required / operator-facing names (names only)

Core: `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_SEC`, `JWT_REFRESH_EXPIRES_SEC`, `CORS_ORIGIN`, `COOKIE_SECURE`, `MEDIA_STORAGE_ROOT`, `MEDIA_MAX_UPLOAD_BYTES`, `MEDIA_COMPOSE_PROVIDER`, `MEDIA_IMAGE_PROVIDER`, `MEDIA_TTS_PROVIDER`, `BACKEND_URL`, `NEXT_PUBLIC_API_BASE`

LLM: `MODEL_PROVIDER`, `MODEL_API_KEY`, `MODEL_BASE_URL`, `MODEL_NAME`, `MODEL_FALLBACK_1_NAME`, `MODEL_CIRCUIT_FAILURE_THRESHOLD`, `MODEL_CIRCUIT_COOLDOWN_MS`

Image: `WANX_API_KEY`, `WANX_BASE_URL`, `WANX_MODEL`, `WANX_SIZE`, `WANX_TIMEOUT_MS`, `WANX_MAX_RESPONSE_BYTES`, `VISUAL_MAX_CONCURRENCY`, `VISUAL_SEMANTIC_MODEL`

TTS: `MINIMAX_TTS_API_KEY`, `MINIMAX_TTS_BASE_URL`, `MINIMAX_TTS_VOICE`, `MINIMAX_TTS_MODEL`, `MINIMAX_TTS_FORMAT`, `MINIMAX_TTS_LANGUAGE_BOOST`, `MINIMAX_TTS_TIMEOUT_MS`, `MINIMAX_TTS_MAX_RESPONSE_BYTES`, `TTS_API_KEY`, `TTS_BASE_URL`, `TTS_MODEL`, `TTS_VOICE`, `TTS_FORMAT`, `TTS_TIMEOUT_MS`, `TTS_MAX_RESPONSE_BYTES`

FFmpeg: `FFMPEG_PATH`, `FFPROBE_PATH`, `FFMPEG_TIMEOUT_MS`, `FFMPEG_MAX_CONCURRENCY`

Jobs: `ACF_JOB_QUEUE_NAME`, `JOB_LEASE_TIMEOUT_MS`, `JOB_HEARTBEAT_INTERVAL_MS`

Other runtime: `PLATFORM_SECRET_MASTER_KEY`, `CROP_REVIEW_REPO_ROOT`, `ACF_REPO_ROOT`, `AGENT_DEBUG_PROMPTS`, `MEDIA_DIGITAL_HUMAN_PROVIDER`, `MEDIA_VOICE_CLONE_PROVIDER`

Documented in committed examples: `DATABASE_URL` only.

Required Env Vars (operator core + typical real providers): **~25**

Documented Env Vars: **1** (`DATABASE_URL` in `database/.env.example`)

Missing From `.env.example`: **all others (root file empty)**

Production Env Documentation: **PARTIAL**

## 7. Localhost / fixed port audit

Classification of code/runtime (excluding docs, dogfood scripts, vision “localhost in screenshot” semantics):

| Ref | Class |
| --- | --- |
| `BACKEND_URL` default `http://localhost:3001` | C (same-VPS loopback OK) |
| CORS default `http://localhost:3000` | C (ignored when `NODE_ENV=production`) |
| `next start` port 3000 | C |
| Nest `PORT` default 3001 | C |
| Compose Postgres 5432 / Redis 6379 | C |
| Windows embedded PG `55432` / `scripts/local-postgres.mjs` | B DEV_ONLY |
| Frontend RC habit 3010 | B DEV_ONLY |
| database test harness 5432/55432 | A test-only |
| UAT scripts `127.0.0.1:3001/3010` | A/B |

Production-impacting Localhost References: **2** (defaults; both overridable; not hard blockers if env is set)

Production-impacting Fixed Port References: **2** (FE 3000, BE 3001 — must be firewalled; Nginx 443 is the public port)

No production D-class hardcoded public `localhost` URL in the paid browser path.

## 8. Worker production audit

- Start: `npm run start -w workers` → `node ../apps/backend/dist/worker.js` (`worker.ts`)
- Same env validation as API in production, plus Prisma + Redis ping
- BullMQ `Worker` on `ACF_JOB_QUEUE_NAME` default `acf-jobs`, **concurrency 2**, Redis `maxRetriesPerRequest: null`
- Queue jobs: `attempts: 3`, exponential backoff 1000ms, `removeOnComplete: true`, `removeOnFail: false`
- DB job lease + heartbeat (`JOB_LEASE_TIMEOUT_MS` default 90s / heartbeat 15s) skips another worker stealing a **fresh** lease — **partial** duplicate protection, not a process singleton
- SIGTERM/SIGINT → `worker.close()` + Nest `app.close()` + Prisma disconnect
- Crash: process exits; **no** supervisor in repo → depends on systemd/PM2
- Two workers can run; operator must keep count = 1

Worker Production Start: **PARTIAL**

Duplicate Worker Protection: **MISSING** (process-level); job-lease is PARTIAL

Graceful Shutdown: **PARTIAL** (handlers exist; no timeout/force-kill policy)

Retry Behavior: BullMQ 3 attempts, exponential 1s; failed jobs kept (`removeOnFail: false`)

## 9. PostgreSQL VPS strategy

- Prisma `provider = postgresql`, `url = env("DATABASE_URL")`
- IDs: Prisma `@default(uuid(7))` **client-side**, not a Postgres extension
- No citext / PostGIS / pgvector in schema
- Init script `database/docker/init.sql` only creates `acf_test`
- Migrate: `npm run db:migrate:deploy` (`prisma migrate deploy`)
- RC used PG 16 on Windows embedded cluster; Compose image `postgres:16-alpine`

PostgreSQL VPS: **PARTIAL** (app ready; VPS install/bind/backup not packaged)

Required Version: **PostgreSQL 16** (match Compose / RC)

Extensions: **none required**

Migration Strategy: create empty DB + role → `prisma migrate deploy` (do **not** restore Windows `acf_dev` validation dump onto production)

## 10. Redis VPS strategy

- Standard Redis URL via ioredis / BullMQ 6
- Compose already uses `--appendonly yes`
- Used for jobs **and** Douyin OAuth state (`oauth:douyin:{sha256}`)
- Localhost Redis on VPS is **correct** if bound to `127.0.0.1` only

Redis VPS: **PARTIAL**

Persistence Recommended: **YES** (AOF; jobs + OAuth state)

## 11. Media storage audit

Implementation: `LocalStorageProvider` + `path.resolve` + POSIX/Windows `path.sep`. Keys `v1/<uuids>/...`. Atomic write via `.part` + `rename`.

Default root if unset: `./storage` relative to **process cwd**. Production **requires** `MEDIA_STORAGE_ROOT`.

Runtime writable paths:

- `MEDIA_STORAGE_ROOT` (uploads, generated audio/images/videos)
- `os.tmpdir()` during ffprobe/quality (`acf-qg-*`) and some compose/preview temps
- Crop-review / production-v2 sidecars under `CROP_REVIEW_REPO_ROOT ?? process.cwd()` if those routes are used
- No Windows drive-letter requirement in storage provider

Linux Path Compatibility: **PASS** for core media if `MEDIA_STORAGE_ROOT` is an absolute Linux path (e.g. `/var/lib/acf/media`)

Media Storage: **PARTIAL** (code OK; cwd-relative default and crop-review cwd are operator traps)

Writable Directories: `MEDIA_STORAGE_ROOT`, OS temp, optional crop-review root

Backup binaries must **not** be git; media is **outside** SQL dump (already noted in RC-10)

## 12. FFmpeg Linux compatibility

- `ffmpegBin()` = `FFMPEG_PATH` or `ffmpeg`
- `ffprobeBin()` = `FFPROBE_PATH` or `ffprobe`
- Spawn via `run-process` / `spawnSync`, not a Windows `.exe` path
- Compose provider `ffmpeg` required in production (mock forbidden)
- Not bundled; RC Windows had 9.0.1 — Linux distro ffmpeg 6/7 is expected to work for current filter graphs; **rehearse** on target VPS

FFmpeg Linux VPS Compatibility: **READY** (PATH-based; confirm package on VPS)

FFmpeg Required Binaries: `ffmpeg`, `ffprobe`

## 13. File permission audit

Required writable paths: `MEDIA_STORAGE_ROOT`, `/tmp` (or `TMPDIR`), process cwd only if crop-review defaults used.

Startup directory creation: **AUTOMATIC** for media keys (`mkdirSync` recursive on put); **MANUAL** to choose/chown the root directory.

Linux Permission Risk: **MEDIUM** (wrong cwd or unwritable root → video fail; running Node as root is unnecessary)

## 14. Reverse proxy

Recommended Proxy Topology: **SAME_DOMAIN_PATH_BASED**

Reason: Next already proxies `/api`; cookies `path=/`; client default `/api`; long timeouts and 128MB bodies already configured on the Next rewrite. Nginx should terminate TLS and proxy `/` to Next (3000) and optionally still let Next rewrite to Nest, **or** proxy `/api/` directly to Nest 3001 (then Next `BACKEND_URL` unused for browser). Direct Nginx `/api/` → 3001 is slightly simpler for cookies if `Host` and `X-Forwarded-*` are set.

No WebSocket in `apps/backend/src`.

## 15. HTTPS / secure auth

Auth Transport:

- Access: JWT in JSON body; frontend memory + `Authorization: Bearer`
- Refresh: httpOnly cookie `acf_rt`, `secure` iff `COOKIE_SECURE=true`, `sameSite=lax`, `path=/`
- CORS `credentials: true`

HTTPS Required: **YES** for paid internet users

Production Auth Readiness: **PARTIAL** (`JWT_ACCESS_SECRET` enforced; `COOKIE_SECURE` not enforced; no `trust proxy`; no `COOKIE_DOMAIN`)

## 16. Public URL / callback

- Frontend public URL: DNS + Nginx only (no `PUBLIC_URL` env in app)
- Backend public URL: not required if path-based `/api`
- Media: no public object URL; downloads go through API
- Douyin: `DOUYIN_REDIRECT_URI` must be https public path registered with Douyin — **DEFERRED** for first paid VPS if product stays MANUAL publication (RC acceptance)

Public URL Configuration: **PARTIAL** (ops/DNS; little code)

Douyin Callback: **DEFERRED**

## 17. Process supervision

Current Process Supervisor: **none** for Node. Compose `restart: unless-stopped` only for postgres/redis. Windows RC was manual processes.

Production Supervisor: **MISSING**

Recommended: **systemd** (matches `node dist/main` / `node dist/worker.js` / `next start`; reboot; journald). PM2 is acceptable; Docker Compose for **app** would require new Dockerfiles (more change).

## 18. Restart / reboot recovery

Postgres/Redis: Compose `restart` **if** that compose stack is used and enabled at boot; native packages need `enable`.

Frontend/Backend/Worker: **no** unit files.

Auto Start After Reboot: **MISSING** (app); **PARTIAL** (DB/Redis only if installed as services)

## 19. Logging

Nest `Logger` / `console.error` on bootstrap failure. Worker logger levels `error|warn|log`. Frontend Next stdout. No file rotation, no JSON shipper.

Single-VPS RC can use **journalctl -u acf-backend -u acf-worker** once systemd exists.

Logging: **PARTIAL**

## 20. Backup

Existing: local RC `pg_dump` policy + freeze dump (Windows paths). Not a VPS cron. Media not in SQL.

Production DB Backup: **MISSING** (on VPS)

Media Backup: **MISSING**

Off-server Backup: **MISSING**

## 21. Security — minimum VPS baseline

Critical Security Blockers:

1. If `docker-compose.yml` is used **as committed**, Postgres `acf:acf` and Redis with **published** `5432`/`6379` on all interfaces.
2. Nest/Next listen on all interfaces with no in-repo firewall/HOST bind — public 3000/3001 would bypass Nginx auth/TLS.

Security P1:

- `COOKIE_SECURE` warning-only in production
- `trust proxy` unset + `x-forwarded-for` trusted
- Compose default DB password if copied
- `AGENT_DEBUG_PROMPTS=true` would log prompts (must stay false)
- Health unauthenticated (OK if not exposing extra data; do not put it on a debug profile)

Security P2:

- CORS single origin only
- No rate-limit middleware
- Multer 128MB memory uploads (DoS/RAM) — mitigate with Nginx `client_max_body_size` and systemd MemoryMax
- JWT refresh secret is the same `JWT_ACCESS_SECRET` family (access secret only)

Critical Security Blockers: **2**

Security P1: **5**

Security P2: **4**

## 22. Nginx requirement matrix

- HTTPS termination (Let’s Encrypt)
- Proxy `/` → Next `:3000`
- Proxy `/api/` → Nest `:3001` **or** Next rewrite
- No WebSocket required
- `client_max_body_size` ≥ 128m (library MP4)
- `proxy_read_timeout` ≥ 240s (agent + video jobs are async, but some POSTs are long)
- Do not directory-list `MEDIA_STORAGE_ROOT`
- Cache `/_next/static` if desired
- Forward `Host`, `X-Forwarded-Proto`, `X-Forwarded-For`

## 23. Domain / DNS

- One A (or AAAA) to VPS
- Optional `www` CNAME — avoid unless CORS array is added
- TLS certificate for that host
- Douyin callback impact: none until OAuth enabled; then exact `DOUYIN_REDIRECT_URI`

## 24. Linux compatibility

| Item | Class |
| --- | --- |
| `path` / `MEDIA_STORAGE_ROOT` | Linux OK |
| FFmpeg PATH | Linux OK |
| `argon2` native addon | needs build tools at `npm install` |
| `scripts/local-postgres.mjs`, runas, port 55432 | DEV_ONLY |
| Memurai | DEV_ONLY |
| PowerShell RC helpers | DEV_ONLY |
| Runtime `cmd.exe` / drive letters | not in Nest/Next start path |

Linux Production Blockers: **0** (runtime). Install-time: Node 20+, build-essential for argon2, ffmpeg packages.

## 25. Clean VPS install requirements (do not install here)

- OS: Ubuntu 24.04 LTS (or 22.04)
- Node.js **>= 20** (root `engines`)
- npm (workspace install)
- PostgreSQL **16**
- Redis **7** (or distro 7.x)
- FFmpeg + ffprobe
- Nginx
- Git
- OpenSSL (certbot)
- `build-essential` / Python for `argon2` compile
- Unprivileged user `acf` + systemd

## 26. Deployment mode decision

| Mode | Fit |
| --- | --- |
| A Native + systemd | **Recommended.** Start commands already exist. Least new artifacts. journald. |
| B Docker Compose | Compose today is **only** PG+Redis. App images/Dockerfiles absent. More work. |
| C PM2 + native DB/Redis | Works; extra Node process manager. systemd is enough. |

Recommended Deployment Mode: **A — Native services + systemd** (optional: keep Compose **only** for PG/Redis with `127.0.0.1:` port binds, not host `0.0.0.0`)

## 27. SINGLE_VPS_WEB_RC blocker classification

### P0 (must have before first paid browser users)

1. Production env actually set: `NODE_ENV=production` + validator-required vars + real MODEL/WANX/MINIMAX keys + `COOKIE_SECURE=true` + `CORS_ORIGIN=https://<host>` + `BACKEND_URL=http://127.0.0.1:3001` + absolute `MEDIA_STORAGE_ROOT`
2. Nginx + TLS on one hostname; 80/443 only public
3. Firewall: Postgres, Redis, 3000, 3001 localhost-only
4. systemd (or equivalent) for frontend, backend, worker — boot + crash restart

### P1

1. Root `.env.example` / operator env matrix (names only)
2. Enforce `COOKIE_SECURE=true` in `validateRuntimeEnvironment` (fail closed)
3. `HOST=127.0.0.1` listen for Nest (and Next `-H 127.0.0.1`)
4. `trust proxy` when behind Nginx
5. Worker process singleton / systemd `Restart=` + one unit
6. Scheduled `pg_dump` + media copy + off-server retention
7. Document migrate-deploy on empty production DB

### P2

1. CORS multi-origin (www)
2. Health readiness (DB/Redis)
3. Structured/file logs beyond journald
4. Upload RAM cap / streaming
5. Crop-review `CROP_REVIEW_REPO_ROOT` defaulting to cwd

### P3

1. README still “V1.0 MVP”; workspace package versions ≠ `0.9.0-rc.1`
2. Object storage / CDN
3. PM2 vs systemd bikeshed

Official Douyin auto publish, auto metrics, Tauri: **not blockers**.

P0: **4**

P1: **7**

P2: **5**

P3: **3**

## 28. MINIMUM_REQUIRED_CHANGES

Only items to move `PARTIAL` → `SINGLE_VPS_WEB_RC` **READY**. Not “nice later”.

| ID | File(s) | Problem | Minimal Fix | Risk | Code | DB |
| --- | --- | --- | --- | --- | --- | --- |
| VPS-ENV-01 | `.env.example` (new content), optional runbook | Operators cannot see required names | Document names only; no secrets | Low | NO (docs) | NO |
| VPS-ENV-02 | operator `.env` on VPS | Production validator + providers unset | Set NODE_ENV and required keys | Med (misconfig) | NO | NO |
| VPS-AUTH-01 | `runtime-env.ts` | `COOKIE_SECURE` warning-only | Require `COOKIE_SECURE=true` in production | Low | YES | NO |
| VPS-BIND-01 | `main.ts`; frontend start | Listen all interfaces | `listen(port, HOST\|\|'127.0.0.1')`; `next start -H 127.0.0.1` | Low | YES | NO |
| VPS-PROXY-01 | Nginx (not in repo yet) | No HTTPS / public routing | Same-host `/` and `/api/` TLS | Med | NO | NO |
| VPS-SUP-01 | systemd units (not in repo yet) | No reboot/crash recovery | Three units + postgres/redis enable | Low | NO | NO |
| VPS-MEDIA-01 | VPS filesystem | cwd `./storage` | Absolute `MEDIA_STORAGE_ROOT`, chown `acf` | Low | NO | NO |
| VPS-FFMPEG-01 | VPS packages | FFmpeg not bundled | `apt install ffmpeg`; PATH or `FFMPEG_PATH` | Low | NO | NO |
| VPS-DB-01 | VPS Postgres | No production DB | PG16, localhost bind, `migrate deploy` empty DB | Med | NO | YES (empty DB + migrate, no schema edit) |
| VPS-REDIS-01 | VPS Redis | Must not be public; need AOF | bind 127.0.0.1, requirepass, AOF | Low | NO | NO |
| VPS-CORS-01 | env | Browser origin mismatch | `CORS_ORIGIN=https://<host>` | Low | NO | NO |
| VPS-WORKER-01 | systemd | Duplicate workers | One `acf-worker` unit | Low | NO | NO |

Minimum Required Changes: **12**

Code-change subset: **2** (`COOKIE_SECURE` fail-closed; loopback `HOST` bind). Everything else is env, packages, Nginx, systemd, firewall.

## 29. NOT_REQUIRED_FOR_FIRST_PAID_VPS_RC

- Kubernetes / multi-node Redis / Postgres HA
- App Docker images / full Compose for Node
- Tauri
- Official Douyin auto publish / live metrics API
- Object storage, CDN, OpenTelemetry stack
- Multi-region
- Changing Prisma schema
- Restoring the Windows RC validation dump into production
- Moving tag `v0.9.0-rc.1`

## 30. Implementation phase split

Keep the planned split. Merge only the thin Linux/FFmpeg audit into rehearsal:

- **II-A.2** Configuration & env portability (`.env.example` names, COOKIE_SECURE fail-closed, HOST bind, CORS/BACKEND_URL notes)
- **II-A.3** Worker/runtime hardening (systemd one worker, lease docs; optional singleton file lock later)
- **II-A.4** Linux media/FFmpeg — expected **small**; can merge into II-A.6 if II-A.2 sets absolute `MEDIA_STORAGE_ROOT`
- **II-A.5** Nginx + HTTPS deployment package (units + sample site config, not live DNS)
- **II-A.6** VPS deployment rehearsal (authorized machine)
- **II-A.7** Commercial VPS acceptance (paid-user browser path)

Suggested merge: **II-A.4 into II-A.6** after II-A.2. Keep II-A.2 and II-A.5 separate (config vs proxy).

## 31. Git

This file is untracked documentation only.

Git Mutation: **NO** (no stage, commit, push, tag)

## 32. Gate

All SINGLE_VPS blockers identified. Minimum change set listed. No unknown P0. Deployment mode: systemd native.

Gate: **SINGLE_VPS_IMPLEMENTATION_PLAN_READY**
