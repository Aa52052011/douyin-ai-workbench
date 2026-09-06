import { AgentError } from '../agents/agent.errors.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import {
  CAMPAIGN_STRATEGY_BRIEF_REFS,
  CAMPAIGN_STRATEGY_CONFIDENCE_RANK,
  CAMPAIGN_STRATEGY_EVIDENCE_TYPES,
  CAMPAIGN_STRATEGY_FORBIDDEN_CLAIMS,
  CAMPAIGN_STRATEGY_FORBIDDEN_KEYS,
  CAMPAIGN_STRATEGY_INPUT_VERSION,
  CAMPAIGN_STRATEGY_LEAKAGE_KEYS,
  CAMPAIGN_STRATEGY_LIMITS,
  CAMPAIGN_STRATEGY_NO_MARKET_PHRASES,
  CAMPAIGN_STRATEGY_NO_PERFORMANCE_PHRASES,
  CAMPAIGN_STRATEGY_OUTPUT_KEYS,
  CAMPAIGN_STRATEGY_OUTPUT_VERSION,
  CAMPAIGN_STRATEGY_POSITIONING_REFS,
  CAMPAIGN_STRATEGY_PRIORITIES,
  CAMPAIGN_STRATEGY_USER_GOAL_REFS,
  LIMITED_MARKET_SAMPLE_LIMITATION,
  NO_MARKET_INSIGHT_LIMITATION,
  NO_PERFORMANCE_HISTORY_LIMITATION,
  collectMarketInsightCodes,
  collectPerformanceSignalCodes,
  type CampaignStrategyConfidence,
  type CampaignStrategyEvidenceBasis,
  type CampaignStrategyInputSnapshot,
  type CampaignStrategyOutputV1,
  type CampaignStrategyPriority,
} from './campaign-strategy.types.js';

export function validateCampaignStrategyEvidenceBasis(value: unknown): CampaignStrategyEvidenceBasis {
  if (!isRecord(value)) {
    throw invalid('evidenceBasis item is invalid');
  }
  rejectForbiddenKeys(value);
  if (
    typeof value.type !== 'string' ||
    !(CAMPAIGN_STRATEGY_EVIDENCE_TYPES as readonly string[]).includes(value.type)
  ) {
    throw invalid('evidenceBasis.type is invalid');
  }
  if (typeof value.ref !== 'string' || !value.ref.trim() || value.ref.trim().length > CAMPAIGN_STRATEGY_LIMITS.evidenceRef) {
    throw invalid('evidenceBasis.ref is invalid');
  }
  if (looksLikeRawSnapshotId(value.ref)) {
    throw invalid('evidenceBasis cannot reference raw snapshot ids');
  }
  const note =
    value.note == null
      ? undefined
      : typeof value.note === 'string' && value.note.trim() && value.note.trim().length <= CAMPAIGN_STRATEGY_LIMITS.evidenceNote
        ? value.note.trim()
        : null;
  if (note === null) {
    throw invalid('evidenceBasis.note is invalid');
  }
  return {
    type: value.type as CampaignStrategyEvidenceBasis['type'],
    ref: value.ref.trim(),
    ...(note ? { note } : {}),
  };
}

export function assertCampaignStrategyInputSnapshot(value: CampaignStrategyInputSnapshot): CampaignStrategyInputSnapshot {
  if (value.version !== CAMPAIGN_STRATEGY_INPUT_VERSION) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'CampaignStrategy input snapshot version is invalid');
  }
  rejectForbiddenDeep(value);
  rejectOversized(value);
  return value;
}

export function validateCampaignStrategyOutput(
  value: unknown,
  snapshot: CampaignStrategyInputSnapshot,
): CampaignStrategyOutputV1 {
  if (!isRecord(value)) {
    throw invalid('CampaignStrategy payload is invalid');
  }
  rejectForbiddenKeys(value);
  rejectLeakageKeys(value);
  rejectExtraKeys(value, CAMPAIGN_STRATEGY_OUTPUT_KEYS);
  if (value.version !== CAMPAIGN_STRATEGY_OUTPUT_VERSION) {
    throw invalid('CampaignStrategy version is invalid');
  }

  const objective = parseObjective(value.objective);
  const targetAudience = parseTargetAudience(value.targetAudience);
  const positioning = parsePositioning(value.positioning);
  const valuePropositions = parseValuePropositions(value.valuePropositions, snapshot);
  const contentPillars = parseContentPillars(value.contentPillars, snapshot);
  const contentMix = parseContentMix(value.contentMix);
  const creativeAngles = parseCreativeAngles(value.creativeAngles, snapshot);
  const conversionPath = parseConversionPath(value.conversionPath);
  const ctaStrategy = parseCtaStrategy(value.ctaStrategy);
  const testingStrategy = parseTestingStrategy(value.testingStrategy, snapshot);
  const publishingCadence = parsePublishingCadence(value.publishingCadence);
  const risks = parseRisks(value.risks);
  const confidence = parseConfidence(value.confidence, snapshot);
  const dataLimitations = parseDataLimitations(value.dataLimitations, snapshot);

  const output: CampaignStrategyOutputV1 = {
    version: CAMPAIGN_STRATEGY_OUTPUT_VERSION,
    objective,
    targetAudience,
    positioning,
    valuePropositions,
    contentPillars,
    contentMix,
    creativeAngles,
    conversionPath,
    ctaStrategy,
    testingStrategy,
    ...(publishingCadence ? { publishingCadence } : {}),
    risks,
    confidence,
    dataLimitations,
  };
  rejectForbiddenClaims(output);
  rejectFabricatedLanguage(output, snapshot);
  rejectOversized(output);
  return output;
}

export function looksLikeRawSnapshotId(ref: string): boolean {
  return /^(snapshot|pms_|publication_metric|raw[-_])/i.test(ref.trim());
}

function parseObjective(value: unknown): CampaignStrategyOutputV1['objective'] {
  if (!isRecord(value)) {
    throw invalid('objective is invalid');
  }
  rejectExtraKeys(value, ['businessGoal', 'conversionGoal', 'primaryObjective']);
  return {
    businessGoal: requireBoundedString(value, 'businessGoal'),
    ...(optionalBoundedString(value, 'conversionGoal')
      ? { conversionGoal: optionalBoundedString(value, 'conversionGoal') }
      : {}),
    primaryObjective: requireBoundedString(value, 'primaryObjective'),
  };
}

function parseTargetAudience(value: unknown): CampaignStrategyOutputV1['targetAudience'] {
  if (!isRecord(value)) {
    throw invalid('targetAudience is invalid');
  }
  rejectExtraKeys(value, ['primary', 'secondary', 'pains', 'motivations']);
  return {
    primary: requireBoundedString(value, 'primary'),
    ...(optionalBoundedString(value, 'secondary') ? { secondary: optionalBoundedString(value, 'secondary') } : {}),
    pains: parseStringArray(value.pains),
    motivations: parseStringArray(value.motivations),
  };
}

function parsePositioning(value: unknown): CampaignStrategyOutputV1['positioning'] {
  if (!isRecord(value)) {
    throw invalid('positioning is invalid');
  }
  rejectExtraKeys(value, ['accountRole', 'marketPosition', 'differentiation']);
  return {
    accountRole: requireBoundedString(value, 'accountRole'),
    marketPosition: requireBoundedString(value, 'marketPosition'),
    differentiation: parseStringArray(value.differentiation, 1),
  };
}

function parseValuePropositions(
  value: unknown,
  snapshot: CampaignStrategyInputSnapshot,
): CampaignStrategyOutputV1['valuePropositions'] {
  const items = requireArray(value, 1);
  return items.map((item) => {
    if (!isRecord(item)) {
      throw invalid('valueProposition is invalid');
    }
    rejectExtraKeys(item, ['proposition', 'evidenceBasis', 'priority']);
    return {
      proposition: requireBoundedString(item, 'proposition'),
      evidenceBasis: parseGroundedEvidence(item.evidenceBasis, snapshot),
      priority: parsePriority(item.priority),
    };
  });
}

function parseContentPillars(
  value: unknown,
  snapshot: CampaignStrategyInputSnapshot,
): CampaignStrategyOutputV1['contentPillars'] {
  const items = requireArray(value, 1);
  return items.map((item) => {
    if (!isRecord(item)) {
      throw invalid('contentPillar is invalid');
    }
    rejectExtraKeys(item, ['name', 'purpose', 'priority', 'evidenceBasis']);
    return {
      name: requireBoundedString(item, 'name', 80),
      purpose: requireBoundedString(item, 'purpose'),
      priority: parsePriority(item.priority),
      evidenceBasis: parseGroundedEvidence(item.evidenceBasis, snapshot),
    };
  });
}

function parseContentMix(value: unknown): CampaignStrategyOutputV1['contentMix'] {
  const items = requireArray(value, 1, CAMPAIGN_STRATEGY_LIMITS.mix);
  const mix = items.map((item) => {
    if (!isRecord(item)) {
      throw invalid('contentMix item is invalid');
    }
    rejectExtraKeys(item, ['type', 'percentage', 'purpose']);
    const percentage = parseOptionalPercentage(item.percentage);
    return {
      type: requireBoundedString(item, 'type', 80),
      ...(percentage !== undefined ? { percentage } : {}),
      purpose: requireBoundedString(item, 'purpose'),
    };
  });
  const withPct = mix.filter((item) => item.percentage !== undefined);
  if (withPct.length > 0) {
    if (withPct.length !== mix.length) {
      throw invalid('contentMix percentages must be complete when used');
    }
    const total = withPct.reduce((sum, item) => sum + (item.percentage ?? 0), 0);
    if (Math.abs(total - 100) > 0.5) {
      throw invalid('contentMix percentages must sum to 100');
    }
  }
  return mix;
}

function parseCreativeAngles(
  value: unknown,
  snapshot: CampaignStrategyInputSnapshot,
): CampaignStrategyOutputV1['creativeAngles'] {
  const items = requireArray(value, 1);
  return items.map((item) => {
    if (!isRecord(item)) {
      throw invalid('creativeAngle is invalid');
    }
    rejectExtraKeys(item, ['angle', 'rationale', 'evidenceBasis']);
    return {
      angle: requireBoundedString(item, 'angle'),
      rationale: requireBoundedString(item, 'rationale'),
      evidenceBasis: parseGroundedEvidence(item.evidenceBasis, snapshot),
    };
  });
}

function parseConversionPath(value: unknown): CampaignStrategyOutputV1['conversionPath'] {
  if (!isRecord(value)) {
    throw invalid('conversionPath is invalid');
  }
  rejectExtraKeys(value, ['awareness', 'consideration', 'conversion']);
  return {
    awareness: requireBoundedString(value, 'awareness'),
    consideration: requireBoundedString(value, 'consideration'),
    conversion: requireBoundedString(value, 'conversion'),
  };
}

function parseCtaStrategy(value: unknown): CampaignStrategyOutputV1['ctaStrategy'] {
  if (!isRecord(value)) {
    throw invalid('ctaStrategy is invalid');
  }
  rejectExtraKeys(value, ['principles', 'allowedDirections']);
  return {
    principles: parseStringArray(value.principles, 1),
    allowedDirections: parseStringArray(value.allowedDirections, 1),
  };
}

function parseTestingStrategy(
  value: unknown,
  snapshot: CampaignStrategyInputSnapshot,
): CampaignStrategyOutputV1['testingStrategy'] {
  if (!isRecord(value)) {
    throw invalid('testingStrategy is invalid');
  }
  rejectExtraKeys(value, ['hypotheses', 'variables', 'successSignals']);
  const hypotheses = requireArray(value.hypotheses, 1, CAMPAIGN_STRATEGY_LIMITS.hypotheses).map((item) => {
    if (!isRecord(item)) {
      throw invalid('testing hypothesis is invalid');
    }
    rejectExtraKeys(item, ['hypothesis', 'evidenceBasis']);
    const hypothesis = requireBoundedString(item, 'hypothesis');
    if (/\d+(\.\d+)?\s*%/.test(hypothesis) && !snapshot.currentUserGoal) {
      throw invalid('testing hypothesis cannot invent numeric targets');
    }
    return {
      hypothesis,
      evidenceBasis: parseGroundedEvidence(item.evidenceBasis, snapshot),
    };
  });
  return {
    hypotheses,
    variables: parseStringArray(value.variables, 1),
    successSignals: parseStringArray(value.successSignals, 1),
  };
}

function parsePublishingCadence(value: unknown): CampaignStrategyOutputV1['publishingCadence'] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw invalid('publishingCadence is invalid');
  }
  rejectExtraKeys(value, ['guidance']);
  const guidance = requireBoundedString(value, 'guidance');
  if (/\d{1,2}\s*[:：]\s*\d{2}/.test(guidance) || /每天\s*\d/.test(guidance)) {
    throw invalid('publishingCadence cannot specify clock times');
  }
  return { guidance };
}

function parseRisks(value: unknown): CampaignStrategyOutputV1['risks'] {
  const items = requireArray(value, 1, CAMPAIGN_STRATEGY_LIMITS.risks);
  return items.map((item) => {
    if (!isRecord(item)) {
      throw invalid('risk is invalid');
    }
    rejectExtraKeys(item, ['risk', 'mitigation']);
    return {
      risk: requireBoundedString(item, 'risk'),
      ...(optionalBoundedString(item, 'mitigation') ? { mitigation: optionalBoundedString(item, 'mitigation') } : {}),
    };
  });
}

function parseConfidence(value: unknown, snapshot: CampaignStrategyInputSnapshot): CampaignStrategyConfidence {
  if (value !== 'LOW' && value !== 'MEDIUM' && value !== 'HIGH') {
    throw invalid('confidence is invalid');
  }
  if (CAMPAIGN_STRATEGY_CONFIDENCE_RANK[value] > CAMPAIGN_STRATEGY_CONFIDENCE_RANK[snapshot.confidenceCeiling]) {
    throw invalid('confidence exceeds ceiling');
  }
  if (snapshot.dataState.overall === 'LIMITED' && value === 'HIGH') {
    throw invalid('LIMITED overall cannot be HIGH');
  }
  return value;
}

function parseDataLimitations(value: unknown, snapshot: CampaignStrategyInputSnapshot): string[] {
  const items = parseStringArray(value, 1);
  if (snapshot.flags.includes('NO_MARKET_INSIGHT') && !items.includes(NO_MARKET_INSIGHT_LIMITATION)) {
    throw invalid('NO_MARKET_INSIGHT limitation required');
  }
  if (snapshot.flags.includes('NO_PERFORMANCE_HISTORY') && !items.includes(NO_PERFORMANCE_HISTORY_LIMITATION)) {
    throw invalid('NO_PERFORMANCE_HISTORY limitation required');
  }
  if (snapshot.dataState.market === 'LIMITED' && !items.includes(LIMITED_MARKET_SAMPLE_LIMITATION)) {
    throw invalid('LIMITED market must record LIMITED_MARKET_SAMPLE');
  }
  return items;
}

function parseGroundedEvidence(
  value: unknown,
  snapshot: CampaignStrategyInputSnapshot,
): CampaignStrategyEvidenceBasis[] {
  const items = requireArray(value, 1, 5).map(validateCampaignStrategyEvidenceBasis);
  for (const item of items) {
    assertEvidenceRef(item, snapshot);
  }
  return items;
}

function assertEvidenceRef(item: CampaignStrategyEvidenceBasis, snapshot: CampaignStrategyInputSnapshot): void {
  if (item.type === 'MARKET_INSIGHT') {
    const codes = snapshot.marketInsight ? collectMarketInsightCodes(snapshot.marketInsight.payload) : [];
    if (!codes.includes(item.ref)) {
      throw invalid('MARKET_INSIGHT evidence ref does not exist');
    }
    return;
  }
  if (item.type === 'PERFORMANCE_FEEDBACK') {
    if (!collectPerformanceSignalCodes(snapshot.performanceFeedback).includes(item.ref)) {
      throw invalid('PERFORMANCE_FEEDBACK evidence ref does not exist');
    }
    return;
  }
  if (item.type === 'PRODUCT_BRIEF') {
    if (!(CAMPAIGN_STRATEGY_BRIEF_REFS as readonly string[]).includes(item.ref)) {
      throw invalid('PRODUCT_BRIEF evidence ref is not allowed');
    }
    return;
  }
  if (item.type === 'ACCOUNT_POSITIONING') {
    if (!(CAMPAIGN_STRATEGY_POSITIONING_REFS as readonly string[]).includes(item.ref)) {
      throw invalid('ACCOUNT_POSITIONING evidence ref is not allowed');
    }
    return;
  }
  if (!snapshot.currentUserGoal) {
    throw invalid('USER_GOAL evidence is not available');
  }
  if (!(CAMPAIGN_STRATEGY_USER_GOAL_REFS as readonly string[]).includes(item.ref)) {
    throw invalid('USER_GOAL evidence ref is not allowed');
  }
  if (!snapshot.currentUserGoal[item.ref as keyof typeof snapshot.currentUserGoal]) {
    throw invalid('USER_GOAL evidence ref is not present');
  }
}

function parsePriority(value: unknown): CampaignStrategyPriority {
  if (typeof value !== 'string' || !(CAMPAIGN_STRATEGY_PRIORITIES as readonly string[]).includes(value)) {
    throw invalid('priority is invalid');
  }
  return value as CampaignStrategyPriority;
}

function parseOptionalPercentage(value: unknown): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 100) {
    throw invalid('contentMix percentage is invalid');
  }
  return value;
}

function parseStringArray(value: unknown, min = 0, max = CAMPAIGN_STRATEGY_LIMITS.list): string[] {
  if (!Array.isArray(value)) {
    throw invalid('string array is invalid');
  }
  if (value.length < min || value.length > max) {
    throw invalid('string array size is invalid');
  }
  return value.map((item) => {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > CAMPAIGN_STRATEGY_LIMITS.statement) {
      throw invalid('string array item is invalid');
    }
    return item.trim();
  });
}

function requireArray(value: unknown, min: number, max: number = CAMPAIGN_STRATEGY_LIMITS.list): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw invalid('array size is invalid');
  }
  return value;
}

function requireBoundedString(record: Record<string, unknown>, key: string, max: number = CAMPAIGN_STRATEGY_LIMITS.statement): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw invalid(`${key} is invalid`);
  }
  return value.trim();
}

function optionalBoundedString(
  record: Record<string, unknown>,
  key: string,
  max = CAMPAIGN_STRATEGY_LIMITS.statement,
): string | undefined {
  if (!(key in record) || record[key] == null) {
    return undefined;
  }
  return requireBoundedString(record, key, max);
}

function rejectForbiddenClaims(output: CampaignStrategyOutputV1): void {
  const texts = collectStrings(output);
  for (const text of texts) {
    for (const claim of CAMPAIGN_STRATEGY_FORBIDDEN_CLAIMS) {
      if (text.includes(claim)) {
        throw invalid(`forbidden claim: ${claim}`);
      }
    }
  }
}

function rejectFabricatedLanguage(output: CampaignStrategyOutputV1, snapshot: CampaignStrategyInputSnapshot): void {
  const texts = collectStrings(output);
  if (!snapshot.marketInsight || snapshot.dataState.market === 'NONE') {
    for (const text of texts) {
      for (const phrase of CAMPAIGN_STRATEGY_NO_MARKET_PHRASES) {
        if (text.includes(phrase)) {
          throw invalid('cannot fabricate market claims without MarketInsight');
        }
      }
    }
  }
  if (snapshot.performanceFeedback.dataState === 'NONE') {
    for (const text of texts) {
      for (const phrase of CAMPAIGN_STRATEGY_NO_PERFORMANCE_PHRASES) {
        if (text.includes(phrase)) {
          throw invalid('cannot fabricate performance claims without history');
        }
      }
    }
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).flatMap(collectStrings);
}

function rejectForbiddenKeys(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if ((CAMPAIGN_STRATEGY_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      throw invalid(`Forbidden campaign strategy field: ${key}`);
    }
  }
}

function rejectLeakageKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(rejectLeakageKeys);
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    if ((CAMPAIGN_STRATEGY_LEAKAGE_KEYS as readonly string[]).includes(key)) {
      throw invalid(`CampaignStrategy cannot include ${key}`);
    }
    rejectLeakageKeys(value[key]);
  }
}

function rejectForbiddenDeep(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(rejectForbiddenDeep);
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  rejectForbiddenKeys(value);
  for (const nested of Object.values(value)) {
    rejectForbiddenDeep(nested);
  }
}

function rejectExtraKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw invalid(`unexpected field: ${key}`);
    }
  }
}

function rejectOversized(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > CAMPAIGN_STRATEGY_LIMITS.payloadBytes * 4) {
    throw invalid('CampaignStrategy snapshot exceeds size limit');
  }
}

function invalid(message: string): AgentError {
  return new AgentError(ErrorCode.AGENT_INVALID_OUTPUT, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
