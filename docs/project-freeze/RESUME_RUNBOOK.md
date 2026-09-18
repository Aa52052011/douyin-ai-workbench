# Resume runbook (from cold Windows boot)

Repository: `D:\project\ai-content-factory`

Do not migrate, do not rebuild the validation dataset, do not start Phase II-A.6 until VPS + domain + DNS exist.

## 1. Open repository

```powershell
Set-Location "D:\project\ai-content-factory"
$env:Path = "$env:LOCALAPPDATA\nodejs;$env:LOCALAPPDATA\ffmpeg;C:\Program Files\Git\cmd;" + $env:Path
```

## 2. Verify HEAD

```powershell
git rev-parse HEAD
```

Must be `f09109fd9bf94767ee2fc8f82a4e127346d9b980`. If not, STOP and do not invent a fix.

## 3. Verify tags

```powershell
git rev-list -n 1 v0.9.1-rc.1
git rev-list -n 1 v0.9.0-rc.1
```

Must be `f09109fd9bf94767ee2fc8f82a4e127346d9b980` and `296e6d8c148eb77df16b5fc18b709262cf197009`.

## 4. Verify working tree

```powershell
git status --short
```

Expect clean, or only reviewed freeze-doc changes. Do not `git add -A`.

## 5. Start PostgreSQL (embedded RC cluster)

```powershell
npm run db:local:status
```

If 55432 is not listening:

```powershell
npm run db:local:start
```

This is **not** `npm run db:up` (Compose 5432). RC `DATABASE_URL` must keep port **55432**.

## 6. Verify 55432

`npm run db:local:status` should show `port 127.0.0.1:55432 listening=true`.

## 7. Migration status (read only)

```powershell
npx prisma migrate status --schema database/prisma/schema.prisma
```

Expect: 23 migrations, **Database schema is up to date**. Do **not** `migrate deploy` / `migrate reset` / `db push`.

## 8. Start Redis if needed

Memurai Windows service `Memurai` is the RC Redis on `127.0.0.1:6379`. If stopped:

```powershell
Start-Service Memurai
```

Do not start Compose Redis unless you intend a different topology.

## 9. Verify 6379

```powershell
redis-cli -h 127.0.0.1 -p 6379 ping
```

Expect `PONG`.

## 10. Start Backend

Requires root `.env` (secrets stay on disk, not in git).

```powershell
Set-Location "D:\project\ai-content-factory\apps\backend"
$env:Path = "$env:LOCALAPPDATA\nodejs;$env:LOCALAPPDATA\ffmpeg;" + $env:Path
node --env-file=..\..\.env dist\main.js
```

If `dist\main.js` is missing: `Set-Location D:\project\ai-content-factory; npm run build -w backend` then retry. Do not change source to make it boot.

## 11. Verify `/health`

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" -UseBasicParsing
```

Expect 200.

## 12. Start Worker

Only **one** process:

```powershell
Set-Location "D:\project\ai-content-factory\apps\backend"
node --env-file=..\..\.env dist\worker.js
```

Log should include `Job worker started`. A second instance should exit with `Worker instance lock already held`.

## 13. Confirm worker count 1

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'dist\\worker\.js' }
```

Count must be 1.

## 14. Start Frontend

```powershell
Set-Location "D:\project\ai-content-factory\apps\frontend"
node --env-file=..\..\.env .\scripts\start-prod.mjs
```

Binds `FRONTEND_HOST`/`FRONTEND_PORT` (defaults `127.0.0.1:3010`). If `.next` is missing: `npm run build -w frontend` from repo root.

## 15. Verify 3010

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:3010/" -UseBasicParsing
```

Expect 200.

## 16. Verify RC validation IDs

Read-only Prisma lookup of IDs in `PROJECT_STATE_20260918.md` section 6. Do not insert/update rows. ContentPlan v2 must remain CONFIRMED.

## 17. Verify Git remote

Temporary SSH only (do not `git config core.sshCommand`):

```powershell
$sshCmd = "ssh -i C:/Users/Administrator/.ssh/id_ed25519_github -o IdentitiesOnly=yes"
git -c "core.sshCommand=$sshCmd" ls-remote --heads origin refs/heads/main
```

Expect `f09109fd9bf94767ee2fc8f82a4e127346d9b980`.

## 18. Review PROJECT_STATE

Read `docs/project-freeze/PROJECT_STATE_20260918.md`.

## 19. Confirm external VPS/domain readiness

If VPS, domain, or DNS is still missing: remain paused. Do not start II-A.6.

## 20. Continue Phase II-A.6

Only when those externals exist: `PHASE_II_A6_REAL_VPS_DEPLOYMENT_REHEARSAL` using `docs/commercial-launch/` runbooks. Do not retag `v0.9.0-rc.1`.
