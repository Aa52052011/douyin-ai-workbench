# RC-06 Baseline Commit Execution

Date: 2026-09-17
Authorization: EXPLICIT_USER_APPROVAL (`ALLOW_GIT_COMMIT`)
Git tag / push / add / amend: not executed
This file is a **post-commit** working-tree artifact and is **not** part of commit `296e6d8`.

## 1. Phase Identity

| Field | Value |
| --- | --- |
| Phase | RC_06_BASELINE_COMMIT_EXECUTION |
| Branch | `main` |
| Pre-commit HEAD | `b063fc4` |
| Post-commit HEAD | `296e6d8` (`296e6d8c148eb77df16b5fc18b709262cf197009`) |
| RC Version | 0.9.0-rc.1 |

## 2. Authorization

Allowed: `git commit -m "release: freeze web 0.9.0-rc.1 product and UI baseline"`
Forbidden: tag, push, amend, add, reset, restore, checkout, clean, stash.

## 3. Pre-commit HEAD

`b063fc4fde0965e0e1f7479506a0fe65aaacd47e`

## 4. Pre-commit Staged Count

**295**

## 5. Pre-commit Diff Check

PASS (`git diff --cached --check` exit 0)
Unsafe Staged Files: **0**
Staged Product Version: **0.9.0-rc.1**
Version Metadata Consistent: **YES**

## 6. Commit Command

```
git commit -m "release: freeze web 0.9.0-rc.1 product and UI baseline"
```

## 7. Commit Result

Commit Success: **YES**
Post-commit HEAD != `b063fc4`: **YES**

Note: Git recorded an extra trailer (not requested in the authorized subject):

```
Co-authored-by: Cursor <cursoragent@cursor.com>
```

No amend was performed.

## 8. Post-commit HEAD

`296e6d8c148eb77df16b5fc18b709262cf197009`

## 9. Commit Message

Subject: `release: freeze web 0.9.0-rc.1 product and UI baseline`

## 10. Committed File Count

**295** (`git diff-tree --name-status` line count)

## 11. Added / Modified / Deleted / Renamed

| | N |
| --- | --- |
| Added | 123 |
| Modified | 172 |
| Deleted | 0 |
| Renamed | 0 |

123 + 172 = 295. Matches staged candidate count.

## 12. Missing / Unexpected Files

Unexpected Committed Files: **0**
Missing Expected Commit Files: **0**

## 13. Git Index State

Staged After Commit: **0**
Git Index: **CLEAN**

## 14. Working Tree State

Immediately after commit, before this report:

Tracked Modified: **0**
Untracked Non-Ignored: **0**

After writing this report: **1** untracked (`docs/release/rc-06-baseline-commit-execution.md`), not staged.

## 15. Ignore Verification

| Path | Result |
| --- | --- |
| `dump.rdb` | IGNORED |
| `database/embedded-postgres-windows-x64-16.14.0-beta.17.tgz` | IGNORED |
| `docs/ui-ux/acf-ui-diag-console-snippet.js` | IGNORED |

Local files were not deleted.

## 16. Secret Audit

Secret Files In HEAD: **0**
Potential Secret Literals In HEAD: **0** (path-level: no `.env` / `.pem` / `.key` / dumps in commit names)
Real Env Files In HEAD: **0**
Values not printed.

## 17. Runtime Data Audit

Runtime Data In HEAD: **0**
Real User/Test Runtime Data In HEAD: **0**

## 18. Product Version

HEAD Product Version: **0.9.0-rc.1**
Lock metadata: **CONSISTENT**
Version Ready For Tag: **YES**

## 19. Frontend Build

`tsc --noEmit`: PASS
`next build`: PASS

## 20. Backend Build

`nest build`: PASS

## 21. UI Regression

final-ui-regression: PASS
visual-color-system: PASS
surface-comfort-pass: PASS

## 22. Runtime Health

Backend Health: PASS (`GET http://127.0.0.1:3001/health` → 200)
Worker: RUNNING (PID 1272)
Database: REACHABLE
Migrations: CLEAN (23 migrations; schema up to date)
Redis: REACHABLE

## 23. RC Baseline Identity

RC Baseline Commit: `296e6d8c148eb77df16b5fc18b709262cf197009`
RC Version: 0.9.0-rc.1
Baseline Status: **FROZEN**
UI_UX: **FROZEN_PASS**
Frozen Routes: **9 / 9**

## 24. Tag Readiness

Tag Candidate: `v0.9.0-rc.1`
Tag Target: `296e6d8c148eb77df16b5fc18b709262cf197009`
Tag Ready: **YES**

## 25. Git Tag

**NO**

## 26. Git Push

**NO**

## 27. Gate

**READY_FOR_TAG_APPROVAL**
