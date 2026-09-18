# RC-09.3 Freeze New RC Database Baseline

Date: 2026-09-18
Mode: logical backup + documentation only. No business writes. No migrate deploy/reset/push. No Agent/video/publication/metrics rerun. No git mutation.

## 1. Phase

RC_09_3_FREEZE_NEW_RC_DATABASE_BASELINE

## 2. Git Baseline

| Field | Value |
| --- | --- |
| Repository | `D:\project\ai-content-factory` |
| Branch | `main` |
| HEAD | `296e6d8c148eb77df16b5fc18b709262cf197009` |
| Tag | `v0.9.0-rc.1` (annotated tag points at HEAD; `git describe --exact-match HEAD` = `v0.9.0-rc.1`) |

## 3. Database Identity

| Field | Value |
| --- | --- |
| Host | 127.0.0.1 |
| Port | 55432 |
| Database | acf_dev |
| Reachable | YES |
| Server | PostgreSQL 16.14 |
| Dump client | pg_dump 16.15 (`C:\Program Files\PostgreSQL\16\bin\pg_dump.exe`) |
| Password | not printed |

## 4. Migration Status

`prisma migrate status --schema database/prisma/schema.prisma`

23 migrations found. **Database schema is up to date.**

Migration Status: **CLEAN**
Failed Migrations: **0**
`_prisma_migrations` unfinished/rolled-back count: **0**

## 5. Validation Dataset Verification

Read-only Prisma/SQL checks of the RC-09.2E IDs:

| Check | Result |
| --- | --- |
| Project exists | YES |
| ContentPlan v1 exists | YES |
| ContentPlan v1 archived | YES (`ARCHIVED`) |
| Script exists | YES |
| Script confirmed | YES |
| Topic on script | YES `5c24881f-08e2-4a6d-8bbc-d717adc73657` |
| Video exists | YES `COMPLETED` |
| Video final accepted | YES record `01a0b298-f5bc-7552-8988-a9d51f23fe15` ACCEPTED current |
| Publication exists | YES `MANUAL` |
| Publication truth | USER_ASSERTED |
| Platform verification | NOT_VERIFIED |
| Metrics snapshot count | 2 (IDs and values match 120/18/4/2/5/1 and 168/29/7/4/9/3) |
| PerformanceAnalysis exists | YES |
| FeedbackCycle exists | YES (`APPLIED_TO_NEXT_PLAN`) |
| ContentPlan v2 exists | YES |
| ContentPlan v2 confirmed | YES version 2 |

RC Validation Dataset: **PASS**

## 6. Backup

`pg_dump -Fc` of `acf_dev`. Directory `D:\acf-backups\releases\` created. Filename did not already exist; no suffix needed.

| Field | Value |
| --- | --- |
| Backup Exists | YES |
| Backup Format | CUSTOM (`PGDMP`) |
| Backup Location | OUTSIDE_REPO |
| Backup Path | `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump` |

Backup: **PASS**

## 7. Backup Size

629795 bytes (> 0)

## 8. TOC Verification

`pg_restore -l` only. Restore **not** executed.

Archive Readable: **YES**
TOC Entries: **541** (archive header; gzip custom, dumped from 16.14)

Tables present in TOC:

- `projects`
- `content_plans`
- `scripts`
- `videos`
- `video_final_acceptances`
- `publications`
- `publication_metric_snapshots`
- `performance_analyses`
- `content_feedback_cycles`

## 9. SHA256

PowerShell-equivalent SHA256 of the dump file:

`EB3E58041CA4C19B20863ED39A53A798A249A1011F1FAB254CD4CC44DE0CE1F6`

SHA256 File: `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump.sha256`

Content: `EB3E58041CA4C19B20863ED39A53A798A249A1011F1FAB254CD4CC44DE0CE1F6  acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump`

## 10. Manifest

`D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline.manifest.txt`

Includes RC version, git commit/tag, Postgres version, CLEAN migrations, dump path/size/SHA256, all RC validation IDs, USER_ASSERTED / NOT_VERIFIED, metrics count 2, v2 current-cycle / v1 preserved.

## 11. Restore Runbook

Generated: `docs/release/rc-09-3-database-restore-runbook.md`

Restore executed: **NO**

## 12. Backup Policy

Generated: `docs/release/database-backup-policy.md`

DAILY (7–14), MILESTONE, RELEASE (permanent). RELEASE requires `.dump` + `.sha256` + `.manifest.txt`.

Future Script `npm run rc:backup`: **DEFERRED** (package.json not modified).

## 13. Code/Data Baseline Binding

| Side | Value |
| --- | --- |
| Code Commit | `296e6d8c148eb77df16b5fc18b709262cf197009` |
| Code Tag | `v0.9.0-rc.1` |
| Data Backup | `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump` |
| SHA256 | `EB3E58041CA4C19B20863ED39A53A798A249A1011F1FAB254CD4CC44DE0CE1F6` |
| Manifest | `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline.manifest.txt` |
| Validation Dataset | CURRENT_RC_VALIDATION_SOURCE_OF_TRUTH |

Code/Data Baseline Binding: **PASS**

## 14. Git State

Tracked Modified: **0**
Staged: **0**
Git Mutation: **NO**

Untracked (allowed): this report, restore runbook, backup policy, plus prior RC audit reports. Backup files are outside the repo.

## 15. Database Mutation

**NO** (dump/list/hash/read-only selects only)

## 16. Gate

All required conditions met.

Gate: **RC_CODE_AND_DATA_BASELINE_FROZEN**

Recommended Next Step: **RC_10_RELEASE_RUNBOOK_AND_RC_LAUNCH_PREP**

STOP.
