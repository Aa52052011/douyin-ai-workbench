# Phase II-A.5 PostgreSQL 16 VPS runbook

Do not run on a live VPS in this phase. No public `5432`. No real passwords in this file.

## Install

Ubuntu: `postgresql-16` (or distro default 16). Bind `listen_addresses = '127.0.0.1'`. `pg_hba.conf`: local/scram for `127.0.0.1/32` only.

## Database and role

Create a dedicated role and database (names are examples):

- database: `acf_prod`
- role: `acf_app` (login, no superuser, no CREATEDB after setup)
- `SEARCH_PATH` / Prisma `?schema=public`

`DATABASE_URL=postgresql://acf_app:PASSWORD@127.0.0.1:5432/acf_prod`

Firewall: do not allow 5432/tcp from the internet.

## Migrate (after backup)

Never: `migrate dev`, `db push`, `migrate reset`, seed.

1. `pg_dump -Fc` (or `deploy/scripts/backup-postgres.sh`)
2. `npx prisma migrate status --schema database/prisma/schema.prisma` (from repo root / `npm run` workspace)
3. `npm run db:migrate:deploy`
4. Confirm CLEAN
5. Then start/restart app units

## Backup

Daily `-Fc` dumps, 7-day retention, SHA-256 sidecar. Restore into a **new** database, verify, then switch. Do not restore onto a live in-use DB without explicit authorization.
