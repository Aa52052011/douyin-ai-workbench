# RC-12 Documentation Staging Manifest

Date: 2026-09-18

## Product baseline

- Product Baseline Commit: `296e6d8c148eb77df16b5fc18b709262cf197009`
- Product Tag: `v0.9.0-rc.1`
- Tag Target (must remain): `296e6d8c148eb77df16b5fc18b709262cf197009`
- RC accepted gate: `V0_9_0_RC_1_LOCAL_WINDOWS_WEB_RC_ACCEPTED`
- Branch: `main`
- Repository: `D:\project\ai-content-factory`

## Authorization

- ALLOW_RELEASE_DOC_STAGE: YES
- ALLOW_RELEASE_DOC_COMMIT: YES
- ALLOW_GITHUB_RELEASE: NO
- ALLOW_PUSH: NO
- ALLOW_TAG_CHANGE: NO
- ALLOW_AMEND: NO

## Candidate count (before writing this manifest)

Untracked `docs/release/` files at start of RC-12: **23**

This manifest and `rc-12-release-documentation-commit.md` are additional INCLUDE files written before staging.

## Include file list

1. `docs/release/database-backup-policy.md`
2. `docs/release/rc-06-baseline-commit-execution.md`
3. `docs/release/rc-07-local-tag-creation.md`
4. `docs/release/rc-08-1-configure-git-remote.md`
5. `docs/release/rc-08-6-switch-origin-to-ssh-and-push-tag.md`
6. `docs/release/rc-08-remote-push.md`
7. `docs/release/rc-08-remote-push-retry.md`
8. `docs/release/rc-09-1-local-runtime-bring-up.md`
9. `docs/release/rc-09-2-authorized-prisma-migrate-deploy.md`
10. `docs/release/rc-09-2a-frozen-database-source-recovery-audit.md`
11. `docs/release/rc-09-2b-option-a-migrate-current-acf-dev.md`
12. `docs/release/rc-09-2c-rebuild-rc-validation-dataset.md`
13. `docs/release/rc-09-2d-script-generation-retry-and-invalid-output-analysis.md`
14. `docs/release/rc-09-2e-resume-validation-from-video.md`
15. `docs/release/rc-09-3-database-restore-runbook.md`
16. `docs/release/rc-09-3-freeze-new-rc-database-baseline.md`
17. `docs/release/rc-09-pre-release-checklist.md`
18. `docs/release/rc-09-release-preparation-and-deployment-readiness.md`
19. `docs/release/rc-10-known-limitations.md`
20. `docs/release/rc-10-launch-checklist.md`
21. `docs/release/rc-10-release-runbook.md`
22. `docs/release/rc-11-final-rc-acceptance.md`
23. `docs/release/v0.9.0-rc.1-release-notes-draft.md`
24. `docs/release/rc-12-documentation-staging-manifest.md`
25. `docs/release/rc-12-release-documentation-commit.md`

Include Count: **25**

Classification: official RC audit / runbook / checklist / release notes / backup policy / this RC-12 commit record.

## Exclude file list

Exclude Count: **0**

Workspace `docs/release/` untracked set contained no debug snippets, console scratch, or one-off intermediate artifacts.

Already-tracked RC-01–RC-05 release docs were not restaged (no working-tree changes).

Out of scope (not under `docs/release/`, not staged): local helper scripts such as `.local/rc-09-2d-retry.mjs`, `.local/rc-09-2e-driver.mjs`, `.local/rc-09-3-freeze.mjs`, `.local/rc-11-verify.mjs`.

## Review required

Review Required: **0**

## Sensitive scan result

- API keys (live values): not found
- `DATABASE_URL` with password: not found
- JWT secret values: not found
- `DOUYIN_CLIENT_SECRET` values: not found
- `PLATFORM_SECRET_MASTER_KEY` values: not found
- Authorization / Bearer token values: not found
- Private SSH keys: not found
- Provider key values: not found
- Cookie/token values: not found

Sensitive Findings: **0**

Operational host paths such as `D:\project\ai-content-factory` and `D:\acf-backups\...` appear only as runbook/backup-policy references. Dump files themselves are not included.

## Staging constraints

- Source code files staged = **0**
- Database/runtime files staged = **0**
- `.env` files staged = **0**
- backup dump files staged = **0**
- Backup Binary Included: **NO**
- Private Key Included: **NO**
- Runtime Dump Included: **NO**

## Staging method

Precise pathspec only. Forbidden: `git add .`, `git add -A`, `git add docs`.
