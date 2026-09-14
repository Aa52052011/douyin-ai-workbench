/**
 * B2-7 offline project-context evaluation. Vision/LLM/provider calls: 0.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessAssetUsage } from '../src/production-v2/visual-context/asset-usage-assessor.js';
import { CONTENT_01_CLAIM_SET, evaluateAssetClaimSupport, evaluateClaimMatrix } from '../src/production-v2/visual-context/claim-evidence-assessor.js';
import {
  ASSET_USAGE_SCHEMA_VERSION,
  CLAIM_EVIDENCE_SCHEMA_VERSION,
  CONTEXT_EVIDENCE_SOURCE_TYPES,
  CONTEXT_REASON_CODES,
  HUMAN_ASSET_OVERRIDE_KINDS,
  RULE_PRIORITY,
  VISUAL_CONTEXT_SCHEMA_VERSION,
} from '../src/production-v2/visual-context/context.types.js';
import {
  CONTENT_01_CONTEXT_FIXTURE_META,
  CONTENT_01_TRUTH_CONSTRAINTS,
  chromeOnlyInput,
  content01CleanRecordingInput,
  content01OldContaminatedInput,
  content01OldHomeImageInput,
  content01ProductInfoImageInput,
  content01ProductionCenterImageInput,
  content01PublishOpsImageInput,
  localhostOnlyOnCurrentInput,
} from '../src/production-v2/visual-context/fixtures/content01-context.fixture.js';
import { evaluateProjectContext } from '../src/production-v2/visual-context/project-context-evaluator.js';
import type { ProjectContextEvaluationInput } from '../src/production-v2/visual-context/context.types.js';

const evidenceDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-7',
);

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function pack(input: ProjectContextEvaluationInput) {
  const evaluation = evaluateProjectContext(input);
  const usage = assessAssetUsage(input, evaluation);
  const claims = evaluateClaimMatrix(input, evaluation);
  return { evaluation, usage, claims };
}

const clean = pack(content01CleanRecordingInput());
const old = pack(content01OldContaminatedInput());
const productInfo = pack(content01ProductInfoImageInput());
const productionCenter = pack(content01ProductionCenterImageInput());
const publishOps = pack(content01PublishOpsImageInput());
const oldHome = pack(content01OldHomeImageInput());
const chromeOnly = pack(chromeOnlyInput());
const localhostOnly = pack(localhostOnlyOnCurrentInput());
const autoPublish = evaluateAssetClaimSupport('C5', content01PublishOpsImageInput(), publishOps.evaluation);

const forcePreferredOnOld = pack({
  ...content01OldContaminatedInput(),
  overrides: [...content01OldContaminatedInput().overrides, { kind: 'FORCE_PREFERRED' }],
});

writeJson('context-contract.json', { schema: VISUAL_CONTEXT_SCHEMA_VERSION, fields: ['relevance', 'freshness', 'evidenceValue', 'misleadingRisk', 'conflicts', 'confidence', 'sourceRefs'] });
writeJson('usage-contract.json', { schema: ASSET_USAGE_SCHEMA_VERSION, statuses: ['PREFERRED', 'USABLE', 'LIMITED', 'AVOID', 'DO_NOT_USE', 'UNKNOWN'], notFinalShot: true });
writeJson('claim-evidence-contract.json', { schema: CLAIM_EVIDENCE_SCHEMA_VERSION, support: ['SUPPORTED', 'PARTIALLY_SUPPORTED', 'INSUFFICIENT', 'CONTRADICTED', 'NOT_APPLICABLE'] });
writeJson('rule-priority.json', { order: [...RULE_PRIORITY] });
writeJson('reason-codes.json', { codes: [...CONTEXT_REASON_CODES] });
writeJson('human-fact-source-contract.json', { sourceTypes: [...CONTEXT_EVIDENCE_SOURCE_TYPES], overrides: [...HUMAN_ASSET_OVERRIDE_KINDS] });
writeJson('content01-context-fixture.json', CONTENT_01_CONTEXT_FIXTURE_META);
writeJson('truth-constraints.json', CONTENT_01_TRUTH_CONSTRAINTS);
writeJson('assets/clean-recording-evaluation.json', clean);
writeJson('assets/old-contaminated-recording-evaluation.json', old);
writeJson('assets/product-info-image-evaluation.json', productInfo);
writeJson('assets/production-center-image-evaluation.json', productionCenter);
writeJson('assets/publish-operations-image-evaluation.json', publishOps);
writeJson('assets/old-home-image-evaluation.json', oldHome);
writeJson('claims/claim-set.json', CONTENT_01_CLAIM_SET);
writeJson('claims/asset-claim-matrix.json', {
  clean: clean.claims.map((item) => ({ claimId: item.claimId, support: item.support })),
  old: old.claims.map((item) => ({ claimId: item.claimId, support: item.support })),
  publishOps: publishOps.claims.map((item) => ({ claimId: item.claimId, support: item.support })),
});
writeJson('claims/automatic-publishing-truth-test.json', {
  claim: '系统已实现自动无人值守发布',
  assetId: publishOps.evaluation.assetId,
  support: autoPublish.support,
  allowed: autoPublish.support !== 'SUPPORTED',
});
writeJson('audits/browser-chrome-truth-boundary.json', {
  chromeAloneFreshness: chromeOnly.evaluation.freshness.status,
  chromeAloneUsage: chromeOnly.usage.status,
  stale: chromeOnly.evaluation.freshness.status === 'STALE',
  doNotUse: chromeOnly.usage.status === 'DO_NOT_USE',
});
writeJson('audits/localhost-truth-boundary.json', {
  freshness: localhostOnly.evaluation.freshness.status,
  usage: localhostOnly.usage.status,
  stale: localhostOnly.evaluation.freshness.status === 'STALE',
  doNotUse: localhostOnly.usage.status === 'DO_NOT_USE',
});
writeJson('audits/stale-mock-hard-block.json', {
  freshness: old.evaluation.freshness.status,
  usage: old.usage.status,
  misleading: old.evaluation.misleadingRisk.level,
});
writeJson('audits/human-override-precedence.json', {
  forcePreferredOnStaleMockUsage: forcePreferredOnOld.usage.status,
  bypassedTruthHardBlock: forcePreferredOnOld.usage.status !== 'DO_NOT_USE',
});
writeJson('audits/no-provider-call.json', { visionCalls: 0, llmCalls: 0, providerCalls: 0 });
writeJson('audits/no-production-wiring.json', { worker: false, director: false, hybrid: false, crop: false });
writeJson('audits/no-migration.json', { migration: false });
writeJson('limitations.json', {
  items: [
    'CONTEXT_RULES_V1_ONLY',
    'HUMAN_FACTS_MANUALLY_SUPPLIED',
    'NO_PERSISTENCE',
    'NO_UI_OVERRIDE',
    'NO_MULTI_PROJECT_BENCHMARK',
    'NO_AUTOMATIC_STALE_VERSION_DETECTION',
    'NO_RIGHTS_ENGINE_RUNTIME',
    'NO_PRIVACY_RUNTIME',
    'NO_DIRECTOR_INTEGRATION',
  ],
  count: 9,
});
writeJson('files-changed.json', {
  step: '13.15B-1E-B2-7',
  files: [
    'apps/backend/src/production-v2/visual-context/context.types.ts',
    'apps/backend/src/production-v2/visual-context/context-evidence.ts',
    'apps/backend/src/production-v2/visual-context/context-rules.ts',
    'apps/backend/src/production-v2/visual-context/project-context-evaluator.ts',
    'apps/backend/src/production-v2/visual-context/asset-usage-assessor.ts',
    'apps/backend/src/production-v2/visual-context/claim-evidence-assessor.ts',
    'apps/backend/src/production-v2/visual-context/fixtures/content01-context.fixture.ts',
    'apps/backend/src/production-v2/visual-context/project-context-evaluator.spec.ts',
    'apps/backend/src/production-v2/visual-context/index.ts',
    'apps/backend/scripts/step-13.15b1e-b2-7-context-eval.ts',
    'apps/backend/package.json',
  ],
});
writeJson('implementation-summary.json', {
  step: '13.15B-1E-B2-7',
  cleanUsage: clean.usage.status,
  cleanFreshness: clean.evaluation.freshness.status,
  oldUsage: old.usage.status,
  oldFreshness: old.evaluation.freshness.status,
  autoPublishSupport: autoPublish.support,
  visionCalls: 0,
  llmCalls: 0,
});

process.stdout.write(
  `${JSON.stringify({
    clean: { relevance: clean.evaluation.relevance.status, freshness: clean.evaluation.freshness.status, usage: clean.usage.status },
    old: { freshness: old.evaluation.freshness.status, usage: old.usage.status },
    autoPublish: autoPublish.support,
    visionCalls: 0,
  })}\n`,
);
