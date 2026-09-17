# RC-02 Release Candidate Manifest

Date: 2026-09-17
Version: **0.9.0-rc.1**
Input: RC-01 Gate `READY_FOR_RC_BASELINE_APPROVAL`
Mode: documentation only. No git mutation. No source / DB / `.env` changes.

---

## 1. RC Identity

| Field | Value |
| --- | --- |
| Version | 0.9.0-rc.1 |
| Release Type | WEB RELEASE CANDIDATE |
| Primary Platform | Local / Web Runtime |
| Desktop / Tauri | NOT YET GA |
| Branch | `main` |
| Pre-RC HEAD | `b063fc4` |
| Recommended commit | `release: freeze web 0.9.0-rc.1 product and UI baseline` |
| Recommended tag | `v0.9.0-rc.1` |

## 2. Release Scope

Validate the **human-gated** core product loop on the current Web stack:

账号定位 → 内容计划 → 脚本 → 视频 → 成片确认 → 下载 → 手动发布 → 作品登记 → 手动录入数据 → AI复盘 → 人工审核建议 → ACCEPTED-only 回流 → 下一轮内容计划。

Not a SaaS GA. Not a Tauri installer. Not official Douyin OAuth/publish.

## 3. Included Features

| Feature | Status | RC Included | Notes |
| --- | --- | --- | --- |
| Authentication | READY | YES | Login / register |
| Workspace | READY | YES | |
| Project | READY | YES | |
| Account Positioning | READY | YES | Human confirm |
| Content Planning | READY | YES | Human confirm |
| Script Generation | READY | YES | |
| Script Confirmation | READY | YES | Human Gate |
| Video Generation | READY | YES | Worker + queue |
| Video Acceptance | READY | YES | Final acceptance |
| Download | READY_WITH_LIMITATION | YES | DOWNLOAD_STARTED only |
| Manual Publication Flow | READY | YES | |
| Publication Registration | READY_WITH_LIMITATION | YES | USER_ASSERTED / NOT_VERIFIED |
| Manual Metrics Input | READY | YES | |
| Performance Analysis | READY | YES | |
| AI Review | READY | YES | |
| Recommendation Review | READY | YES | ACCEPTED / REJECTED / DEFERRED / PENDING |
| ACCEPTED-only Feedback Handoff | READY | YES | No auto-apply |
| Current-cycle Isolation | READY | YES | |
| Historical Data Isolation | READY | YES | |
| UI/UX Phase I | READY | YES | FROZEN_PASS |
| Visual Color System | READY | YES | Brand `#176B5B` |
| Surface Comfort System | READY | YES | Page `#EEF1EC` |
| Runtime Health Checks | READY | YES | `/health` |
| Worker | READY | YES | |
| Redis-backed Queue | READY | YES | BullMQ |
| PostgreSQL Persistence | READY | YES | Prisma |

Included Features: **26**
READY: **24**
READY_WITH_LIMITATION: **2**

## 4. Excluded Features

These are **scope**, not defects.

| Feature | Status | RC Included |
| --- | --- | --- |
| Official Douyin Auto Publish | DEFERRED | NO |
| Automatic Douyin Metrics Fetch | DEFERRED | NO |
| Platform-side Publication Verification | DEFERRED | NO |
| Automatic Comment Reply | NOT_IN_RC | NO |
| Fully Automated Closed-loop Without Human Confirmation | NOT_IN_RC | NO |
| Phone / Mobile Productization | NOT_IN_RC | NO |
| Production SaaS Multi-tenant Deployment | NOT_IN_RC | NO |
| Enterprise Billing | NOT_IN_RC | NO |
| Channel / Reseller Edition | NOT_IN_RC | NO |
| Production Tauri Installer | NOT_IN_RC | NO |
| Code Signing | NOT_IN_RC | NO |
| Auto Updater | NOT_IN_RC | NO |
| Cloud Database Deployment | NOT_IN_RC | NO |
| Hosted Redis Deployment | NOT_IN_RC | NO |
| Distributed Worker Cluster | NOT_IN_RC | NO |

Deferred: **3**
Not In RC: **12**

## 5. Known Limitations

| ID | Description | Severity | RC Blocking | User Impact | Mitigation |
| --- | --- | --- | --- | --- | --- |
| L01 | Publication is manual | INFO | NO | Operator copies/uploads outside the app | Documented manual flow |
| L02 | Publication truth is USER_ASSERTED unless officially verified | MEDIUM | NO | Posts are not platform-verified | Copy + registration UI |
| L03 | Automatic Douyin metrics fetch is not available | INFO | NO | No auto pull | Manual import |
| L04 | Metrics can be entered/imported manually | INFO | NO | Operator effort | Forms / history |
| L05 | Official OAuth / publish integration is deferred | INFO | NO | No in-app official publish | Manual publication |
| L06 | Real Douyin OAuth requires Client Secret rotation before production use | MEDIUM | NO | Cannot safely do real OAuth | Rotate; keep `.env` out of git |
| L07 | Download state is DOWNLOAD_STARTED, not confirmed browser completion | LOW | NO | UI may show started while save dialog pending | Copy explains start-only |
| L08 | Recommendation handoff is ACCEPTED-only | INFO | NO | Rejected/deferred do not flow | Review UI |
| L09 | No recommendation is automatically applied | INFO | NO | Must confirm next plan | Human Gate |
| L10 | No next-cycle content is automatically generated | INFO | NO | Operator starts next plan | Next-action CTA |
| L11 | Phone/mobile UI is not productized | INFO | NO | Small screens unsupported | 1024+ baseline |
| L12 | Tauri packaging is not the primary RC target | INFO | NO | No installer | Web local runtime |
| L13 | Real creator assets improve video realism | LOW | NO | Mock/stock look | User assets later |
| L14 | Landscape is not the primary Douyin delivery path | INFO | NO | Vertical is primary | Variant exists, not default |
| L15 | Browser automation is not part of this RC | INFO | NO | No Playwright UAT in RC gate | Human 9-route PASS |
| L16 | Some AI session/conversation continuity gaps may remain | LOW | NO | Occasional context loss | Documented; retry |

## 6. Frozen Browser Routes

| Route | Code Regression | Human Browser Acceptance | Layout | Business Semantics | Route |
| --- | --- | --- | --- | --- | --- |
| Dashboard | PASS | PASS | FROZEN | FROZEN | FROZEN |
| Projects | PASS | PASS | FROZEN | FROZEN | FROZEN |
| Project Overview | PASS | PASS | FROZEN | FROZEN | FROZEN |
| Positioning | PASS | PASS | FROZEN | FROZEN | FROZEN |
| Content Planning | PASS | PASS | FROZEN | FROZEN | FROZEN |
| Scripts | PASS | PASS | FROZEN | FROZEN | FROZEN |
| Video | PASS | PASS | FROZEN | FROZEN | FROZEN |
| Publish/Data | PASS | PASS | FROZEN | FROZEN | FROZEN |
| AI Review | PASS | PASS | FROZEN | FROZEN | FROZEN |

Frozen Browser Routes: **9 / 9**

## 7. UI/UX Baseline

UI_UX: **FROZEN_PASS**

Page `#EEF1EC` · Surface `#F7F8F5` · Muted `#F2F4F0` · Elevated / Input `#FAFBF9` · Brand `#176B5B`

Primary CTA: one clear primary per step. Current: soft brand. Completed: success icon/semantics. Pending: neutral.

No color changes in this phase.

## 8. Runtime Manifest

| Component | Value |
| --- | --- |
| Frontend | Next.js, port **3010** |
| Backend | NestJS, port **3001** |
| Database | PostgreSQL 16, `127.0.0.1:55432` / `acf_dev` |
| Redis | Memurai/Redis `127.0.0.1:6379` |
| Worker | RUNNING (single process at RC-01) |
| FFmpeg | **Required** for real compose (`MEDIA_COMPOSE_PROVIDER=ffmpeg`). **Available** on this host: ffmpeg/ffprobe 9.0.1 |
| AI | OpenAI-compatible provider architecture (`MODEL_*`) |

Secret values: not listed.

## 9. Environment Variable Manifest

Secret Values: **NOT INCLUDED**
`.env`: **NOT INCLUDED IN GIT**

| Name | Class |
| --- | --- |
| `DATABASE_URL` | REQUIRED |
| `REDIS_URL` | REQUIRED |
| `JWT_ACCESS_SECRET` | REQUIRED |
| `CORS_ORIGIN` | OPTIONAL (local) / REQUIRED (public HTTPS) |
| `MODEL_PROVIDER` | REQUIRED (runtime policy) |
| `MODEL_API_KEY` | REQUIRED when real models |
| `MODEL_BASE_URL` | REQUIRED when real models |
| `MODEL_NAME` | REQUIRED when real models |
| `MODEL_FALLBACK_*` / circuit vars | OPTIONAL |
| `MEDIA_COMPOSE_PROVIDER` | REQUIRED for real video (`ffmpeg`) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | OPTIONAL if on PATH |
| `MEDIA_TTS_PROVIDER` / `MINIMAX_TTS_*` | OPTIONAL |
| `MEDIA_IMAGE_PROVIDER` / `WANX_*` | OPTIONAL |
| `MEDIA_STORAGE_ROOT` | REQUIRED for media |
| `DOUYIN_CLIENT_KEY` | FUTURE_INTEGRATION |
| `DOUYIN_CLIENT_SECRET` | FUTURE_INTEGRATION |
| `DOUYIN_REDIRECT_URI` | FUTURE_INTEGRATION / LOCAL_ONLY tunnel |
| `PLATFORM_SECRET_MASTER_KEY` | FUTURE_INTEGRATION |

`.env.example`: **already tracked** at repo root (currently empty) and `database/.env.example` (placeholder URL). **Should remain in RC baseline.** Filling names-only content is a later docs task, not this phase.

## 10. Database Manifest

| Item | Value |
| --- | --- |
| Engine | PostgreSQL |
| Client | Prisma `^6.19.3` (`database` workspace) |
| Role | Schema + client only; no business logic in `database/` |
| Migration Status | CLEAN (RC-01) |
| Seed | **NOT REQUIRED** for existing RC local data. No production seed pipeline. Test helpers seed graphs in Vitest only. |

RC migration set (23 SQL files under `database/prisma/migrations/`):

- `20260830120000_init_core_schema`
- `20260830140000_add_agent_runs`
- `20260831020000_add_content_plan_versioning`
- `20260831030000_add_script_topic_versioning`
- `20260831040000_add_media_asset_job_video`
- `20260831050000_add_job_worker_lease`
- `20260902080000_add_publishing_foundation`
- `20260902160000_add_publication_metrics_foundation`
- `20260905060000_add_market_research_foundation`
- `20260905160000_add_market_insight`
- `20260905170000_add_campaign_strategy_foundation`
- `20260909160000_add_asset_library_foundation`
- `20260909170000_add_reference_content_intake`
- `20260909180000_add_account_memory_snapshot`
- `20260909190000_add_reference_intelligence`
- `20260909200000_add_voice_digital_human_profiles`
- `20260910010000_add_usage_cost_metering`
- `20260910020000_add_autonomous_research_learning`
- `20260912020000_add_crop_review_approval_execution`
- `20260912100000_add_output_strategy_selections`
- `20260913220000_add_manual_publication_monitoring`
- `20260914010000_add_performance_analysis`
- `20260915080000_add_video_final_acceptance` (**currently untracked; include in baseline**)

Do not run migrations in this phase.

## 11. Real Data Policy

| Class | Policy |
| --- | --- |
| Source code baseline | Git |
| Local real test data | **LOCAL_RUNTIME_ONLY** |
| User publication URL | LOCAL_RUNTIME_DATA |
| Metrics snapshots | LOCAL_RUNTIME_DATA |
| AI review decisions | LOCAL_RUNTIME_DATA |
| `dump.rdb` / DB dumps | **never** in baseline |

Real Data In Git: **NO** (planned).

## 12. Git Workspace Summary

At RC-02 classification (before adding this file + release notes):

| Metric | Count |
| --- | --- |
| Branch | `main` |
| HEAD | `b063fc4` |
| Staged | 0 |
| Modified | **169** |
| Untracked | **116** |
| Deleted | 0 |
| Merge/rebase | NONE |

RC-01 reported untracked 115; +1 is `docs/release/rc-01-read-only-baseline-audit.md`. After this phase, untracked also includes this manifest and the release-notes draft.

## 13. Modified Classification

All **169** modified paths are source, tests, schema, or `docs/README.md`. None are secrets or runtime dumps.

| Class | Count | Meaning |
| --- | --- | --- |
| A INCLUDE_IN_RC_BASELINE | 168 | backend/frontend source + specs + `database/prisma/schema.prisma` |
| C DOCUMENTATION | 1 | `docs/README.md` |

## 14. Untracked Classification

**116** files:

| Class | Count | Paths / pattern |
| --- | --- | --- |
| A INCLUDE_IN_RC_BASELINE | 38 | new backend modules + frontend components/workspace libs + `database/prisma/migrations/20260915080000_add_video_final_acceptance/migration.sql` |
| A (tests/selfchecks) | 52 | `*.spec.ts`, `*.selfcheck.ts` (except listed below) |
| B INCLUDE_IF_SOURCE_REQUIRED | 1 | `apps/frontend/src/lib/ui-interaction-diagnostics.ts` (dev-only loader; still imported from `app-providers.tsx`) |
| C DOCUMENTATION | 22 | `docs/ui-ux/*.md` (except snippet) + `docs/release/rc-01-read-only-baseline-audit.md` |
| E LOCAL_RUNTIME_IGNORE | 2 | `dump.rdb`, `database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz` |
| H REMOVE_LATER_NOT_NOW | 1 | `docs/ui-ux/acf-ui-diag-console-snippet.js` |
| D GENERATED_IGNORE | 0 | none in dirty set (already gitignored) |
| F SECRET_IGNORE | 0 | `.env` not listed (gitignored) |
| G REVIEW_MANUALLY | 0 extra | diagnostics.ts counted as B |

## 15. Gitignore Gap Analysis

| Item | Verdict |
| --- | --- |
| `node_modules`, `.next`, `dist`, `coverage`, `.local/`, `.env*` | Already Ignored |
| `dump.rdb` / `*.rdb` | Should Be Ignored (do not change `.gitignore` this phase) |
| `database/*.tgz` embedded Postgres | Should Be Ignored |
| `docs/ui-ux/acf-ui-diag-console-snippet.js` | Manual Review / exclude from staging |
| New source, migrations, UI reports, selfchecks | Should Be Tracked |
| `ui-interaction-diagnostics.ts` | Should Be Tracked (source-required) |

## 16. Recommended Staging Groups

**Do not execute. Do not `git add .`.**

### STAGING_GROUP_01_CORE_SOURCE

paths:

- `apps/backend/src/**` (all modified + untracked `.ts` except `*.spec.ts` which is group 03)
- `apps/backend/test/manual-publication.e2e-spec.ts` → group 03
- `apps/frontend/next.config.ts`
- `apps/frontend/package.json`
- `apps/frontend/src/app/**`
- `apps/frontend/src/components/**`
- `apps/frontend/src/lib/**` excluding `*.selfcheck.ts` (group 03)

reason: product loop + UI freeze implementation.

Explicit untracked source to include:

```
apps/backend/src/media/tts/minimax-tts-subtitles.ts
apps/backend/src/performance-analysis/actionable-recommendation.mapper.ts
apps/backend/src/publishing/publication-source-binding.ts
apps/backend/src/videos/video-final-acceptance.ts
apps/frontend/src/components/ai-review-workspace-v1.tsx
apps/frontend/src/components/async-task-progress-v1.tsx
apps/frontend/src/components/inline-action-error-v1.tsx
apps/frontend/src/components/learning-context-summary-v1.tsx
apps/frontend/src/components/learning-loop-v1.tsx
apps/frontend/src/components/metrics-summary-v2.tsx
apps/frontend/src/components/metrics-trend-v1.tsx
apps/frontend/src/components/next-action-bar-v1.tsx
apps/frontend/src/components/observation-card-v2.tsx
apps/frontend/src/components/page-container-v2.tsx
apps/frontend/src/components/planning-accepted-feedback-notice.tsx
apps/frontend/src/components/positioning-first-step-notice.tsx
apps/frontend/src/components/publish-workflow-steps-v1.tsx
apps/frontend/src/components/recommendation-card-v2.tsx
apps/frontend/src/components/script-review-panel-v2.tsx
apps/frontend/src/components/technical-details-panel.tsx
apps/frontend/src/components/video-review-panel-v2.tsx
apps/frontend/src/components/workflow-back-nav-v1.tsx
apps/frontend/src/components/workflow-overview-dialog.tsx
apps/frontend/src/components/workflow-page-header-v1.tsx
apps/frontend/src/lib/ai-review.workspace.ts
apps/frontend/src/lib/nav-scope.ts
apps/frontend/src/lib/performance-analysis.api.ts
apps/frontend/src/lib/performance-review.view.ts
apps/frontend/src/lib/publish.workspace.ts
apps/frontend/src/lib/script.workspace.ts
apps/frontend/src/lib/ux/create-project-flow.ts
apps/frontend/src/lib/ux/current-cycle.ts
apps/frontend/src/lib/ux/cycle-progress.ts
apps/frontend/src/lib/ux/positioning-source.ts
apps/frontend/src/lib/ux/workflow-back-nav.ts
apps/frontend/src/lib/video-download.ts
apps/frontend/src/lib/video.workspace.ts
```

### STAGING_GROUP_02_DATABASE_SCHEMA_MIGRATIONS

paths:

```
database/prisma/schema.prisma
database/prisma/migrations/20260915080000_add_video_final_acceptance/migration.sql
```

reason: video final acceptance already applied; schema must match.

### STAGING_GROUP_03_SELF_CHECKS_TESTS

paths:

- all dirty `apps/backend/**/*.spec.ts`
- `apps/backend/test/manual-publication.e2e-spec.ts`
- all dirty `apps/frontend/src/lib/**/*.selfcheck.ts`
- `apps/frontend/src/lib/ux/*.selfcheck.ts`

reason: frozen UI/product gates.

### STAGING_GROUP_04_DOCUMENTATION

paths:

```
docs/README.md
docs/release/rc-01-read-only-baseline-audit.md
docs/release/rc-02-release-candidate-manifest.md
docs/release/0.9.0-rc.1-release-notes-draft.md
```

reason: RC paper trail.

### STAGING_GROUP_05_UI_UX_REPORTS

paths: all `docs/ui-ux/*.md` currently untracked **except** `acf-ui-diag-console-snippet.js`.

reason: Phase A–I / I.5 freeze evidence.

## 17. Excluded Generated Files

patterns:

```
.next
dist
coverage
node_modules
*.tsbuildinfo
.turbo
.cache
```

None of these appear in the dirty list (already ignored).

## 18. Excluded Secret Files

patterns:

```
.env
.env.*
!.env.example
*.key
*.pem
```

Do not stage local `.env`. `.env.example` already tracked.

## 19. Excluded Runtime Files

```
dump.rdb
database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz
.local/
storage/
apps/backend/storage/
uploads/
exports/
*.dump
```

## 20. Manual Review Files

| Path | Recommendation |
| --- | --- |
| `apps/frontend/src/lib/ui-interaction-diagnostics.ts` | **INCLUDE** with group 01 (dev-gated; imported) |
| `apps/frontend/src/lib/ui-interaction-diagnostics.selfcheck.ts` | **INCLUDE** with group 03 |
| `docs/ui-ux/acf-ui-diag-console-snippet.js` | **EXCLUDE**; remove in a later cleanup, not now |

## 21. Version Audit

| Package | Current Version |
| --- | --- |
| root `package.json` | 1.0.0 |
| frontend | 0.1.0 |
| backend | 0.0.1 |
| database | 0.0.1 |
| workers | 0.0.1 |
| ai-engine | Python package (no npm version) |

Recommended RC Version: **0.9.0-rc.1**
Version Change Required Before Tag: **YES** (align manifests; **do not change in this phase**)

## 22. Lockfile Audit

- `package-lock.json` (npm lockfileVersion 3): **already tracked**, not in dirty set → already in HEAD baseline.
- No `yarn.lock` / `pnpm-lock.yaml`.
- No unexpected second package-manager lock.

Include lockfile if RC-03 later changes dependencies; not required for current dirty tree.

## 23. Documentation Manifest

| Doc | RC baseline |
| --- | --- |
| README | INCLUDE (existing + `docs/README.md` modified) |
| Setup / architecture / runtime | already tracked under `docs/` |
| UI/UX reports | INCLUDE (`docs/ui-ux/*.md`) |
| RC-01 report | INCLUDE |
| RC-02 manifest | INCLUDE (this file) |
| Known Limitations | this file §5 |
| Release Notes Draft | INCLUDE (`docs/release/0.9.0-rc.1-release-notes-draft.md`) |
| Rollback | MISSING as standalone; boundary in §25 |

## 24. Security Notes

- Tracked Secrets: **NO**
- `.env` committed: **NO**
- Douyin secret rotation before real OAuth: **REQUIRED**
- Provider API keys, JWT secrets, database credentials: environment-only
- Secret values: not in this document

## 25. Rollback Boundary

Pre-RC Git HEAD: **`b063fc4`**

After a future approved commit, that commit becomes `RC_SOURCE_BASELINE` tagged `v0.9.0-rc.1` (not created now).

- Source rollback: checkout/revert to `b063fc4` or to the RC commit **after explicit approval**
- Database rollback: **do not infer**; current migrations CLEAN; no automatic DB rollback
- This phase executes **no** rollback

## 26. RC Acceptance Criteria

| Criterion | Status |
| --- | --- |
| P0 = 0 | YES (RC-01) |
| P1 = 0 | YES |
| Frontend Build PASS | YES |
| Backend Build PASS | YES |
| Backend Health PASS | YES |
| Worker Running | YES |
| Database Reachable | YES |
| Migrations CLEAN | YES |
| Redis Reachable | YES |
| Tracked Secrets NO | YES |
| 9 Browser Routes PASS | YES |
| UI/UX FROZEN_PASS | YES |
| Precise staging plan | YES (this file) |
| No generated/runtime/secrets planned for staging | YES |

## 27. RC-03 Eligibility

**YES**

No RC-02 blockers. RC-03 must use path-based staging only.

## 28–35. Mutation ledger

Backend Changes: 0
Database Changes: 0
Agent Changes: 0
Provider Calls: 0
LLM Calls: 0
.env Modified: NO
Real Data Mutated: NO
Git Mutation: NO

## 36. Gate

**READY_FOR_RC_03_STAGING_PLAN_APPROVAL**

---

### Dirty workspace rollup (for Final Output)

Expected Source Changes: **259** (176 product source + 82 tests/selfchecks + 1 diagnostics `.ts`)
Expected Documentation: **23** (plus this manifest and release-notes draft after write)
Expected Generated/Ignored (in dirty set): **0**
Expected Local Runtime: **2**
Needs Manual Review: **2** (`ui-interaction-diagnostics.ts` include; console snippet exclude)
Include In Baseline (dirty set minus runtime/snippet): **282**
