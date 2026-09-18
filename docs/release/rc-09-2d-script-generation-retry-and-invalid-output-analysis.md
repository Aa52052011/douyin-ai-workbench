# RC-09.2D Script Generation Retry and Invalid Output Analysis

Date: 2026-09-18
HEAD: `296e6d8c148eb77df16b5fc18b709262cf197009`
Mode: same RC validation project / ContentPlan / topic. Official `POST /scripts` only. Max 2 new provider/LLM calls. No prompt/schema/parser/validator/agent/model/git mutation. No Video+ continuation.

## 1. Phase

RC_09_2D_SCRIPT_GENERATION_RETRY_AND_INVALID_OUTPUT_ANALYSIS

## 2. Existing RC IDs

| Key | Value |
| --- | --- |
| RC_VALIDATION_PROJECT_ID | `01a0b275-b904-7492-a5a3-185430e1d585` |
| RC_VALIDATION_CONTENT_PLAN_V1_ID | `01a0b279-ed8c-7c63-ac34-2ab58e0d5f0c` |
| ContentPlan v1 status | CONFIRMED |
| RC_VALIDATION_TOPIC_ID | `5c24881f-08e2-4a6d-8bbc-d717adc73657` |
| Script before this phase | NONE |
| Tenant | `01a0b275-b8c4-7c21-a872-f7c2738aeb83` |
| Workspace | `01a0b275-b8c7-7e52-9f5c-6fd4371e1df6` |

Project exists: YES. ContentPlan v1 exists: YES. Selected topic exists: YES.

## 3. Previous Failed AgentRun

| Field | Value |
| --- | --- |
| Previous Script AgentRun ID | `01a0b279-ee3c-71c1-9fa1-34642e84f69c` |
| Agent Name / ID | `script.generation` |
| Agent Version | `v1` |
| Provider | real (`usageEvent` `01a0b279-ee48-7931-a29e-4110ab9320cf`) |
| Model | `openai/gpt-5.5` |
| Status | FAILED |
| Error Code | AGENT_INVALID_OUTPUT |
| Error Message | Agent output failed schema validation |
| Retryable | false |
| HTTP (RC-09.2C) | 502 |
| Request ID | `820d4d41-19ed-4ebc-bce1-580833a00507` |
| Duration | 79809 ms |
| Usage | SUCCEEDED, 10118 TOKENS |
| AgentRun.output | null |
| AgentRun token fields | in/out/total all null |

## 4. Expected Script Output Schema

Read-only from `apps/backend/src/agents/definitions/script-generation.agent.ts` (`outputSchema` + `validateScriptOutput`) and `script-generation.types.ts` (`ScriptOutput` / `ScriptSection`). Parser: `parseModelJson` in `account-positioning.agent.ts`. Executor: `InProcessExecutor.runScriptGeneration` → `validateScriptOutput(parseModelJson(model.text), targetDuration)`.

**Expected top-level fields (required):**

- `title` (non-empty string)
- `hook` (non-empty string)
- `opening` (non-empty string)
- `sections` (array length 1–12)
- `ending` (non-empty string)
- `cta` (non-empty string)
- `totalDuration` (integer ≥ 1; must equal sum of section durations; must be within 5 of `targetDuration`)
- `estimatedWordCount` (present; validator overwrites from CJK/char count of concatenated narration)
- `voiceStyle` (non-empty string)
- `visualStyle` (non-empty string)
- `productionNotes` (non-empty array of non-empty strings)

**Each `sections[]` item:**

- `sequence` number, must equal index + 1
- `duration` integer ≥ 1
- `narration`, `visualSuggestion`, `subtitle` non-empty strings

No Zod schema is used for this agent. JSON Schema `outputSchema` on the definition only lists the required top-level keys (no nested properties). Runtime contract is the TypeScript validator above.

## 5. Previous Raw Output Analysis

Raw Output Present: **NO**

Evidence:

- `AgentRun.output` is null on the failed run.
- `AgentEngine` persists only `{ code, message, retryable }` on failure; it does not store model text.
- `runScriptGeneration` does **not** catch validation errors to log `outputIssue` / `responseLength` (unlike `content.planning`).
- Backend log for request `820d4d41-19ed-4ebc-bce1-580833a00507` is only `status: FAILED`, `errorCode: AGENT_INVALID_OUTPUT`, `durationMs: 79809`. No field-level validator dump. No markdown fence sample.

JSON Parse: **UNKNOWN** (generic `AGENT_INVALID_OUTPUT` is also thrown by `parseModelJson` on non-JSON).

Schema Validation: **UNKNOWN at field level**. Product maps every `AGENT_INVALID_OUTPUT` to the same HTTP message “Agent output failed schema validation”.

Validation Errors: none beyond `{ code: AGENT_INVALID_OUTPUT, message: Agent output failed schema validation, retryable: false }`.

Failure Classification: **OTHER**

Cannot honestly assign INVALID_JSON / MISSING_REQUIRED_FIELD / WRONG_FIELD_TYPE / WRONG_ENUM_VALUE / ARRAY_SHAPE_ERROR / EXTRA_WRAPPER_OBJECT / MARKDOWN_FENCE / TRUNCATED_OUTPUT. Observability gap is confirmed.

## 6. Retry 1

Official `POST /scripts` same Project / ContentPlan / Topic. Payload semantics unchanged: `{ contentPlanId, topicId, targetDuration: 30, requirements: "口播清晰，突出到店咨询，不要夸大效果" }`.

| Field | Value |
| --- | --- |
| Retry 1 HTTP | **201** |
| Retry 1 result | **SUCCESS** |
| RC_VALIDATION_SCRIPT_ID | `01a0b283-d4c6-74f2-addf-186fb24b0c80` |
| Retry 1 AgentRun ID | `01a0b282-5739-74c2-a3c6-16729ba036bc` |
| Status | COMPLETED |
| Provider Call | YES |
| LLM Call | YES |
| UsageEvent | `01a0b282-5744-7d60-96e8-b353d970c014` SUCCEEDED, 14310 TOKENS |
| Model | `openai/gpt-5.5` |
| Tokens | in 10510 / out 3800 / total 14310 |
| Duration | ~97783 ms HTTP / 97656 ms AgentEngine |
| Request ID | `f06f02b9-cdef-4fbe-a7a5-8906fdae3eb8` |
| Confirm HTTP | **200** `POST /scripts/{id}/confirm` |
| Script status after confirm | **CONFIRMED** |

## 7. Retry 1 Validation Analysis

Retry 1 Raw Output Present: YES on AgentRun (`hasOutput: true`). Persisted `payload` matches `ScriptOutput`.

JSON Parse: **PASS** (inferred: validator ran after `parseModelJson` and script was persisted).

Schema Validation: **PASS**

Validation Errors: none

Failure Classification: **N/A (SUCCESS)**

Observed valid payload shape: 3 sections, durations 10+10+10, `totalDuration` 30 (equals target), productionNotes length 2.

## 8. Retry 2

**NOT_RUN**

Retry 1 created a Script. Third/second extra provider call would violate the max-2 budget and the “stop if script exists” rule.

## 9. Retry 2 Validation Analysis

NOT_APPLICABLE

## 10. Failure Comparison

| | Previous | Retry 1 | Retry 2 |
| --- | --- | --- | --- |
| HTTP | 502 | 201 | NOT_RUN |
| AgentRun | FAILED | COMPLETED | — |
| Raw stored | NO | YES | — |
| Classification | OTHER | SUCCESS | — |

Same Failure Shape: **NO** (Retry 1 did not fail)

Variance judgment (evidence only): previous failure is consistent with **INTERMITTENT_MODEL_FORMAT_VARIANCE** *as a working hypothesis* (same frozen prompt/schema/model config; one fail then one pass). **SYSTEMATIC_SCHEMA_MISMATCH is not confirmed** because Retry 1 produced a contract-valid object without code changes. Classification of the *first* failure remains OTHER due to missing raw text.

## 11. Script Result

Script created: YES
Script confirmed: YES (`CONFIRMED`)
RC_VALIDATION_SCRIPT_ID: `01a0b283-d4c6-74f2-addf-186fb24b0c80`
Version: 1
sourceAgentRunId: `01a0b282-5739-74c2-a3c6-16729ba036bc`

Video / Download / Publication / Metrics / Performance Analysis / ContentPlan v2: **not continued** (this phase Script gate only).

## 12. Script Data Integrity

| Check | Result |
| --- | --- |
| Script record exists | PASS |
| topicId = `5c24881f-08e2-4a6d-8bbc-d717adc73657` | PASS |
| contentPlanId = `01a0b279-ed8c-7c63-ac34-2ab58e0d5f0c` | PASS |
| projectId = `01a0b275-b904-7492-a5a3-185430e1d585` | PASS |
| version = 1 | PASS |
| status = CONFIRMED | PASS |
| sourceAgentRunId = Retry 1 AgentRun | PASS |
| topicSnapshot exists | PASS |

Script Data Integrity: **PASS**

## 13. Runtime Health

| Check | Result |
| --- | --- |
| Backend `GET /health` | PASS (`{"service":"backend","status":"ok"}`) |
| Worker Count | 1 (`node dist/worker.js`, PID 12512) |
| Frontend `127.0.0.1:3010` | REACHABLE 200 |
| Postgres `127.0.0.1:55432` | reachable |
| Redis `127.0.0.1:6379` | reachable |

## 14. Provider/LLM Call Delta

Baseline before this phase (RC-09.2C): Provider 3 / LLM 3 / AgentRuns 3 (positioning COMPLETED, planning COMPLETED, script FAILED).

This phase:

- Provider Calls Added: **1**
- LLM Calls Added: **1**
- AgentRuns Added: **1** (COMPLETED)
- Retry 2 not used

Cumulative after this phase: Provider 4 / LLM 4 / AgentRuns 4.

## 15. Git State

HEAD: `296e6d8c148eb77df16b5fc18b709262cf197009`

Tracked Modified: **0**
Staged: **0**
Git Mutation: **NO**

Untracked audit report allowed: this file. Other prior untracked RC reports remain untracked. Local helper under `.local/` is untracked and is not a product change.

## 16. Gate

Retry 1 succeeded. Script created and confirmed. Script Data Integrity = PASS. Tracked Modified = 0. Staged = 0.

Gate: **RC_SCRIPT_STAGE_RECOVERED**

## 17. Recommended Next Step

RC_09_2E_RESUME_VALIDATION_FROM_VIDEO

Do not start it in this phase.

Optional later (not a blocker for resume): script.generation still lacks `outputIssue` + raw-output persistence; a future observability audit would make the next AGENT_INVALID_OUTPUT classifiable. That is **not** RC_09_2E_SCRIPT_AGENT_OUTPUT_CONTRACT_FIX_AUDIT, because Retry 1 recovered without a contract change.

STOP.
