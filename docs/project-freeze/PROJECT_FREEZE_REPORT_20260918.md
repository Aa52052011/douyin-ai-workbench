# Project Freeze Report — 2026-09-18

## Freeze Reason

AWAITING_VPS_AND_DOMAIN. Phase II-A.6 real VPS rehearsal cannot start: VPS, domain, DNS, and HTTPS are not prepared. Not a code blocker.

## Freeze Point

After II-A.5.3 `SINGLE_VPS_COMMERCIAL_CANDIDATE_PUBLISHED`. II-A.6 NOT_STARTED.

## Git Integrity

Local: branch `main`, HEAD `f09109fd9bf94767ee2fc8f82a4e127346d9b980`, `v0.9.1-rc.1` and `v0.9.0-rc.1` peeled targets match expected.

Remote (temporary `core.sshCommand` + `id_ed25519_github`): main and both tags match.

Git Remote Integrity: **PASS**

Working tree **before** freeze docs: clean (tracked 0, staged 0, untracked 0).

## Database Integrity

`acf_dev` @ `127.0.0.1:55432`. Prisma: 23 migrations, schema up to date. Pending 0. Failed 0. Migration: **CLEAN**. No migrate/reset/seed this phase.

## Checkpoint Backup

`pg_dump -Fc` to `D:\acf-backups\checkpoints\acf_dev_pause_before_vps_rehearsal_20260918_151627.dump` (did not overwrite release dump). Size 629795. Format CUSTOM. `pg_restore -l` readable (TOC 541, gzip, dbname acf_dev). SHA256 sidecar written.

Checkpoint Backup SHA256: `F84A75627227380F1028FD668510B51163DFE26DF99BB0DBA497A7115BB9D715`

## Validation Dataset

All listed RC IDs present. Semantics match RC-11 (positioning confirmed, plan v1 archived, script confirmed, video final accepted, manual USER_ASSERTED publication, 2 metrics, analysis + recommendation reviews, plan v2 confirmed). Validation Baseline: **PASS**

## Runtime Inventory

| Item | Value |
| --- | --- |
| Windows | NT 10.0.19045 |
| Node | v22.19.0 |
| npm | 10.9.3 |
| Git | 2.55.0.windows.5 |
| PostgreSQL server | 16.14 embedded (`postgres.exe` in `@embedded-postgres`) |
| Postgres listen | 127.0.0.1:55432 |
| pg_dump client | 16.15 (`C:\Program Files\PostgreSQL\16\bin\pg_dump.exe`) |
| Redis | Memurai service `Running`, `127.0.0.1:6379` PONG |
| FFmpeg / FFprobe | 9.0.1-full_build-www.gyan.dev |
| OpenSSH | OpenSSH_for_Windows_9.5p1 |
| Frontend | 3010 |
| Backend | 3001 |
| Worker concurrency | 2 (BullMQ) |
| Singleton key | `acf:worker:singleton` |
| Lock TTL | 30s |
| Heartbeat | 10s |

PIDs informational only: Backend 10448, Worker 15100, Frontend 12600 (plus leftover next on 10456 `::3010`), Postgres 10348, Memurai 4000.

## Environment Inventory

Names only. Values not recorded.

**SECRET:** DATABASE_URL, JWT_ACCESS_SECRET, MODEL_API_KEY, WANX_API_KEY, MINIMAX_TTS_API_KEY, TTS_API_KEY, DOUYIN_CLIENT_SECRET, PLATFORM_SECRET_MASTER_KEY, AI_ENGINE_SECRET (REDIS_URL if it ever includes a password)

**PUBLIC:** NEXT_PUBLIC_API_BASE, CORS_ORIGIN, CORS_ORIGINS, FRONTEND_HOST, FRONTEND_PORT, BACKEND_HOST, BACKEND_PORT, PORT, BACKEND_URL, NODE_ENV, COOKIE_SECURE, TRUST_PROXY, MEDIA_COMPOSE_PROVIDER, MEDIA_IMAGE_PROVIDER, MEDIA_TTS_PROVIDER, MODEL_PROVIDER, MODEL_NAME, MODEL_BASE_URL, WANX_BASE_URL, MINIMAX_TTS_BASE_URL, DOUYIN_REDIRECT_URI, DOUYIN_OAUTH_BASE_URL, DOUYIN_API_BASE_URL

**LOCAL_DEV_REQUIRED:** NODE_ENV, DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, CORS_ORIGIN, BACKEND_URL, PORT or BACKEND_PORT, MEDIA_STORAGE_ROOT, MODEL_* when provider=real, media provider keys when those providers are selected

**SINGLE_VPS_REQUIRED:** NODE_ENV=production, DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, CORS_ORIGIN (https), COOKIE_SECURE=true, BACKEND_HOST=127.0.0.1, BACKEND_URL loopback, FRONTEND_HOST=127.0.0.1, MEDIA_STORAGE_ROOT absolute, real model/media keys as used

**OPTIONAL:** TRUST_PROXY, JWT_*_EXPIRES_SEC, ACF_JOB_QUEUE_NAME, JOB_LEASE_TIMEOUT_MS, JOB_HEARTBEAT_INTERVAL_MS, ACF_WORKER_LOCK_*, ACF_WORKER_SINGLETON, FFMPEG_PATH, FFPROBE_PATH, FFMPEG_TIMEOUT_MS, FFMPEG_MAX_CONCURRENCY, MODEL_FALLBACK_*, MODEL_CIRCUIT_*, MODEL_ROUTE_TIMEOUT_MS, WANX_MODEL/SIZE/TIMEOUT, MINIMAX_TTS_MODEL/FORMAT/TIMEOUT, MEDIA_MAX_UPLOAD_BYTES, MEDIA_DIGITAL_HUMAN_PROVIDER, MEDIA_VOICE_CLONE_PROVIDER, AI_ENGINE_URL, CROP_REVIEW_REPO_ROOT, ACF_REPO_ROOT, AGENT_DEBUG_PROMPTS

**DEFERRED_DOUYIN:** DOUYIN_CLIENT_KEY, DOUYIN_CLIENT_SECRET, DOUYIN_REDIRECT_URI, DOUYIN_OAUTH_BASE_URL, DOUYIN_API_BASE_URL, PLATFORM_SECRET_MASTER_KEY

Secrets Captured In Freeze Docs: **NO**

## Completed Phases

RC-01–RC-12. II-A.1, II-A.2, II-A.3, II-A.5, II-A.5.1, II-A.5.2, II-A.5.3.

## Next Phase

PHASE_II_A6_REAL_VPS_DEPLOYMENT_REHEARSAL after VPS + domain + DNS.

## External Requirements

VPS, Domain, DNS access, HTTPS readiness.

## Recovery Assets

PROJECT_STATE, RESUME_RUNBOOK, SAFE_SHUTDOWN_RUNBOOK, NEXT_SESSION_PROMPT, RESUME_CHECKLIST, checkpoint dump+sha256+manifest, original release dump.

## Secret Hygiene

`docs/project-freeze/` scanned: no live passwords, API keys, Bearer tokens, private keys, cookies. Freeze Documentation Secret Hygiene: **PASS**

## Freeze Completeness

CODE (GitHub main + candidate tag) + DATA (release dump + pause dump + SHA256 + manifest) + CONTEXT (five freeze docs + this report): **PASS**

## Git State

Git Mutation: **NO** (no stage/commit/push). After this phase, `docs/project-freeze/` is untracked until a later review-and-commit step.

## Gate

PROJECT_PAUSE_BASELINE_READY_FOR_REVIEW
