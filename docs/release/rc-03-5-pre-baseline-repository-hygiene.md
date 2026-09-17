# RC-03.5 Pre-Baseline Repository Hygiene

Date: 2026-09-17
Mode: hygiene only. No `git add` / commit / tag / push.

## 1. Phase Identity

| Field | Value |
| --- | --- |
| Phase | RC_03_5_PRE_BASELINE_REPOSITORY_HYGIENE |
| Branch | `main` |
| HEAD | `b063fc4` |
| Target RC | 0.9.0-rc.1 |
| Recommended tag | `v0.9.0-rc.1` |

## 2. Input State

RC-01/02/03: PASS. Index clean. Staged 0. UI_UX FROZEN_PASS. Tracked secrets NO.

## 3. Gitignore Gaps Before

3:

1. `dump.rdb`
2. `database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz`
3. `docs/ui-ux/acf-ui-diag-console-snippet.js`

## 4. Gitignore Changes

Appended three **exact** rules under the local-runtime section of `.gitignore`:

```
dump.rdb
database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz
docs/ui-ux/acf-ui-diag-console-snippet.js
```

Did not use `*.rdb`, `*.tgz`, or `docs/ui-ux/**`.

## 5. Gitignore Verification

```
.gitignore:61:dump.rdb	dump.rdb
.gitignore:62:database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz	…
.gitignore:63:docs/ui-ux/acf-ui-diag-console-snippet.js	…
```

3 / 3 ignored.

Gitignore Gap Before: **3**
Gitignore Gap After: **0**

## 6. Unexpected Ignore Audit

Exact paths only. Control checks (`globals.css`, `schema.prisma`, RC docs, selfcheck) are **not** ignored.

Unexpected Files Newly Ignored: **0**

(The three intended runtime/debug files leaving `git ls-files --others --exclude-standard` is expected.)

## 7. Package Version Audit

| Package | private | Before | After | Role |
| --- | --- | --- | --- | --- |
| root `ai-content-factory` | true | 1.0.0 | **0.9.0-rc.1** | product version |
| frontend | true | 0.1.0 | 0.1.0 | workspace |
| backend | true | 0.0.1 | 0.0.1 | workspace |
| database | true | 0.0.1 | 0.0.1 | workspace |
| workers | true | 0.0.1 | 0.0.1 | workspace |

No other workspace `package.json`. None are publishable npm packages.

## 8. Version Source-of-Truth Analysis

- Root is `private: true` monorepo name `ai-content-factory`.
- Workspaces are private / UNLICENSED; versions are independent internal numbers.
- No Tauri / `src-tauri` / desktop `productVersion`.
- Backend `/health` returns `{ service, status }` only — no package version.
- Frontend has no `NEXT_PUBLIC_VERSION` / footer product version import of `package.json`.
- No `version.ts` / release manifest as product version source.
- RC-01 already treated root `1.0.0` as a misleading GA number, not a published artifact.

Classification: workspace versions are **B** (internal). Root `package.json` `version` is the only reasonable **PRODUCT_VERSION** field without inventing a new system.

## 9. Selected Version Strategy

**STRATEGY_A** — root package version is PRODUCT_VERSION.

## 10. Product Version Before

`1.0.0` (`package.json` + lockfile root metadata)

## 11. Product Version After

`0.9.0-rc.1`

Version Semantics: **CONSISTENT_WITH_TAG** (`v0.9.0-rc.1`)

## 12. Workspace Versions

Workspace Versions Changed: **0**

## 13. package-lock Impact

Synced **only** lockfile root metadata:

- top-level `"version"`
- `packages[""].version`

No `npm install` / `npm update`. Dependency graph unchanged.

## 14. Tauri Version

Tauri Version: **N/A** (no `tauri.conf.*`)
Changed: **NO**

## 15. Runtime Version Exposure

None. Tag vs UI: no version UI exists; none added.

## 16. Build Results

| Check | Result |
| --- | --- |
| `npm run typecheck -w frontend` | PASS |
| `npm run build -w frontend` | PASS |
| `npm run build -w backend` | PASS |

## 17. UI Regression Results

| Check | Result |
| --- | --- |
| `check:final-ui-regression` | PASS |
| `check:visual-color-system` | PASS |
| `check:surface-comfort-pass` | PASS |

## 18. Workspace Counts

Staged: **0**

After ignore (3 untracked dropped) + version files (3 tracked mods) + this report (1 untracked):

| | Approx |
| --- | --- |
| Modified | 172 (was 169; +`.gitignore` + root `package.json` + `package-lock.json`) |
| Untracked (exclude-standard) | 119 (was 121 after RC-03 docs; −3 ignored + this report) |

HEAD unchanged: `b063fc4`.

## 19. Stage Include Plan Impact

Updated `docs/release/rc-03-stage-include.txt` by **adding 4 paths**:

- `.gitignore`
- `package.json`
- `package-lock.json`
- `docs/release/rc-03-5-pre-baseline-repository-hygiene.md`

No other include paths rewritten.

## 20. Stage Exclude Plan Impact

`docs/release/rc-03-stage-exclude.txt` **unchanged** (same 3 paths). They are now **IGNORED** and remain **NOT_STAGED**.

## 21. Candidate Security Audit

dump.rdb: **IGNORED**
embedded Postgres tgz: **IGNORED**
console snippet: **IGNORED**
Secret Files Planned: **0**
Runtime Files Planned: **0**
Real Data Planned: **0**
Unsafe Candidate Files: **0**

## 22. Secret Audit

Secret Values Printed: **NO**
Secret Files Modified: **0**
Tracked Secrets: **NO**
`.env` untouched.

## 23. Runtime Data Audit

Runtime Data Planned In Git: **NO**
Real Data Planned In Git: **NO**

## 24. Git Mutation

Git Index Mutated: **NO**
Git Commit: **NO**
Git Tag: **NO**
Git Push: **NO**

Source / business / route / DB schema / agent / provider / LLM: **0**

## 25. Gate

Gitignore Gap After = 0
Unexpected Files Newly Ignored = 0
Product Version = 0.9.0-rc.1
Version Semantics = CONSISTENT_WITH_TAG
Frontend Build = PASS
Backend Build = PASS
Tracked Secrets = NO
Unsafe Candidate Files = 0
Git Index Mutated = NO

**READY_FOR_RC_04_STAGING_EXECUTION_APPROVAL**
