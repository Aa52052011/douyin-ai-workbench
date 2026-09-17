# RC-01 Read-Only Baseline Audit

Date: 2026-09-17
Mode: read-only. No git mutation. No `.env` write. No DB write. No provider/LLM calls.

UI_UX / PHASE_I / PHASE_I_5: FROZEN_PASS (declared). Surface Comfort Browser Acceptance: PASS (declared).

---

## 1. Current Branch

`main`

HEAD: `b063fc4` (`recovery: establish final clean baseline`)

## 2. Git Status Summary

Working tree **dirty**. Staged: 0. Modified: 169. Untracked: 115. Deleted: 0. Conflicts: none.

This is expected before an RC commit boundary. Not classified as P0/P1 product defect.

## 3. Staged Files

None.

## 4. Modified Files

169 paths. Includes backend video/performance/publication work, Prisma schema, frontend Phase I / I.5 UI token and workspace files, `docs/README.md`. Sample families:

- `apps/backend/src/videos/**`, `performance-analysis/**`, `publishing/**`, `media/**`
- `apps/frontend/src/app/**`, `components/**`, `lib/**`, `globals.css`, `package.json`
- `database/prisma/schema.prisma`

## 5. Untracked Files

115 paths. Families:

- Backend: TTS subtitles, recommendation mapper, publication source binding, video final acceptance
- Frontend: productization components + selfchecks (`surface-comfort-pass`, `color-comfort-polish`, `final-ui-regression`, diagnostics)
- `database/prisma/migrations/20260915080000_add_video_final_acceptance/` (applied; DB reports up to date)
- `docs/ui-ux/**` (UI freeze reports)
- `docs/ui-ux/acf-ui-diag-console-snippet.js` (debug snippet)
- `database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz`
- `dump.rdb`

## 6. Merge/Rebase State

Merge: **NONE**
Rebase: **NONE**
Cherry-pick: **NONE**
Conflicts: **NONE**

## 7. Recent Commits

```
b063fc4 recovery: establish final clean baseline
9c3cfe1 recovery: create emergency baseline after source restoration
2bd090e release: prepare v0.1.0-rc.2 UX consolidation
557fd28 release: prepare Web V1 0.1.0-rc.1
73cc0f6 feat: implement agent engine foundation
```

## 8. Temporary/Debug Files

| Item | Class |
| --- | --- |
| `apps/frontend/src/lib/ui-interaction-diagnostics.ts` (loaded only when `NODE_ENV === "development"`) | KEEP |
| `apps/frontend/src/lib/ui-interaction-diagnostics.selfcheck.ts` | KEEP |
| `docs/ui-ux/acf-ui-diag-console-snippet.js` | REMOVE_BEFORE_RC |
| Cloudflare / trycloudflare Douyin redirect in local `.env` | REMOVE_BEFORE_RC (local config; not tracked) |
| `dump.rdb` | REMOVE_BEFORE_RC / NOT_TRACKED |
| `database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz` | REMOVE_BEFORE_RC / NOT_TRACKED |
| `apps/frontend/.next` | IGNORED |
| `node_modules` | IGNORED |
| `.local/` | IGNORED |
| `coverage` | IGNORED |
| `storage/` / `apps/backend/storage/` | IGNORED |
| PID files | NOT_TRACKED (none found) |
| Test-only product routes | NOT_TRACKED as extra routes; 9 frozen app routes still present |

This phase did **not** delete anything.

## 9. Secret Tracking Audit

Tracked Secret Files: **NO**

Git tracks `.env.example` (root file exists but is empty) and `database/.env.example`. `.env` and `database/.env` are gitignored.

Local `.env` **keys present** (values not printed): `DATABASE_URL`, `JWT_ACCESS_SECRET`, `MODEL_*`, `MINIMAX_TTS_*`, `REDIS_URL`, `WANX_*`, `DOUYIN_CLIENT_KEY`, `DOUYIN_CLIENT_SECRET`, `DOUYIN_REDIRECT_URI`, `PLATFORM_SECRET_MASTER_KEY`.

Potential Secret Exposure: **NONE in git index**. Historical Douyin Client Secret was previously exposed in a screenshot (operator-declared).

Secret Values Printed: **NO** (this report)

ROTATION_REQUIRED_BEFORE_REAL_DOUYIN_OAUTH: **YES**

## 10. .gitignore Audit

Covered: `node_modules`, `.next`, `dist`, `coverage`, `.local/`, `*.log`, `.env` / `.env.*` with `!.env.example`, storage/uploads/exports.

Gaps (report only):

- `dump.rdb` / `*.rdb` not ignored
- Embedded Postgres `.tgz` not ignored
- No explicit `*.pid`, `temp/`, `downloads/`
- Video artifacts otherwise covered via `storage/`

## 11. Frontend Typecheck

PASS (`npx tsc --noEmit` then `next build` TypeScript step, exit 0)

## 12. Frontend Build

PASS (`npx next build`, Next.js 16.3.3)

## 13. UI Regression Checks

PASS:

- check:phase-a … check:phase-h
- final-ui-regression
- check:visual-color-system
- check:color-comfort-polish
- check:surface-comfort-pass

## 14. Backend Build

PASS (`npx nest build`, exit 0)

## 15. Backend Health

PASS
`GET http://127.0.0.1:3001/health` → HTTP 200 `{"service":"backend","status":"ok"}`

Backend was **not** restarted.

## 16. Backend Port Owner

Port 3001 Listen: PID **8680** (`node`, `dist\main`)

Additional `dist\main` process PID **14384** observed (not the Listen owner). Duplicate listen: **NO**. Extra process: **YES** (P2 ops hygiene).

## 17. Worker Status

RUNNING

Command: `node --env-file=... dist\worker.js` PID **1272**

## 18. Worker Count

1. Double Worker Risk: **NO**

Worker was not killed, restarted, or queue-cleared.

## 19. Database Reachability

YES — PostgreSQL listen `127.0.0.1:55432` (`postgres` PID 5396)

## 20. Database Name

`acf_dev` (schema `public`)

## 21. Migration Status

CLEAN

`prisma migrate status`: 23 migrations found; **Database schema is up to date.**
Pending Migrations: **0**
Failed Migrations: **0**
Commands used: status only. No `migrate dev` / `db push` / `reset` / seed.

## 22. Redis Reachability

YES — `127.0.0.1:6379` (`memurai` PID 4032). TCP `PING` → `PONG`. No flush/del.

## 23. Runtime Port Matrix

| Service | Expected | Observed |
| --- | --- | --- |
| Frontend | 3010 | Listen PID 6920 `next` (parent npm/npx also present; one port) |
| Backend | 3001 | Listen PID 8680 |
| Postgres | 55432 | Listen PID 5396 |
| Redis | 6379 | Listen PID 4032 Memurai |
| Worker | process | PID 1272 |

Port conflict on 3001/3010/55432/6379: **NO**
Duplicate backend listen: **NO**
Duplicate worker: **NO**

Docs still mention frontend `localhost:3000` in `docs/development.md` (drift vs 3010). P3 docs.

## 24. Real Data Freeze Audit

Read-only Prisma counts. **MATCH** expected freeze.

| Item | Expected | Observed |
| --- | --- | --- |
| Project `01a0a08d-4968-70c0-a528-de2e6cecfade` | exists | YES |
| ContentPlan `01a0a648-3db7-7191-a91b-621cc99f4751` | v2 CONFIRMED | version 2, CONFIRMED |
| v2 Scripts / Videos / Publications | 0 / 0 / 0 | 0 / 0 / 0 |
| Historical Publication `01a0a54e-5f54-78c1-a558-76a8d5fcf686` | exists | YES, same project |
| Metric snapshots | 2 | 2 |
| Snapshot 1 | 96 / 31 / 10 / 3 / 3 / 0 | MATCH |
| Snapshot 2 | 115 / 42 / 12 / 5 / 6 / 1 | MATCH |
| PerformanceAnalysis `01a0a61d-394b-72c0-8312-2f9b19192116` | exists | YES, same project |
| Reviews ACCEPTED/REJECTED/DEFERRED/PENDING | 1 / 1 / 1 / 3 | 1 / 1 / 1 / 3 (6 recs) |
| ContentFeedbackCycle | preserved | count 1 |

Real Data Mutated: **NO**

## 25. Feature Freeze Matrix

| Feature | RC Status | Notes |
| --- | --- | --- |
| Authentication | READY | Login/register present |
| Workspace / Project | READY | |
| Account Positioning | READY | Closed loop declared |
| Content Planning | READY | |
| Script Generation | READY | |
| Video Generation | READY | Worker running |
| Final Video Acceptance | READY | Schema + untracked module present; DB migrated |
| Download | READY_WITH_LIMITATION | DOWNLOAD_STARTED semantics only |
| Manual Publication | READY | |
| Publication Registration | READY | USER_ASSERTED / NOT_VERIFIED |
| Manual Metrics Import | READY | Two snapshots frozen |
| Performance Analysis | READY | |
| Recommendation Review | READY | 1/1/1/3 |
| Accepted-only Feedback Handoff | READY | Cycle preserved |
| UI/UX | READY | FROZEN_PASS |
| Official Douyin Auto Publish | DEFERRED | Not in this RC |
| Automatic Douyin Metrics Fetch | DEFERRED | Manual import only |
| Platform Verification | NOT_IN_RC | NOT_VERIFIED |
| Tauri Packaging | NOT_IN_RC | No `src-tauri` / tauri.conf |

## 26. Product Limitations

Accepted, **not** P0/P1:

- Manual publication only
- No automatic Douyin metrics fetch
- Platform verification: NOT_VERIFIED
- Official publish: DEFERRED
- AI conversation context gap
- Review session fact gap
- Browser automation unavailable
- Phone/mobile not productized
- 1024 desktop/tablet baseline only
- Real user assets would improve video realism
- Landscape not primary Douyin publish flow
- Download: DOWNLOAD_STARTED only

## 27. UI/UX Freeze Status

9 frozen routes: PRESERVED (selfcheck labels + Next route table)

Layout / business logic / brand: PRESERVED (this audit did not change UI)

Surface tokens in `globals.css`:

- Page `#EEF1EC`
- Primary Surface `#F7F8F5`
- Muted `#F2F4F0`
- Elevated `#FAFBF9`
- Brand `#176B5B`

## 28. Interaction Freeze Regression

PASS

No `overflow-x: clip` in `globals.css` or AppShell. Dialog closed: `if (!isOpen) return null`. No `inert` in dialog source.

## 29. Documentation Readiness

| Doc | Status |
| --- | --- |
| README | PARTIAL (still “V1.0 MVP 初始化”; start commands exist) |
| Development setup | READY (`docs/development.md`) |
| Runtime / startup | PARTIAL (frontend port 3000 vs 3010) |
| Database setup | READY |
| Worker startup | READY (`docs/job-queue-worker.md`) |
| Redis | READY |
| FFmpeg | READY (in development + release-web-v1) |
| Environment example | PARTIAL (root `.env.example` empty; `database/.env.example` exists) |
| UI/UX docs | READY (`docs/ui-ux/**`, currently untracked) |
| Release notes | PARTIAL (`docs/release-web-v1.md` still 0.1.0-rc.1) |
| Rollback notes | MISSING |
| Production runbook | PARTIAL (`docs/release-web-v1.md`) |
| Tauri packaging notes | MISSING |

No large doc rewrite this phase.

## 30. Web RC Readiness

PARTIAL → **READY after commit/tag approval** from a product-loop view; packaging/env example still PARTIAL.

Judged **PARTIAL** overall until git baseline is committed (dirty tree) and Douyin secrets rotated for any real OAuth.

## 31. Tauri RC Readiness

NOT_READY — no Tauri project, no Windows installer verification, no code signing, no embedded Postgres/Redis/FFmpeg distribution strategy implemented in-repo as a packaged app.

## 32. RC Blockers

P0 RELEASE BLOCKER: **0**

P1 MUST FIX BEFORE RC: **0**

P2 SHOULD FIX BEFORE GA:

- Commit dirty tree (169 modified + 115 untracked) as the actual RC snapshot
- Ignore or remove `dump.rdb` and embedded Postgres `.tgz`
- Remove or relocate `acf-ui-diag-console-snippet.js`
- Extra `dist\main` PID 14384 (ops)
- Empty root `.env.example`; port 3000 vs 3010 docs
- Rotate Douyin OAuth credentials before any real OAuth (limitation + security, not product-loop P0)

P3 POST_V1: Tauri, official Douyin publish/metrics, mobile, rollback runbook

## 33. Recommended RC Version

**0.9.0-rc.1**

Reason: web product loop and UI freeze are RC-complete, but this is not GA 1.0.0 (official Douyin, platform verification, Tauri still out). Prior git messages used `0.1.0-rc.1/rc.2`; this freeze is a new productization boundary, so bump to 0.9 rather than 0.1.0-rc.3. Root `package.json` already says `1.0.0` (suggestion only; not edited).

## 34. Recommended Commit Boundary

Working tree on `main` after `b063fc4`, including modified + untracked product/UI/docs/migration files.

Exclude from commit: `dump.rdb`, `database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz`, `docs/ui-ux/acf-ui-diag-console-snippet.js` (or delete in a later cleanup phase).

Do **not** commit `.env`.

## 35. Recommended Commit Message

```
release: freeze web 0.9.0-rc.1 product and UI baseline
```

## 36. Recommended Tag

`v0.9.0-rc.1`

Not created.

## 37. Backend Changes

0 (this audit)

## 38. Database Changes

0

## 39. Agent Changes

0

## 40. Provider Calls

0

## 41. LLM Calls

0

## 42. .env Modified

NO

## 43. Real Data Mutated

NO

## 44. Git Mutation

NO

## 45. Gate

READY_FOR_RC_BASELINE_APPROVAL

Criteria:

- Frontend Build = PASS
- Backend Build = PASS
- Backend Health = PASS
- Migration Status = CLEAN
- Tracked Secrets = NO
- P0 = 0
- P1 = 0
