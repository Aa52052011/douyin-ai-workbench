# RC-09.3 Database Restore Runbook

RC Version: 0.9.0-rc.1
Code: `296e6d8c148eb77df16b5fc18b709262cf197009` (`v0.9.0-rc.1`)
Data backup: `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump`

This document is **operations only**. It does **not** authorize a restore by itself. Do not run restore as part of RC-09.3.

## Binding

| Item | Value |
| --- | --- |
| Dump | `acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump` |
| SHA256 | `EB3E58041CA4C19B20863ED39A53A798A249A1011F1FAB254CD4CC44DE0CE1F6` |
| Manifest | `acf_dev_v0.9.0-rc.1_validation-baseline.manifest.txt` |
| Source DB when dumped | `acf_dev` @ `127.0.0.1:55432` |
| Format | PostgreSQL custom (`pg_dump -Fc`) |

Verify SHA256 before any restore:

```powershell
Get-FileHash "D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump" -Algorithm SHA256
```

The hash must match the `.sha256` sidecar and the manifest.

## Hard rule

**Do not restore onto the currently running application database** (`acf_dev` on `127.0.0.1:55432` while Backend/Worker/Frontend are using it), **unless the user explicitly authorizes disaster recovery**.

Default path: restore into a **separate database** (recommended name: `acf_dev_restore_rc090`) on the same cluster or another cluster, then validate IDs and health there.

## Procedure

### 1. Stop Backend

Stop the Nest process bound to `127.0.0.1:3001`. Confirm `GET /health` is no longer served.

### 2. Stop Worker

Stop the single `node … dist\worker.js` process. Confirm worker count is 0.

### 3. Stop Frontend

Stop the Next process bound to `127.0.0.1:3010`. Confirm the origin is unreachable.

### 4. Confirm target database

Record, without printing passwords:

- Host / port
- Database name
- `SHOW data_directory;`
- Whether this is the live `acf_dev` used by the app

If the target is the live app DB and there is **no** explicit disaster-recovery authorization: **STOP**. Create or choose an isolated restore DB instead.

### 5. Backup the current target first

Even for an isolated restore DB that already has data, take a new `pg_dump -Fc` of the target **before** restore. Store it outside the repo (for example `D:\acf-backups\pre-restore\`). Do not overwrite the RC-09.3 release dump.

### 6. Create an independent restore database (preferred)

Example (credentials via env, never echoed):

```text
createdb -h 127.0.0.1 -p 55432 -U acf acf_dev_restore_rc090
```

Do not drop or recreate live `acf_dev` in this step.

### 7. Restore with pg_restore

Into the **isolated** database only:

```text
pg_restore -h 127.0.0.1 -p 55432 -U acf -d acf_dev_restore_rc090 --no-owner --no-acl "D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump"
```

Do not pipe this into live `acf_dev` unless disaster recovery is explicitly authorized.

Optional readability check (no data write):

```text
pg_restore -l "D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump"
```

### 8. Check migrations

Point a one-off `DATABASE_URL` at the restore DB (not committed). Run:

```text
prisma migrate status --schema database/prisma/schema.prisma
```

Expect **CLEAN** for this RC dump (23 migrations applied). Do **not** run `migrate deploy`, `migrate dev`, `db push`, or `migrate reset` unless a later authorized phase says so.

### 9. Verify validation IDs (read-only)

Confirm these rows exist in the restore DB:

| Object | ID |
| --- | --- |
| Project | `01a0b275-b904-7492-a5a3-185430e1d585` |
| ContentPlan v1 (ARCHIVED) | `01a0b279-ed8c-7c63-ac34-2ab58e0d5f0c` |
| Topic | `5c24881f-08e2-4a6d-8bbc-d717adc73657` |
| Script CONFIRMED | `01a0b283-d4c6-74f2-addf-186fb24b0c80` |
| Video | `56c9c55b-8784-4039-8e19-638d4c804439` |
| Publication USER_ASSERTED | `01a0b298-f772-7871-8de5-c3f41b5d9548` |
| Metric snapshot 1 | `01a0b298-f7b2-71c0-8fe3-4403ec9fce8e` |
| Metric snapshot 2 | `01a0b298-fdb4-7342-b714-e9a5130d7ccb` |
| Performance analysis | `01a0b298-fe05-7b13-b25e-5f06ea72108b` |
| Feedback cycle | `01a0b298-fe11-7e80-9d1c-95719078e91b` |
| ContentPlan v2 CONFIRMED | `01a0b299-d07d-77f1-b2f0-db14777451c3` |

Also confirm: metrics count 2; publication not platform-verified; v1 preserved; v2 current-cycle.

### 10. Verify application health

Only after the app `DATABASE_URL` is intentionally pointed at a validated database:

- Backend `GET /health` → 200
- Worker count 1
- Frontend reachable

If restore was into an isolated DB, do **not** silently retarget production/live `.env`. That is a separate authorized cutover.

## Disaster recovery onto live `acf_dev`

Allowed **only** with explicit user authorization. Then still: stop all three processes, dump the current live DB first, restore, migrate status, ID check, then start processes and health-check.

## Forbidden during restore

- `prisma migrate reset` / `db push` / seed as a substitute for dump restore
- Overwriting the release dump or its `.sha256` / `.manifest.txt`
- Printing database passwords
