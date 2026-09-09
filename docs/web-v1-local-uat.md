# Web V1 Local Real-User Acceptance — Issue Log

**RC Version:** 0.1.0-rc.1  
**Tag:** `v0.1.0-rc.1`  
**RC Commit:** `557fd288489e10d31efc7f8ec3f18c2bdb618dd8`  
**Mode:** Real-user UI acceptance (no automated harness)  
**Started:** 2026-09-06  
**Paused overnight:** 2026-09-06 night — local apps + embedded Postgres stopped for shutdown; resume UAT after morning boot.

Do not pre-fill fake issues. Only record problems the user actually finds during UAT.

## Environment (prepared)

| Service | Status |
| --- | --- |
| PostgreSQL | running (`127.0.0.1:55432`) |
| Redis / Memurai | running (`6379`) |
| Backend `/health` | 200 |
| Frontend | `http://localhost:3000` |
| Worker | running |

## Suggested project

Create a **new** project (do not reuse Real Provider Acceptance technical project), e.g. name: `真实用户验收`.

## Issue log

| ID | Page | User action | Expected | Actual | Severity | Category | Reproducible | Screenshot/Note | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | — | *(none yet)* | — |

## Severity legend

- **P0** — data leak / auth bypass / cross-tenant / data corruption  
- **P1** — main flow blocked / critical misunderstanding / unusable video / publish mislead / feedback loop broken  
- **P2** — copy / layout / loading / terminology / minor UX  
- **P3** — polish / aesthetic / optional  

## Experience notes (optional freeform)

*(fill during / after walkthrough)*

- Login:  
- Dashboard:  
- Product:  
- Positioning (wait feel):  
- Research / Analysis:  
- Strategy:  
- Planning:  
- Script:  
- Video quality (GOOD / ACCEPTABLE / NEEDS_IMPROVEMENT / UNUSABLE):  
- Publication clarity:  
- Performance / next-round loop:  

## Decision (after full loop)

- [ ] A — RC accepted → Step 12.13 Remote Git Backup  
- [ ] B — Few P2 only → rc.2 fix list  
- [ ] C — P1 found → RC rejected → fix cycle  
