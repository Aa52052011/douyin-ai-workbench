import { buildCropConstraints } from './crop-constraint-rules.js';
import { buildGeometryCandidates } from './crop-geometry-facts.js';
import { buildCropRisks } from './crop-risk-rules.js';
import { linkClaimsToRegions } from './claim-region-linker.js';
import { contextRef } from './hybrid-provenance.js';
import { buildHybridRegions } from './hybrid-region.js';
import type {
  HybridAssemblyInput,
  HybridStatus,
  HybridVisualAnalysisResultV1,
  HybridVisualConflict,
  SemanticCropInputAssemblyV1,
} from './hybrid.types.js';
import { AVAILABLE_CROP_STRATEGIES, AVAILABLE_FIT_MODES, HYBRID_PRECEDENCE, HYBRID_SCHEMA_VERSION, SEMANTIC_CROP_INPUT_VERSION } from './hybrid.types.js';

export type HybridPackage = {
  hybrid: HybridVisualAnalysisResultV1;
  cropInput: SemanticCropInputAssemblyV1;
};

function statusOf(input: HybridAssemblyInput): HybridStatus {
  if (input.usageAssessment.status === 'DO_NOT_USE') return 'BLOCKED';
  if (input.contextEvaluation.freshness.status === 'STALE' && input.contextEvaluation.misleadingRisk.level === 'CRITICAL') {
    return 'BLOCKED';
  }
  if (input.observations.length === 0 || !input.geometry.sourceWidth) return 'PARTIAL';
  return 'READY';
}

export function assembleHybridPackage(input: HybridAssemblyInput): HybridPackage {
  const regions = buildHybridRegions(input.observations);
  const blocked = statusOf(input) === 'BLOCKED';
  const status = statusOf(input);
  const conflicts: HybridVisualConflict[] = input.contextEvaluation.conflicts.map((item) => ({
    type: item.type === 'HUMAN_VISION_CONFLICT' ? 'HUMAN_SEMANTIC_CONFLICT' : 'SEMANTIC_CONTEXT_CONFLICT',
    summary: item.summary,
    sourceRefs: [contextRef('conflict', item.type)],
    ruleIds: ['RULE_STALE_MOCK_PRODUCTION_BLOCK'],
  }));
  const constraints = buildCropConstraints({
    regions,
    usageStatus: input.usageAssessment.status,
    blocked,
    claims: input.claims,
    overrides: input.regionOverrides,
  });
  const geometryCandidates = buildGeometryCandidates(input.geometry);
  const risks = buildCropRisks(input.geometry);
  const frameIds = [...new Set(input.observations.map((item) => item.frameId))];

  const hybrid: HybridVisualAnalysisResultV1 = {
    schemaVersion: HYBRID_SCHEMA_VERSION,
    assetId: input.contextEvaluation.assetId,
    status,
    productionEligibility: blocked ? 'BLOCKED' : 'ALLOWED',
    sourceSummary: {
      deterministic: Boolean(input.geometry.sourceWidth),
      semantic: input.observations.length > 0,
      context: true,
      human: input.contextEvaluation.sourceRefs.some((ref) => ref.sourceType === 'HUMAN_CONFIRMED'),
    },
    contextEvaluation: input.contextEvaluation,
    usageAssessment: input.usageAssessment,
    regions,
    temporalSummary: { frameIds, precision: 'sampled', notFrameAccurate: true },
    conflicts,
    warnings: blocked ? ['PRODUCTION_ELIGIBILITY_BLOCKED'] : [],
    limitations: ['NO_FINAL_CROP', 'NO_DIRECTOR_DECISION', 'TEMPORAL_SAMPLED_ONLY'],
    provenance: { precedence: HYBRID_PRECEDENCE },
    finalShotDecision: 'NOT_PERFORMED',
    finalCropDecision: 'NOT_PERFORMED',
  };

  const cropInput: SemanticCropInputAssemblyV1 = {
    schemaVersion: SEMANTIC_CROP_INPUT_VERSION,
    assetId: hybrid.assetId,
    status: blocked ? 'BLOCKED' : status,
    profile: input.geometry,
    geometryCandidates,
    availableFitModes: AVAILABLE_FIT_MODES,
    availableStrategies: AVAILABLE_CROP_STRATEGIES,
    constraints,
    risks,
    claimLinks: linkClaimsToRegions(regions, input.claims),
    winner: 'NOT_SELECTED',
    finalFitMode: 'NOT_SELECTED',
  };

  return { hybrid, cropInput };
}
