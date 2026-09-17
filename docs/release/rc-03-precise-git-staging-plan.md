# RC-03 Precise Git Staging Plan

Date: 2026-09-17
Mode: **plan only**. Do not run `git add`, commit, tag, or push.

## 1. RC Identity

| Field | Value |
| --- | --- |
| Version | 0.9.0-rc.1 |
| Type | WEB_RC |
| Branch | `main` |
| Pre-RC HEAD | `b063fc4` |
| Recommended commit | `release: freeze web 0.9.0-rc.1 product and UI baseline` |
| Recommended tag | `v0.9.0-rc.1` |

## 2. Current Git State

`main` @ `b063fc4`. Index clean. No merge/rebase/cherry-pick.

## 3. Current Dirty Counts

Live scan (`git diff --name-only` + `git ls-files --others --exclude-standard`), **after** writing this plan’s three allowed files:

| Metric | Count |
| --- | --- |
| Total Dirty | **290** |
| Modified | **169** |
| Untracked | **121** |
| Deleted | **0** |
| Renamed | **0** |
| Staged | **0** |

RC-02 (pre RC-03 docs): Modified 169 / Untracked 118 / Total 287. Difference is exactly the three allowed RC-03 documentation files. `git status --short` can list fewer lines than the two list commands; this plan uses the two list commands.

Classification of the RC-02 287-set: Include 284 + Exclude 3. After RC-03 docs: Include **287** + Exclude **3**.

## 4. Classification Rules

Every dirty path is exactly one of:

| Code | Stage |
| --- | --- |
| A_INCLUDE_CORE_SOURCE | YES |
| B_INCLUDE_DATABASE_SCHEMA_MIGRATION | YES |
| C_INCLUDE_TEST_SELF_CHECK | YES |
| D_INCLUDE_DOCUMENTATION | YES |
| E_INCLUDE_CONFIGURATION_TEMPLATE | YES |
| F_INCLUDE_PACKAGE_LOCK | YES |
| G_EXCLUDE_GENERATED | NO |
| H_EXCLUDE_LOCAL_RUNTIME | NO |
| I_EXCLUDE_SECRET | NO |
| J_EXCLUDE_TEMP_DEBUG | NO |
| K_MANUAL_REVIEW | HOLD |

Applied:

- `*.selfcheck.ts`, `*.spec.ts`, `*e2e-spec.ts`, `ui-interaction-diagnostics.ts` → **C**
- `database/prisma/schema.prisma`, `database/prisma/migrations/**` → **B**
- `docs/**` except console snippet → **D**
- `dump.rdb`, `*embedded-postgres*.tgz` → **H**
- `docs/ui-ux/acf-ui-diag-console-snippet.js` → **J**
- remaining `apps/frontend/**`, `apps/backend/**` (non-test) → **A**
- Unclassified: **0**

## 5. Full File Classification

Classified Entries: **290**
Unclassified Entries: **0**

Complete YES set (plus this plan’s three files): [`docs/release/rc-03-stage-include.txt`](./rc-03-stage-include.txt)
Complete NO set: [`docs/release/rc-03-stage-exclude.txt`](./rc-03-stage-exclude.txt)

Per-path Stage:

- Every path in include.txt → **YES** (A/B/C/D as rules in §4)
- Every path in exclude.txt → **NO**

| Path | Git Status | Category | Stage In RC | Reason |
| --- | --- | --- | --- | --- |
| `dump.rdb` | ?? | H_EXCLUDE_LOCAL_RUNTIME | NO | Redis local snapshot |
| `database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz` | ?? | H_EXCLUDE_LOCAL_RUNTIME | NO | embedded Postgres archive |
| `docs/ui-ux/acf-ui-diag-console-snippet.js` | ?? | J_EXCLUDE_TEMP_DEBUG | NO | manual browser debug snippet |
| all 169 `M` paths | M | A/B/C/D per §4 | YES | source/tests/docs/schema |
| remaining `??` except the 3 rows above | ?? | A/B/C/D per §4 | YES | new source/tests/docs/migration |

Category totals (live): A 174 · C 83 · B 2 · D 28 · H 2 · J 1.
A+C+B+D = **287 YES**. H+J = **3 NO**. Manual Review **0**.

## 6. Core Source Files

A_INCLUDE_CORE_SOURCE: **174**
All dirty `apps/frontend/**` and `apps/backend/**` that are not spec/selfcheck/e2e, plus `apps/frontend/next.config.ts`, `apps/frontend/package.json`.
No dirty files under `apps/ai-engine`, `workers`, `packages`, or Tauri.

## 7. Database/Migration Files

B: **2**

- `database/prisma/schema.prisma` (M)
- `database/prisma/migrations/20260915080000_add_video_final_acceptance/migration.sql` (??)

Database Runtime Data In Git: **NO**

## 8. Tests/Selfchecks

C: **83** including phase-a–h, final-ui-regression, visual-color-system, color-comfort-polish, surface-comfort-pass, backend `*.spec.ts`, `manual-publication.e2e-spec.ts`, `ui-interaction-diagnostics.ts` + selfcheck.

## 9. Documentation

D: **28** (25 from RC-02 scan, plus):

- `docs/release/rc-03-precise-git-staging-plan.md`
- `docs/release/rc-03-stage-include.txt`
- `docs/release/rc-03-stage-exclude.txt`

Includes RC-01, RC-02, release-notes draft, Phase I / I.5 UI reports, `docs/README.md`.

## 10. Config Templates

E dirty: **0**. Already tracked: `.env.example` (empty), `database/.env.example` (placeholder). Not a blocker. No real credentials in those templates.

## 11. Package/Lockfiles

F dirty: **0**. `package-lock.json` already at HEAD. `apps/frontend/package.json` is **A** (group 01). No yarn/pnpm lock.

## 12. Generated Exclusions

G dirty: **0**. `.next` / `dist` / `coverage` / `node_modules`: **ALREADY_IGNORED**.

## 13. Runtime Exclusions

| Exact Path | Reason | Currently Ignored |
| --- | --- | --- |
| `dump.rdb` | Redis dump | NO |
| `database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz` | local Postgres binary archive | NO |

No extra dirty `*.pid`, `*.log`, downloads, or generated videos in this scan.

## 14. Secret Exclusions

I dirty: **0**. `.env` **ALREADY_IGNORED**.
Secret Files Planned For Stage: **0**
Potential Secret Value Exposure: **NONE** (284 candidate paths scanned for private-key / `sk-` value patterns; 0 hits). Variable **names** in source are allowed.

## 15. Temp/Debug Exclusions

| Exact Path | Reason | Currently Ignored |
| --- | --- | --- |
| `docs/ui-ux/acf-ui-diag-console-snippet.js` | temporary/manual browser debug artifact | NO |

## 16. Diagnostics Decision

**INCLUDE** (`C_INCLUDE_TEST_SELF_CHECK`)

Path: `apps/frontend/src/lib/ui-interaction-diagnostics.ts`
Reason: reusable; `NODE_ENV === "development"` only; no secrets; not a one-off dump.

## 17. Console Snippet Decision

**EXCLUDE** (`J_EXCLUDE_TEMP_DEBUG`)

Path: `docs/ui-ux/acf-ui-diag-console-snippet.js`

## 18. Gitignore Gap Analysis

Gitignore Gap Count: **3**

| Path | Currently Ignored | Verdict |
| --- | --- | --- |
| `dump.rdb` | NO | Should Be Ignored But Isn't — exclude manually this RC |
| embedded postgres `.tgz` | NO | Should Be Ignored But Isn't — exclude manually |
| console snippet `.js` | NO | Manual Exclusion Only |
| `.next` `dist` `.env` | YES | Already Ignored |

Do not edit `.gitignore` now.

## 19. Package Version Audit

Current Package Version: root `1.0.0`; frontend `0.1.0`; backend/database/workers `0.0.1`
Target RC Version: **0.9.0-rc.1**
Version Change Required: **YES**
VERSION_UPDATE_REQUIRED_BEFORE_TAG: **YES** (not RC-03 blocker)

## 20. Count Reconciliation

Live: Total Dirty **290** = Include **287** + Exclude **3** + Manual Review **0**.
RC-02 snapshot: 287 = 284 + 3 + 0. Delta = three RC-03 docs.

## 21. Candidate Security Audit

Unsafe Files In Candidate Stage Set: **0**

## 22. Candidate Quality Audit

Required Baseline Files Missing: **0**

## 23. Exact Staging Groups

### STAGING_GROUP_01_CORE_SOURCE

File Count: **174**
Reason: product/UI source.
Directory 100% INCLUDE among dirty children: `apps/frontend` (gitignore still drops `.next`); `apps/backend/src` contains A+C, **all INCLUDE**.

### STAGING_GROUP_02_DATABASE_SCHEMA_MIGRATIONS

File Count: **2** (exact paths in §7). Never `git add database/`.

### STAGING_GROUP_03_TESTS_SELF_CHECKS

File Count: **83**. Covered by `apps/frontend` + `apps/backend/src` plus `apps/backend/test/manual-publication.e2e-spec.ts`.

### STAGING_GROUP_04_PACKAGE_MANIFESTS_LOCKFILES

File Count: **0** extra. Frontend package.json in group 01. Lockfile already tracked.

### STAGING_GROUP_05_DOCUMENTATION

File Count: **28**
Do **not** `git add docs/ui-ux` (snippet). Use `docs/ui-ux/*.md` and `docs/release`.

### STAGING_GROUP_06_CONFIGURATION_TEMPLATES

File Count: **0** dirty.

## 24. Exact Staging Commands

**PREVIEW ONLY. DO NOT EXECUTE.** Never `git add .` / `-A` / `--all`.

```bash
# Groups 1+3: every dirty file under these trees is INCLUDE
git add -- "apps/frontend"
git add -- "apps/backend/src"
git add -- "apps/backend/test/manual-publication.e2e-spec.ts"

# Group 2
git add -- \
  "database/prisma/schema.prisma" \
  "database/prisma/migrations/20260915080000_add_video_final_acceptance/migration.sql"

# Group 5
git add -- "docs/README.md" "docs/release"
git add -- docs/ui-ux/*.md
```

Equivalent: `git add --pathspec-from-file=docs/release/rc-03-stage-include.txt` (not run).

Must not add paths in `rc-03-stage-exclude.txt` or `.env`.

## 25. Post-stage Verification Plan

After **explicit** RC-04 approval only:

```bash
git status --short
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached -- .env
git diff --cached --name-only
```

Confirm exclude paths are untracked, no `.env`, no dump/tgz/snippet, no unexpected deletions.

## 26. Commit Preview

`release: freeze web 0.9.0-rc.1 product and UI baseline`

## 27. Tag Preview

`v0.9.0-rc.1`

## 28. Branch Strategy

Stay on `main`. Optional later: branch `rc/0.9.0-rc.1` before staging so `b063fc4` remains obvious. **Not executed.**

## 29. Git Mutation

NO. Git Index Mutated: NO. Commit/Tag/Push: NO.

## 30. Gate

**READY_FOR_RC_04_STAGING_EXECUTION_APPROVAL**

Unclassified 0 · Manual Review 0 · Unsafe 0 · Tracked Secrets NO · Real/runtime data not in candidate set · Precise commands generated · P0/P1 = 0.
