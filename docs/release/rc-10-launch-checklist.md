# RC-10 Launch Checklist

RC Version: 0.9.0-rc.1
Use with `docs/release/rc-10-release-runbook.md`. Tick only from evidence. Do not stage this file.

## Identity

- [ ] Git commit `296e6d8c148eb77df16b5fc18b709262cf197009`
- [ ] Git tag `v0.9.0-rc.1` on that commit
- [ ] Branch `main`
- [ ] Remote `git@github.com:Aa52052011/douyin-ai-workbench.git`
- [ ] Product version `0.9.0-rc.1` (root `package.json`)

## Data

- [ ] Database `acf_dev` @ `127.0.0.1:55432`
- [ ] `prisma migrate status` **CLEAN**
- [ ] Release dump exists: `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump`
- [ ] SHA256 `EB3E58041CA4C19B20863ED39A53A798A249A1011F1FAB254CD4CC44DE0CE1F6`
- [ ] Manifest + `.sha256` sidecar present
- [ ] RC validation IDs present (see runbook §6)
- [ ] Restore path documented (`docs/release/rc-09-3-database-restore-runbook.md`) — restore **not** run unless authorized

## Runtime start (order)

- [ ] Postgres 55432 reachable
- [ ] Redis 6379 reachable
- [ ] Backend `GET /health` 200
- [ ] Worker Count **1** (was 0 before start)
- [ ] Frontend `http://127.0.0.1:3010` reachable
- [ ] FFmpeg available (this lab: 9.0.1)

## Contracts testers must accept

- [ ] Publication MANUAL / USER_ASSERTED / NOT_VERIFIED
- [ ] Auto publish NO; auto metrics NO
- [ ] Download = DOWNLOAD_STARTED (not DOWNLOAD_COMPLETED)
- [ ] Script AGENT_INVALID_OUTPUT may recur; limited retry only

## 9 routes

- [ ] Dashboard
- [ ] Projects
- [ ] Project Overview
- [ ] Positioning
- [ ] Content Planning
- [ ] Scripts
- [ ] Video
- [ ] Publish / Data
- [ ] AI Review

## Smoke

- [ ] Login works
- [ ] Project / positioning / current plan (v2) visible
- [ ] Script / video playable / final acceptance visible
- [ ] Publication / two metrics / analysis / review states visible
- [ ] Accepted-only handoff / v2 current-cycle / v1 historical

## Git hygiene at freeze

- [ ] Tracked Modified 0
- [ ] Staged 0
- [ ] Secrets not committed (`.env` untracked; dump outside repo)
- [ ] No `git add` / commit / tag / push in RC-10

## Status (this freeze)

| Channel | Status |
| --- | --- |
| LOCAL_WINDOWS_WEB_RC | READY |
| SINGLE_VPS_WEB_RC | PARTIAL |
| TAURI_RC | NOT_READY |
| PRODUCTION_GA | NOT_READY |

P0: 0 · P1: 0 · P2: 4 · P3: 2 (see known-limitations)
