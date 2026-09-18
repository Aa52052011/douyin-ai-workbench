# Phase II-A.5.2 Staging Manifest

Date: 2026-09-18. Precise INCLUDE for a local documentation + deployment/code hardening commit. No push. No tag.

## Identifiers

Base HEAD: `4f716c0409d373d1379287edf1d2a4515099dd49`
Existing Tag: `v0.9.0-rc.1`
Existing Tag Target: `296e6d8c148eb77df16b5fc18b709262cf197009`
Product Baseline Commit: `296e6d8c148eb77df16b5fc18b709262cf197009`
Branch: `main`

## Classification counts (dirty workspace before this commit)

Total Dirty Files: **47** (44 pre-existing + this manifest + freeze report + `.gitignore` exception for the production env template)

Phase II-A Candidate Files: **47**
Unrelated: **0**
Runtime/Generated: **0**
Secret/Local: **0**
Review Required: **0**

## Candidate Files (INCLUDE)

All classified **A** (Phase II-A production hardening) and/or **B** (commercial-launch documentation). None C–F.

### Root

- `.env.example` — A (II-A.2 / II-A.5.1 placeholders)
- `.gitignore` — A (allow `deploy/env/.env.production.example`; keep real `.env*` ignored)

### Frontend production config/startup — A (II-A.2)

- `apps/frontend/next.config.ts`
- `apps/frontend/package.json`
- `apps/frontend/scripts/start-prod.mjs`
- `apps/frontend/src/lib/backend-rewrite-url.ts`
- `apps/frontend/src/lib/backend-rewrite-url.selfcheck.ts`

### Backend bootstrap/config/trust proxy — A (II-A.2 / II-A.5.1)

- `apps/backend/src/main.ts`
- `apps/backend/src/configure-app.ts`
- `apps/backend/src/auth/auth.controller.ts`
- `apps/backend/src/config/runtime-env.ts`
- `apps/backend/src/config/runtime-env.spec.ts`
- `apps/backend/src/config/cors-origin.ts`
- `apps/backend/src/config/cors-origin.spec.ts`
- `apps/backend/src/config/listen-config.ts`
- `apps/backend/src/config/listen-config.spec.ts`
- `apps/backend/src/config/trust-proxy.ts`
- `apps/backend/src/config/trust-proxy.spec.ts`

### Worker runtime / single-instance lock — A (II-A.3)

- `apps/backend/src/worker.ts`
- `apps/backend/src/jobs/job.worker.ts`
- `apps/backend/src/jobs/worker-instance-lock.ts`
- `apps/backend/src/jobs/worker-instance-lock.spec.ts`

### deploy/ — A (II-A.3 / II-A.5)

- `deploy/env/.env.production.example`
- `deploy/nginx/ai-content-factory.conf`
- `deploy/scripts/backup-all.sh`
- `deploy/scripts/backup-media.sh`
- `deploy/scripts/backup-postgres.sh`
- `deploy/scripts/health-check.sh`
- `deploy/scripts/preflight.sh`
- `deploy/systemd/acf-backend.service`
- `deploy/systemd/acf-frontend.service`
- `deploy/systemd/acf-worker.service`
- `deploy/systemd/acf-backup.service`
- `deploy/systemd/acf-backup.timer`

### docs/commercial-launch/ — B (II-A.1 ~ II-A.5.2)

- `docs/commercial-launch/phase-ii-a1-single-vps-gap-audit.md`
- `docs/commercial-launch/phase-ii-a2-configuration-env-portability.md`
- `docs/commercial-launch/phase-ii-a3-runtime-systemd-runbook.md`
- `docs/commercial-launch/phase-ii-a3-worker-systemd-hardening.md`
- `docs/commercial-launch/phase-ii-a5-certbot-https-runbook.md`
- `docs/commercial-launch/phase-ii-a5-nginx-https-deployment-package.md`
- `docs/commercial-launch/phase-ii-a5-postgresql-vps-runbook.md`
- `docs/commercial-launch/phase-ii-a5-redis-vps-runbook.md`
- `docs/commercial-launch/phase-ii-a5-single-vps-deployment-runbook.md`
- `docs/commercial-launch/phase-ii-a5-vps-rollback-runbook.md`
- `docs/commercial-launch/phase-ii-a5-1-reverse-proxy-trust-boundary.md`
- `docs/commercial-launch/phase-ii-a5-2-production-hardening-staging-manifest.md`
- `docs/commercial-launch/phase-ii-a5-2-freeze-production-hardening-candidate.md`

Included Files: **47**

## Excluded Files

Not in `git status` (gitignored or never dirty). Not staged:

- `.env` (local RC secrets)
- `deploy/env/.env.production` (must not exist in repo; real VPS copy only)
- `node_modules/`
- `apps/frontend/.next/`
- `apps/backend/dist/`
- `coverage/`
- `.local/postgres/` and PostgreSQL data
- Redis dump
- media outputs / uploads / generated A/V
- runtime logs
- database dumps / `*.sql` backups
- private SSH keys
- `database/prisma/schema.prisma` (unchanged)
- `database/prisma/migrations/` (unchanged)

Excluded Files: **0 dirty-workspace files** (all listed exclusions were absent from `git status --short`)

## Scans

Sensitive Findings: **0**
Source/business files: production hardening only (bind, CORS, cookies, worker lock, trust proxy, frontend loopback start). No product-feature modules.
Schema/Migrations: **0**
Backup binaries: **0**
Secrets: **0**

`.env.example` Secret Safe: **YES** (placeholders `USERNAME:PASSWORD`, `CHANGE_ME_*` only)
Deployment Package Secret Hygiene: **PASS**
