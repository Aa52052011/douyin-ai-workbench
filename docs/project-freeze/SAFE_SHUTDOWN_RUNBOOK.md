# Safe shutdown runbook

Reusable whenever this Windows RC must pause. Does not authorize database restore or git mutation.

## 1. Check no active video jobs

If Backend is up, inspect running jobs (UI or API). Do not kill a worker while a video/compose job is RUNNING unless the operator accepts job recovery via lease timeout.

## 2. Stop Frontend

Stop the `start-prod.mjs` / `next start` process on 3010 (SIGTERM). Confirm `http://127.0.0.1:3010/` no longer responds.

## 3. Stop Worker gracefully

Send SIGTERM to the single `node … dist\worker.js` process (parent PowerShell if that is how it was launched). Confirm zero `dist\worker.js` processes. Redis lock `acf:worker:singleton` expires in 30s if the process crashes without release.

## 4. Stop Backend gracefully

SIGTERM the `node … dist\main.js` process. Nest has `enableShutdownHooks()`. Confirm `http://127.0.0.1:3001/health` fails.

## 5. Redis handling

If Memurai was already a machine service before this project, **leave it running** unless you are shutting down the whole PC. Do not `npm run db:down` if that would also stop an unrelated Compose stack you still need.

To stop Memurai only when intended:

```powershell
Stop-Service Memurai
```

## 6. PostgreSQL clean shutdown

Only after API and worker are down:

```powershell
Set-Location "D:\project\ai-content-factory"
npm run db:local:stop
```

Do **not** stop Windows service `postgresql-x64-16` (Program Files) — RC uses embedded cluster on **55432**, not that service’s 5432.

## 7. Verify ports

Confirm not listening (or not serving the app): 3010, 3001, 55432. 6379 depends on step 5.

## 8. Verify Git working tree

```powershell
git -C "D:\project\ai-content-factory" status --short
```

Do not discard freeze docs. Do not `git clean`.

## 9. Checkpoint DB backup if meaningful changes occurred

If `acf_dev` changed since the last dump:

```text
pg_dump -Fc -h 127.0.0.1 -p 55432 -U acf -d acf_dev -f D:\acf-backups\checkpoints\<new-name>.dump
```

Password via env, never echoed. Do **not** overwrite:

`D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump`

## 10. Verify backup

```text
pg_restore -l <dump>
Get-FileHash <dump> -Algorithm SHA256
```

Write a `.sha256` sidecar next to the dump.

## 11. Finish shutdown

Machine may power off. Resume with `RESUME_RUNBOOK.md`.
