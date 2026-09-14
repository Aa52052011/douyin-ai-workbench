import { atLeast, type EvidenceLevel } from './evidence-levels.js';
import { CATALOG_VISION_CANDIDATES } from './candidate-matrix.js';

export const PROVIDER_SELECTION_STATUSES = [
  'READY_FOR_SMOKE_TEST',
  'BLOCKED_BY_CAPABILITY_UNKNOWN',
  'ROUTER_MULTIMODAL_NOT_SUPPORTED',
] as const;

export type ProviderSelectionStatus = (typeof PROVIDER_SELECTION_STATUSES)[number];

export type CapabilityInputs = {
  routerMultimodal: EvidenceLevel;
  modelImageInput: EvidenceLevel;
  payloadFormatDetermined: boolean;
  structuredOutputFallback: EvidenceLevel;
  newVendorRequired: boolean;
};

export function decideProviderSelectionStatus(input: CapabilityInputs): ProviderSelectionStatus {
  if (input.routerMultimodal === 'NOT_SUPPORTED') {
    return 'ROUTER_MULTIMODAL_NOT_SUPPORTED';
  }
  if (input.newVendorRequired) {
    return 'BLOCKED_BY_CAPABILITY_UNKNOWN';
  }
  if (!input.payloadFormatDetermined) {
    return 'BLOCKED_BY_CAPABILITY_UNKNOWN';
  }
  if (!atLeast(input.routerMultimodal, 'DOCUMENTED')) {
    return 'BLOCKED_BY_CAPABILITY_UNKNOWN';
  }
  if (!atLeast(input.modelImageInput, 'DOCUMENTED')) {
    return 'BLOCKED_BY_CAPABILITY_UNKNOWN';
  }
  if (!atLeast(input.structuredOutputFallback, 'DOCUMENTED')) {
    return 'BLOCKED_BY_CAPABILITY_UNKNOWN';
  }
  return 'READY_FOR_SMOKE_TEST';
}

export function candidateRejectedForMissingImageInput(imageInput: EvidenceLevel): boolean {
  return imageInput === 'NOT_SUPPORTED' || imageInput === 'UNVALIDATED';
}

export function canBePreferredForSmokeTest(imageInput: EvidenceLevel): boolean {
  return atLeast(imageInput, 'DOCUMENTED');
}

const LEVEL_SCORE: Record<EvidenceLevel, number> = {
  CONFIRMED: 5,
  DOCUMENTED: 4,
  INFERRED: 2,
  UNVALIDATED: 1,
  NOT_SUPPORTED: 0,
};

export type CandidateScore = {
  modelId: string;
  total: number;
  breakdown: Record<string, number>;
  eligiblePreferred: boolean;
};

export function scoreVisionCandidate(
  row: (typeof CATALOG_VISION_CANDIDATES)[number],
  extras?: { latencyScore: number; stabilityScore: number },
): CandidateScore {
  const eligiblePreferred = canBePreferredForSmokeTest(row.imageInput);
  const latencyScore = extras?.latencyScore ?? 2;
  const stabilityScore = extras?.stabilityScore ?? 3;
  const chinese = Math.min(LEVEL_SCORE[row.ChineseUIEvidence], 2);
  const grounding = Math.min(LEVEL_SCORE[row.regionGrounding], 1);
  const breakdown = {
    routerCompatibility: LEVEL_SCORE[row.routerTransportEvidence],
    multiImage: LEVEL_SCORE[row.multiImage],
    chineseUi: chinese,
    structuredOutput: LEVEL_SCORE[row.jsonObject],
    regionGrounding: grounding,
    latencyExpectation: latencyScore,
    costVisibility: row.costInfo === 'UNKNOWN' ? 0 : 5,
    stabilityAvailability: stabilityScore,
  };
  const total =
    breakdown.routerCompatibility * 0.2 +
    breakdown.multiImage * 0.15 +
    breakdown.chineseUi * 0.15 +
    breakdown.structuredOutput * 0.15 +
    breakdown.regionGrounding * 0.1 +
    breakdown.latencyExpectation * 0.1 +
    breakdown.costVisibility * 0.05 +
    breakdown.stabilityAvailability * 0.1;
  return { modelId: row.modelId, total: Number(total.toFixed(3)), breakdown, eligiblePreferred };
}

export const VISION_PROVIDER_CAPABILITY_DECISION = {
  routerMultimodalStatus: 'DOCUMENTED' as EvidenceLevel,
  primaryModelStatus: 'DOCUMENTED' as EvidenceLevel,
  backupModelStatus: 'DOCUMENTED' as EvidenceLevel,
  preferredSmokeCandidate: 'openai/gpt-5.5',
  backupSmokeCandidate: 'anthropic/claude-haiku-4.5',
  blockingUnknowns: [
    'DATA_URL_ROUTER_SPECIFIC_UNVALIDATED',
    'MULTI_IMAGE_PER_REQUEST_UNVALIDATED',
    'PAYLOAD_LIMITS_UNKNOWN',
    'JSON_SCHEMA_MODEL_ENFORCEMENT_UNVALIDATED',
    'CHINESE_UI_AND_REGION_GROUNDING_REQUIRE_REAL_VALIDATION',
    'VISION_ROUTE_RUNTIME_UNVALIDATED',
  ],
  requiredManualConfig: ['MANUAL_ENV_CHANGE_REQUIRED_LATER:VISUAL_SEMANTIC_MODEL'],
  readyForSmokeTest: true,
  providerSelectionStatus: 'READY_FOR_SMOKE_TEST' as ProviderSelectionStatus,
  reason:
    'Router One documents vision as a catalog flag on OpenAI-compatible chat/completions and documents image_url content parts on that endpoint. openai/gpt-5.5 and anthropic/claude-haiku-4.5 are listed with vision; haiku detail page also states image input. json_object is documented as a gateway-accepted fallback. Auth path can be reused. Runtime vision remains unconfirmed; DATA_URL is not Router-specific documented.',
};

export const B2_3A_CAPABILITY_INPUTS: CapabilityInputs = {
  routerMultimodal: 'DOCUMENTED',
  modelImageInput: 'DOCUMENTED',
  payloadFormatDetermined: true,
  structuredOutputFallback: 'DOCUMENTED',
  newVendorRequired: false,
};
