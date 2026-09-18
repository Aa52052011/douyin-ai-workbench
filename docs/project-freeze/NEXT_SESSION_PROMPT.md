# Next session prompt

Copy everything below the line into a new Cursor chat.

---

We are resuming **AI Content Factory** after an authorized pause. This is not a greenfield project and not a schema/migration task.

Repository: `D:\project\ai-content-factory`
GitHub: `git@github.com:Aa52052011/douyin-ai-workbench.git`
Branch: `main`
Expected HEAD: `f09109fd9bf94767ee2fc8f82a4e127346d9b980`

Tags (do not move, do not recreate, do not GitHub Release):

- `v0.9.0-rc.1` → `296e6d8c148eb77df16b5fc18b709262cf197009` — LOCAL_WINDOWS_WEB_RC_ACCEPTED
- `v0.9.1-rc.1` → `f09109fd9bf94767ee2fc8f82a4e127346d9b980` — SINGLE_VPS_WEB_RC_CANDIDATE, status **AWAITING_REAL_VPS_REHEARSAL** (not ACCEPTED)

Database: PostgreSQL `acf_dev` at `127.0.0.1:55432` (embedded cluster via `npm run db:local:*`, not Compose 5432). Migrations must remain CLEAN; do not migrate/reset/push/seed.

Latest pause checkpoint (do not overwrite the v0.9.0-rc.1 release dump):

- `D:\acf-backups\checkpoints\acf_dev_pause_before_vps_rehearsal_20260918_151627.dump`
- SHA256 `F84A75627227380F1028FD668510B51163DFE26DF99BB0DBA497A7115BB9D715`
- Release dump remains `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump`

Read first: `docs/project-freeze/PROJECT_STATE_20260918.md`, then `docs/project-freeze/RESUME_RUNBOOK.md`.

Current completed work: RC-01–RC-12 plus Phase II-A.1 through II-A.5.3. **Do not redo** those unless a proven regression.

Current phase: paused before **PHASE_II_A6_REAL_VPS_DEPLOYMENT_REHEARSAL**.

External blockers (why we paused): VPS not ready, domain not ready, DNS not ready, HTTPS not ready.

Strict boundaries:

- Do not add product features, UI, agents, prompts, or provider behavior.
- Do not change schema or run migrations.
- Do not rebuild the RC validation dataset (IDs are listed in PROJECT_STATE).
- Do not amend, force-push, or retag `v0.9.0-rc.1`.
- Do not start II-A.6 until VPS + domain + DNS access exist.
- First actions: verify git HEAD/tags/working tree, start Postgres 55432, confirm migrate CLEAN, Redis 6379, backend `/health`, one worker, frontend 3010.

SSH for GitHub (temporary, never persist `core.sshCommand`):
`ssh -i C:/Users/Administrator/.ssh/id_ed25519_github -o IdentitiesOnly=yes`

If the user has not confirmed VPS/domain/DNS, STOP after verification and wait. Do not invent a rehearsal.
