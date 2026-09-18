# RC-09.2E Resume Validation From Video

Date: 2026-09-18
HEAD: `296e6d8c148eb77df16b5fc18b709262cf197009`
Mode: continue existing RC validation dataset from confirmed Script. Official product HTTP APIs only. No source/schema/.env/git mutation. No SQL/Prisma creates of business objects.

## 1. Phase Identity

RC_09_2E_RESUME_VALIDATION_FROM_VIDEO

## 2. Existing RC Validation IDs

| Key | Value |
| --- | --- |
| RC_VALIDATION_USER_ID | `01a0b275-b8ba-7723-a72f-ff5d40feb8d7` |
| RC_VALIDATION_TENANT_ID | `01a0b275-b8c4-7c21-a872-f7c2738aeb83` |
| RC_VALIDATION_WORKSPACE_ID | `01a0b275-b8c7-7e52-9f5c-6fd4371e1df6` |
| RC_VALIDATION_PROJECT_ID | `01a0b275-b904-7492-a5a3-185430e1d585` |
| RC_VALIDATION_CONTENT_PLAN_V1_ID | `01a0b279-ed8c-7c63-ac34-2ab58e0d5f0c` |
| RC_VALIDATION_TOPIC_ID | `5c24881f-08e2-4a6d-8bbc-d717adc73657` |
| RC_VALIDATION_SCRIPT_ID | `01a0b283-d4c6-74f2-addf-186fb24b0c80` |
| Positioning | CONFIRMED (`01a0b275-b917-7263-a326-a001c8dcd3eb`) |
| ContentPlan v1 (start of phase) | CONFIRMED |
| Script | CONFIRMED, integrity PASS |

No pre-phase objects were recreated.

## 3. Runtime Health

Start of phase:

| Check | Result |
| --- | --- |
| Postgres `127.0.0.1:55432` | REACHABLE |
| Redis `127.0.0.1:6379` | REACHABLE |
| Backend `GET /health` | 200 `ok` |
| Worker Count | **1** (`node … dist\worker.js` PID 12512) |
| Frontend `127.0.0.1:3010` | REACHABLE 200 |

End of phase: health still `ok`, worker count still 1.

## 4. Video Generation

Official `POST /videos` `{ scriptId }` (same body as product UI). Job provider `mock-pipeline` (product pipeline). Worker executed stages including configured image/TTS providers and FFmpeg.

| Field | Value |
| --- | --- |
| RC_VALIDATION_VIDEO_ID | `56c9c55b-8784-4039-8e19-638d4c804439` |
| Video Job ID | `01a0b297-ba23-7f93-b2e9-13673bba81aa` |
| Worker Job Status | **COMPLETED** |
| Video status | COMPLETED |
| FFmpeg | **PASS** (3 `FFMPEG_COMPOSE` usage events SUCCEEDED) |
| Video Artifact | asset `1570d3f9-95a2-4e75-a6be-762f7a624600` |
| Vertical Output | **YES** 1080×1920 |
| Duration | 41s |

## 5. Video Integrity

| Check | Result |
| --- | --- |
| Video belongs to correct Project | YES |
| Video belongs to correct Script | YES |
| Artifact exists | YES |
| Artifact size | 3,845,371 bytes (`GET /videos/:id/export`) |
| Output playable/readable | YES (`ftyp` MP4, ffprobe exit 0, video+audio streams) |

Video Data Integrity: **PASS**

## 6. Final Acceptance

Official `POST /videos/{id}/final-acceptance` HTTP 200. No DB status patch.

| Field | Value |
| --- | --- |
| Final Acceptance | **ACCEPTED** |
| Accepted Video ID | `56c9c55b-8784-4039-8e19-638d4c804439` |
| Accepted Artifact ID | `1570d3f9-95a2-4e75-a6be-762f7a624600` |
| Final Acceptance Record ID | `01a0b298-f5bc-7552-8988-a9d51f23fe15` |
| variant / current | VERTICAL / true |
| acceptedAt | `2026-09-18T03:39:23.956Z` |

## 7. Download

Official `GET /videos/{id}/export` HTTP 200, `Content-Disposition` attachment, vertical filename. Product has no download-complete callback.

Download: **DOWNLOAD_STARTED**

## 8. Publication Registration

Official product publish path (not Douyin API auto-publish):

1. `POST /videos/{videoId}/publications` `mode=MANUAL` `platform=DOUYIN`
2. `POST /publications/{id}/manual-complete` with **RC user-asserted** URL `https://example.test/rc-09-2e/user-asserted-publication` and post id `RC09E-USER-ASSERTED-001`

This URL is an explicit RC test declaration. It was **not** verified by any Douyin API.

| Field | Value |
| --- | --- |
| RC_VALIDATION_PUBLICATION_ID | `01a0b298-f772-7871-8de5-c3f41b5d9548` |
| Publication Method | **MANUAL** |
| Publication Truth | **USER_ASSERTED** (`verificationStatus=USER_ASSERTED`) |
| Platform Verification | **NOT_VERIFIED** |
| Official Auto Publish | **NO** |
| status | PUBLISHED (user-asserted registration, not platform-verified) |

## 9. Metrics Snapshot 1

Official `POST /publications/{id}/metrics/manual`

| Field | Value |
| --- | --- |
| RC_VALIDATION_METRIC_SNAPSHOT_1_ID | `01a0b298-f7b2-71c0-8fe3-4403ec9fce8e` |
| Views / Likes / Comments / Shares / Favorites / New Followers | 120 / 18 / 4 / 2 / 5 / 1 |
| Timestamp `observedAt` | `2026-09-18T03:39:24.447Z` |

## 10. Metrics Snapshot 2

| Field | Value |
| --- | --- |
| RC_VALIDATION_METRIC_SNAPSHOT_2_ID | `01a0b298-fdb4-7342-b714-e9a5130d7ccb` |
| Views / Likes / Comments / Shares / Favorites / New Followers | 168 / 29 / 7 / 4 / 9 / 3 |
| Timestamp `observedAt` | `2026-09-18T03:39:25.984Z` |

Snapshot 2 Timestamp > Snapshot 1 Timestamp: **YES**

## 11. Metrics Integrity

Snapshot Count: **2**
Publication association: CORRECT (`publicationId` of both snapshots = publication above)
Values match specified RC samples.

Metrics Integrity: **PASS**

## 12. Performance Analysis

Official `POST /monitoring/posts/{publicationId}/analyze` `{ analysisWindow: LATEST_ONLY }`.

Product implementation is **deterministic** (`llmInvoked: false`). Still an official AgentRun; no DB insert of analysis rows outside the API.

| Field | Value |
| --- | --- |
| RC_VALIDATION_PERFORMANCE_ANALYSIS_ID | `01a0b298-fe05-7b13-b25e-5f06ea72108b` |
| Agent Run ID | `01a0b298-fdf3-7a40-8310-5b2201110d1f` |
| Provider | none (deterministic engine) |
| Model | n/a |
| Status | **COMPLETED** (analysis `ACTIVE`, AgentRun `COMPLETED`) |
| Observations / findings | PRESENT (4) |
| Recommendations | PRESENT (6) |

## 13. Recommendation Review

Official `POST /performance-analyses/{id}/recommendations/{recId}/review`

| Decision | Count | IDs |
| --- | --- | --- |
| ACCEPTED | 1 | `rec-views-format` (APPROVE) |
| REJECTED | 1 | `rec-likes-engagement` |
| DEFERRED | 1 | `rec-comments-cta` |
| PENDING | 3 | `rec-shares-shareability`, `rec-favorites-content`, `rec-followers-audience` |

Recommendation total 6 ≥ 3. No extra recommendations fabricated.

## 14. Feedback Handoff

Official `POST /performance-analyses/{id}/feedback-cycle/apply` HTTP 201.

| Field | Value |
| --- | --- |
| RC_VALIDATION_FEEDBACK_CYCLE_ID | `01a0b298-fe11-7e80-9d1c-95719078e91b` |
| Approved / handoff recommendations | 1 ACCEPTED |
| `GET …/accepted-performance-feedback` | count 1, `rec-views-format` only |
| Rejected / Deferred / Pending in handoff | 0 |

Feedback Handoff: **ACCEPTED_ONLY**

## 15. ContentPlan v2

Official `POST /content-plans` with same positioning run, days=7, postsPerDay=1, platform `douyin`, **without** `ignoreAcceptedPerformanceFeedback` (product default includes accepted feedback). Then `POST /content-plans/{v2}/confirm`. Then official `POST /content-plans/{v1}/archive` so v1 is historical.

| Field | Value |
| --- | --- |
| RC_VALIDATION_CONTENT_PLAN_V2_ID | `01a0b299-d07d-77f1-b2f0-db14777451c3` |
| Version | **2** |
| Status | **CONFIRMED** |
| Planning AgentRun | `01a0b298-feec-7db1-bf74-73a21f521724` COMPLETED |
| Source Feedback | **ACCEPTED_ONLY** (`acceptedPerformanceFeedback` length 1; no REJECTED/DEFERRED/PENDING leak in input) |

## 16. Current-cycle Isolation

Latest ContentPlan for project = v2 CONFIRMED.
v1 = ARCHIVED, still listed.
Current-cycle scripts/videos: product still shows the v1-produced Script/Video (quota for v2 topics is not yet filled — expected; v2 is a new plan).
Publish/review data remain bound to the accepted video/publication.

Current-cycle Isolation: **PASS**

## 17. Historical Isolation

v1 plan record still exists (`ARCHIVED`). Script `01a0b283-…` and Video `56c9c55b-…` remain. Old lost freeze UUIDs remain HISTORICAL_AUDIT_ONLY and were not reused as this project’s business IDs.

Historical Isolation: **PASS**

## 18. 9 Route Validation

Project `01a0b275-b904-7492-a5a3-185430e1d585`.

| # | Surface | Path / API | HTTP |
| --- | --- | --- | --- |
| 1 | Dashboard | `/dashboard` | 200 |
| 2 | Projects | `/dashboard/projects` | 200 |
| 3 | Project Overview | `/dashboard/projects/{id}` | 200 |
| 4 | Positioning | `…/positioning` | 200 |
| 5 | Content Planning | `…/content/plans` | 200 |
| 6 | Scripts | `…/content/scripts` | 200 |
| 7 | Video | `…/content/videos` | 200 |
| 8 | Publish / Data | `…/publish` | 200 |
| 9 | AI Review | `…/performance` | 200 |

Authenticated API visibility (JWT, same tenant/workspace): project / content-plans / scripts / videos / publications / performance-analysis all **200**, returning the new RC IDs above. No UI restyle.

Frozen Routes: **9 / 9 PASS**

Note: no browser login session was available in this environment; page load is Next HTML 200 plus API data checks for current-cycle objects.

## 19. Final RC ID Map

New IDs: **CURRENT_RC_VALIDATION_SOURCE_OF_TRUTH**

| Key | Value |
| --- | --- |
| RC_VALIDATION_PROJECT_ID | `01a0b275-b904-7492-a5a3-185430e1d585` |
| RC_VALIDATION_CONTENT_PLAN_V1_ID | `01a0b279-ed8c-7c63-ac34-2ab58e0d5f0c` (ARCHIVED) |
| RC_VALIDATION_TOPIC_ID | `5c24881f-08e2-4a6d-8bbc-d717adc73657` |
| RC_VALIDATION_SCRIPT_ID | `01a0b283-d4c6-74f2-addf-186fb24b0c80` |
| RC_VALIDATION_VIDEO_ID | `56c9c55b-8784-4039-8e19-638d4c804439` |
| RC_VALIDATION_PUBLICATION_ID | `01a0b298-f772-7871-8de5-c3f41b5d9548` |
| RC_VALIDATION_METRIC_SNAPSHOT_1_ID | `01a0b298-f7b2-71c0-8fe3-4403ec9fce8e` |
| RC_VALIDATION_METRIC_SNAPSHOT_2_ID | `01a0b298-fdb4-7342-b714-e9a5130d7ccb` |
| RC_VALIDATION_PERFORMANCE_ANALYSIS_ID | `01a0b298-fe05-7b13-b25e-5f06ea72108b` |
| RC_VALIDATION_FEEDBACK_CYCLE_ID | `01a0b298-fe11-7e80-9d1c-95719078e91b` |
| RC_VALIDATION_CONTENT_PLAN_V2_ID | `01a0b299-d07d-77f1-b2f0-db14777451c3` |

Old lost frozen IDs: **HISTORICAL_AUDIT_ONLY**

## 20. Provider/LLM Accounting

Known before this phase (RC-09.2C + 09.2D): Provider/LLM **4** (3 + 1 retry).

This phase:

| Kind | Count |
| --- | --- |
| Video Provider Calls | **8** (7 `IMAGE_GENERATION` + 1 `VOICE_SYNTHESIS`) |
| FFmpeg local compose | 3 (not LLM; counted as FFmpeg PASS) |
| Performance Analysis Calls | **0** LLM (`llmInvoked: false`) |
| ContentPlan v2 Calls | **1** LLM |

Total Provider Calls Across Rebuild: **13** (4 prior LLM + 8 video media + 1 plan v2)
Total LLM Calls Across Rebuild: **5**
Agent Runs Across Rebuild: **6** (positioning, planning v1, script FAILED, script COMPLETED, performance.analysis, planning v2)

No keys printed.

## 21. Runtime Errors

This phase:

| Check | Result |
| --- | --- |
| Backend Fatal Errors | **0** |
| Worker Job Failures | **0** (VIDEO_GENERATION COMPLETED) |
| DB Errors | **0** |
| Redis Errors | **0** |
| Duplicate Worker | **NO** |

## 22. Git State

HEAD `296e6d8c148eb77df16b5fc18b709262cf197009`
Tracked Modified: **0**
Staged: **0**
Git Mutation: **NO**
Untracked: this report and prior RC audit reports (allowed).

## 23. Gate

All required conditions met:

Backend Health PASS; Worker Count 1; Frontend reachable; Script CONFIRMED; Video COMPLETED; Video Data Integrity PASS; Final Acceptance ACCEPTED; Download DOWNLOAD_STARTED; Publication MANUAL / USER_ASSERTED / NOT_VERIFIED; Metrics 2 + Integrity PASS; Performance Analysis COMPLETED; Review ACCEPTED/REJECTED/DEFERRED ≥1; Handoff ACCEPTED_ONLY; ContentPlan v2 CONFIRMED; isolations PASS; Frozen Routes 9/9; Fatal Errors 0; Tracked/Staged 0.

Gate: **NEW_RC_VALIDATION_BASELINE_ESTABLISHED**

## 24. Recommended Next Step

RC_10_RELEASE_RUNBOOK_AND_RC_LAUNCH_PREP

Do not start it in this phase.

STOP.
