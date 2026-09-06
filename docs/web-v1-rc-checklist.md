# Web V1 RC Checklist

**Version:** 0.1.0-rc.1  
**Gate:** Step 12.10 PASS / Step 12.11A staging  
**Feature Freeze:** YES  
**RC Status:** READY (commit/tag pending authorization)

## Feature Freeze

Forbidden for this RC: new agents, UI pages, providers, business tables, product flows, Douyin official publish/metrics, Tauri, billing, multi-user UI, movie editing, scheduler, comments/reply, third-party market provider.

Allowed: release docs, config docs, ignore rules, release scripts, build/ops fixes, backup tooling, smoke/selfcheck, safe dead-debug cleanup, RC blockers only.

## Technical gates (preconditions)

| Gate | Status |
| --- | --- |
| Code Health | PASS |
| Security | PASS |
| Production Config | PASS |
| UX | PASS |
| Runtime Product Loop | PASS |
| Router One 5-Agent Acceptance | VERIFIED |
| Real Media Acceptance | VERIFIED |
| Real Provider Acceptance | VERIFIED |
| Step 12.9 | COMPLETE |
| Step 12.10 Web RC Gate | **PASS** |

## Provider gates (Step 12.10 / 12.11A)

| Provider | Calls |
| --- | --- |
| Router One | **0** |
| Wanx | **0** |
| MiniMax | **0** |

## Build commands

```bash
npm run typecheck -w frontend
npm run lint -w frontend
npm run build -w frontend
npm run build -w backend
npm run build -w workers
npx prisma migrate status --schema database/prisma/schema.prisma
npm audit
```

## Migration status

**CLEAN** (11 migrations applied; verified Step 12.10 + 12.11A).

## Backup status

- Backup smoke **PASS** (Step 12.10)
- Restore validation **PASS** (temp DB; `acf_dev` untouched)
- Media root backed up separately from DB

## Deployment profiles

| Profile | Use | COOKIE_SECURE | CORS_ORIGIN |
| --- | --- | --- | --- |
| LOCAL_RC | localhost HTTP evaluation | `false` | local frontend origin |
| PUBLIC_HTTPS | public/LAN HTTPS | `true` | exact HTTPS frontend origin (not `*`) |

## Known limitations (not RC blockers)

- No official Douyin auto publish
- No official Douyin metrics sync
- No Tauri/Desktop release
- No movie editing agent
- No scheduling
- No AI comment reply
- No billing
- No teams/multi-user product UI
- No third-party market provider
- Script estimated duration vs real TTS duration may diverge
- Wanx scene-level image cost grows with scene count

## Commit / tag checklist (Step 12.11)

- [x] Review intentional commit set vs excluded/runtime files (12.11A)
- [x] Staged secret scan PASS (12.11A)
- [ ] Commit RC source + docs only — **NOT DONE** (await authorization)
- [ ] Tag `v0.1.0-rc.1` — **NOT DONE** (await authorization)
- [ ] No push/deploy unless explicitly authorized — **NOT DONE**

## RC Gate checklist (Step 12.10)

- [x] P0 = 0
- [x] P1 = 0
- [x] Feature Freeze preserved
- [x] Frontend production build PASS
- [x] Backend production build PASS
- [x] Worker build/start PASS
- [x] Migrations CLEAN
- [x] Backup smoke PASS
- [x] Restore validation PASS
- [x] Production backend health PASS
- [x] Production frontend smoke PASS
- [x] Production worker smoke PASS
- [x] Existing video preview/export PASS
- [x] Secret scan PASS
- [x] Runtime dirs documented
- [x] Release runbook present
- [x] Rollback documented
- [x] Known limitations documented
- [x] No paid provider calls
- [x] Git hygiene decision complete

**Git Commit:** NOT DONE  
**Git Tag:** NOT DONE  
**Deployment:** NOT DONE  

Do not auto-deploy, push, tag, or migrate production DB until explicitly authorized.
