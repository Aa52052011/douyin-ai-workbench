# Database Backup Policy

Applies to local/RC PostgreSQL for `ai-content-factory` (`acf_dev` @ `127.0.0.1:55432` unless a later environment document says otherwise).

Backups live **outside the git repository**, under `D:\acf-backups\` (release dumps under `D:\acf-backups\releases\`). They must not be staged or committed.

## Classes

### DAILY

- Purpose: rolling safety net for the working local/RC database.
- When: once per calendar day while the environment is in active use.
- Retention: keep the **most recent 7–14** daily dumps; delete older daily files only, never RELEASE files.
- Location suggestion: `D:\acf-backups\daily\`

### MILESTONE

- Purpose: recover a completed product-loop or module gate without waiting for a version tag.
- When: after a large closed loop passes (for example full validation dataset established).
- Retention: keep until the next RELEASE supersedes it, or longer if still referenced by an audit report.
- Location suggestion: `D:\acf-backups\milestones\`

### RELEASE

- Purpose: permanent pairing of a tagged code baseline with a proven data baseline.
- When: RC / GA freeze (this file’s first instance is `0.9.0-rc.1`).
- Retention: **permanent**. Do not delete to free disk without an explicit later policy change.
- Location: `D:\acf-backups\releases\`

## RELEASE triplet (mandatory)

Every RELEASE backup must exist as three files:

| File | Role |
| --- | --- |
| `.dump` | `pg_dump -Fc` custom archive |
| `.sha256` | SHA256 of the dump plus filename |
| `.manifest.txt` | RC version, git commit/tag, DB identity, migration status, validation IDs, SHA256 |

If any one file is missing, the RELEASE set is incomplete.

## Capture rules

1. Confirm Postgres reachable and `prisma migrate status` is **CLEAN** before dump.
2. Use `pg_dump -Fc`. Do not print passwords.
3. Do not overwrite an existing RELEASE dump; add a `-HHMMSS` suffix.
4. Verify with `pg_restore -l` (list only, no restore).
5. Compute SHA256 and write the sidecar.
6. Write the manifest with the current RC ID map.
7. Keep dump path outside the repo.

## Restore rules

Follow `docs/release/rc-09-3-database-restore-runbook.md`. Default restore target is an **isolated** database. Direct overwrite of the running application database requires explicit disaster-recovery authorization.

## Future automation (not implemented)

Future Script: `npm run rc:backup`

Intended to automate: DB reachability, migration CLEAN check, `pg_dump`, `pg_restore -l`, SHA256, manifest generation.

Implementation: **DEFERRED**. Do not add the npm script in this phase.
