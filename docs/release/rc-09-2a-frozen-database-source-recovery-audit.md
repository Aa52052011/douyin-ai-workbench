# RC-09.2A Frozen Database Source Recovery Audit

Date: 2026-09-18
Mode: read-only source location. No migrate / restore / copy / second cluster start / `.env` / app start / git mutation.

## 1. Phase

RC_09_2A_FROZEN_DATABASE_SOURCE_RECOVERY_AUDIT

## 2. Current Cluster Identity

| Field | Value |
| --- | --- |
| Database Name | `acf_dev` |
| Postgres Version | 16.14 (embedded `postgres.exe`) |
| Query timestamp (UTC) | 2026-09-18T02:36:16Z |
| Data directory | `D:/project/ai-content-factory/.local/postgres/data` |
| Database size | 14 MB (`pg_database_size`) |
| Cluster dir size | ~90.2 MB |
| Listen | `127.0.0.1:55432` PID **10348** (left running, not mutated) |
| System identifier | `7680976020806808368` |
| PG_VERSION | 16 |
| `postgresql.conf` overlay | `listen_addresses='127.0.0.1'`, `port=55432` |

## 3. Current DB Record Summary

Counts only.

| Entity | Table | Count |
| --- | --- | --- |
| User | `users` | 81 |
| Tenant | `tenants` | 81 |
| Workspace | `workspaces` | 82 |
| Project | `projects` | 90 |
| ContentPlan | `content_plans` | 14 |
| Script | `scripts` | 21 |
| Video | `videos` | 19 |
| Publication | `publications` | 8 |
| MetricSnapshot | `publication_metric_snapshots` | 10 |
| PerformanceAnalysis | `performance_analyses` | **TABLE_ABSENT** |
| Recommendation / Review | `strategy_adjustment_recommendations` | 0; analysis/review JSON table absent |

Frozen IDs in this DB: all **absent**.

| Frozen ID | Present |
| --- | --- |
| Project `01a0a08d-4968-70c0-a528-de2e6cecfade` | NO |
| ContentPlan `01a0a648-3db7-7191-a91b-621cc99f4751` | NO |
| Publication `01a0a54e-5f54-78c1-a558-76a8d5fcf686` | NO |
| PerformanceAnalysis `01a0a61d-394b-72c0-8312-2f9b19192116` | NO |

## 4. Current Cluster Timeline

Filesystem: created **2026-09-03 00:29:50**, directory mtime **2026-09-18 10:24:10** (today’s start).

`pg_controldata` (read-only): checkpoint time **2026-09-18 10:34:11** after this morning’s start. Recovery snapshot of the **same** system identifier still shows last control update **2026-09-10 02:59:18**. Embedded start log: `database system was shut down at 2026-09-10 02:59:18 CST`.

`NextXID=3574` and `NextOID=76530` match the 2026-09-10 snapshot. Today’s start did not replay a later WAL history.

Current Cluster Approximate Age: **initialized 2026-09-03; last committed business timeline ≈ 2026-09-10 02:59 CST**.

Consistent with full RC closed-loop (23 migrations CLEAN + freeze IDs, observed in RC-01 on 2026-09-18): **NO**.

## 5. Candidate Data Directories

Did not start any additional cluster. Did not parse relation files.

### Candidate Cluster 1

- Path: `D:\project\ai-content-factory\.local\postgres\data`
- PG Version: 16 (server 16.14)
- Approx Modified: 2026-09-18 10:24 (start); control lineage 2026-09-10 02:59
- Why: official `scripts/local-postgres.mjs` `DATA_DIR`

### Candidate Cluster 2

- Path: `D:\project\_recovery\ai-content-factory\emergency-baseline-20260914-210127\source-snapshot\.local\postgres\data`
- PG Version: 16
- Approx Modified: 2026-09-14 21:01:31 (copy); `pg_control` still 2026-09-10 02:59:18
- Why: filesystem copy of the **same** cluster (identical system identifier + checksum). Offline. Not started.

### Candidate Cluster 3

- Path: `C:\Program Files\PostgreSQL\16\data`
- PG Version: 16 (binaries **16.15**)
- Approx Modified: created 2026-09-10 12:22; mtime 2026-09-18 09:00
- Why: Windows installer cluster; processes running; **not** bound to 55432. Not queried (would be a different instance). Not started by this audit.

No other `PG_VERSION`+`base`+`global` trees under `D:\project` (excluding `node_modules`). Isolated verify used temp port **55433** and an empty DB name `acf_migration_recovery_verify_*` — **not** frozen RC data; left stopped.

## 6. Candidate Backups

No restore. `D:\acf-backups` / `D:\backup` / `.local\backups` do not exist.

### Backup 1

- Path: `D:\project\ai-content-factory\.local\dogfood\30-day\preflight\acf_dev-2026-09-10T09-00-47-208Z.dump`
- Type: custom `pg_dump -Fc` (gzip), dbname `acf_dev`
- Size: 248670 bytes
- Timestamp: 2026-09-10 17:00:47
- Dumped from **PostgreSQL 16.15** (pg_dump 16.15)
- `pg_restore -l`: TOC has `projects`, `content_plans`, `publications`, `publication_metric_snapshots`. **No** `performance_analyses`, `crop_review_sessions`, `video_final_acceptances`.
- Frozen UUID Evidence: **NO** (text scan of dump: no freeze IDs)

Copies of the same file exist under `_recovery\...\source-snapshot\.local\dogfood\...` (not restored).

### Backup 2

- Path: `D:\project\ai-content-factory\backups\acf_web_v1_rc_smoke.sql`
- Type: plain SQL smoke dump (gitignored `backups/`)
- Size: 25521 bytes
- Timestamp: 2026-09-06 22:11:35
- Frozen UUID Evidence: **NO**

Desktop / Documents / Downloads: no additional `*.dump` / `acf_dev*` dumps found.

## 7. Frozen UUID Evidence

Frozen ID Text Evidence: **FOUND** (documentation + fixtures only — **not** in any dump/cluster query)

| Path | Role |
| --- | --- |
| `docs/release/rc-01-read-only-baseline-audit.md` | Live freeze confirmation on 55432/`acf_dev` (PID 5396), 23 migrations CLEAN |
| `docs/release/rc-09-2-authorized-prisma-migrate-deploy.md` | Records current miss |
| `apps/frontend/src/lib/*selfcheck.ts` and backend specs | Fixture/selfcheck IDs |

Not found in `.local` json/md logs, `_recovery` text, SQL dumps, or dump TOC as row evidence.

## 8. Historical Startup Paths

`scripts/local-postgres.mjs` hardcodes:

`DATA_DIR = <repo>/.local/postgres/data`, host `127.0.0.1`, port `55432`, database `acf_dev`.

`package.json`: `db:local:start` → that script. Docs (`docs/database-architecture.md`, README) same path.

`.local/HANDOFF-2026-09-10.md`: last clean `npm run db:local:stop` ~2026-09-10 02:58; resume via `db:local:start`. No alternate PGDATA.

Historical Data Directory References: **only** `.local/postgres/data` for `acf_dev`.

Historical PGDATA Difference: **NO** (application path). Tooling note: dogfood dump used **16.15** client/server label vs current embedded **16.14**.

RC-01 live runtime used the same host/port/db name (`127.0.0.1:55432` / `acf_dev`) with a **newer** schema (23/23 CLEAN). That later WAL/state is **not** in the directory now on disk.

## 9. Prisma Migration Timeline

Current DB Last Applied Migration:
`20260910020000_add_autonomous_research_learning`
`finished_at`: **2026-09-09T18:13:47.257Z**

18 finished rows; 0 rolled back. Pending remain the five RC-09.2 names.

Current DB Timeline: **OLDER_THAN_RC_DATA**

RC-01 required 23 applied (including crop review through video final acceptance). Those finished_at rows are not in this `_prisma_migrations`.

## 10. Candidate Classification

| Item | Class |
| --- | --- |
| Current `.local/postgres/data` `acf_dev` | **B. LIKELY_OLDER_TEST_DATABASE** (also a frozen-era **old snapshot** of the official path) |
| `_recovery\...\source-snapshot\.local\postgres\data` | **B. LIKELY_OLDER_TEST_DATABASE** (same cluster id, 2026-09-10 state) |
| `C:\Program Files\PostgreSQL\16\data` | **D. UNRELATED** (installer cluster, 16.15, not 55432; not inspected) |
| Isolated 55433 verify DB | **D. UNRELATED** (empty temp DB; left stopped) |
| `acf_dev-2026-09-10T09-00-47-208Z.dump` | **C. BACKUP_CANDIDATE** of **pre-freeze** `acf_dev` (no freeze tables/IDs) |
| `backups/acf_web_v1_rc_smoke.sql` | **D. UNRELATED** / old smoke |
| RC-01 documented live DB | **A. LIKELY_FROZEN_RC_DATABASE** historically — **source files not found on this machine now** |

## 11. Most Likely Data Source

**Frozen RC database files: not present on this host.**

Most likely explanation: official PGDATA path is correct, but on-disk cluster is the **2026-09-10 clean-stop image** (same system id as the 2026-09-14 emergency directory copy). Post-2026-09-10 closed-loop rows (including freeze UUIDs and five later migrations) are not in this directory, not in found dumps, and not in the recovery snapshot.

## 12. Current DB Classification

**LIKELY_OLD_SNAPSHOT**

Evidence: last clean shutdown 2026-09-10 02:59; last Prisma apply 2026-09-09; `NextXID`/`NextOID` match the Sept 10 copy; freeze IDs missing; `performance_analyses` absent; RC-01 same path had 23 CLEAN.

Not `LIKELY_CORRECT_CLUSTER_WITH_MISSING_DATA` (that would still have later migrations recorded).

## 13. Previous Report Semantic Correction

`docs/release/rc-09-2-authorized-prisma-migrate-deploy.md` used **FAILED** for migrations that were never executed, and **FAIL** for build/schema checks that were never run.

Correct semantics:

| Item | Correction |
| --- | --- |
| Migration 1–5 | **NOT_RUN** (not FAILED) |
| Backend Build | **NOT_RUN_IN_RC_09_2** (historical baseline build PASS) |
| Post-migration Data Integrity | **NOT_APPLICABLE** |
| Schema Verification | **NOT_RUN** |
| Database Schema Mutated | NO |

## 14. Git State

HEAD `296e6d8c148eb77df16b5fc18b709262cf197009` `main`
Tracked Modified: **0**
Staged: **0**
Untracked RC audit markdown only.

## 15. Database Mutation

NO — no deploy, restore, copy, write, or second-cluster start.

## 16. Gate

Gate: **FROZEN_RC_DATABASE_NOT_FOUND**

## 17. Recommended Next Step

Do not restore or deploy in this phase.

Choose later (not executed here):

- **OPTION_A:** continue on this older `acf_dev` with authorized `prisma migrate deploy`, then **rebuild** RC test data (freeze IDs will not return).
- **OPTION_B:** restore freeze data from another machine / an undiscovered backup (none found locally that contains the freeze UUIDs).

STOP.
