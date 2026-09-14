# Visual Semantic Layer Design (B2)

Status: DESIGN ONLY. Versions: `visual.semantic:v1`, `visual.context:v1`, `visual.hybrid:v1`, `semantic.frame-selection:v1`.

B1 Deterministic Visual Analyzer is PASS / FROZEN. This document freezes Layers B / C / D contracts. It does not implement a Vision provider, OCR, Router One, Production Worker, Prisma migration, V1 repair, or V2 generation.

## Four-layer model

| Layer | Name | Status |
| --- | --- | --- |
| A | Deterministic Asset Facts | IMPLEMENTED (B1) |
| B | Visual Semantic Observations | DESIGNED |
| C | Project Context Evaluation | DESIGNED |
| D | Profile / Platform Suitability | DESIGNED |

Hybrid merge produces `VisualAnalysisResult`. Facts, semantics, context judgment, and recommendations stay stratified.

## Analyzer role boundary

Visual Semantic Analyzer is not Director.

May say: looks like browser toolbar; contains product UI; possible localhost; possible stale copy; brand watermark; high-density UI; likely key control region.

Must not decide: final crop; must-cut; shot timing; must-use this asset.

Those belong to Director / Validator.

## Observation vs evaluation vs decision

- Observation: what was seen (Layer B).
- Evaluation: what it means in this project (Layer C / D).
- Decision: how to edit (Director).

Do not mix.

## Contracts (TypeScript)

See `apps/backend/src/production-v2/visual-semantic/contracts/`.

- `VisualSemanticObservation`: observationId, type, region?, startMs?, endMs?, confidence, source, evidence, uncertainty.
- `SemanticRegion`: regionId, type, rect (`NormalizedRect`), confidence, temporalRange?, attributes, source.
- `mustKeepCandidate` is a candidate, not `mustKeep=true`.
- `UIFocusCandidate` vs `SubjectCandidate` are distinct. Product recording prefers UI Focus; talking-head prefers Subject. Do not assume faces exist.
- Chrome families are separate: `BROWSER_CHROME`, `OS_CHROME`, `APP_WINDOW_CHROME`. Product navigation must not be treated as browser chrome from a top strip alone. Vision + deterministic jointly.
- Developer artifacts need OCR/Vision confirmation (localhost, 127.0.0.1, debug overlays, editor chrome, terminal, mock/placeholder labels).
- Authenticity types are split: STALE, MOCK, DEMO, PLACEHOLDER, UNRELATED. Analyzer truth labels: LIKELY_REAL, LIKELY_MOCK, UNCERTAIN. Never REAL/FAKE.
- STALE is not a pure visual problem; needs vision + current project context.
- MOCK requires evidence; “looks like a demo” is insufficient.
- Watermark / Privacy observations as designed. High-risk privacy may hard-block in a later step.
- OCR is an evidence source, not sole truth. Persist only necessary, sanitized, risk-relevant, project-relevant fragments.
- Evidence value is project-context aware (product UI can be HIGH for “what the system is” and LOW for “7-day growth”).
- Claims: SUPPORTED / PARTIALLY_SUPPORTED / NOT_SUPPORTED / UNKNOWN. Content #1: a UI label such as 一键发布 must not auto-assert verified auto-publish.
- Usage assessment: PREFERRED / USABLE / LIMITED / AVOID / DO_NOT_USE / UNKNOWN. Not a final shot decision.
- Semantic crop: B1 geometry candidates + B2 regions → scored semantic candidates. Vision must not emit final crop coordinates. CENTER/CONTAIN remain B1.
- Conflicts: `VisualAnalysisConflict` with no silent override either direction.
- Precedence: Safety/Privacy/Rights > Truth > Project Relevance > Evidence > MustKeep > Readability > Geometry > Creative Preference.
- Confidence 0–1. Guideline HIGH ≥0.85, MEDIUM 0.60–0.85, LOW <0.60. Not hardcoded implementation.
- Low confidence: warn / confirm / fallback deterministic. Must not drive destructive crop, privacy delete, asset rejection, or truth judgment.
- Status: B1 READY + semantic unavailable → PARTIAL. B1 + semantic + context READY → READY. Offline/Vision failure keeps B1 facts, PARTIAL + SEMANTIC_ANALYSIS_UNAVAILABLE.
- Human override scopes ASSET / PROJECT / SHOT. Cannot override rights, privacy hard block, or truth safety.
- Audio intelligence is out of scope. Frame roles: ANALYSIS_FRAME_SAMPLE vs SEMANTIC_FRAME_EXTRACT vs EDITING_FRAME_EXTRACT vs FRAME_INTERPOLATION.
- Persistence tables are future-only. Migration = NO.
- Provider interface `VisualSemanticProvider` is family-independent. Implementation = NO. Vision calls = 0.

## Content #1 design expectations (not measured facts)

New recording: possible PRODUCT_UI, BROWSER_CHROME, NAVIGATION, TEXT_REGION, UI_FOCUS.

Old recording: possible PRODUCT_UI, stale copy, localhost/dev artifact, stale candidate. Even if B1 geometry is good, Layer C LOW relevance + HIGH stale → usage may be DO_NOT_USE.

## Next step (not this step)

Step 13.15B-1E-B2-1 — Visual Semantic Provider + Structured Vision Contract Implementation.
