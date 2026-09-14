# V1 Final Architecture — Master Design

**Status:** APPROVED_FOR_PLANNING (design only)  
**Baseline checkpoint:** `v0.1.0-rc.2` @ `2bd090e24dc4e813d7f0ceb4e4282f4a590db1d0`  
**Date:** 2026-09-09  
**Constraint:** No implementation / migration / provider calls in Step 13.1.

---

## 1. Product Definition

**Product:** 一个用户可以真正拿去**长期运营抖音账号**的 AI 内容生产与运营系统。

**Not:** AI 文案工具、纯视频生成器、Agent 展示台、剪映替代品。

**User provides (minimum):** 产品、业务目标、账号基本情况；可选市场参考、自有素材、爆款参考。

**System completes (background):** 市场研究/分析 → 定位 → 策略 → Content Batch → 脚本 → 素材选择与镜头规划 → 视频制作 → 内部质检与自动修复 → 发布 → 数据分析 → 方向修正 → 下一批内容。

**UX law:** 后台复杂，前台简单。用户不是质检员；修改能力仅作兜底/高级控制。

Normal path:

```
AI research → generate → check → auto-repair → best result → user confirm/use
```

---

## 2. Architecture Principles

1. **DB is SoT** for business objects; BullMQ only dispatches jobs.
2. **Agents output structured contracts**; deterministic services own isolation, rights, quota, cost, status, version, retry.
3. **Versioned, append-mostly** facts (plans, scripts, strategies, metrics) — no silent overwrite.
4. **Reuse before regenerate** (assets, voice, subtitle, checkpoints) — cost-safe.
5. **External market ≠ own performance** — separate SoTs.
6. **REFERENCE ≠ PRODUCTION asset** unless explicit rights.
7. **Quality Gate is internal** — not a primary user workflow page.
8. **Learning requires evidence** (`supportCount >= 2` preserved).
9. **Compatible evolution** from rc.2 — no rewrite.
10. **Scope control** — V1 MUST / SHOULD / 1.5 / V2 explicit.

---

## 3. Current System (RC.2 Baseline)

### Stack

- `apps/frontend` Next.js · `apps/backend` NestJS · `database` Prisma · `workers` BullMQ consumer  
- Optional `apps/ai-engine` sidecar (not in root workspaces)

### Existing SoT tables (reuse)

| Table | Role |
|-------|------|
| Project | Tenant/Workspace scoped account container |
| ProductBrief | Versioned product facts (`payload.businessGoal`) |
| MarketResearch / Snapshot / MarketInsight | Market intake → intelligence |
| CampaignStrategy | Strategy versions |
| ContentPlan | Topics in `payload`; `planningDays`/`postsPerDay` |
| Script | `contentPlanId` + `topicId` + `topicSnapshot` |
| Video | Business video row → output Asset |
| Asset + AssetLink | File metadata + roles |
| Job | Media job SoT |
| Publication + PublicationMetricSnapshot | Publish + metrics |
| AgentRun | Agent execution audit |

### Derived / code-only today

- Account Positioning (AgentRun + snapshots on plans/strategies)
- PerformanceFeedback (builder over metric snapshots; `REPEATED_SIGNAL_MIN_SUPPORT = 2`)
- VideoProductionPlan v1 (`production-plan.types.ts`) — scene-based, not full NLE

### Pipeline today

```
visual → voice → subtitle → compose → finalize
```

Reuse helpers already exist: `asset-reuse`, `voice-reuse`, `subtitle-reuse`, `visual-reuse`.

### Frontend project spine

Product → Positioning → Market research/analysis → Strategy → Plans → Scripts → Videos → Publish → Performance

---

## 4. Target End-to-End Loop

```
Business Goal + Product + Account
        ↓
Market Sources (user / platform / autonomous / own metrics as separate input)
        ↓
Autonomous Market Research (adapters)
        ↓
Market Intelligence
        ↓
Account Positioning
        ↓
Campaign Strategy
        ↓
Content Batch (evolved ContentPlan)
        ↓
Script Generation (Content Generation Context)
        ↓
Production Director
        ↓
Reference Intelligence + Account Memory + Asset Library
        ↓
Shot Plan → Material resolve → Voice / DH / B-roll
        ↓
Editing Timeline → Draft Compose
        ↓
Production Quality Gate → Automatic Repair
        ↓
Final Video → Publication
        ↓
Own Account Metrics → Performance Learning
        ↓
Account Memory Update → Strategy Self-correction
        ↓
Next Content Batch
```

### Layer legend

| Symbol | Meaning |
|--------|---------|
| **SoT** | Persisted business truth |
| **Derived** | Computed view (may cache) |
| **Agent** | LLM structured output |
| **Service** | Deterministic domain logic |
| **Infra** | Storage, queue, FFmpeg, providers |

---

## 5. Business Goal Design

### Options compared

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. ProductBrief.payload** (current) | Zero migration; already required in intake | Hard to query/index; multi-goal weak | **V1 primary** |
| **B. Project columns** | Easy filter by goal | Couples goal to project; migration | **V1 SHOULD** add `primaryGoalCode` optional |
| **C. Independent Goal entity** | Multi-goal, history | Migration + new joins | **V1.5+** |

### V1 decision

- Keep `businessGoal` (natural language) + optional `conversionGoal` in ProductBrief.
- Add **canonical `goalCode`** inside ProductBrief payload (enum: `FOLLOW_GROWTH | LEAD_GENERATION | PRIVATE_MESSAGE | STORE_VISIT | SALES | BRAND_AWARENESS | RECRUITMENT | OTHER`).
- Optional later: `Project.primaryGoalCode` for list filters (nullable, backfill lazy).
- Goal influences prompts and evaluation weights — not a separate agent.

---

## 6. Content Batch Design

**Product concept:** “这一批要制作哪些内容”，不是“未来 N 天每天必须发什么”。

### Options

| Option | Verdict |
|--------|---------|
| **A. Reuse ContentPlan + semantic rename** | **V1 REQUIRED** |
| B. New ContentBatch entity | Deferred — breaks `Script.contentPlanId` uniqueness story |

### Compatibility mapping

| Old | New meaning |
|-----|-------------|
| ContentPlan | Content Batch (SoT unchanged) |
| `payload.topics[]` | Batch items (ordered) |
| `planningDays × postsPerDay` | Legacy size hint → migrate to `batchSize` |
| `startDate`/`endDate` | Move toward **Publishing Schedule** |
| Script.contentPlanId / topicId / topicSnapshot | Unchanged |

### Batch size

- Default **`batchSize = 7`**
- Allowed presets: 5 / 7 / 10 (V1); 20+ and fully dynamic = V1.5
- Agent constraint today (`topics.length === planningDays × postsPerDay`) becomes `topics.length === batchSize`

---

## 7. Publishing Schedule Separation

**Frozen:** Planning = **what**; Schedule = **when**.

Example: Batch of 7 can publish 1/day, 3/day, all-at-once, or auto-scheduled.

### Compatibility path

1. V1: keep reading `planningDays`/`postsPerDay` if present; treat as schedule preference defaults.
2. V1 SHOULD: `PublishingSchedule` derived object or JSON on Publication planning (not blocking production).
3. V1.5: first-class schedule rows / calendar; ContentPlan schedule fields deprecated in UI.

---

## 8. Content Generation Context

Script must not depend only on previous script. Unified **Content Generation Context** (compact, not infinite prompt):

| Block | Source |
|-------|--------|
| Goal + Product | ProductBrief |
| Positioning | latest confirmed positioning snapshot |
| Strategy | latest confirmed CampaignStrategy compact |
| Batch + Topic | ContentPlan + topicSnapshot |
| Account Memory | compact core + retrieved patterns |
| Recent scripts | previousScriptSummaries (already in rc.2) |
| Own performance | CompactPerformanceFeedback |
| Reference patterns | optional ReferenceAnalysis summary |

Built by **deterministic assembler**; Agents consume only the compact bundle.

---

## 9–13. Market Sources, Evidence, Intake, Autonomous Research, Own Performance

### Unified source abstraction

`MarketSource` (logical) / future table `market_sources` (V1 SHOULD):

- Types: `USER_TEXT | USER_CSV | USER_LINK_VIDEO | USER_LINK_ACCOUNT | USER_UPLOAD_VIDEO | USER_UPLOAD_IMAGE | KEYWORD | COMPETITOR_NAME | SYSTEM_DISCOVERED | PLATFORM_API | OWN_PUBLICATION_METRICS (read-only join, not stored as market raw)`

### Evidence model

`MarketEvidence` (normalize from source):

- `sourceType`, `origin`, `sourceUrl`, `capturedAt`, `provenance`, `confidence`, `contentType`, `platform`, `referenceOnly`, `rights`, `rawPayload?`, `normalizedPayload?`

**raw evidence ≠ derived MarketInsight.**

### User intake UX (future)

Paste Douyin video/account links, upload video/screenshot, keywords, competitors, tables, free text, “let system research”. CSV is optional, not core.

### Autonomous research

`MarketResearchSourceAdapter` interface — Official API / Licensed Provider / Connector / Public Research / Manual. **Not** hard-bound to one crawler.

Provenance mandatory: where, when, reuse rights, confidence, displayable vs internal-only.

### Own performance boundary

SoT remains `PublicationMetricSnapshot` → `PerformanceFeedback`.  
Strategy may **read** both MarketInsight and PerformanceFeedback.  
**Never** write own play counts into MarketResearch raw items.

---

## 14–16. Account Content Memory, Layers, Write Rules, Confidence, Patterns

### Goal

At video #100, system understands what happened in #1–99 — without stuffing full scripts into prompts.

### Recommended layers

| Layer | Contents | V1 |
|-------|----------|----|
| L1 Account Core | Product, goal, positioning, audience, current direction | MUST |
| L2 Content History | Compact topic/hook/angle/CTA indices | MUST |
| L3 Performance | Winning/losing signals with supportCount | MUST (reuse builder) |
| L4 Production | Modes, asset usage, styles used | SHOULD |
| L5 Pattern | Aggregated patterns | SHOULD→1.5 |
| L6 Recent Working | Current batch + last N summaries | MUST |

### Persistence (V1)

- New table **`AccountMemorySnapshot`** (versioned JSON per project) — **V1 REQUIRED**  
- Avoid per-event tables explosion initially; writers update snapshot transactionally.

### Write rules (only confirmed/final facts)

Write on: Product confirmed, Strategy confirmed, Script confirmed, Video finalized, Publication created, Metrics snapshot ingested, PerformanceFeedback derived.  
**Do not** write every draft.

### Confidence

Patterns require `supportCount`, recency, sample size. Preserve **`supportCount >= 2`** for repeated learning signals.

### Pattern memory dimensions

Hook, Angle, Topic, Pillar, CTA, Video Type, Length, Pacing, Voice, Digital Human, Shot Pattern, Asset Type — **system-owned**, not user-managed.

---

## 17–22. Reference Intelligence vs Assets

### Flow

```
Reference Content → Reference Analysis → Reference Pattern
  + Product/Positioning/Strategy/Memory
  → Original Script → Original Shot Plan → Production
```

Learn structure; **do not copy works**.

### Frozen boundary

| | REFERENCE | PRODUCTION |
|--|-----------|------------|
| Default use | Analyze only | Compose into video |
| Library | `ownerType=REFERENCE`, `referenceOnly=true` | Reusable if rights allow |
| Third-party viral | Never default download-into-final | — |

---

## 23–28. Asset Library

### Extend existing `Asset` (SoT)

Already has tenant/workspace/project, type, status, storage, duration/size, metadata JSON.

### V1 MUST extensions (prefer metadata / additive columns — no big-bang)

- `ownerType`: USER_PRIVATE | PROJECT | SYSTEM | GENERATED | REFERENCE  
- `rightsStatus`, `licenseType`, `consentStatus`, `referenceOnly`, `sourceUrl`, `provider`  
- Usage counters in metadata or `AssetUsage` later: `usedCount`, `lastUsedAt`

### Asset intelligence

| Field | Tier |
|-------|------|
| duration, resolution, mime, size | MUST (mostly exist) |
| transcript, tags, qualityScore | SHOULD |
| embedding, sceneType, objects, usableSegments | V1.5 / V2 |

### Reuse priority (Director may reorder)

Current upload → User library → Project history → Generated reusable → System licensed → AI Image → AI Video → Digital Human

### Avoid infinite repetition

Track usage + performance; soft-penalize overused assets.

---

## 29–34. Production Director, Modes, Shot Plan, Guidance, Fallback

### Role

Agent + deterministic resolver that outputs **ProductionPlan** (evolution of `VideoProductionPlan`).

**Inputs:** Confirmed Script, Topic, Batch, Strategy, Memory, Reference Patterns, Available Assets, Preferences, Quota/Cost context.  
**Outputs:** Mode, shots, sources, voice/DH choices, subtitle/pacing, quality targets, cost estimate.

### Modes

A Real footage · B Digital human + B-roll · C Voice + user assets · D AI-assisted · E Hybrid  

User sets **preferences**, not technical wiring.

### Shot fields (minimal)

`sequence, purpose, duration, narrationSegment, visualRequirement, preferredSource, fallbackSources[], assetId?, generationInstruction?, digitalHuman?, voiceover?, subtitle?, transition?, qualityRequirement`

### Shooting guidance

**Recommendation, not blocker.** User can skip → fallback.

### Material fallback chain

Current Upload → User Asset → Project Historical → Generated Reusable → System Licensed → AI Image → AI Video → Digital Human

---

## 35–38. Digital Human & Voice

### Abstractions providers

- `DigitalHumanProvider`: registerAvatar / generateTalkingVideo / status / cancel / estimateCost  
- `TTSProvider` + optional `VoiceCloneProvider`

### Consent (frozen)

- Avatar/voice only from user or explicitly authorized person.  
- Persist ownership, consent, source asset, provider IDs, status.  
- **Forbidden:** clone faces/voices from third-party reference videos by default.

### V1

- System voices: MUST  
- ≥1 Digital Human provider: MUST (architecture + one adapter)  
- Voice clone: SHOULD  

---

## 39–44. Editing, Quality Gate, Repair, Safety, Self-correction

### Timeline

Production Plan → Minimal Editing Timeline → FFmpeg Compose (keep current infra).

Minimal contract: `clips[]` with start/end/source/crop/scale/audioMode/voiceover/subtitle/overlay/transition/bgm/volume/aspectRatio — **not** Premiere.

### Quality Gate (internal)

```
Draft → Quality Analysis → PASS? → Final
                ↓ NO
         Classify → Local Repair → Re-compose → Re-check
                ↓ budget exceeded
         BEST_AVAILABLE + limitation record → User still gets a video
```

### Dimensions

Deterministic: black frame, duration, subtitle overflow heuristics, technical corruption, CTA presence flags.  
AI/vision-audio: alignment, opening quality, pacing semantics — phased.  
Deferred: advanced perceptual scores.

### Repair

Prefer local (replace shot, reflow subtitle, regen voice, sync tweak, redo opening only). Inherit checkpoints & asset reuse.  
Safety: `maxRepairAttempts`, repair budget, same-error detection, BEST_AVAILABLE fallback.

### Content self-correction

Before show: check memory for repeated hooks/angles/CTAs/shot patterns; background local repair if severe.

---

## 45–47. Performance Learning & Strategy Self-correction & Continuous Learning

Reuse PerformanceFeedback. Strategy changes need minimum evidence, supportCount, confidence, recency, metric quality, goal relevance.  
Trajectory: Batch 1 market-heavy → Batch 5 own-account mix → Batch 20+ memory-heavy.

---

## 48–54. Usage / Cost

**No billing UI mandatory in early V1**, but metering architecture is REQUIRED.

### UsageEvent — V1 REQUIRED

`id, tenantId, workspaceId, projectId, userId?, jobId?, operationType, provider, model, resourceType, inputUnits, outputUnits, durationSeconds, providerCost, currency, chargedCredits?, status, createdAt`

### ProviderPriceCatalog — V1 REQUIRED

`provider, model, operationType, unit, price, currency, effectiveFrom, effectiveTo?`

### CostLedger — V1 REQUIRED

Actual provider cost, estimated, final, failed/refund handling.

### Credits/Quota — V1 SHOULD (schema), UI V1.5

Included / Top-up / Reserved / Consumed / Period.

### Cost-aware Production

Director optimizes quality + relevance + authenticity + rights + **cost**. Asset reuse lowers spend.

---

## 55–57. Jobs / Parent-Child / Recovery

Keep: Postgres Job SoT + BullMQ `acf-jobs`.

### Suggested Production 2.0 stages (adjustable)

`ANALYZE_REFERENCE → ANALYZE_ASSETS → PLAN_PRODUCTION → RESOLVE_ASSETS → GENERATE_VOICE → GENERATE_DIGITAL_HUMAN → GENERATE_AI_VIDEO → BUILD_TIMELINE → COMPOSE → QUALITY_CHECK → REPAIR → FINALIZE`

Parent VIDEO_GENERATION job; child operations as sub-progress in `Job.output` or child Job rows (V1: prefer nested progress JSON; V1.5: child jobs).

### Frozen semantics

- **retry** = continue unfinished + reuse READY assets  
- **regenerate** = user-explicit new version/instance  

Extend to asset analysis, DH, AI video, voice, quality repair.

---

## 58–60. Multi-platform & Drama

Shared core: Market, Memory, Asset, Reference, Content, Production, Usage.  
Platform deltas: Market Adapter, Strategy constraints, Publishing Spec, Publication/Metrics Adapters.  
**Do not** duplicate whole systems. Platform Adaptation Layer for titles/duration/aspect — not 4 full generations in V1.

**Drama/TV editing:** separate domain; shares Asset/Storage/Media/Timeline/FFmpeg/Job/Providers/Cost — **not** Douyin Production Director logic.

---

## 61. Domain Boundaries

```
product → account/positioning → market → strategy → content
                                              ↓
                         memory ← analytics ← publication
                                              ↓
reference → assets → production → media/quality
                ↘ usage/cost ↙
```

Depend inward; avoid cycles (memory writers called from services after confirmed events, not from arbitrary agents).

Suggested Nest domain folders over time: `product`, `account`, `market`, `strategy`, `content`, `memory`, `reference`, `assets`, `production`, `media`, `quality`, `publication`, `analytics`, `usage` — evolve from existing modules without big-bang rename in first steps.

---

## 62–63. Database Proposal & Reuse

### Reuse / extend

| Existing | Action |
|----------|--------|
| ProductBrief | Extend payload goalCode |
| ContentPlan | Semantic Batch + batchSize in payload |
| Script / Video / Job / Publication / Metrics | Reuse |
| Asset / AssetLink | Extend rights/owner metadata |
| AgentRun | Reuse for new agents |
| CampaignStrategy / Market* | Reuse |

### New tables (proposed — no migration now)

| Table | Tier |
|-------|------|
| AccountMemorySnapshot | **V1 REQUIRED** |
| ReferenceContent | **V1 REQUIRED** |
| ReferenceAnalysis | **V1 REQUIRED** |
| UsageEvent | **V1 REQUIRED** |
| ProviderPriceCatalog | **V1 REQUIRED** |
| CostLedger | **V1 REQUIRED** |
| ProductionPlanRecord (optional if not only Job.output) | V1 SHOULD |
| AssetUsage | V1 SHOULD |
| AssetAnalysis | V1 SHOULD |
| VoiceProfile | V1 SHOULD |
| DigitalHumanProfile | V1 SHOULD |
| CreditLedger / Quota | V1 SHOULD |
| PatternMemory | V1.5 |
| PublishingSchedule | V1.5 |
| Independent Goal | V1.5 |

Avoid creating 20 tables on day one.

---

## 64–65. Agent Inventory & Deterministic Split

### Agents (true LLM)

| Agent | Tier |
|-------|------|
| product.intake / market.intake (exist) | keep |
| market.intelligence / campaign.strategy / content.planning / script.generation / account.positioning | keep |
| reference.analysis:v1 | V1 MUST |
| production.director:v1 | V1 MUST |
| production.quality:v1 (semantic slice) | V1 SHOULD |
| asset.analysis:v1 | V1 SHOULD |
| market.research:v1 (autonomous) | V1.5 |
| performance.learning:v1 | V1.5 |
| content.memory.update:v1 | V1 SHOULD (or deterministic merge + small LLM summarize) |

### Never Agents

cost, rights, quota, status, version, tenant isolation, job state machine, price lookup, technical media probes.

---

## 66–67. Observability & Security

Internal lineage for a Final Video: Product→Goal→Positioning→Insight→Strategy→Batch→Topic→Script→References→ProductionPlan→Assets→Provider/Usage→Quality/Repairs→Video→Publication→Metrics→Learning.  
Users never see raw IDs as primary UX.

Security: tenant isolation; asset ownership; reference rights; voice/avatar consent; provider remote retention; deletion cascade (local + provider disable + future-use block).

---

## 68–72. Scope Tiers

### V1 MUST

Business Goal (payload), Content Batch semantics, Basic market source intake (links/uploads/text), Account Memory foundation, Reference intake + pattern, Asset Library extensions + reuse, Production Director + Shot Plan, Material fallback, System Voice, ≥1 Digital Human path, Auto editing (FFmpeg timeline), Internal Quality Gate + repair foundation, UsageEvent + CostLedger + PriceCatalog, Publication/Performance reuse, Continuous learning foundation (feedback→memory), Compatible migration, Final unified UX after capabilities, Full UAT + 30-day dogfooding plan readiness.

### V1 SHOULD

Voice clone, deeper vision analysis, embedding retrieval, AI Video provider, cost estimate UI, credits UI, advanced quality repairs, autonomous research MVP.

### V1.5

Full voice-clone ecosystem, multi DH/AI-video providers, semantic asset search, platform auto-research, auto-scheduling, cost-tier optimization, PatternMemory table, PublishingSchedule SoT.

### V2

Multi-platform complete, Drama editing product, advanced avatar, large-scale SaaS billing, team/enterprise controls.

---

## 73. Final Unified UI/UX Principles (design freeze only)

Do **not** design final screens now. Principles:

- Hide Agents; user sees: Home, Content Plan (Batch), Production Center, Asset Center, Publish Center, Insights, Settings.
- Formal UI overhaul **after** core V1 capabilities (Step 13.13).

---

## 74–75. V1 Acceptance Gate & 30-Day Dogfooding

Acceptance checklist (product): goal+product in → research (semi) → strategy → batch → contextual scripts → reference → assets → director → optional shoot tips → fallback → DH + system voice → edit → internal gate/repair → final video → publish → metrics → background correction → metering → unified UX → full UAT → 30-day Douyin dogfooding.

Dogfooding KPIs: make time, provider cost, human interventions, first-pass rate; repetition/AI-feel/continuity; platform metrics; whether next batch truly learns.

---

## 76. Development Sequence (repo-grounded)

| Step | Goal | Depends | DB | Contract | Provider | Gate |
|------|------|---------|----|----------|----------|------|
| **13.2** | Business Goal codes + Content Batch semantics (`batchSize`), soft-decouple schedule fields in agents/UI copy | rc.2 | optional payload only / nullable columns later | planning+script prompts | 0 | Batch of N topics; scripts still link contentPlanId |
| **13.3** | Asset Library rights/owner/referenceOnly + upload library UX foundation | 13.2 | extend Asset metadata/columns | asset API additive | 0 | Assets listed with ownership; tenant isolation tests |
| **13.4** | Market source + Reference intake (links/uploads) SoT | 13.3 | ReferenceContent (+ evidence) | intake DTOs | 0 | User can attach references without composing into video |
| **13.5** | Account Memory Snapshot foundation + write on confirm/finalize | 13.2 | AccountMemorySnapshot | memory read API internal | 0 | Script context includes memory compact |
| **13.6** | Reference Intelligence agent → patterns | 13.4–13.5 | ReferenceAnalysis | agent contract | LLM | Pattern produced; referenceOnly enforced |
| **13.7** | Production Director agent + Shot Plan persisted | 13.3–13.6 | plan in Job.output or ProductionPlanRecord | director contract | LLM | Plan chooses mode/sources without user wiring |
| **13.8** | System Voice polish + Digital Human provider adapter + consent | 13.7 | Voice/DH profile tables SHOULD | provider ports | TTS+DH | One DH talking-head path works |
| **13.9** | Editing Timeline contract + material fallback resolver | 13.7–13.8 | — | timeline contract | media | Missing shot falls back without hard fail |
| **13.10** | Quality Gate + automatic local repair loop safety | 13.9 | job output repair log | quality codes | optional vision | Infinite loop impossible; BEST_AVAILABLE |
| **13.11** | UsageEvent + PriceCatalog + CostLedger; director cost estimate | any parallel after 13.3 | 3 tables | metering | 0 | Every provider call metered |
| **13.12** | Autonomous research adapters + learning→memory/strategy gates | 13.5–13.6, metrics | adapters | research agent optional | licensed/API | Own metrics never pollute market raw |
| **13.13** | Final Unified UI/UX | MUST features | — | — | 0 | Agent-free primary nav |
| **13.14** | V1 Full Real-user UAT | 13.13 | — | — | controlled | P0/P1=0 |
| **13.15** | 30-Day Douyin Dogfooding | 13.14 | — | — | real | Efficiency/quality/learning report |

Parallelization note: **13.11** can start after Asset/Job stability; **13.5** can overlap **13.3**.

---

## 77. Architecture Risks

### P0

- Scope explosion / boiling the ocean  
- Douyin data access legality & availability  
- Rights/copyright if reference media enters finals  
- Cost runaway without metering  
- Quality repair infinite loops  
- Consent gaps on voice/avatar  

### P1

- Provider lock-in / quality variance (DH, AI video)  
- Memory corruption from writing drafts  
- Bad learning from n=1 metrics  
- Job graph complexity / orphan child work  
- Asset storage growth  

### P2

- UI inconsistency during dual semantics (7-day vs batch)  
- Multi-provider parameter drift  
- Over-tagging assets without retrieval value  

---

## 78–79. Migration & Backward Compatibility

- Keep `ContentPlan` / `Script` / `Video` / `Asset` IDs and FKs.  
- New fields **optional**; readers tolerate missing `batchSize` (derive from topics.length or planningDays×postsPerDay).  
- Old projects open read-only compatible; lazy backfill goalCode/batchSize.  
- No destructive migrations for rc.2 data.  
- Dual-write schedule prefs until PublishingSchedule exists.

---

## 80. Document Control

This file is the Step 13.1 master design. Implementation begins only when a later step is explicitly authorized.  
**Do not modify tag `v0.1.0-rc.2`.**

---

## Appendix A — ASCII System Map

```
[User]
  |  product/goal/prefs/uploads/links
  v
[Intake]--->[ProductBrief]--->[Positioning]
  |                |
  v                v
[MarketSource/Evidence]-->[MarketInsight]-->[CampaignStrategy]
  |                                            |
  |         [AccountMemorySnapshot]<-----------+
  |                ^                           |
  v                |                           v
[Reference*]       |                    [ContentPlan=Batch]
  |                |                           |
  v                |                           v
[Asset Library]<---+--------------------->[Script + Context]
  |                                        |
  v                                        v
[Production Director]-->[Shot Plan]-->[Timeline]-->[Compose]
  |                         |              |
  +-->[Quality/Repair]------+              v
                                    [Video/Asset]
                                          |
                                          v
                                    [Publication]-->[Metrics]-->[Feedback]-->[Memory/Strategy]
                                          |
                                          v
                                    [UsageEvent/CostLedger]
```

## Appendix B — Decision Log (Step 13.1)

1. Business Goal: ProductBrief-first (+ optional goalCode).  
2. Content Batch: ContentPlan alias, not new entity.  
3. Schedule decoupled conceptually; tables later.  
4. Memory: versioned snapshot table, layered compact retrieval.  
5. Asset: extend existing Asset; don’t replace.  
6. Production Director: elevate current production-plan builder.  
7. Quality: internal-only gate.  
8. Cost: meter before fancy billing UI.  
9. Evolve rc.2; no rewrite.

## Appendix C — Step 13.2 Implementation Foundation (DONE)

Implemented without DB migration / without ContentBatch table:

- Deterministic `goalCode` normalize helpers (frontend + backend)
- Optional `ProductBrief.payload.goalCode` on create (legacy briefs still work)
- `ContentBatchView` / sequence labels: batchSize = `topics.length`
- Planning / Script / Overview presentation: “本期内容计划 / 第 N 条 / 本批进度”
- Script compact context adds `itemIndex` + `batchSize`; prompt treats dayIndex as legacy
- Publishing schedule remains **not implemented** (legacy planningDays/postsPerDay kept as preference only)
- content.planning:v1 output contract unchanged

Not implemented in 13.2: multi-goal objects, batch size selector UI, PublishingSchedule entity, ContentPlan v2 agent.

## Appendix D — Step 13.3 Asset Library Foundation (DONE)

**Implemented**

- Extended existing `Asset` (no parallel UserAsset/MediaAsset table)
- Additive fields: `sourceType`, `ownerType`, `referenceOnly`, `reusable`, `rightsStatus`, `consentStatus`, `libraryVisible`, `usedCount`, `lastUsedAt`, provenance columns, `contentHash`, `tags`
- New `AssetUsage` table (idempotent `tenantId+assetId+videoId+usageType`)
- Deterministic `isAssetProductionEligible` + Chinese labels
- Library list/upload/delete APIs; project UI `/dashboard/projects/:projectId/assets`
- Pipeline creates set library defaults (visual/voice/subtitle/final)
- Finalize records `VIDEO_OUTPUT` usage once
- Tenant-scoped queries; soft-hide linked assets instead of breaking historical video

**Deferred**

- Reference Intelligence / vision analysis / embeddings
- Digital Human / Voice Clone providers
- Asset quality AI ranking / auto tags
- Public system library marketplace
- Full consent workflow UI

**Not claimed:** Asset Intelligence / Production Director / Reference Analysis complete.

## Appendix E — Step 13.4 Market Source + Reference Intake (DONE)

**Implemented**

- Deterministic MarketSource classification (role + sourceType + platform), no network
- Draft `sources[]` provenance SoT; `keywords[]` / `competitors[]` remain normalized convenience fields
- Thin `ReferenceContent` table for long-term Reference Intelligence boundary (analysis deferred)
- Douyin URL / account / short-link-unknown / web URL classifier + canonicalization + dedupe
- User intent role override (市场研究资料 / 爆款参考 / 我的历史内容 / 可用制作素材)
- Asset Library reuse for uploads (`assetId` only); PRODUCTION_ASSET never enters MarketResearch
- `referenceOnly` / rights mapping for reference & market screenshots vs production handoff
- Market Intake UI foundation +「让系统自己研究」request flag (no fake research success)
- Confirm stores `intakeSources` + `normalizedMarketContext` in queryContext; MI agent accepts optional normalized context
- Tenant isolation on ReferenceContent + asset association cross-check
- No-data path and CSV/XLSX import remain available

**Deferred**

- Reference Intelligence analysis / patterns
- Autonomous Douyin research / platform API / comment crawl / trend discovery
- Short-link resolve adapter
- Competitor entity table
- Vision deep analysis

**Not claimed:** live Douyin scrape / Reference Analysis / Account Memory complete.

## Appendix F — Step 13.5 Account Content Memory Foundation (DONE)

**Implemented**

- Versioned `AccountMemorySnapshot` (Project scope; ACTIVE / SUPERSEDED)
- Deterministic rebuild from domain SoT (ProductBrief / Strategy / ContentPlan / Script / Publication metrics / PerformanceFeedback)
- Idempotent refresh via `sourceWatermark`; concurrent version allocation with Serializable + retry
- Layers: core / contentHistory / performance / production(placeholder) / patterns / recent / meta
- Pattern threshold: `supportCount >= 2` for winning/losing; support=1 stays candidate
- Bounded recent windows (scripts 20 / batches 5 / publications 20) + compact `AccountMemoryContext`
- `DeterministicMemoryRetriever` foundation (exact/field filters; no embeddings)
- Content overlap helper for title/hook/angle/topicId
- Best-effort refresh triggers after ProductBrief / Strategy / ContentPlan / Script confirm and metrics import
- Script generation optional `accountMemoryContext` (does not remove existing continuity)
- Lazy bootstrap for legacy projects without snapshots
- Failure isolation: memory refresh never fails primary business writes

**Deferred**

- Embedding / vector retrieval
- AI memory summarization agent
- Advanced decay formulas
- Cross-platform / cross-project shared memory
- Production Director–rich production memory
- Reference Pattern ingestion into memory (Step 13.6)

**Not claimed:** semantic memory / learning agent / auto strategy regeneration complete.

## Appendix G — Step 13.6 Reference Intelligence Foundation (DONE)

**Implemented**

- Layered SoT: `ReferenceContent` (source) → `ReferenceAnalysis` (versioned understanding) → `ReferencePattern` (thin reusable patterns)
- `reference.analysis:v1` agent contract (PromptRegistry + validator + one-shot repair + Mock fixture)
- Default analyze path: **deterministic** structure extraction from note/title/metadata (Provider Calls = 0); optional `useAgent=true` for agent path
- URL-only without text/asset description → `INSUFFICIENT` (no fake analysis, no provider call)
- `buildReferenceContext()` with budget (≤3 refs, ≤2/type, ≤10 total); Script optional `referenceContext` only when `referenceIds` explicitly provided
- Originality boundary: forbidden exact-copy fields; quote stripping; imitationRisks; UI disclaimer
- Reference asset remains `referenceOnly` / production ineligible after analysis
- APIs: analyze / latest analysis / patterns
- Minimal Market Research UI panel (status, pattern cards, insufficient state, reanalyze)

**Deferred**

- Vision / ASR / Douyin network fetch
- Embedding retrieval
- Performance-based reference ranking
- Production Director consumption
- Full Reference Center UI

**Not claimed:** multimodal video understanding / auto scrape / reference marketplace complete.

## Appendix H — Step 13.7 Production Director Foundation (DONE)

**Implemented**

- Production Director as planning decision layer over existing `VideoProductionPlan` (Job.input SoT; **0 migration**)
- Modes: REAL_FOOTAGE / DIGITAL_HUMAN_BROLL / VOICEOVER_ASSETS / AI_ASSISTED / HYBRID
- Shot plan from Script segmentation + duration/sequence validators
- Capability registry (DH / AI Video / Voice Clone currently unavailable)
- Asset candidate query (≤30) + `isAssetProductionEligible` + referenceOnly hard exclude
- Deterministic ranking + repetition penalty + fallback sources
- Deterministic Fallback Director (legacy pipeline always buildable via `buildProductionPlan`)
- Memory / ReferencePattern / Goal context integration (bounded)
- APIs: `GET/POST /videos/:id/production-plan`; create/retry attach `directorPlan` additively
- Minimal Video detail UI (mode, duration, shots, guidance optional, fallback copy) on formal `/dashboard/projects/:id/content/videos` via `VideoDetail` + `ProductionPlanPanel` (legacy `/dashboard/videos/:id` remains blocked in production)
- Media providers not invoked in this step (Wanx/MiniMax/DH/AI Video/FFmpeg compose = 0 for director acceptance)

**Deferred**

- Live `production.director:v1` LLM agent (types/validators ready; V1 uses deterministic director)
- Digital Human / Voice Clone / AI Video execution
- Timeline / original-audio ducking execution
- Visual stage skip-Wanx when `selectedAssetId` (planning only here)
- Quality Gate / Cost optimization

**Not claimed:** Director media execution / editing timeline / quality gate complete.

## Appendix I — Step 13.8 Voice System + Digital Human Foundation (DONE)

**Implemented**

- VoiceProfile thin table (workspace scoped, optional projectId) + System Voice registry (virtual, no seed)
- Deterministic `resolveVoiceConfig()` + MiniMax/OpenAI/mock TTS compatibility
- Voice identity (`resolvedVoiceId`) in voice reuse / generation fingerprint
- Consent/rights hard gates; reference sample cannot clone
- VoiceCloneProvider + DigitalHumanProvider abstractions, disabled production providers, test-only mock DI
- DigitalHumanProfile thin table; register/generate not executed without provider
- Dynamic ProductionCapabilityRegistry: DIGITAL_HUMAN / VOICE_CLONE false unless a real provider is configured
- `GET /media-capabilities`, voice/DH profile APIs, Settings foundation UI
- Director: DH mode still falls back when capability/profile ineligible; invalid voice → default

**Deferred**

- Real Voice Clone / Digital Human provider activation
- Avatar generation worker execution / talking-head generation
- Provider webhook / cost metering
- Advanced voice catalog and remote delete live tests

**Not claimed:** Digital Human Real Execution / Voice Clone Real Execution.

## Appendix J — Step 13.9 Editing Timeline + Material Resolution / Fallback Execution (DONE)

**Implemented**

- MaterialResolver with real existing-asset reuse
- Reference / revoked / deleted hard block at execution resolve
- Mixed IMAGE + VIDEO EditingTimelineV1 (Job.output JSON, 0 migration)
- Fallback execution foundation to AI_IMAGE (mock/color-background; no Wanx in acceptance)
- FFmpeg timeline bridge: image loop + video trim/freeze
- Checkpoint/retry reuse of material + timeline hashes
- AssetUsage writes (`SHOT_VISUAL:{n}`, `VOICE_AUDIO`, `VIDEO_OUTPUT`) idempotent
- `GET /videos/:id/timeline` public summary (no storageKey)

**Deferred**

- AI Video execution
- Digital Human execution
- Advanced trimming / semantic matching
- Timeline editor
- Vision semantic video QA / advanced aesthetics (see Appendix K)

## Appendix K — Step 13.10 Production Quality Gate + Automatic Repair (DONE)

**Implemented**

- deterministic Quality Gate (before Finalize)
- technical media checks (ffprobe when available; mock compose uses declared metadata)
- timeline checks
- subtitle checks + overflow estimate / reflow
- rights/reference recheck
- issue classification
- repair planner
- bounded repair loop (`MAX_QUALITY_REPAIR_ATTEMPTS = 2`)
- local repair (timeline / subtitle / shot replace) before regenerate
- recompose/recheck
- BEST_AVAILABLE
- finalization gate (BLOCKED cannot finalize)
- quality observability (`Job.output.qualityGate`)
- `GET /videos/:id/quality` public summary
- `production.quality:v1` contract/mock only (not vision, not gate authority)
- mixed IMAGE+VIDEO+VOICE+SUBTITLE local FFmpeg live acceptance

**Deferred**

- Vision semantic video QA
- ASR-based alignment
- advanced black-frame detection
- AI semantic quality ranking
- advanced visual aesthetics scoring
- cost-aware repair budgeting integration (CostLedger)
- cleanup worker for repair drafts

## Appendix L — Step 13.11 Usage / Cost Metering Foundation (DONE)

**Implemented**

- UsageEvent (PENDING → SUCCEEDED/FAILED/CANCELLED)
- ProviderPriceCatalog (`effectiveFrom`/`effectiveTo`, `unitScale`, Decimal money)
- CostLedger (1:1 with UsageEvent; `priceCatalogId` snapshot; statuses ESTIMATED/FINAL/UNPRICED/WAIVED/REFUNDED/FAILED)
- UsageMeteringService (`startUsage` / `completeUsage` / `failUsage` / `recordUsage` / summaries / `reconcileUsage` skeleton)
- `withUsageMetering()` wrapper (metering failures do not fail provider/business success)
- LLM metering on ModelRouter (AgentRun token fields retained; schema repair = second UsageEvent)
- TTS / AI Image / local FFmpeg metering on generate/synthesize/compose paths only
- retry/reuse-safe counting (READY asset reuse does not emit provider UsageEvent)
- quality repair attribution via metering scope (`stage=REPAIR`, `repairAttempt`); local subtitle/timeline repair does not emit AI/TTS usage
- cost aggregation: project / video / job; mixed currency = `totalsByCurrency` (no FX)
- unpriced handling: missing catalog → UNPRICED (not 0)
- future Credits (`CreditAmount` / `UsageCharge` types only) and Quota (`canExecuteUsageEstimate()` always ALLOW)

**Deferred**

- real billing / checkout / Stripe / 支付宝
- credits wallet / conversion / subscription / invoices
- quota enforcement
- FX conversion
- storage periodic billing / bandwidth billing
- provider invoice reconciliation
- customer-facing pricing UI
- Digital Human / Voice Clone / AI Video real provider usage (enums only; capability false → 0 events)

**Boundaries**

- Usage ≠ Cost ≠ Credits
- Quality Gate millisecond checks: observability only, not per-check UsageEvent
- Storage/Bandwidth: resourceType reserved; no per-asset CostLedger in V1
- FFmpeg `LOCAL_COMPUTE`: external provider cost WAIVED/0; this is not “system cost = 0”
- Mock providers: recorded when a metering scope exists; CostLedger WAIVED / 0 (not commercial stats)
- Price catalog: empty by default; tests use fixtures (no internet price scrape)

## Appendix M — Step 13.12 Autonomous Research + Continuous Learning Foundation (DONE)

**Implemented**

- ResearchRequest
- research adapter abstraction (`MarketResearchSourceAdapter`)
- disabled capability truth (`NOT_CONFIGURED`, productionAvailable=false)
- research evidence/provenance (`research_evidences` thin table; distinct from MI `MarketEvidence` DTO)
- dedupe/idempotency (contentHash + queryHash)
- normalized MI integration (`systemEvidenceSummaries` / freshness / coverage; user vs system kept separate)
- learning signal aggregation from PerformanceFeedback (`buildLearningSignalsFromPerformanceFeedback`)
- support threshold (`>= 2` confirmed; n=1 candidate)
- memory learning bridge (confirmed → patterns, candidate → candidateSignals)
- strategy recommendation foundation (`strategy_adjustment_recommendations`; never mutates CampaignStrategy)
- next batch learning context (`buildNextBatchLearningContext`)
- research/learning observability

**Deferred**

- real Douyin research adapter
- official/third-party platform provider
- automated trend discovery
- comment mining
- real multimodal market analysis
- advanced causal learning
- statistical significance
- embedding
- automatic strategy replacement
- multi-platform research
- research scheduling

## Appendix N — Step 13.13 Final Unified UI/UX (DONE)

**Final IA**

- Global: 首页 / 项目 / 设置
- Project main nav (7): 首页、内容计划、制作中心、素材中心、发布运营、数据优化、设置
- 项目资料（业务/定位/市场/策略/脚本）为次级入口，不进正式主导航

**User journey**

业务资料 → 策略 → 内容计划 → 脚本 → 制作 → 发布 → 数据优化

**Terminology**

项目 / 内容计划 / 内容 / 脚本 / 成片 / 素材 / 发布 / 数据表现 / 系统学习 / 参考内容

**Capability truth**

自动市场研究、数字人、声音克隆、AI 视频：未配置。不假装可用。

**Legacy routes**

Production: redirect 到 /dashboard 或 /dashboard/projects，不 404。Development 可保留 debug 页，正式导航隐藏。

**Responsive**

Desktop sidebar；Mobile 底部 4 项（首页/内容/制作/数据）+ 菜单。

**UAT**

2026-09-10 Playwright Chromium（`http://localhost:3010` + Nest `3001`）：
desktop 1440×900 PASS；mobile 390×844 PASS；tablet 768 快速 PASS。
consoleFatal=0，brokenCtas=0，用户可见 raw enum=0。
新用户注册 → 创建项目 → 首页 F5 恢复会话 → 内容/制作/素材/发布/数据/设置。
`/dashboard/videos` production 重定向到 `/dashboard/projects`（不 404）。
工件：`.local/step-13.13-acceptance/`（不入库）。

## Appendix O — Step 13.14 V1 Final End-to-End UAT (2026-09-10)

**Environment**

- Frontend 3010 PASS；Backend 3001 PASS；PostgreSQL 55432 PASS；FFmpeg/ffprobe 9.0.1 PASS。
- Redis 6379 FAIL（无 Memurai/docker）。
- Prisma：18 migrations applied（含 usage metering、autonomous research）。
- Preflight overall: FAIL（Redis）。

**Journey**

- New-user Playwright：注册 → 项目 A → F5 → 内容/制作/素材/发布/数据/设置 → 项目 B。desktop/mobile/tablet PASS。consoleFatal=0。
- Live Script→Video→Publication→Learning→Batch2：**未跑完**（缺 Redis worker；隔离 e2e Prisma 启动失败）。

**Provider mode**

- 本步未发起真实 Router One / Wanx / MiniMax / Research / DH / Clone / AI Video 调用（成本护栏）。
- Digital Human / Voice Clone / AI Video / Autonomous Research：NOT CONFIGURED。

**Final video / quality / publication / learning**

- Product-pipeline Final mp4：未生成。
- Manual publication / metrics / n=1 / support>=2：依赖未完成的成片链。
- Learning 文案已修：n=1 →「出现初步迹象，系统会继续观察。」；confirmed →「已有多次数据支持」。

**Manual work / time-to-video / usage**

- 未测 Time-to-Video（无成片）。
- Usage：本步无新 UsageEvent。

**Defects / blockers / dogfood**

- P0=0。
- P1：Redis 不可用；e2e Prisma URL；闭环未在 live 完成。
- Dogfood Readiness: **NOT READY**。
- 工件：`.local/step-13.14-acceptance/`（不入库）。








