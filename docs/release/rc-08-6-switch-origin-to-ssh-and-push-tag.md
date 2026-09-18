# RC-08.6 Switch Origin to SSH and Push RC Tag

Date: 2026-09-17
This file is a working-tree audit artifact. Not staged. Not committed.

## 1. Authorization

Allowed: `git remote set-url origin` to SSH; `git push origin v0.9.0-rc.1`
Forbidden: push main, force, `--tags`, commit, amend, new/rewrite tag, add, reset, merge, rebase.

## 2. Repository

`D:\project\ai-content-factory`

## 3. Local HEAD

`296e6d8c148eb77df16b5fc18b709262cf197009`

## 4. Local Tag

`v0.9.0-rc.1` annotated
Target: `296e6d8c148eb77df16b5fc18b709262cf197009`

## 5. Origin Before

`https://github.com/Aa52052011/douyin-ai-workbench.git`

## 6. Origin After

`git@github.com:Aa52052011/douyin-ai-workbench.git`
Remote URL Changed: YES
Remote Protocol: SSH

## 7. SSH Remote Verification

`ls-remote --heads origin refs/heads/main` succeeded over SSH (identity `id_ed25519_github`).

## 8. Remote Main Verification

`296e6d8c148eb77df16b5fc18b709262cf197009 refs/heads/main`
Remote Main Target Correct: YES
Main was not pushed.

## 9. Remote Tag Before

MISSING (no refs for `v0.9.0-rc.1`)

## 10. Tag Push Result

```
git push origin v0.9.0-rc.1
```

Result: `* [new tag] v0.9.0-rc.1 -> v0.9.0-rc.1`
Tag Push: SUCCESS
Not `--tags`. Not force.

## 11. Remote Tag Verification

- `refs/tags/v0.9.0-rc.1` = tag object `cb4c54c631c71726de08c7dbccb529d25ce32864`
- `refs/tags/v0.9.0-rc.1^{}` = `296e6d8c148eb77df16b5fc18b709262cf197009`

Remote Tag Target Correct: YES

## 12. Remote RC Baseline Consistency

Remote main and peeled tag both `296e6d8c148eb77df16b5fc18b709262cf197009`
Remote RC Baseline: CONSISTENT

## 13. Working Tree

Tracked Modified: 0
Staged: 0
Untracked RC audit reports remain (including this file after write). Not staged.

## 14. Force Push

NO

## 15. Git Commit

NO

## 16. Git Tag Rewrite

NO

## 17. Gate

REMOTE_RC_BASELINE_PUBLISHED
