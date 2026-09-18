# RC-09.2 Authorized Prisma Migrate Deploy

Date: 2026-09-18
Mode: authorized schema mutation only. **Deploy was not executed.**

## 1. Phase Identity

RC_09_2_AUTHORIZED_PRISMA_MIGRATE_DEPLOY

## 2. Authorization

| Field | Value |
| --- | --- |
| ALLOW_DATABASE_MIGRATION | YES (explicit user approval this turn) |
| Authorized method | `prisma migrate deploy` only |
| Target | `acf_dev` |
| Authorized pending | 5 named migrations |
| Forbidden | migrate dev / db push / reset / resolve / seed / app start / git mutation |

Authorization recorded: **EXPLICIT_USER_APPROVAL**
Deploy executed: **NO** (blocked by pre-migration data snapshot gate)

## 3. Git Baseline

| Field | Value |
| --- | --- |
| Repository | `D:\project\ai-content-factory` |
| Branch | `main` |
| HEAD | `296e6d8c148eb77df16b5fc18b709262cf197009` |
| Tracked Modified | 0 |
| Staged | 0 |

Untracked RC audit markdown only (plus this report after write). Source tree unchanged.

## 4. Target Database

Password not printed.

| Field | Value |
| --- | --- |
| Host | 127.0.0.1 |
| Port | 55432 |
| Database | acf_dev |
| Reachable | YES |
| Postgres PID | 10348 |
| Not production / not new empty DB / not `acf_test` | confirmed via Prisma datasource + `pg` inspect |

Target Database Confirmed: **YES**

## 5. Pre-migration Status

`prisma migrate status --schema database/prisma/schema.prisma`

23 files in `prisma/migrations`. `_prisma_migrations` has **18** finished rows, **0** rolled back.

Migration Status before deploy: **PENDING**
Failed Migrations: **0**

## 6. Pending Migration List

Pending Migration Count: **5**
Unexpected Pending Migrations: **0**
Failed Migrations: **0**

1. `20260912020000_add_crop_review_approval_execution`
2. `20260912100000_add_output_strategy_selections`
3. `20260913220000_add_manual_publication_monitoring`
4. `20260914010000_add_performance_analysis`
5. `20260915080000_add_video_final_acceptance`

List matches authorization exactly.

## 7. Migration SQL Safety Audit

No SQL files were modified.

### Migration: `20260912020000_add_crop_review_approval_execution`

DDL Summary: CREATE TYPE (5 enums) + CREATE TABLE `crop_review_sessions`, `human_crop_approvals`, `crop_execution_authorizations`, `crop_execution_runs` + indexes + FKs to existing tenants/workspaces/projects.
Destructive Operation: **NO**
Existing Data Risk: **LOW**
Blocking Concern: **NONE**

### Migration: `20260912100000_add_output_strategy_selections`

DDL Summary: CREATE TABLE `output_strategy_selections` + unique on `(tenant_id, review_session_id)` + FKs including `crop_review_sessions`.
Destructive Operation: **NO**
Existing Data Risk: **LOW**
Blocking Concern: **NONE**

### Migration: `20260913220000_add_manual_publication_monitoring`

DDL Summary: `ALTER TYPE PublicationMode ADD VALUE IF NOT EXISTS 'SCHEDULED_API'`; new enums; `publications.video_id` DROP NOT NULL (relaxes, does not drop data); ADD COLUMN with defaults for new NOT NULL columns; unique `(tenant_id, platform, external_post_id)`; nullable `entered_by_user_id` on snapshots; CREATE TABLE `manual_publication_exports`, `monitoring_targets`.
Destructive Operation: **NO** (no DROP TABLE / TRUNCATE / DELETE / DROP COLUMN)
Existing Data Risk: **LOW** (unique-index collision checked: **0** duplicate `(tenant_id, platform, external_post_id)` where `external_post_id IS NOT NULL`; PostgreSQL UNIQUE allows multiple NULLs)
Blocking Concern: **NONE** (SQL). Data-freeze mismatch is a separate gate.

### Migration: `20260914010000_add_performance_analysis`

DDL Summary: CREATE TABLE `performance_analyses`, `content_feedback_cycles` + FKs to publications/agent_runs.
Destructive Operation: **NO**
Existing Data Risk: **LOW**
Blocking Concern: **NONE**

### Migration: `20260915080000_add_video_final_acceptance`

DDL Summary: CREATE TABLE `video_final_acceptances` + FKs to scripts/videos/assets/users. Empty new table; no rewrite of existing video rows.
Destructive Operation: **NO**
Existing Data Risk: **LOW**
Blocking Concern: **NONE**

Migration SQL Safety: **PASS**
Gate `RC_09_2_BLOCKED_PRE_MIGRATION` (destructive SQL): **not triggered**

## 8. Pre-migration Data Snapshot

Expected freeze vs live `acf_dev` (read-only):

| Item | Expected | Observed |
| --- | --- | --- |
| Project `01a0a08d-4968-70c0-a528-de2e6cecfade` | exists | **MISSING** |
| ContentPlan `01a0a648-3db7-7191-a91b-621cc99f4751` v2 CONFIRMED | exists | **MISSING** |
| v2 scripts / videos / publications | 0 / 0 / 0 | N/A (plan missing) |
| Historical publication `01a0a54e-5f54-78c1-a558-76a8d5fcf686` | exists | **MISSING** |
| Metric snapshots | 2 | **0** for that id |
| Metrics 96/31/10/3/3/0 and 115/42/12/5/6/1 | MATCH | **NOT FOUND** |
| PerformanceAnalysis `01a0a61d-394b-72c0-8312-2f9b19192116` | exists | table **does not exist** (pending migration) and id not present |
| Reviews ACCEPTED/REJECTED/DEFERRED/PENDING | 1 / 1 / 1 / 3 | **NOT FOUND** |

Cluster is populated with **other** older rows (projects=90, content_plans=14, publications=8, metric snapshots=10), aligned with last clean Postgres shutdown **2026-09-10**. RC freeze IDs from RC-01 are **not** in this data directory.

Pre-migration Data Snapshot: **FAIL**

## 9. Backup

Not created. Pre-deploy backup is mandatory only immediately before an allowed `migrate deploy`. Snapshot gate failed, so dump was skipped to avoid implying deploy was authorized to proceed.

Backup File Exists: **NO**
Backup: **FAIL** (not taken)
Git Tracked: N/A

## 10. Existing Cluster Verification

`SHOW data_directory` = `D:/project/ai-content-factory/.local/postgres/data`
No initdb, no new cluster, no data wipe.

Existing Cluster Preserved: **YES**

## 11. Deploy Command

**NOT RUN**

Last pre-deploy gate failed: `Pre-migration Data Snapshot = PASS` is required.

Would have been (once): `node --env-file=.env ./node_modules/prisma/build/index.js migrate deploy --schema database/prisma/schema.prisma`
(`database` package has `migrate:deploy` mapping to the same Prisma CLI.)

## 12. Migration Results

All five: **NOT_EXECUTED**

1. `20260912020000_add_crop_review_approval_execution` — NOT_EXECUTED
2. `20260912100000_add_output_strategy_selections` — NOT_EXECUTED
3. `20260913220000_add_manual_publication_monitoring` — NOT_EXECUTED
4. `20260914010000_add_performance_analysis` — NOT_EXECUTED
5. `20260915080000_add_video_final_acceptance` — NOT_EXECUTED

## 13. Post-migration Status

Unchanged: **PENDING** (5)
Database schema is up to date: **NO**

## 14. Prisma Migration Records

Authorized Migrations Recorded: **0 / 5**
Failed Migration Records: **0**
Still 18 historical applied rows; none of the five authorized names present.

## 15. Post-migration Data Integrity

Not applicable (no deploy).
Post-migration Data Integrity: **FAIL** (not verified after deploy; freeze ids still missing)

## 16. Schema Verification

Not run (new tables still absent, as expected without deploy).
Schema Verification: **FAIL**

## 17. Build Verification

Not run (stopped before generate/build).
Backend Build: **FAIL** (not verified)

Backend / Worker / Frontend remain **NOT_STARTED**. Redis unchanged.

## 18. Git State

Tracked Modified: **0**
Staged: **0**
Git Mutation: **NO**

## 19. Database Mutation Summary

| Item | Value |
| --- | --- |
| Database Schema Mutated | NO |
| Authorized Migration Count applied | 0 |
| Application Data Manually Mutated | NO |
| Seed | NO |
| Reset | NO |
| DB Push | NO |
| Migrate Dev | NO |

## 20. Gate

Gate: **RC_09_2_BLOCKED**

Reason: live `acf_dev` on the preserved embedded cluster is **not** the RC-01 frozen dataset. SQL is additive and pending list matches, but deploying would mutate a **different** data snapshot than the one the RC freeze contract names.

To unblock, operator must either:

1. Restore / attach the cluster that contains the freeze IDs, then re-run this phase, or
2. Explicitly authorize deploy against **this** older `acf_dev` while accepting that freeze-id integrity cannot pass.

Recommended Next Step after a successful deploy on the correct data: **RC_09_3_START_BACKEND_WORKER_FRONTEND_AND_VERIFY_RUNTIME**

STOP.
