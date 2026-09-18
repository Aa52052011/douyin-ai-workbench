# Phase II-A.5.2 Freeze Single VPS production hardening candidate

Date: 2026-09-18. Local commit only. No push. No new tag. Existing `v0.9.0-rc.1` not moved.

## 1. Authorization

ALLOW_STAGE: YES
ALLOW_COMMIT: YES
ALLOW_PUSH: NO
ALLOW_NEW_TAG: NO
ALLOW_MOVE_EXISTING_TAG: NO
ALLOW_AMEND: NO

Authorization: **EXPLICIT_USER_APPROVAL**

## 2. Base Commit

Branch: `main`
Local HEAD before commit: `4f716c0409d373d1379287edf1d2a4515099dd49`
Remote main (recorded): `4f716c0409d373d1379287edf1d2a4515099dd49`

## 3. Existing RC Tag

Tag: `v0.9.0-rc.1`
Target: `296e6d8c148eb77df16b5fc18b709262cf197009`
Must remain unchanged after commit.

## 4. Dirty Workspace Audit

Pre-commit dirty files: **47** (44 from II-A.2–II-A.5.1 + this report + staging manifest + `.gitignore` exception).

| Class | Count |
| --- | --- |
| A Phase II-A production hardening | 34 |
| B Commercial-launch documentation | 13 |
| C Unrelated | 0 |
| D Runtime/generated | 0 |
| E Secrets/config-local | 0 |
| F Review required | 0 |

Total Dirty Files: **47**
Phase II-A Candidate Files: **47**
Unrelated: **0**
Runtime/Generated: **0**
Secret/Local: **0**
Review Required: **0**

## 5. Include List

See `phase-ii-a5-2-production-hardening-staging-manifest.md`. Included Files: **47**.

## 6. Exclude List

No dirty-workspace excludes. Gitignored local `.env`, `dist`, `.next`, postgres data, and similar were not staged.

## 7. Secret Scan

Candidate INCLUDE scanned for API keys, real `DATABASE_URL` passwords, JWT material, Router One, Douyin secret, master key, Bearer tokens, cookies, private keys, production passwords.

Sensitive Findings: **0**
.env.example Secret Safe: **YES**
Deployment Package Secret Hygiene: **PASS**

## 8. Production Hardening Coverage

| Item | Present |
| --- | --- |
| A production env portability | `.env.example`, `runtime-env.ts` |
| B frontend production startup | `start-prod.mjs`, `package.json` `start` |
| C backend configurable bind | `listen-config.ts`, `main.ts` |
| D CORS production config | `cors-origin.ts`, wildcard reject |
| E COOKIE_SECURE production fail-fast | `runtime-env.ts` |
| F worker single-instance lock | `worker-instance-lock.ts` |
| G worker graceful shutdown | `worker.ts` SIGTERM + lock release |
| H backend graceful shutdown | `app.enableShutdownHooks()` in `main.ts` |
| I systemd templates | `deploy/systemd/acf-*.service` |
| J Nginx template | `deploy/nginx/ai-content-factory.conf` |
| K production env template | `deploy/env/.env.production.example` |
| L backup scripts/timer | `backup-*.sh`, `acf-backup.service/.timer` |
| M preflight/health scripts | `preflight.sh`, `health-check.sh` |
| N deployment/rollback runbooks | II-A.5 runbooks |
| O loopback-only trust proxy | `trust-proxy.ts` |

Production Hardening Coverage: **PASS**

Schema Files Modified: **0**
Migration Files Modified: **0**
Database Dumps Included: **0**
Business Data Files: **0**
Database Mutation: **NO**

## 9. Builds

Frontend production build: **PASS**
Backend build: **PASS**
Worker build (`npm run build -w workers` → backend nest build): **PASS**

## 10. Tests

`vitest` 5 files, 47 tests passed (`runtime-env`, `cors-origin`, `listen-config`, `trust-proxy`, `worker-instance-lock`).

Config Tests: **PASS**
Worker Singleton Tests: **PASS**
Trust Proxy Tests: **PASS**

## 11. Local Runtime Regression

Verified without restarting DB/Redis. Backend already on post-II-A.5.1 `dist`.

| Check | Result |
| --- | --- |
| Postgres `127.0.0.1:55432` | REACHABLE |
| Redis PING | REACHABLE |
| `GET /health` | 200 |
| Worker PID 15100 | 1 |
| Frontend `127.0.0.1:3010` | 200 |

Local Runtime Regression: **PASS**

## 12. Validation Baseline

Read-only Prisma lookup:

- Project `01a0b275-b904-7492-a5a3-185430e1d585` exists
- ContentPlan `01a0b299-d07d-77f1-b2f0-db14777451c3` status **CONFIRMED** version **2**

Validation Baseline Preserved: **YES**

## 13. Staging Audit

Precise `git add -- <paths>` only. No `git add .` / `-A`.

Cached categories (expected):

- Frontend Config Files: 5
- Backend Runtime Files: 11
- Worker Runtime Files: 4
- Deploy Files: 12
- Root (`.env.example` + `.gitignore`): 2
- Commercial Docs: 13
- Business Feature Files: 0
- Migration Files: 0
- Backup Binaries: 0
- Secrets: 0
- Unexpected: 0

Commit Scope: **SINGLE_VPS_PRODUCTION_HARDENING_ONLY**

## 14. Cached Diff Check

`git diff --cached --check` must PASS before commit (recorded in Final Output after stage).

## 15. Commit

Message: `chore(deploy): prepare single-vps production runtime`
Amend: NO
Parent must be `4f716c0409d373d1379287edf1d2a4515099dd49`

## 16. Commit Hash

Filled after `git commit` in working notes / Final Output.

## 17. Tag Integrity

`git rev-list -n 1 v0.9.0-rc.1` must remain `296e6d8c148eb77df16b5fc18b709262cf197009`.
Existing RC Tag Moved: **NO** (verified after commit)

## 18. Remote Mutation

Git Push: **NO**
New Tag: **NO**
GitHub Release: **NO**
Remote Modified: **NO**

## 19. Final Working Tree

Target: Tracked Modified 0, Staged 0, Remaining Untracked 0.

## 20. Gate

If all checks in §29 of the phase brief hold: **SINGLE_VPS_PRODUCTION_HARDENING_COMMITTED_LOCALLY**

## 21. Recommended Next Step

PHASE_II_A5_3_REVIEW_PUSH_AND_CREATE_COMMERCIAL_VPS_CANDIDATE_TAG
