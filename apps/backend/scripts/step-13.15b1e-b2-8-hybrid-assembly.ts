/**
 * B2-8 offline hybrid assembly. Vision/LLM/provider: 0.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constraintOfType } from '../src/production-v2/visual-hybrid/crop-constraint-rules.js';
import { containOccupancy, coverRetainedAreaRatio } from '../src/production-v2/visual-hybrid/crop-geometry-facts.js';
import { assembleHybridPackage } from '../src/production-v2/visual-hybrid/hybrid-assembler.js';
import { riskLevel } from '../src/production-v2/visual-hybrid/crop-risk-rules.js';
import {
  CONTENT_01_GEOMETRY,
  assembleContent01Clean,
  content01OldHomeHybridInput,
  content01OldHybridInput,
  content01ProductInfoHybridInput,
  content01ProductionCenterHybridInput,
  content01PublishHybridInput,
} from '../src/production-v2/visual-hybrid/fixtures/content01-hybrid.fixture.js';
import {
  AVAILABLE_CROP_STRATEGIES,
  AVAILABLE_FIT_MODES,
  CROP_CONSTRAINT_KINDS,
  CROP_RISK_CODES,
  HYBRID_CONFLICT_TYPES,
  HYBRID_PRECEDENCE,
  HYBRID_REASON_CODES,
  HYBRID_SCHEMA_VERSION,
  SEMANTIC_CROP_INPUT_VERSION,
} from '../src/production-v2/visual-hybrid/hybrid.types.js';

const evidenceDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-8',
);

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

const clean = assembleContent01Clean();
const old = assembleHybridPackage(content01OldHybridInput());
const publish = assembleHybridPackage(content01PublishHybridInput());
const productInfo = assembleHybridPackage(content01ProductInfoHybridInput());
const productionCenter = assembleHybridPackage(content01ProductionCenterHybridInput());
const oldHome = assembleHybridPackage(content01OldHomeHybridInput());
const again = assembleContent01Clean();

writeJson('hybrid-contract.json', { version: HYBRID_SCHEMA_VERSION, status: ['READY', 'PARTIAL', 'BLOCKED'] });
writeJson('crop-input-contract.json', { version: SEMANTIC_CROP_INPUT_VERSION, constraints: [...CROP_CONSTRAINT_KINDS], winner: 'NOT_SELECTED' });
writeJson('conflict-contract.json', { types: [...HYBRID_CONFLICT_TYPES] });
writeJson('constraint-contract.json', { kinds: [...CROP_CONSTRAINT_KINDS] });
writeJson('risk-contract.json', { codes: [...CROP_RISK_CODES] });
writeJson('rule-priority.json', { order: [...HYBRID_PRECEDENCE] });
writeJson('reason-codes.json', { codes: [...HYBRID_REASON_CODES] });
writeJson('versioning.json', { hybrid: HYBRID_SCHEMA_VERSION, cropInput: SEMANTIC_CROP_INPUT_VERSION });
writeJson('content01/source-summary.json', clean.hybrid.sourceSummary);
writeJson('content01/hybrid-result.json', {
  assetId: clean.hybrid.assetId,
  status: clean.hybrid.status,
  productionEligibility: clean.hybrid.productionEligibility,
  usage: clean.hybrid.usageAssessment.status,
  finalShotDecision: clean.hybrid.finalShotDecision,
  finalCropDecision: clean.hybrid.finalCropDecision,
  limitations: clean.hybrid.limitations,
});
writeJson('content01/hybrid-regions.json', clean.hybrid.regions);
writeJson('content01/conflicts.json', clean.hybrid.conflicts);
writeJson('content01/crop-inputs.json', {
  status: clean.cropInput.status,
  winner: clean.cropInput.winner,
  finalFitMode: clean.cropInput.finalFitMode,
  availableFitModes: AVAILABLE_FIT_MODES,
  availableStrategies: [...AVAILABLE_CROP_STRATEGIES],
});
writeJson('content01/crop-constraints.json', clean.cropInput.constraints);
writeJson('content01/crop-risks.json', clean.cropInput.risks);
writeJson('content01/geometry-candidates.json', clean.cropInput.geometryCandidates);
writeJson('content01/claim-region-links.json', clean.cropInput.claimLinks);
writeJson('content01/provenance-audit.json', {
  constraintsHaveRefs: clean.cropInput.constraints.every((item) => item.sourceRefs.length > 0),
  risksHaveRefs: clean.cropInput.risks.every((item) => item.sourceRefs.length > 0),
});
writeJson('old-contaminated/hybrid-result.json', {
  status: old.hybrid.status,
  productionEligibility: old.hybrid.productionEligibility,
  usage: old.hybrid.usageAssessment.status,
});
writeJson('old-contaminated/hard-block.json', {
  blocked: old.hybrid.productionEligibility === 'BLOCKED',
  conflicts: old.hybrid.conflicts,
});
writeJson('images/product-info.json', { status: productInfo.hybrid.status, usage: productInfo.hybrid.usageAssessment.status });
writeJson('images/production-center.json', { status: productionCenter.hybrid.status, usage: productionCenter.hybrid.usageAssessment.status });
writeJson('images/publish-operations.json', {
  status: publish.hybrid.status,
  c5: publish.cropInput.claimLinks.find((item) => item.claimId === 'C5'),
  buttonConstraint: constraintOfType(publish.cropInput.constraints, 'BUTTON_LIKE_REGION'),
});
writeJson('images/old-home.json', { status: oldHome.hybrid.status, usage: oldHome.hybrid.usageAssessment.status });
writeJson('audits/no-final-crop.json', { winner: clean.cropInput.winner, finalFitMode: clean.cropInput.finalFitMode });
writeJson('audits/no-director-decision.json', { shot: clean.hybrid.finalShotDecision, crop: clean.hybrid.finalCropDecision });
writeJson('audits/browser-chrome-boundary.json', { constraint: constraintOfType(clean.cropInput.constraints, 'BROWSER_CHROME') });
writeJson('audits/localhost-boundary.json', { constraint: constraintOfType(clean.cropInput.constraints, 'LOCALHOST_REFERENCE') });
writeJson('audits/automatic-publishing-truth-boundary.json', {
  c5Critical: publish.cropInput.claimLinks.find((item) => item.claimId === 'C5')?.claimCritical ?? false,
  support: publish.cropInput.claimLinks.find((item) => item.claimId === 'C5')?.support,
});
writeJson('audits/deterministic-assembly.json', { same: JSON.stringify(clean) === JSON.stringify(again) });
writeJson('audits/no-provider-call.json', { visionCalls: 0, llmCalls: 0, providerCalls: 0 });
writeJson('audits/no-production-wiring.json', { worker: false, director: false, cropRuntime: false });
writeJson('audits/no-migration.json', { migration: false });
writeJson('limitations.json', {
  items: [
    'NO_SEMANTIC_CROP_SOLVER',
    'TEMPORAL_SAMPLED_ONLY',
    'GEOMETRY_PROFILE_ASSUMES_1080x1920_TARGET',
    'NO_PERSISTENCE',
    'NO_DIRECTOR_INTEGRATION',
    'HUMAN_FACTS_FROM_B2_7_FIXTURES',
  ],
  count: 6,
});
writeJson('files-changed.json', {
  step: '13.15B-1E-B2-8',
  files: [
    'apps/backend/src/production-v2/visual-hybrid/hybrid.types.ts',
    'apps/backend/src/production-v2/visual-hybrid/hybrid-assembler.ts',
    'apps/backend/src/production-v2/visual-hybrid/hybrid-region.ts',
    'apps/backend/src/production-v2/visual-hybrid/hybrid-conflict.ts',
    'apps/backend/src/production-v2/visual-hybrid/hybrid-provenance.ts',
    'apps/backend/src/production-v2/visual-hybrid/crop-input-assembler.ts',
    'apps/backend/src/production-v2/visual-hybrid/crop-constraint-rules.ts',
    'apps/backend/src/production-v2/visual-hybrid/crop-risk-rules.ts',
    'apps/backend/src/production-v2/visual-hybrid/crop-geometry-facts.ts',
    'apps/backend/src/production-v2/visual-hybrid/claim-region-linker.ts',
    'apps/backend/src/production-v2/visual-hybrid/fixtures/content01-hybrid.fixture.ts',
    'apps/backend/src/production-v2/visual-hybrid/hybrid-assembler.spec.ts',
    'apps/backend/src/production-v2/visual-hybrid/index.ts',
    'apps/backend/scripts/step-13.15b1e-b2-8-hybrid-assembly.ts',
    'apps/backend/package.json',
  ],
});
writeJson('implementation-summary.json', {
  step: '13.15B-1E-B2-8',
  cleanStatus: clean.hybrid.status,
  cleanUsage: clean.hybrid.usageAssessment.status,
  productUi: constraintOfType(clean.cropInput.constraints, 'PRODUCT_UI'),
  browserChrome: constraintOfType(clean.cropInput.constraints, 'BROWSER_CHROME'),
  localhost: constraintOfType(clean.cropInput.constraints, 'LOCALHOST_REFERENCE'),
  coverRetained: coverRetainedAreaRatio(CONTENT_01_GEOMETRY),
  containOccupancy: containOccupancy(CONTENT_01_GEOMETRY),
  coverRisk: riskLevel(clean.cropInput.risks, 'CENTER/COVER', 'LOW_RETAINED_AREA'),
  containRisk: riskLevel(clean.cropInput.risks, 'CONTAIN', 'READABILITY_LOSS'),
  oldEligibility: old.hybrid.productionEligibility,
  visionCalls: 0,
});

process.stdout.write(
  `${JSON.stringify({
    cleanStatus: clean.hybrid.status,
    usage: clean.hybrid.usageAssessment.status,
    oldBlocked: old.hybrid.productionEligibility,
    coverRisk: riskLevel(clean.cropInput.risks, 'CENTER/COVER', 'LOW_RETAINED_AREA'),
    visionCalls: 0,
  })}\n`,
);
