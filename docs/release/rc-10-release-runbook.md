# RC-10 Release Runbook

RC Version: **0.9.0-rc.1**
Date: 2026-09-18
Mode: operator runbook. No product code or database mutation in RC-10 itself.

## Frozen baselines

| Side | Value |
| --- | --- |
| Code | commit `296e6d8c148eb77df16b5fc18b709262cf197009`, tag `v0.9.0-rc.1`, branch `main` |
| Remote | `git@github.com:Aa52052011/douyin-ai-workbench.git` |
| Data | `acf_dev` @ `127.0.0.1:55432`, migrations **CLEAN** |
| Dump | `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump` |
| SHA256 | `EB3E58041CA4C19B20863ED39A53A798A249A1011F1FAB254CD4CC44DE0CE1F6` |
| Restore | `docs/release/rc-09-3-database-restore-runbook.md` |
| Policy | `docs/release/database-backup-policy.md` |

Validation Dataset: **CURRENT_RC_VALIDATION_SOURCE_OF_TRUTH** (IDs in §9).

Do **not** restore onto live `acf_dev` unless the operator explicitly authorizes disaster recovery. Prefer an isolated database. See the restore runbook.

---

## 1. One-click start order

Work from repo root `D:\project\ai-content-factory` unless a row says otherwise. Load secrets from local `.env` (not committed). Do not print values.

**Do not run** `npm run db:migrate` / `migrate:dev` / `db:push` / `migrate:reset` / seed during an RC session. Schema is already CLEAN.

Compose `npm run db:up` starts Docker Postgres on **5432** and Redis on **6379**. LOCAL_WINDOWS_WEB_RC uses **embedded Postgres 55432**. Do not point `DATABASE_URL` at Compose 5432 while expecting the frozen `acf_dev` on 55432.

### 1. Postgres

| Field | Value |
| --- | --- |
| Role | Embedded cluster for this RC |
| Port | `127.0.0.1:55432` |
| Database | `acf_dev` |
| Working directory | repo root |
| Start command (official script) | `npm run db:local:start` (`scripts/local-postgres.mjs start`) |
| Status | `npm run db:local:status` |
| Windows Administrator caveat | Official start may fail under an elevated token (`PostgreSQL did not become ready`). RC-09.1 recovered with medium integrity: `runas /trustlevel:0x20000` launching `database\node_modules\@embedded-postgres\windows-x64\native\bin\postgres.exe` against `.local\postgres\data`. Do not `initdb` and do not overwrite PGDATA. |
| Do not use for this baseline | `npm run db:up` Postgres (maps **5432**) |
| Success | TCP 55432 listening; Prisma can open `acf_dev` |
| Failure | Port closed; `P1001`; postgres.log “must be run as a non-admin”; wrong data directory |

### 2. Redis

| Field | Value |
| --- | --- |
| Port | `127.0.0.1:6379` |
| Working directory | repo root if using Compose |
| Start command if 6379 is already PONG | **none** (RC-09 left an existing listener running) |
| Start command if 6379 is free | `npm run db:up` starts Compose **redis** on 6379 (also starts Compose Postgres on 5432 — leave that unused for this RC DB) |
| There is no `npm run redis:start` | Do not invent one |
| Success | TCP 6379; `redis-cli ping` → `PONG` |
| Failure | Connection refused; Backend/Worker cannot create BullMQ |

### 3. Backend

Requires: Postgres + Redis + local `.env`. Build once if `apps/backend/dist/main.js` is missing: `npm run build:backend`.

| Field | Value |
| --- | --- |
| Port | `127.0.0.1:3001` (`process.env.PORT ?? 3001`) |
| Working directory | `apps/backend` for the proven RC command |
| Proven RC start | `node --env-file=..\..\.env dist\main.js` |
| Package script | `npm run start:prod -w backend` → `node dist/main` (inherits process env; RC used `--env-file` explicitly) |
| Dev alternative (not required) | `npm run dev:backend` |
| Success | `GET http://127.0.0.1:3001/health` → **200** `{"service":"backend","status":"ok"}` |
| Failure | Nothing on 3001; startup `RuntimeConfigError`; Prisma/Redis connect fail |

### 4. Worker (exactly one)

Requires: same `.env` as backend, Redis, Postgres, FFmpeg on PATH or `FFMPEG_PATH`. **Before start: Worker Count = 0.** There is no single-instance lock.

| Field | Value |
| --- | --- |
| Process | single `node … dist\worker.js` |
| Port | none (queue consumer) |
| Working directory | `apps/backend` for the proven RC command |
| Proven RC start | `node --env-file=..\..\.env dist\worker.js` |
| Package script | `npm run start -w workers` → `node ../apps/backend/dist/worker.js` (needs env in the process) |
| Dev alternative | `npm run dev:worker` |
| Success | log `Job worker started`; Worker Count **1** |
| Failure | Count 0; Redis errors; two `dist\worker.js` processes (unsafe) |

### 5. Frontend

Requires: backend 3001. Next rewrite `/api/*` → `BACKEND_URL` default `http://localhost:3001`.

`package.json` `start` is `next start` (**default port 3000**). LOCAL_WINDOWS_WEB_RC convention is **3010** (not encoded in scripts).

| Field | Value |
| --- | --- |
| Port (RC) | `127.0.0.1:3010` |
| Working directory | repo root |
| Build | `npm run build:frontend` if `.next` missing |
| Proven RC start | `npm run start -w frontend -- -p 3010` |
| Dev alternative | `npm run dev:frontend` (Next default **3000**, CORS default matches 3000; RC UI was 3010) |
| Success | HTTP **200** on `http://127.0.0.1:3010` |
| Failure | Connection refused; API proxy errors if backend down |

---

## 2. Shutdown order

Recommended:

1. **Frontend** — stop Next (3010 or 3000). Safe anytime.
2. **Worker** — stop only when **no VIDEO_GENERATION / compose job is RUNNING**. Do not kill `-9` mid-FFmpeg. Wait for job COMPLETED/FAILED, then stop the single `dist\worker.js`.
3. **Backend** — stop Nest on 3001 after worker is down (or after in-flight HTTP finishes).
4. **Redis** — optional. If it was a pre-existing Windows listener, leave it. If you started Compose redis, `npm run db:down` stops Compose (also stops Compose Postgres **5432**, not 55432).
5. **Postgres 55432** — `npm run db:local:stop` only when no backend/worker remains. Do not stop the unrelated Program Files PostgreSQL service.

---

## 3. RC Startup Health Checklist

After start, all must pass before human acceptance:

- [ ] Postgres `127.0.0.1:55432` reachable
- [ ] `prisma migrate status --schema database/prisma/schema.prisma` → **CLEAN** (do not deploy)
- [ ] Redis `127.0.0.1:6379` reachable
- [ ] `GET http://127.0.0.1:3001/health` = 200 `ok`
- [ ] Worker Count = **1** (`node.exe` command line contains `dist\worker.js`)
- [ ] `http://127.0.0.1:3010` reachable
- [ ] `ffmpeg -version` available (this RC machine: **9.0.1-full_build**; not bundled)

This session spot-check (2026-09-18): backend health `ok`, frontend 3010 = 200, ffmpeg 9.0.1 present.

---

## 4. Environment variable names (no values)

Root `.env.example` exists and is **empty (0 bytes)**. `database/.env.example` only names `DATABASE_URL`. Treat as **RELEASE_DOCUMENTATION_GAP**. Do not fill `.env.example` in this phase.

### DB

- `DATABASE_URL`

### Redis

- `REDIS_URL`

### JWT / Auth

- `JWT_ACCESS_SECRET`
- `JWT_ACCESS_EXPIRES_SEC`
- `JWT_REFRESH_EXPIRES_SEC`
- `COOKIE_SECURE`
- `CORS_ORIGIN`

### Model provider

- `MODEL_PROVIDER`
- `MODEL_API_KEY`
- `MODEL_BASE_URL`
- `MODEL_NAME`
- `MODEL_FALLBACK_1_NAME`
- `MODEL_CIRCUIT_FAILURE_THRESHOLD`
- `MODEL_CIRCUIT_COOLDOWN_MS`
- `MODEL_ROUTE_TIMEOUT_MS`
- `MODEL_BACKUP_ROUTE_TIMEOUT_MS`
- `AI_ENGINE_URL`
- `AI_ENGINE_SECRET`
- `AGENT_DEBUG_PROMPTS`

### Video / media provider

- `MEDIA_STORAGE_ROOT`
- `MEDIA_IMAGE_PROVIDER`
- `WANX_API_KEY`
- `WANX_BASE_URL`
- `WANX_MODEL`
- `WANX_SIZE`
- `WANX_TIMEOUT_MS`
- `WANX_MAX_RESPONSE_BYTES`
- `MEDIA_TTS_PROVIDER`
- `MINIMAX_TTS_API_KEY`
- `MINIMAX_TTS_BASE_URL`
- `MINIMAX_TTS_MODEL`
- `MINIMAX_TTS_VOICE`
- `MINIMAX_TTS_FORMAT`
- `MINIMAX_TTS_LANGUAGE_BOOST`
- `MINIMAX_TTS_TIMEOUT_MS`
- `MINIMAX_TTS_MAX_RESPONSE_BYTES`
- `TTS_API_KEY`
- `TTS_BASE_URL`
- `TTS_MODEL`
- `TTS_VOICE`
- `TTS_FORMAT`
- `TTS_TIMEOUT_MS`
- `TTS_MAX_RESPONSE_BYTES`
- `MEDIA_COMPOSE_PROVIDER`
- `FFMPEG_PATH`
- `FFPROBE_PATH`
- `FFMPEG_TIMEOUT_MS`
- `FFMPEG_MAX_CONCURRENCY`
- `MEDIA_DIGITAL_HUMAN_PROVIDER`
- `MEDIA_VOICE_CLONE_PROVIDER`
- `MEDIA_MAX_UPLOAD_BYTES`

### Douyin future integration (not official auto-publish in this RC)

- `DOUYIN_CLIENT_KEY`
- `DOUYIN_CLIENT_SECRET`
- `DOUYIN_REDIRECT_URI`
- `DOUYIN_OAUTH_BASE_URL`
- `DOUYIN_API_BASE_URL`
- `DOUYIN_OAUTH_TIMEOUT_MS`
- `DOUYIN_OAUTH_MAX_RESPONSE_BYTES`

### Platform security

- `PLATFORM_SECRET_MASTER_KEY`

### Frontend public / proxy config

- `BACKEND_URL` (Next rewrite target; default `http://localhost:3001`)
- `NEXT_PUBLIC_API_BASE` (default `/api`)
- `PORT` (backend listen; default 3001)

---

## 5. RC login URLs (human testers)

| Page | URL |
| --- | --- |
| Frontend | `http://127.0.0.1:3010` |
| Login | `http://127.0.0.1:3010/login` |
| Register | `http://127.0.0.1:3010/register` |
| Dashboard | `http://127.0.0.1:3010/dashboard` |
| Projects | `http://127.0.0.1:3010/dashboard/projects` |
| Validation project | `http://127.0.0.1:3010/dashboard/projects/01a0b275-b904-7492-a5a3-185430e1d585` |

Validation account email (non-secret): `rc090.val.1789700454310@example.test`. Password was not persisted in RC docs; if the session is gone, register/login is a product path — do **not** SQL-reset the user.

---

## 6. RC validation ID map

CURRENT_RC_VALIDATION_SOURCE_OF_TRUTH

| Object | ID |
| --- | --- |
| Project | `01a0b275-b904-7492-a5a3-185430e1d585` |
| ContentPlan v1 (ARCHIVED / historical) | `01a0b279-ed8c-7c63-ac34-2ab58e0d5f0c` |
| Topic | `5c24881f-08e2-4a6d-8bbc-d717adc73657` |
| Script CONFIRMED | `01a0b283-d4c6-74f2-addf-186fb24b0c80` |
| Video | `56c9c55b-8784-4039-8e19-638d4c804439` |
| Publication | `01a0b298-f772-7871-8de5-c3f41b5d9548` |
| Metric snapshot 1 | `01a0b298-f7b2-71c0-8fe3-4403ec9fce8e` |
| Metric snapshot 2 | `01a0b298-fdb4-7342-b714-e9a5130d7ccb` |
| Performance analysis | `01a0b298-fe05-7b13-b25e-5f06ea72108b` |
| Feedback cycle | `01a0b298-fe11-7e80-9d1c-95719078e91b` |
| ContentPlan v2 CONFIRMED | `01a0b299-d07d-77f1-b2f0-db14777451c3` |

Old lost freeze UUIDs remain **HISTORICAL_AUDIT_ONLY**.

---

## 7. In scope (Ready)

Account Positioning; Content Planning; Script Generation; Video Generation; Final Acceptance; Download Started; Manual Publication Registration; Manual Metrics; Performance Analysis; Recommendation Review; Accepted-only Feedback; Next-cycle ContentPlan; Current-cycle Isolation; Historical Isolation.

## 8. Out of scope (Deferred, not defects)

Official Douyin Auto Publish; Automatic Douyin Metrics Fetch; Platform Verified Publication; Tauri GA; Cloud multi-service GA; Multi-user production SaaS.

## 9. Publication truth contract

- Publication method: **MANUAL**
- Truth: **USER_ASSERTED**
- Platform verification: **NOT_VERIFIED**
- Auto publish: **NO**
- Auto metrics: **NO**

Do not tell testers that Douyin official APIs verified the post.

## 10. Download contract

Product export is **DOWNLOAD_STARTED**. It does **not** mean **DOWNLOAD_COMPLETED** unless a later product adds completion confirmation.

## 11. AI / provider behavior

**KNOWN_NON_BLOCKING_MODEL_OUTPUT_VARIANCE**

Observed on this dataset: Script Generation once `AGENT_INVALID_OUTPUT` (HTTP 502); official Retry 1 succeeded. Prompt/schema were not changed.

Operator: one limited retry on the same topic is allowed. **No unbounded retries.** If two consecutive official attempts fail with the same contract error, STOP and open a targeted audit. Do not patch prompts during RC.

Performance Analysis on this loop was the product **deterministic** engine (`llmInvoked: false`). That is in-scope, not a fake insert.

## 12. Worker operational warning

No strict single-instance lock (P2). RC rule:

1. Start only when Worker Count = 0
2. Start one process
3. Confirm Worker Count = 1
4. Never start a second worker

## 13. FFmpeg

**REQUIRED** for compose. **Not bundled.** This machine: **9.0.1**. New machines must install FFmpeg/ffprobe (or set `FFMPEG_PATH` / `FFPROBE_PATH`) before video jobs.

## 14. Backup before an RC session

1. Confirm the RELEASE dump still exists
2. `Get-FileHash … -Algorithm SHA256` matches `EB3E58041CA4C19B20863ED39A53A798A249A1011F1FAB254CD4CC44DE0CE1F6`
3. Optionally take a **daily** dump under `D:\acf-backups\daily\`
4. **Never overwrite** the release baseline dump

Media files live under `MEDIA_STORAGE_ROOT` / `./storage`. A DB restore without that directory will not replay video bytes.

## 15. Nine-route human checklist

Project `01a0b275-b904-7492-a5a3-185430e1d585`:

| # | Surface | Path | PASS / FAIL |
| --- | --- | --- | --- |
| 1 | Dashboard | `/dashboard` | |
| 2 | Projects | `/dashboard/projects` | |
| 3 | Project Overview | `/dashboard/projects/{id}` | |
| 4 | Positioning | `…/positioning` | |
| 5 | Content Planning | `…/content/plans` | |
| 6 | Scripts | `…/content/scripts` | |
| 7 | Video | `…/content/videos` | |
| 8 | Publish / Data | `…/publish` | |
| 9 | AI Review | `…/performance` | |

Expect: pages load; current-cycle shows v2 plan; v1 remains historical; publication remains USER_ASSERTED.

## 16. Core business smoke

- [ ] Login works
- [ ] Project visible
- [ ] Positioning visible
- [ ] Current plan visible (v2 CONFIRMED)
- [ ] Script visible
- [ ] Video playable
- [ ] Final acceptance visible
- [ ] Publication visible
- [ ] Metrics visible (two snapshots)
- [ ] Performance analysis visible
- [ ] Review states visible (ACCEPTED / REJECTED / DEFERRED / PENDING)
- [ ] Accepted-only handoff visible
- [ ] v2 current-cycle visible; v1 not treated as current

## 17. Error handling (ops only, no code fixes)

| Symptom | Check order | Safe recovery | STOP when |
| --- | --- | --- | --- |
| Backend down | 3001 listen; console error; Postgres; Redis; `.env` names present | Restart backend after deps; do not migrate | Config invalid or DB identity wrong |
| Worker down | Count `dist\worker.js`; Redis; backend; last job status | Start **one** worker after count=0 | Need a second worker to “unstick” |
| Redis unavailable | TCP 6379; ping | Start redis listener; do not flush if jobs exist | Data loss would require flush |
| Postgres unavailable | 55432; `db:local:status`; postgres.log | Non-admin start of **existing** PGDATA | Temptation to initdb / restore onto live without auth |
| Migration pending | `migrate status` read-only | STOP; need explicit deploy authorization | Any `migrate dev` / reset |
| AGENT_INVALID_OUTPUT | AgentRun error; do not assume JSON | At most 1–2 official retries | Two fails same contract; or urge to edit prompts |
| Video job failed | Job status/error; FFmpeg; provider usage | `POST /videos/:id/retry` only if product allows; else new video from same script | Kill worker mid-job; DB-insert video |
| FFmpeg missing | `ffmpeg -version`; `FFMPEG_PATH` | Install host FFmpeg | Skip compose / fake artifact |
| Provider failure | usage events (no keys) | Retry within product; check quota later | Paste keys into chat/docs |
| Frontend unavailable | 3010 vs 3000; Next process; backend | Start `next start -p 3010` | Point testers at wrong port without noting CORS |

## 18. Forbidden during RC

`prisma migrate dev`; `db push`; `migrate reset`; seed; delete validation rows; second Worker; direct SQL/Prisma writes of business results; `git push --force`; overwrite release backup; edit frozen migrations; change `.env` / schema / prompts for “just this RC”.

## 19. Environment matrix

| Target | Status |
| --- | --- |
| LOCAL_WINDOWS_WEB_RC | **READY** (frozen code+data; stack start documented; P2 operational) |
| SINGLE_VPS_WEB_RC | **PARTIAL** (HTTPS, CORS_ORIGIN, COOKIE_SECURE, hosted PG/Redis, FFmpeg, media disk, env matrix) |
| TAURI_RC | **NOT_READY** (no `src-tauri`) |
| PRODUCTION_GA | **NOT_READY** (SaaS, official Douyin, multi-service) |

Deferred Douyin official publish does **not** block LOCAL_WINDOWS_WEB_RC.

Companion files: `docs/release/rc-10-launch-checklist.md`, `docs/release/rc-10-known-limitations.md`.
