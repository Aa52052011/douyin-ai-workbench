# RC-09.2C Rebuild RC Validation Dataset

Date: 2026-09-18
Mode: official HTTP/API product flow only. No SQL/Prisma writes of business results. No code/schema/git mutation.

**Stopped at Script Generation.** LLM output failed product schema validation (`AGENT_INVALID_OUTPUT`). No code change. No retry after STOP.

## 1. Phase Identity

RC_09_2C_REBUILD_RC_VALIDATION_DATASET

## 2. Authorization

ALLOW_CREATE_RC_VALIDATION_DATA / PRODUCT_FLOW_WRITES / PROVIDER / LLM / MANUAL_PUBLICATION / MANUAL_METRICS: **YES**
Direct DB insert / fake publish / fake metrics / seed / migrate / git: **not used**

## 3. Runtime Bring-up

Postgres 55432 already RUNNING (PID 10348). Redis 6379 already REACHABLE (PID 4000). Not restarted.

| Service | Result |
| --- | --- |
| Backend `127.0.0.1:3001` | RUNNING, `GET /health` **200** `ok` |
| Worker | `Job worker started`, Count **1** |
| Frontend `127.0.0.1:3010` | REACHABLE **200** |
| Migration | left CLEAN (not run) |

## 4. Validation Account

Created via `POST /auth/register` (not DB insert).

RC_VALIDATION_USER_ID: `01a0b275-b8ba-7723-a72f-ff5d40feb8d7`
Email (non-secret): `rc090.val.1789700454310@example.test`

## 5. Validation Workspace

RC_VALIDATION_TENANT_ID: `01a0b275-b8c4-7c21-a872-f7c2738aeb83`
RC_VALIDATION_WORKSPACE_ID: `01a0b275-b8c7-7e52-9f5c-6fd4371e1df6`

## 6. Validation Project

`POST /projects` name `RC 0.9.0 验证项目`, industry 本地生活餐饮, platform douyin.

RC_VALIDATION_PROJECT_ID: `01a0b275-b904-7492-a5a3-185430e1d585`
Project creation: **SUCCESS**

## 7. Account Positioning

`POST /agents/runs` `account.positioning:v1` → **COMPLETED**
Run: `01a0b275-b917-7263-a326-a001c8dcd3eb`
Tokens: 295 / 2308 / 2603
Human confirm: UI-equivalent (completed run used as `positioningRunId`; product confirm is client-side).
Positioning Confirmed: **YES**

## 8. ContentPlan v1

`POST /content-plans` days=7 postsPerDay=1 → generated **7 topics**, then `POST .../confirm`.

RC_VALIDATION_CONTENT_PLAN_V1_ID: `01a0b279-ed8c-7c63-ac34-2ab58e0d5f0c`
Topic Count: **7**
RC_VALIDATION_TOPIC_ID: `5c24881f-08e2-4a6d-8bbc-d717adc73657`
ContentPlan v1 Status: **CONFIRMED**

## 9. Script Generation

`POST /scripts` for the first topic, 30s.

HTTP **502** `AGENT_INVALID_OUTPUT` — Agent output failed schema validation.

RC_VALIDATION_SCRIPT_ID: **not created**
Script Status: **FAIL**

Per instructions: **STOP**. No code fix. Subsequent video/publish/metrics/analysis/handoff/v2 **not run**.

## 10. Video Generation

NOT_RUN

## 11. Final Video Acceptance

NOT_RUN

## 12. Download

NOT_RUN

## 13. Publication Registration

NOT_RUN

## 14. Metrics Snapshot 1

NOT_RUN

## 15. Metrics Snapshot 2

NOT_RUN

## 16. Performance Analysis

NOT_RUN

## 17. Recommendation Review

NOT_RUN

## 18. Accepted-only Feedback Handoff

NOT_RUN

## 19. ContentPlan v2

NOT_RUN

## 20. New RC ID Map

| Key | Value |
| --- | --- |
| RC_VALIDATION_PROJECT_ID | `01a0b275-b904-7492-a5a3-185430e1d585` |
| RC_VALIDATION_CONTENT_PLAN_V1_ID | `01a0b279-ed8c-7c63-ac34-2ab58e0d5f0c` |
| RC_VALIDATION_TOPIC_ID | `5c24881f-08e2-4a6d-8bbc-d717adc73657` |
| RC_VALIDATION_SCRIPT_ID | — |
| RC_VALIDATION_VIDEO_ID | — |
| RC_VALIDATION_PUBLICATION_ID | — |
| RC_VALIDATION_METRIC_SNAPSHOT_1_ID | — |
| RC_VALIDATION_METRIC_SNAPSHOT_2_ID | — |
| RC_VALIDATION_PERFORMANCE_ANALYSIS_ID | — |
| RC_VALIDATION_FEEDBACK_CYCLE_ID | — |
| RC_VALIDATION_CONTENT_PLAN_V2_ID | — |

Old freeze UUIDs remain HISTORICAL_ONLY. New map is **incomplete**.

## 21. Data Integrity

RC Validation Data Integrity: **FAIL** (loop incomplete)

## 22. Current-cycle Isolation

Current-cycle Isolation: **FAIL** (v2 never created; not fully exercised)

## 23. Historical Isolation

Historical Isolation: **FAIL** (not fully exercised on this project)

## 24. Provider Calls

3 attempted (positioning, planning, script). Script call failed validation after provider return.

## 25. LLM Calls

3 (same)

## 26. Agent Runs

Completed: positioning + content.planning. Script run failed validation.

Agent Runs completed: **2** (+1 failed)

## 27. Runtime Errors

Backend fatal: **0**
Worker job failures: **0** (no video job)
Redis: none
DB errors: none
Duplicate worker: **NO**
Business failure node: **Script Generation** (`AGENT_INVALID_OUTPUT`)

## 28. 9 Route Validation

Unauthenticated Next production HTML load **200** for dashboard / projects / overview / positioning / plans / scripts / videos / publish / performance (project id in path). Not a logged-in data-visibility pass.

Frozen Routes: **9 / 9 PARTIAL** (HTTP load only)

## 29. Git State

HEAD `296e6d8c148eb77df16b5fc18b709262cf197009`
Tracked Modified: **0**
Staged: **0**
Git Mutation: **NO**

## 30. Gate

Gate: **RC_09_2C_BLOCKED**

Failure node: Script Generation schema validation.

Recommended Next Step: operator retry of official script generate on the same confirmed plan/topic (or authorize a later RC-09.2C resume). **Do not** start RC-10 until the loop gate passes.

STOP.
