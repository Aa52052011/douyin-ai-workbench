# RC-09.2B OPTION_A Migrate Current acf_dev

Date: 2026-09-18
Mode: authorized `prisma migrate deploy` on the **current old** `acf_dev`. No frozen-UUID restore. No seed. No app start. No git mutation.

## 1. Phase Identity

RC_09_2B_OPTION_A_MIGRATE_CURRENT_ACF_DEV

## 2. Authorization

| Field | Value |
| --- | --- |
| OPTION_A | YES |
| ALLOW_PRISMA_MIGRATE_DEPLOY | YES |
| Method | `prisma migrate deploy` once |
| Target | `acf_dev` @ `127.0.0.1:55432` |

Authorization: **EXPLICIT_USER_APPROVAL**

## 3. OPTION_A Decision

Current DB is **LIKELY_OLD_SNAPSHOT**, not the frozen RC dataset. Goal is schema upgrade of this cluster, not recovery of freeze IDs.

## 4. Git Baseline

| Field | Value |
| --- | --- |
| Repository | `D:\project\ai-content-factory` |
| Branch | `main` |
| HEAD | `296e6d8c148eb77df16b5fc18b709262cf197009` |
| Tracked Modified (pre) | 0 |
| Staged (pre) | 0 |

## 5. Target Database

Password not printed.

| Field | Value |
| --- | --- |
| Host | 127.0.0.1 |
| Port | 55432 |
| Database | acf_dev |
| PGDATA | `D:\project\ai-content-factory\.local\postgres\data` |
| Reachable | YES |
| Production / other / empty new DB | NO |

Target Database Confirmed: **YES**

## 6. Current DB Classification

LIKELY_OLD_SNAPSHOT

## 7. Pre-migration Migration Status

`prisma migrate status --schema database/prisma/schema.prisma`

23 files in `prisma/migrations`. Last previously applied: `20260910020000_add_autonomous_research_learning`.

Pending Count: **5**
Unexpected Pending: **0**
Failed Migrations: **0**

## 8. Pending Migration List

1. `20260912020000_add_crop_review_approval_execution`
2. `20260912100000_add_output_strategy_selections`
3. `20260913220000_add_manual_publication_monitoring`
4. `20260914010000_add_performance_analysis`
5. `20260915080000_add_video_final_acceptance`

SQL safety (RC-09.2 audit): **PASS** (unchanged; not re-edited).

## 9. Pre-migration Old DB Snapshot

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
| PerformanceAnalysis | `performance_analyses` | TABLE_NOT_YET_PRESENT |
| Recommendation | `strategy_adjustment_recommendations` | 0 |
| Feedback cycle | `content_feedback_cycles` | TABLE_NOT_YET_PRESENT |

Sample Project IDs:

- `01a07240-555c-7832-b7a2-52acd547e653`
- `01a07240-5573-72f1-b439-0a6b94e7f24d`
- `01a07296-2c20-7213-92fb-0244ba725dcf`

Sample ContentPlan IDs:

- `01a075ca-20c7-74e1-8510-25bf4f53472e`
- `01a075cb-0571-7163-a8ea-62789d49b22d`
- `01a075cb-2002-7c31-a24e-a0e3ac018929`

Pre-migration Old DB Snapshot: **PASS**

## 10. Backup

`pg_dump -Fc` via Program Files PostgreSQL 16.15 client against embedded 16.14. Credentials via env, not printed.

| Field | Value |
| --- | --- |
| Path | `D:\acf-backups\acf_dev_pre_rc09_2b_20260918-104744.dump` |
| Size | 505666 bytes |
| Format | CUSTOM |
| Location | OUTSIDE_REPO (`D:\acf-backups\`) |
| Exists | YES |

Backup: **PASS**

## 11. Backup Readability

`pg_restore -l` TOC: dbname `acf_dev`, Format CUSTOM, dumped from 16.14, 414 TOC entries.

Archive Readable: **YES**
Restore executed: **NO**

## 12. Existing Cluster Verification

`SHOW data_directory` before and after: `D:/project/ai-content-factory/.local/postgres/data`
No initdb, no PGDATA swap.

Existing Cluster Preserved: **YES**

## 13. Deploy Command

Once:

```
node --env-file=.env ./node_modules/prisma/build/index.js migrate deploy --schema database/prisma/schema.prisma
```

Equivalent workspace script exists: `npm run migrate:deploy -w database` / root `npm run db:migrate:deploy`. CLI used matches that schema path.

Forbidden commands: not used.

## 14. Migration Results

Prisma: “All migrations have been successfully applied.”

| Migration | Result |
| --- | --- |
| `20260912020000_add_crop_review_approval_execution` | APPLIED |
| `20260912100000_add_output_strategy_selections` | APPLIED |
| `20260913220000_add_manual_publication_monitoring` | APPLIED |
| `20260914010000_add_performance_analysis` | APPLIED |
| `20260915080000_add_video_final_acceptance` | APPLIED |

## 15. Post-migration Status

`prisma migrate status`: **Database schema is up to date!**

Migration Status: **CLEAN**
Pending: **0**
Failed: **0**
Database schema is up to date: **YES**

## 16. `_prisma_migrations` Audit

All five rows: `finished_at` set, `rolled_back_at` null, logs not failure.

Authorized Migrations Recorded: **5 / 5**
Failed Migration Records: **0**

## 17. Pre-existing Data Integrity

Post counts match pre for existing tables: 81/81/82/90/14/21/19/8/10. Recommendation table still 0.

New tables present with count 0: crop review/approval/execution, output strategy, manual exports, monitoring targets, performance analyses, feedback cycles, video final acceptances.

Sample Existing Project IDs Preserved: **YES** (3/3)
Sample Existing ContentPlan IDs Preserved: **YES** (3/3)
Pre-existing Data Counts Preserved: **YES**

## 18. Schema Verification

| Area | Observed |
| --- | --- |
| Crop review / approval / execution | tables `crop_review_sessions`, `human_crop_approvals`, `crop_execution_authorizations`, `crop_execution_runs` |
| Output strategy | table `output_strategy_selections` |
| Manual publication monitoring | `publications.video_id` nullable; `lifecycle_status`, `monitoring_status`, `content_plan_id`; tables `manual_publication_exports`, `monitoring_targets` |
| Performance analysis | `performance_analyses`, `content_feedback_cycles` |
| Video final acceptance | `video_final_acceptances` |

Schema Verification: **PASS**

## 19. Backend Build

`npm run generate -w database` → Prisma Client v6.19.3 to `node_modules/@prisma/client` (not tracked).
`npm run build -w backend` → `nest build` exit 0.

Backend Build: **PASS**
Tracked Generated Changes: **0**

Backend / Worker / Frontend: **NOT_STARTED**

## 20. Git State

Tracked Modified: **0**
Staged: **0**
Git Mutation: **NO**
Untracked: prior RC audit markdown plus this report.

## 21. Database Mutation Summary

| Item | Value |
| --- | --- |
| Database Schema Mutated | YES |
| Vehicle | prisma migrate deploy (once) |
| Application Data Manually Mutated | NO |
| Seed | NO |
| Reset | NO |
| DB Push | NO |
| Migrate Dev | NO |
| Restore | NO |

## 22. Gate

Gate: **CURRENT_ACF_DEV_SCHEMA_READY**

Recommended Next Step: **RC_09_2C_REBUILD_RC_VALIDATION_DATASET**

STOP.
