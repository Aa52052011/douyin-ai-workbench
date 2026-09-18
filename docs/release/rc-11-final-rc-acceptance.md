# RC-11 Final RC Acceptance

Date: 2026-09-18
Mode: read-only verification and release decision. No source, schema, `.env`, migration, business-data, or git mutation. No GitHub Release.

## 1. Release Identity

| Field | Value |
| --- | --- |
| Product | 抖音AI智能工作台 |
| Release | 0.9.0-rc.1 |
| Release Class | LOCAL_WINDOWS_WEB_RC |
| Status | **RC_ACCEPTED** |
| Code Baseline | `296e6d8c148eb77df16b5fc18b709262cf197009` |
| Tag | `v0.9.0-rc.1` |
| Validation Baseline | CURRENT_RC_VALIDATION_SOURCE_OF_TRUTH |

This acceptance is **not** Production GA, VPS, or Tauri.

## 2. Code Baseline

| Check | Result |
| --- | --- |
| HEAD | `296e6d8c148eb77df16b5fc18b709262cf197009` |
| Branch | `main` |
| Local tag | `v0.9.0-rc.1` (annotated) |
| Local tag peeled | `296e6d8c148eb77df16b5fc18b709262cf197009` (`refs/tags/v0.9.0-rc.1^{}`) |
| `origin/main` | `296e6d8c148eb77df16b5fc18b709262cf197009` |
| Remote URL | `git@github.com:Aa52052011/douyin-ai-workbench.git` |
| Live `git ls-remote` tags | UNAVAILABLE this session (`Permission denied (publickey)`). Does not contradict local peeled tag + `origin/main`. |

Git Baseline Integrity: **PASS**

Tracked Modified: **0**
Staged: **0**
Untracked release docs (before RC-11 files): **21** (allowed; not staged)

## 3. Data Baseline

| Check | Result |
| --- | --- |
| Database | `acf_dev` @ `127.0.0.1:55432` |
| Postgres | REACHABLE |
| `prisma migrate status` | Database schema is up to date (23 migrations) |
| Pending | 0 |
| Failed | 0 |

Database Baseline Integrity: **PASS**

## 4. Backup

| Field | Value |
| --- | --- |
| Path | `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump` |
| Exists | YES |
| Size | 629795 |
| Recalculated SHA256 | `EB3E58041CA4C19B20863ED39A53A798A249A1011F1FAB254CD4CC44DE0CE1F6` |
| SHA256 Match | **YES** |
| Sidecar | `.dump.sha256` present |

Backup Integrity: **PASS**

## 5. SHA256

`EB3E58041CA4C19B20863ED39A53A798A249A1011F1FAB254CD4CC44DE0CE1F6`

## 6. Validation Dataset

`pg_restore -l` header: CUSTOM, gzip, dbname `acf_dev`, TOC Entries 541, dumped from 16.14. Restore **not** executed.

Backup Archive Readable: **YES**

Manifest `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline.manifest.txt` binds RC version, git commit/tag, database, CLEAN, dump filename, SHA256, and all validation IDs.

Manifest Integrity: **PASS**

All listed RC IDs exist (project, v1 archived, topic on confirmed script, video, publication, two metrics, analysis, feedback cycle, v2 confirmed).

Validation Source of Truth: **PASS**

Validation Semantics: **PASS**

| Fact | Evidence |
| --- | --- |
| Positioning | CONFIRMED (RC-09.2C; not re-run) |
| ContentPlan v1 | ARCHIVED / historical |
| Script | CONFIRMED |
| Video | COMPLETED + final acceptance ACCEPTED current |
| Download | DOWNLOAD_STARTED (RC-09.2E; not re-exported) |
| Publication | MANUAL, USER_ASSERTED, NOT_VERIFIED |
| Metrics | 2 snapshots, IDs match |
| Performance Analysis | ACTIVE / AgentRun completed |
| Recommendations | ACCEPTED 1, REJECTED 1, DEFERRED 1, PENDING 3 |
| Feedback Handoff | ACCEPTED_ONLY (`APPLIED_TO_NEXT_PLAN`) |
| ContentPlan v2 | CONFIRMED version 2 |
| Current-cycle / Historical isolation | PASS |

## 7. Runtime Readiness

Services were running at RC-11 start; health was checked (not treated as a product defect if later stopped).

| Check | Result |
| --- | --- |
| Postgres 55432 | REACHABLE |
| Redis 6379 | REACHABLE |
| Backend `/health` | 200 `ok` |
| Worker Count | **1** (`dist\worker.js` PID 12512) |
| Frontend 3010 | 200 |
| FFmpeg | AVAILABLE 9.0.1 |

Runtime Status: **RUNNING_HEALTHY**
Runtime Runbook: **VERIFIED** (`docs/release/rc-10-release-runbook.md`)

## 8. Functional Scope (READY IN RC)

Account Positioning; Content Planning; Script Generation; Video Generation; Final Video Acceptance; Download Started; Manual Publication Registration; Manual Metrics; Performance Analysis; Recommendation Review; Accepted-only Feedback; Next-cycle ContentPlan; Current-cycle Isolation; Historical Isolation.

Frozen Routes: **9 / 9 PASS** (RC-09.2E evidence; no regression indicated; full loop not re-run)

## 9. Deferred Scope (not blockers)

Official Douyin Auto Publish; Automatic Douyin Metrics Fetch; Platform-verified Publication; Tauri distribution; Single VPS production deployment; Cloud multi-service deployment; Multi-user production SaaS; Production GA hardening.

## 10. Known Limitations

See `docs/release/rc-10-known-limitations.md`.

KNOWN_NON_BLOCKING_MODEL_OUTPUT_VARIANCE: Script Generation first call `AGENT_INVALID_OUTPUT`; Retry 1 SUCCESS. Not P1. Limited retry only.

## 11. P0 / P1 / P2 / P3

| Severity | Count | Blocks LOCAL_WINDOWS_WEB_RC |
| --- | --- | --- |
| P0 | **0** | — |
| P1 | **0** | — |
| P2 | **4** | **NO** (`.env.example` empty; CORS 3000 vs FE 3010; no worker singleton; localhost defaults) |
| P3 | **2** | **NO** (README wording; workspace package versions) |

## 12. Secret Hygiene

| Check | Result |
| --- | --- |
| Tracked `.env` | NO (gitignore; `ls-files --error-unmatch .env` fails) |
| Tracked `.env.example` | YES, empty (allowed) |
| Real provider keys tracked | NO |
| Real Douyin secret tracked | NO |
| Private SSH key tracked | NO |
| Tracked “sk-live” hit | fixture string in `scripts/step-13.15-dogfood-report.mjs` (`sk-live-should-not-appear`) — redaction test, not a live key |

Secret Hygiene: **PASS**

## 13. Release Decision

| Target | Decision |
| --- | --- |
| LOCAL_WINDOWS_WEB_RC | **ACCEPT** |
| SINGLE_VPS_WEB_RC | NOT_ACCEPTED_YET |
| TAURI_RC | NOT_ACCEPTED_YET |
| PRODUCTION_GA | NOT_ACCEPTED_YET |

Local RC accept ≠ Production GA.

## 14. Recovery Assets

- Dump + SHA256 sidecar + manifest under `D:\acf-backups\releases\`
- Restore runbook: `docs/release/rc-09-3-database-restore-runbook.md` (isolated DB first; no unauthorized overwrite of live `acf_dev`)
- Media files are **not** inside the SQL dump (`MEDIA_STORAGE_ROOT` / `./storage`)

## 15. Operational Constraints

Start order: Postgres 55432 → Redis 6379 → Backend 3001 → one Worker → Frontend 3010.
Do not start a second worker; do not kill worker mid-job; do not migrate/reset/seed; do not overwrite the release dump; publication remains USER_ASSERTED.

No new git tag (`v0.9.0` / rc.2). No GitHub Release in this phase.

## 16. Final Gate

All required PASS conditions met. P0=0, P1=0.

Gate: **V0_9_0_RC_1_LOCAL_WINDOWS_WEB_RC_ACCEPTED**

Recommended Next Step: **RC_12_RELEASE_DOCUMENTATION_COMMIT_AND_OPTIONAL_GITHUB_RELEASE_PREP** (not started here).

STOP.
