# RC-12 Release Documentation Commit

Date: 2026-09-18

## 1. Authorization

- RC Phase: `RC_12_RELEASE_DOCUMENTATION_COMMIT`
- Authorization: `EXPLICIT_USER_APPROVAL`
- ALLOW_RELEASE_DOC_STAGE: YES
- ALLOW_RELEASE_DOC_COMMIT: YES
- ALLOW_GITHUB_RELEASE: NO
- ALLOW_PUSH: NO
- ALLOW_TAG_CHANGE: NO
- ALLOW_AMEND: NO

## 2. Product Baseline Commit

`296e6d8c148eb77df16b5fc18b709262cf197009`

Pre-commit `git rev-parse HEAD` matched this hash. Parent of the documentation commit is this product baseline.

## 3. Product Tag

- Tag: `v0.9.0-rc.1`
- Required target: `296e6d8c148eb77df16b5fc18b709262cf197009`
- Tag mutation: not performed

## 4. RC Acceptance Gate

`V0_9_0_RC_1_LOCAL_WINDOWS_WEB_RC_ACCEPTED`

Scope remains LOCAL_WINDOWS_WEB_RC only. VPS / Tauri / GA are not accepted.

## 5. Candidate Release Docs

Untracked under `docs/release/` at RC-12 start (sorted):

1. `database-backup-policy.md`
2. `rc-06-baseline-commit-execution.md`
3. `rc-07-local-tag-creation.md`
4. `rc-08-1-configure-git-remote.md`
5. `rc-08-6-switch-origin-to-ssh-and-push-tag.md`
6. `rc-08-remote-push.md`
7. `rc-08-remote-push-retry.md`
8. `rc-09-1-local-runtime-bring-up.md`
9. `rc-09-2-authorized-prisma-migrate-deploy.md`
10. `rc-09-2a-frozen-database-source-recovery-audit.md`
11. `rc-09-2b-option-a-migrate-current-acf-dev.md`
12. `rc-09-2c-rebuild-rc-validation-dataset.md`
13. `rc-09-2d-script-generation-retry-and-invalid-output-analysis.md`
14. `rc-09-2e-resume-validation-from-video.md`
15. `rc-09-3-database-restore-runbook.md`
16. `rc-09-3-freeze-new-rc-database-baseline.md`
17. `rc-09-pre-release-checklist.md`
18. `rc-09-release-preparation-and-deployment-readiness.md`
19. `rc-10-known-limitations.md`
20. `rc-10-launch-checklist.md`
21. `rc-10-release-runbook.md`
22. `rc-11-final-rc-acceptance.md`
23. `v0.9.0-rc.1-release-notes-draft.md`

Release Docs Candidate Count: **23**

Plus two RC-12 files written before staging: staging manifest and this report.

## 6. Include List

Count: **25**

All 23 candidates above plus:

- `docs/release/rc-12-documentation-staging-manifest.md`
- `docs/release/rc-12-release-documentation-commit.md`

Markdown trailing-whitespace cleanup was applied only to INCLUDE files that would fail `git diff --cached --check`. No source, schema, env, lockfile, or runtime files were edited.

## 7. Exclude List

Count: **0**

No untracked `docs/release/` file was classified as debug/scratch. Helper scripts outside `docs/release/` were not staged.

## 8. Sensitive Scan

Sensitive Findings: **0**

Backup Binary Included: **NO**

Private Key Included: **NO**

Runtime Dump Included: **NO**

## 9. Staging Audit

Method: `git add --` with exact INCLUDE paths only.

Expected after stage:

- Staged Source Files: 0
- Staged Env Files: 0
- Staged Migration Files: 0
- Staged Package Files: 0
- Staged Lockfiles: 0
- Staged Runtime Files: 0
- Staged Backup Dumps: 0
- Staged Release Docs: 25
- Unexpected Staged Files: 0

## 10. Cached Diff Check

Required: `git diff --cached --check` PASS

## 11. Commit

Message:

```
docs(release): archive v0.9.0-rc.1 acceptance records
```

Amend: NO

Author rewrite: NO

## 12. Documentation Commit Hash

This report is included in the documentation commit, so the commit hash cannot be known before `git commit`. Verify after commit:

```
git rev-parse HEAD
git rev-parse --short HEAD
git show --stat --oneline HEAD
```

Parent must remain `296e6d8c148eb77df16b5fc18b709262cf197009`.

Documentation-only Commit is YES only if `git show --stat --oneline HEAD` lists `docs/release/` paths exclusively.

## 13. Tag Integrity

`git rev-list -n 1 v0.9.0-rc.1` must remain `296e6d8c148eb77df16b5fc18b709262cf197009`.

Release Tag Moved: **NO** (tag commands not executed)

## 14. Remote Mutation

Git Push: **NO**

Remote Modified: **NO**

## 15. GitHub Release

GitHub Release: **NO**

## 16. Final Working Tree

Verify after commit with `git status --short`. Required: Tracked Modified 0, Staged 0. Remaining untracked may include helper scripts outside `docs/release/`.

## 17. Gate


Target if all checks pass: `RC_RELEASE_DOCUMENTATION_COMMITTED_LOCALLY`

Otherwise: `RC_12_BLOCKED`

## 18. Recommended Next Step

`RC_12_1_REVIEW_DOCUMENTATION_COMMIT_AND_AUTHORIZE_PUSH`

Do not start RC-12.1 until explicitly authorized.
