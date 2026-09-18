# Project State — 2026-09-18 pause

Read this first after any long pause. Do not guess. Do not redo completed RC or II-A.1–II-A.5.3 work.

## 1. Product Overview

**AI Content Factory** (抖音AI智能工作台) is a local-first web app: NestJS API, Next.js UI, BullMQ worker, PostgreSQL, Redis. It covers project intake, positioning, planning, script, video, manual publication, metrics, and performance feedback.

Product version on `main` package: `0.9.0-rc.1` (workspace packages may still show `0.0.1` / `0.1.0`).

## 2. Architecture

**Local Windows RC (this machine)**

- Next `127.0.0.1:3010`
- Nest `127.0.0.1:3001` (`GET /health`)
- Embedded PostgreSQL `127.0.0.1:55432` database `acf_dev`
- Memurai/Redis `127.0.0.1:6379`
- One job worker (`dist/worker.js`), BullMQ concurrency 2, Redis singleton `acf:worker:singleton` TTL 30s heartbeat 10s

**Intended SINGLE VPS (not yet rehearsed)**

Internet → HTTPS 443 Nginx → `/` Next `127.0.0.1:3010`; `/api/` Nest `127.0.0.1:3001` (prefix stripped). Postgres `127.0.0.1:5432`, Redis `127.0.0.1:6379`. Public 22/80/443 only. Templates: `deploy/nginx/`, `deploy/systemd/`, `deploy/scripts/`, `deploy/env/.env.production.example`.

## 3. Current Release Status

| Artifact | Class | Status |
| --- | --- | --- |
| `v0.9.0-rc.1` | LOCAL_WINDOWS_WEB_RC_ACCEPTED | Frozen at product commit |
| `v0.9.1-rc.1` | SINGLE_VPS_WEB_RC_CANDIDATE | AWAITING_REAL_VPS_REHEARSAL |
| Production GA | — | NOT_READY |
| GitHub Release | — | NOT_CREATED |

`v0.9.1-rc.1` must **not** be called ACCEPTED until Phase II-A.6 passes.

## 4. Git Baselines

| Item | Value |
| --- | --- |
| Repo path | `D:\project\ai-content-factory` |
| GitHub | `git@github.com:Aa52052011/douyin-ai-workbench.git` (`Aa52052011/douyin-ai-workbench`) |
| Branch | `main` |
| HEAD / remote main | `f09109fd9bf94767ee2fc8f82a4e127346d9b980` |
| `v0.9.1-rc.1` peeled | `f09109fd9bf94767ee2fc8f82a4e127346d9b980` (annotated) |
| `v0.9.0-rc.1` peeled | `296e6d8c148eb77df16b5fc18b709262cf197009` (annotated) |
| SSH key (explicit, not in git config) | `C:\Users\Administrator\.ssh\id_ed25519_github` |

## 5. Database Baselines

| Item | Value |
| --- | --- |
| Host | `127.0.0.1:55432` |
| Database | `acf_dev` |
| Prisma migrations | 23, **CLEAN**, pending 0, failed 0 |
| Release dump | `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump` (PRESERVED) |
| Pause checkpoint | `D:\acf-backups\checkpoints\acf_dev_pause_before_vps_rehearsal_20260918_151627.dump` |

Do **not** `migrate deploy` / reset / restore onto live `acf_dev` unless disaster recovery is explicitly authorized. Restore runbook: `docs/release/rc-09-3-database-restore-runbook.md`.

## 6. RC Validation IDs

Source of truth (still present 2026-09-18):

- USER `01a0b275-b8ba-7723-a72f-ff5d40feb8d7`
- TENANT `01a0b275-b8c4-7c21-a872-f7c2738aeb83`
- WORKSPACE `01a0b275-b8c7-7e52-9f5c-6fd4371e1df6`
- PROJECT `01a0b275-b904-7492-a5a3-185430e1d585`
- CONTENT_PLAN_V1 `01a0b279-ed8c-7c63-ac34-2ab58e0d5f0c` ARCHIVED v1
- TOPIC `5c24881f-08e2-4a6d-8bbc-d717adc73657`
- SCRIPT `01a0b283-d4c6-74f2-addf-186fb24b0c80` CONFIRMED
- VIDEO `56c9c55b-8784-4039-8e19-638d4c804439` COMPLETED + current FINAL ACCEPTED
- PUBLICATION `01a0b298-f772-7871-8de5-c3f41b5d9548` MANUAL, truth USER_ASSERTED (not PLATFORM_VERIFIED)
- METRIC snapshots `01a0b298-f7b2-71c0-8fe3-4403ec9fce8e`, `01a0b298-fdb4-7342-b714-e9a5130d7ccb` (count 2)
- PERFORMANCE_ANALYSIS `01a0b298-fe05-7b13-b25e-5f06ea72108b` ACTIVE; reviewStatus ACCEPTED 1 / REJECTED 1 / DEFERRED 1 / PENDING 3
- FEEDBACK_CYCLE `01a0b298-fe11-7e80-9d1c-95719078e91b` APPLIED_TO_NEXT_PLAN (ACCEPTED_ONLY applied)
- CONTENT_PLAN_V2 `01a0b299-d07d-77f1-b2f0-db14777451c3` CONFIRMED v2
- Positioning agent `account.positioning` run COMPLETED

## 7. Completed RC Phases

RC-01 through RC-12 (local Windows Web RC accepted). Detail: `docs/release/` especially `rc-11-final-rc-acceptance.md`, `rc-10-release-runbook.md`, `rc-09-3-freeze-new-rc-database-baseline.md`, `rc-09-3-database-restore-runbook.md`.

## 8. Completed Commercial Phases

| Phase | Gate |
| --- | --- |
| II-A.1 | SINGLE_VPS_IMPLEMENTATION_PLAN_READY |
| II-A.2 | CONFIGURATION_AND_ENV_PORTABILITY_READY |
| II-A.3 | WORKER_AND_SYSTEMD_RUNTIME_HARDENING_READY |
| II-A.5 | VPS_DEPLOYMENT_PACKAGE_READY |
| II-A.5.1 | REVERSE_PROXY_TRUST_BOUNDARY_READY |
| II-A.5.2 | SINGLE_VPS_PRODUCTION_HARDENING_COMMITTED_LOCALLY (`f09109f`) |
| II-A.5.3 | SINGLE_VPS_COMMERCIAL_CANDIDATE_PUBLISHED |

Docs: `docs/commercial-launch/`.

## 9. Current Runtime

See freeze report inventory. Typical start order: Postgres 55432 → Redis 6379 → Backend 3001 → one Worker → Frontend 3010. Commands: `RESUME_RUNBOOK.md`.

## 10. Deployment Candidate

- Tag: `v0.9.1-rc.1`
- Commit: `f09109fd9bf94767ee2fc8f82a4e127346d9b980`
- Status: **AWAITING_REAL_VPS_REHEARSAL** (not ACCEPTED)

## 11. Known Limitations

- Official Douyin auto publish: DEFERRED
- Automatic Douyin metrics: DEFERRED
- Tauri: NOT_READY
- Production GA: NOT_READY
- Single VPS: CANDIDATE ONLY
- Off-server production backup: NOT_IMPLEMENTED_YET
- Real VPS rehearsal / DNS / TLS: NOT_RUN / NOT_CONFIGURED
- Video bytes are **not** inside SQL dumps (`MEDIA_STORAGE_ROOT` / `./storage`)

## 12. Deferred Features

Official Douyin OAuth/API, auto metrics, desktop Tauri, multi-host CORS/CSP extras, off-server backup destination.

## 13. Pending External Requirements

VPS, domain, DNS access, HTTPS/certbot readiness. Until those exist, **do not start II-A.6**.

## 14. Exact Next Phase

`PHASE_II_A6_REAL_VPS_DEPLOYMENT_REHEARSAL` — only after VPS + domain + DNS.

## 15. Do Not Repeat

RC-01–RC-12; database recovery investigation; RC validation rebuild; II-A.1 audit; II-A.2 env; II-A.3 worker/systemd; II-A.5 package; II-A.5.1 trust proxy; II-A.5.2 commit; II-A.5.3 push/tag — unless a regression is proven.

## 16. Recovery Checklist

`RESUME_CHECKLIST.md` and `RESUME_RUNBOOK.md`.

## 17. Critical Paths

- Git: `main` @ `f09109f` + tags above
- Data: `acf_dev` + both dumps + SHA256 sidecars
- Media: local `MEDIA_STORAGE_ROOT` (not in dump)
- Secrets: live `.env` on this machine only (never in freeze docs)

## 18. Backup Locations

- Release: `D:\acf-backups\releases\` (do not overwrite)
- Pause: `D:\acf-backups\checkpoints\`
- VPS templates (code): `deploy/scripts/backup-*.sh` (runtime not installed)

## 19. GitHub Repository

`Aa52052011/douyin-ai-workbench` — `main` and `v0.9.1-rc.1` at `f09109f`; `v0.9.0-rc.1` at `296e6d8`. No GitHub Release.

## 20. Project Pause Status

**PAUSED.** Reason: awaiting VPS, domain, DNS, HTTPS — not a code blocker. Gate for this freeze package: `PROJECT_PAUSE_BASELINE_READY_FOR_REVIEW` (docs not committed yet).
