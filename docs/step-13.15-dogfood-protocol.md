# Step 13.15 — 30-Day Real Douyin Dogfooding Acceptance Protocol

Status: **13.15A design freeze**. This document does **not** authorize Day 1 operations, real provider calls, Douyin OAuth, or live publishing.

## 1. Objective

Verify whether a real creator can operate **one** real Douyin account with current V1 for ~30 days through:

Research → Strategy → Plan → Script → Production → Human Review → **Manual** Publish → Metrics → Learning → next batch

while remaining **stable, explainable, cost-truthful, and human-load acceptable**.

This is product-level endurance acceptance, not a single-API test.

## 2. Account scope

- 1 real Douyin account
- 1 primary Project
- 1 real business / content domain
- No multi-account concurrency stress

Keep the niche fixed so learning data is not scrambled.

## 3. Publishing boundary (truth)

| Capability | Status |
| --- | --- |
| Manual publication record + metrics import | **VALIDATED** (Step 13.14) |
| Douyin OAuth | **NOT VALIDATED** |
| Douyin API auto-publish | **NOT VALIDATED** |

30-day early phase: generate → human review → **human posts on Douyin** → system records `Publication` (`mode=MANUAL`) → import real metrics.

**Forbidden:** calling manual publish “自动发布”. Product UI must not claim auto-publish is generally available.

## 4. Human approval

Every item: Human Review → Approved → then publish.

No unattended auto-publish. Minimum checks: factual/brand/CTA/subtitle/picture/audio/platform-risk.

## 5. Provider rollout

**Phase 1 (first 3 contents)**  
Allow: Router One REAL (necessary calls only), MiniMax REAL TTS (≤1 per piece unless repair), Wanx REAL only when assets are insufficient, FFmpeg local.  
Forbid: AI Video, Digital Human, Voice Clone, Autonomous Research.

**Phase 2 (contents 4–10)**  
Increase real AI image only if Phase 1 quality/cost is acceptable.

**Phase 3 (rest)**  
Expand only after stability.

All real calls remain under usage events, cost ledger, and human review.

## 6. Real provider preflight (code only; no live call in 13.15A)

Selectors already exist:

- `MODEL_PROVIDER=real` (requires `MODEL_API_KEY`, `MODEL_NAME`, `MODEL_BASE_URL`)
- `MEDIA_TTS_PROVIDER=minimax-tts` (`MINIMAX_TTS_*`)
- `MEDIA_IMAGE_PROVIDER=wanx` (`WANX_*`)
- `MEDIA_COMPOSE_PROVIDER=ffmpeg`

Boot validation refuses missing keys when those providers are selected. Keys are Bearer headers, not logged as job public fields (`jobs.mapper` redacts tokens). Failed compose/quality does not emit a fake PASS final (`QUALITY_GATE_BLOCKED` does not finalize). Mock TTS is not MiniMax.

**13.15A verdict:** code path **READY**. Live credentials are **not** verified in this step (`.env` untouched).

## 7. Volume (default, operator-adjustable)

| Week | Target published |
| --- | --- |
| 1 | 3 |
| 2 | 4 |
| 3 | 4 |
| 4 | 4 |
| **Total** | **~15** |

Do not force one piece per day. Continuity + feedback matter more.

## 8. Batch strategy

Plan **2–4** items per batch. Batch N → publish → metrics windows → learning → Batch N+1. Do not plan all 30 days in one shot.

## 9. Daily record fields

See `.local/dogfood/30-day/templates/daily-report.json` (`schemaVersion: 13.15A.v1`): date, projectId, content ids, production times, human work, quality scores, provider counts, cost truth, publication, metrics (available only), learning counts, notes.

## 10–11. Time-to-content & manual work

Record: strategy/topic → script confirm → final video → publish-ready.

KPIs: script generation time, script edit time, production time, review time, total time-to-publish.

Per item also: script edits, production intervention, asset replace, subtitle edit, voice adjust, regeneration, publish manual actions.

Classify interventions: **A** necessary review, **B** missing product capability, **C** bug, **D** creative preference. Do not treat all as system failure.

## 12–13. Quality & first-pass

1–5 scores: topic, hook, script, brand/domain, visual, voice, subtitle, CTA, overall.

**Publishable = YES** only if overall ≥ 4 and no severe issue.

First-pass = first production needs no regenerate to publish (YES/NO). Week 1: no hard bar. 30-day **reference** target ≥ 70%. Not a hardcoded business rule.

## 14. Production reliability

Jobs created / completed / failed / retried / stuck / recovered. End-state: **stuck RUNNING = 0**, **critical lost final = 0**.

## 15–17. Learning

After each batch: candidate/confirmed signals, supportCount, recommendations. Must trace to Publication + Metric Snapshot + Performance Feedback.

Effectiveness: recommendation accepted YES/NO; if YES, was next batch actually adopted; later outcome **improved / neutral / worse / insufficient data**. No causal claims.

Usefulness scores 1–5 (clarity, relevance, actionability). 30-day average **reference** ≥ 3.5/5.

## 18. Account memory

Weekly: no unbounded growth, no obvious duplicates, no stale wrong conclusions, confirmed vs candidate boundary. Label: useful / stale / incorrect.

## 19–20. Metrics schedule & idempotency

Preferred: T+2h (optional), T+24h, T+72h, T+7d. Minimum: T+24h and T+72h. Avoid snapshot spam.

Same publication + observedAt + metrics fingerprint must not add extra snapshots or inflate supportCount. Audit during the 30 days.

## 21–24. Usage, cost, provider failure

Per content: LLM tokens, TTS chars/duration, AI images, AI video seconds (**expect 0**), local FFmpeg, failed calls. Split provider vs local compute.

Cost: known priced vs **UNPRICED**; unknown price must **not** be stored as 0. Multi-currency reported separately; no fake FX.

Targets: collect cost per script / final / published / publishable; **no price cap this step**.

Failures: timeout, schema, HTTP, invalid media, rejection, retry-success → Provider Success Rate.

## 25–27. Real TTS / image / reuse

After MiniMax is actually enabled: weekly listen (audible, pronunciation, tone, pace, subtitle sync). AAC stream alone is insufficient.

Wanx: record whyGenerated, generatedCount, usedInFinal, discarded → waste rate.

Reuse: existing assets vs generated; goal is avoiding pointless regen, not maximizing reuse.

## 28–29. Quality gate & human override

Count PASS / BEST_AVAILABLE / BLOCKED / repairs. BLOCKED must not finalize.

Record human rejects of AI recs / script / assets / video. **No reverse training** this phase.

## 30–31. Platform & comment AI

User confirms every publish. System must not: fake engagement, mass auto-comment, auto-DM, or evasion of platform risk controls.

V1 has **no validated auto comment-reply**. 30-day: suggestions only, human sends replies. No unattended bulk replies.

## 32–33. Severity & stop

**P0:** leak, cross-tenant, severe corruption, wrong auto-publish, secret leak, unrecoverable data loss.  
**P1:** production chain down, persistent stuck jobs, severe final, lasting real-provider failure, learning/metrics mis-attribution.  
**P2:** UX, copy, mild perf, non-blocking visual, extra manual steps.

**Stop immediately** on any P0, **or** 3 consecutive unpublishable finals, severe data pollution, wrong publication ownership, cross-project mix, severe duplicate billing, irrecoverable stuck jobs.

## 34–38. Weekly gates

Week N report fields: see weekly template.

- **Week 1:** real provider stable enough to produce; human publish; metrics import; learning chain not broken; no P0. (Not vanity engagement.)
- **Week 2:** production stability, human minutes, cost, asset reuse, quality gate.
- **Week 3:** learning usefulness, recommendations, memory, batch improvement.
- **Week 4:** overall stability, UX, commercial usability, long-run cost.

## 39–41. Final metrics & commercial gate

See `final-report.json`. Nine dimensions: Reliability, Content Quality, Efficiency, Automation Value, Learning Value, Cost Predictability, UX, Security/Isolation, Operational Safety — each READY / NEEDS_WORK / BLOCKED.

**V1 Commercial Readiness = READY** only if P0=0, no unresolved core P1, acceptable production success, acceptable human cost, real content publishable, learning has usable value, cost explainable, long-run stable. Else **LIMITED PILOT** or **NOT READY**.

## 42–43. Evidence & secrets

Root: `.local/dogfood/30-day/` (`day-NN/`, `week-0N/`, `final/`). Structured JSON + short markdown summaries. **Do not git-commit real ops evidence** (`.local/` is gitignored).

Never store: access/refresh tokens, API keys, cookies, DB passwords, OAuth secrets, full Authorization headers.

## 44–45. Telemetry policy

Audit: `docs/step-13.15-telemetry-audit.json` and `node scripts/step-13.15-dogfood-report.mjs --audit`.

MISSING KPIs go to dogfood artifacts first. No schema expansion in 13.15A. Propose future product fields only if they are long-term SoT.

## 46–47. Runner & dashboard

`scripts/step-13.15-dogfood-report.mjs` — read-only summary / templates. Must not mutate business data, auto-publish, or synthesize metrics.

No new product dashboard this phase. CLI/JSON/Markdown is enough.

## 48. Day 1 checklist (operator; not executed in 13.15A)

- [ ] Runtime PASS
- [ ] DB backup/restore strategy known (`scripts/rc-pg-backup.mjs` exists; operator still confirms)
- [ ] Provider selector ready (code)
- [ ] Real provider credentials **present** (not verified here)
- [ ] Usage metering ready
- [ ] Cost catalog status known (priced vs UNPRICED)
- [ ] Real project created
- [ ] Real product intake complete
- [ ] Real market intake complete
- [ ] Human approval flow ready
- [ ] Manual publication flow ready
- [ ] Metrics import flow ready
- [ ] Evidence directory ready
- [ ] Day 1 provider guard understood (below)

**Day 1 Ready for 13.15A = NO** (protocol complete; live dogfood not started).

## 49–51. Day 1 / first content / first-3 gates

First real piece: Router One necessary only; MiniMax TTS ≤ 1; Wanx only if needed; local FFmpeg. No DH / clone / AI video / autonomous research.

First real content must: script review PASS, final human review PASS, usage recorded, cost truth recorded, **manual** publish successful, publication row correct — else no batch scale-up.

After first 3: **First-3 Real Content Report** → continue / continue with fixes / pause. Major P1: fix before continuing the 30 days.

## 52. Publish truth reminder

Manual Publish Flow = VALIDATED. OAuth / API publish = NOT VALIDATED.

## 53. 13.15A PASS criteria

Protocol, KPIs, severities, stop rules, daily/weekly/final reports, evidence layout, telemetry audit, Day 1 checklist, provider safety, publish truth — all defined. This document + runner + templates satisfy that.
