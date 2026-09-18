# RC-09.1 Local Runtime Bring-Up and Health Verification

Date: 2026-09-18
Mode: LOCAL_WINDOWS_WEB_RC operator bring-up. No source / `.env` / schema / git mutation.
No `prisma migrate deploy`. No provider / LLM / business data writes.

## 1. Phase

RC_09_1_LOCAL_RUNTIME_BRING_UP

## 2. Git Baseline

| Field | Value |
| --- | --- |
| Repository | `D:\project\ai-content-factory` |
| Branch | `main` |
| HEAD | `296e6d8c148eb77df16b5fc18b709262cf197009` |
| Remote tag | `v0.9.0-rc.1` |
| Product | `0.9.0-rc.1` |
| Match required HEAD | YES |
| Match required branch | YES |

## 3. Pre-start Port Matrix

Taken before any service start this session.

| Port | Role | State |
| --- | --- | --- |
| 3010 | Frontend | FREE |
| 3001 | Backend | FREE |
| 55432 | Embedded Postgres | FREE |
| 6379 | Redis | OCCUPIED (PID 4000) |

Existing Backend Count: **0**
Existing Worker Count: **0**
Existing Frontend Count: **0**
No duplicate worker. No process kill.

Note: Windows service PostgreSQL 16 (`C:\Program Files\PostgreSQL\16`) was already running on its own data directory, **not** on 55432. Left untouched.

## 4. Redis State

Redis Reachable: **YES**
TCP `127.0.0.1:6379` + `redis-cli ping` → `PONG`
Action: **not restarted** (already reachable). No flush.

## 5. PostgreSQL Start

Official `npm run db:local:start` (`scripts/local-postgres.mjs start`) **failed** from this elevated Administrator shell:

`PostgreSQL did not become ready: not ready`

Cause in `.local/postgres/logs/postgres.log`: Postgres refuses to start under an administrative token.

Existing-cluster start (no initdb, no data overwrite): `runas /trustlevel:0x20000` launching the embedded `postgres.exe` against `.local/postgres/data`.

Log: `database system was shut down at 2026-09-10 02:59:18 CST` then `database system is ready to accept connections`.

| Field | Value |
| --- | --- |
| Postgres PID | 10348 |
| Binary | `database/node_modules/@embedded-postgres/windows-x64/native/bin/postgres.exe` |
| Data dir | `.local/postgres/data` |
| Host | `127.0.0.1` |
| Port | 55432 |
| Database Name | `acf_dev` |

Port 55432: **LISTENING**

## 6. Database Reachability

Database Reachable: **YES**
Prisma datasource: PostgreSQL `acf_dev` / `public` at `127.0.0.1:55432`

## 7. Migration Status

Command (read-only): `prisma migrate status --schema database/prisma/schema.prisma`

23 migrations found in `prisma/migrations`.

**Not yet applied:**

- `20260912020000_add_crop_review_approval_execution`
- `20260912100000_add_output_strategy_selections`
- `20260913220000_add_manual_publication_monitoring`
- `20260914010000_add_performance_analysis`
- `20260915080000_add_video_final_acceptance`

Migration Status: **PENDING**

```
MIGRATION_AUTHORIZATION_REQUIRED
```

`prisma migrate deploy` was **not** run. Backend / Worker / Frontend were **not** started after this stop.

## 8. Backend Start

NOT STARTED (blocked by pending migrations).

## 9. Backend Health

Backend Health: **FAIL** (nothing listening on 3001; health not requested after STOP)

## 10. Worker Start

NOT STARTED.

## 11. Worker Count

Worker Count: **0**
Worker Status: NOT_RUNNING
Double Worker Risk: **NO**

## 12. Frontend Start

NOT STARTED.

## 13. Runtime Port Matrix (end of phase)

| Port | Role | State |
| --- | --- | --- |
| 3010 | Frontend | not listening |
| 3001 | Backend | not listening |
| 55432 | Embedded Postgres | LISTENING (PID 10348) |
| 6379 | Redis | LISTENING (PID 4000) |

Worker processes: 0

## 14. Frontend Smoke

Frontend Smoke: **NOT_RUN**

## 15. Runtime Logs

Postgres boot log: clean start after medium-integrity launch; recovered from 2026-09-10 clean shutdown.

Backend / Worker / Frontend logs: N/A (not started).

Official `db:local:start` log: repeated “must not run as administrator” (non-fatal after workaround).

## 16. Fatal Errors

Fatal Runtime Errors: **0**

Non-blocking Warnings: **3**

1. Elevated Administrator shell cannot use `npm run db:local:start` directly; medium-integrity `runas` is required on this machine.
2. Coexisting Program Files PostgreSQL 16 service (separate cluster; not 55432).
3. Live `acf_dev` is behind published `0.9.0-rc.1` schema by five migrations (blocker, not a code defect).

## 17. Open P2 Items

Unchanged. Still **P2**, not this bring-up’s schema blocker:

1. `.env.example` incomplete
2. CORS 3000 vs frontend 3010
3. Worker repeat-start / single-instance guard
4. localhost defaults

## 18. Provider Calls

0

## 19. LLM Calls

0

## 20. Real Data Mutation

NO (Postgres start only; no migrate deploy, seed, flush, or business writes)

## 21. Git Mutation

NO
Tracked Modified: **0**
Staged: **0**
Untracked: prior RC audit markdown plus this report (not staged)

## 22. Gate

Gate: **RC_09_1_BLOCKED**

Reason: Migration Status = PENDING. Remaining runtime (backend health, worker=1, frontend 3010) was not started by design.

Required before LOCAL_WEB_RC_RUNTIME_READY:

1. Explicit authorization to run `prisma migrate deploy` on `acf_dev`, **or** confirmation of a different already-migrated cluster.
2. Then start Backend 3001, one Worker, Frontend 3010, and re-verify health.

Recommended Next Step after authorize-and-finish bring-up: **RC_10_RELEASE_RUNBOOK_AND_RC_LAUNCH_PREP**

STOP.
