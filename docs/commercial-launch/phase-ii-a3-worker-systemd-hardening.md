# Phase II-A.3 Worker and systemd hardening

Date: 2026-09-18

Git: not staged, not committed.

## 1. Phase

II-A.3_WORKER_AND_SYSTEMD_RUNTIME_HARDENING

## 2. Worker audit (before change)

| Field | Value |
| --- | --- |
| Worker Entrypoint | `apps/backend/src/worker.ts` → `dist/worker.js` |
| Queue | BullMQ `acf-jobs` (`ACF_JOB_QUEUE_NAME`) |
| Worker Concurrency | 2 |
| SIGTERM Handling | YES |
| SIGINT Handling | YES |
| BullMQ Close | YES (`worker.close()`, default not forced) |
| Redis Close | YES (`connection.quit()`) |
| Current Single-instance Protection | MISSING (process); DB job lease only |

## 3. Lock strategy

Chosen: **A** — systemd one `acf-worker.service` **plus** Redis singleton lock.

- Key: `acf:worker:singleton` (`ACF_WORKER_LOCK_KEY`)
- Acquire: `SET key token NX PX ttl`
- Heartbeat Lua `PEXPIRE` only if value == owner token
- Release Lua `DEL` only if value == owner token
- Second process: log `Worker instance lock already held`, exit 1, does not consume jobs
- Tests skip lock unless `ACF_WORKER_SINGLETON=true`

Lock TTL: **30s**

Heartbeat: **10s**

Worker Close Waits For Active Job: **YES** (BullMQ `close()` waits; `TimeoutStopSec=200` on the unit). Long FFmpeg jobs may still be cut at the systemd timeout — recorded, architecture unchanged.

## 4. Tests

Second Worker Test: **PASS** (started while #1 held the lock → `Worker instance lock already held`, exit 1; #1 stayed up)

Crash Recovery: **PASS** (RUNNING jobs were 0; kill -9 #1; wait 35s; #3 started)

Graceful SIGTERM of the recovered test worker: process exited.

Production queue worker restored afterward (`Job worker started`). Test used `ACF_JOB_QUEUE_NAME=acf-jobs-ii-a3-test` so lock tests did not consume `acf-jobs`.

## 5. Backend shutdown

`enableShutdownHooks()` already present. No extra orchestration. systemd `KillSignal=SIGTERM`.

Backend Graceful Shutdown: **PASS** (hooks present; not crash-tested against in-flight HTTP)

## 6. Frontend

`start-prod.mjs` forwards SIGTERM/SIGINT to `next start`. Units bind `127.0.0.1:3010`.

## 7. systemd templates

`deploy/systemd/acf-backend.service`

`deploy/systemd/acf-worker.service`

`deploy/systemd/acf-frontend.service`

User=`acf`. `Restart=on-failure`. journald. `ProtectSystem=full` + `ReadWritePaths` for media. No secrets in units (`EnvironmentFile=`).

Systemd Runtime Test: **DEFERRED_TO_VPS_REHEARSAL** (Windows host)

## 8. Logging / secrets

Startup logs do not print URLs, keys, or tokens. Lock failure is a fixed string.

Runtime Secret Logging: **PASS**

## 9. Builds and regression

Backend/Worker build: PASS

Frontend build: PASS

Lock unit tests: 4 passed

| Check | Result |
| --- | --- |
| Backend `/health` | 200 |
| Frontend `:3010` | 200 |
| Worker | 1 |
| RC project | present |
| ContentPlan v2 | present |
| RUNNING jobs before crash test | 0 |

Local Runtime Regression: **PASS**

Database Business Mutation: **NO**

## 10. Remaining VPS blockers

P0: Nginx+HTTPS deployment package; VPS firewall/rehearsal (public 443 only)

P1: `trust proxy`; scheduled DB+media backup; production `migrate deploy` rehearsal

P2: CORS multi-host; readiness health; structured logs beyond journald; upload RAM; crop-review cwd

Duplicate worker, missing supervisor, and undocumented reboot recovery are closed **as templates + app lock**. Enabling units on a live VPS is II-A.6.

## 11. Git

Git Mutation: **NO**
