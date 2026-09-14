# Final Clean Baseline — 2026-09-14

## Baseline Type

`FINAL_CLEAN_BASELINE`

This is the **PRIMARY_RECOVERY_BASELINE**.

Created At: `2026-09-14T22:57:00+08:00` (document authored at baseline creation; git commit date is authoritative)

## Previous Emergency Baseline

- Commit: `9c3cfe1cf9cee6e945f2efa91ab5b3f656aa4555`
- Tag: `acf-emergency-baseline-20260914`
- Status: `KNOWN_INCOMPLETE_BASELINE`
- Reason: contains corrupted/empty Prisma schema and empty migration SQL prior to final Prisma recovery.

The emergency commit and tag are **preserved**. They must not be deleted, moved, or force-updated. They are **not** the final restore target.

## Recovery Summary

- Recovered incident files: **536**
  - 259 backend TypeScript
  - 269 non-TS
  - 1 `database/prisma/schema.prisma`
  - 7 `migration.sql`
- Prisma schema: restored, validated (`PASS`)
- Isolated fresh PostgreSQL migrate deploy: **22 found / 22 applied**, status `CLEAN`
- Backend compile: `PASS`
- Backend build: `PASS`
- Full regression: **1324 PASS / 0 FAIL / 14 SKIPPED**, 0 failed suites
- Backend health: `PASS`
- Dev database (`acf_dev` / port 55432) mutated during isolated verify: **NO**
- `acf` role privileges changed: **NO**
- Core product features: **PRESERVED**

## Known Non-Blocking Limitations

These remain **unresolved**. Final Clean does **not** mean product gaps are closed.

### Recovery artifacts (not written back)

1. In-window `REVIEW_REQUIRED` artifact (1)
2. Outside-window manual-review artifacts (15)
3. Generated/recreatable artifact (1)

### Product / UX gaps (preserved)

- `REVIEW_SESSION_FACT_DATA_GAP`
- `AI_CONVERSATION_CONTEXT_DATA_GAP`
- `FULL_PERFORMANCE_ANALYSIS_UI_BINDING` — `NOT_YET_COMPLETE`
- `RECOMMENDATION_REVIEW_PERSISTENCE` — `NOT_YET_CONNECTED`
- `FINAL_ACCEPTANCE_PERSISTENCE_UI_GAP`
- `LANDSCAPE_EXPORT_LIMITATION`
- `BROWSER_VISUAL_ACCEPTANCE` — `NOT_YET_COMPLETED`

Classification: `KNOWN_NON_BLOCKING_LIMITATIONS`

## Secrets

No secrets are recorded in this file. `.env` and credentials are excluded from git and from independent backup contents (presence + SHA-256 of `.env` only, never the file body).
