import { ErrorCode } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import type { MarketEvidence, MarketEvidenceItem } from '../../market/market-evidence.types.js';
import type { MarketConfidence, ProductBriefPayload } from '../../market/market.types.js';
import { parseProductBriefPayload } from '../../market/product-brief.payload.js';
import { AgentError } from '../agent.errors.js';
import {
  MARKET_INTELLIGENCE_AGENT_ID,
  MARKET_INTELLIGENCE_AGENT_VERSION,
  MARKET_INTELLIGENCE_TIMEOUT_MS,
  type AgentDefinition,
} from '../agent.types.js';
import {
  CONFIDENCE_RANK,
  EVIDENCE_KIND_RANK,
  MARKET_INSIGHT_CAMPAIGN_KEYS,
  MARKET_INSIGHT_FORBIDDEN_CLAIMS,
  MARKET_INSIGHT_ITEM_KEYS,
  MARKET_INSIGHT_LIMITS,
  MARKET_INSIGHT_OUTPUT_KEYS,
  MARKET_INSIGHT_OUTPUT_VERSION,
  MARKET_INSIGHT_STATES,
  MARKET_INTELLIGENCE_FORBIDDEN_KEYS,
  MARKET_INTELLIGENCE_INPUT_KEYS,
  NO_MARKET_DATA_LIMITATION,
  asInsightKind,
  isMarketInsightItemKind,
  type MarketInsightEvidenceCoverage,
  type MarketInsightItem,
  type MarketInsightItemKind,
  type MarketInsightOutputV1,
  type MarketInsightState,
  type MarketIntelligenceInput,
} from './market-intelligence.types.js';

export const marketIntelligenceDefinition: AgentDefinition = {
  id: MARKET_INTELLIGENCE_AGENT_ID,
  name: '市场证据分析',
  version: MARKET_INTELLIGENCE_AGENT_VERSION,
  description: '基于 compact MarketEvidence 解释当前研究样本，不产出推广方案。',
  capabilities: ['market-intelligence', 'structured-output', 'evidence-grounded'],
  timeoutMs: MARKET_INTELLIGENCE_TIMEOUT_MS,
  defaultModel: process.env.MODEL_NAME?.trim() || undefined,
  temperature: 0.2,
  maxTokens: 3500,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['productBrief', 'marketEvidence'],
    properties: {
      productBrief: { type: 'object' },
      marketEvidence: { type: 'object' },
      userFocus: { type: 'string', maxLength: MARKET_INSIGHT_LIMITS.userFocus },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: [...MARKET_INSIGHT_OUTPUT_KEYS],
  },
};

export function parseMarketIntelligenceInput(input: unknown): MarketIntelligenceInput {
  if (!isRecord(input)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  for (const key of Object.keys(input)) {
    if ((MARKET_INTELLIGENCE_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    if (!(MARKET_INTELLIGENCE_INPUT_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }
  if (!isRecord(input.productBrief) || !isRecord(input.marketEvidence)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  let productBrief: ProductBriefPayload;
  try {
    productBrief = parseProductBriefPayload(input.productBrief);
  } catch {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return {
    productBrief,
    marketEvidence: requireMarketEvidence(input.marketEvidence),
    userFocus: optionalString(input, 'userFocus', MARKET_INSIGHT_LIMITS.userFocus),
  };
}

export function listMarketEvidenceItems(evidence: MarketEvidence): MarketEvidenceItem[] {
  return [
    ...evidence.keywordEvidence,
    ...evidence.contentEvidence,
    ...evidence.competitorEvidence,
    ...evidence.trendEvidence,
    ...evidence.audienceEvidence,
    ...evidence.opportunityEvidence,
    ...(evidence.insufficientData ? [evidence.insufficientData] : []),
  ];
}

export function computeEvidenceCoverage(
  evidence: MarketEvidence,
  items: MarketInsightItem[],
): MarketInsightEvidenceCoverage {
  const availableItems = listMarketEvidenceItems(evidence);
  const availableCodes = new Set<string>(availableItems.map((item) => item.code));
  const referenced = new Set<string>();
  for (const item of items) {
    for (const code of item.evidenceCodes) {
      if (availableCodes.has(code)) {
        referenced.add(code);
      }
    }
  }
  const available = availableItems.length;
  return {
    evidenceItemsAvailable: available,
    evidenceItemsReferenced: referenced.size,
    coverageRate: available === 0 ? 0 : Number((referenced.size / available).toFixed(4)),
  };
}

export function buildInsufficientMarketInsight(input: MarketIntelligenceInput): MarketInsightOutputV1 {
  const output: MarketInsightOutputV1 = {
    version: MARKET_INSIGHT_OUTPUT_VERSION,
    marketResearchId: input.marketEvidence.marketResearchId,
    evidenceVersion: input.marketEvidence.version,
    executiveSummary: '当前研究没有可用的市场样本，无法形成可引用的市场判断。',
    marketState: 'INSUFFICIENT_DATA',
    keywordInsights: [],
    contentInsights: [],
    competitorInsights: [],
    trendInsights: [],
    audienceInsights: [],
    opportunityInsights: [],
    strategicImplications: [],
    dataLimitations: [NO_MARKET_DATA_LIMITATION],
    confidence: 'LOW',
    evidenceCoverage: {
      evidenceItemsAvailable: 0,
      evidenceItemsReferenced: 0,
      coverageRate: 0,
    },
  };
  output.evidenceCoverage = computeEvidenceCoverage(input.marketEvidence, collectInsightItems(output));
  output.evidenceCoverage.evidenceItemsReferenced = 0;
  output.evidenceCoverage.coverageRate = 0;
  return output;
}

export function validateMarketInsightOutput(
  value: unknown,
  input: MarketIntelligenceInput,
): MarketInsightOutputV1 {
  if (!isRecord(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  rejectExtraKeys(value, MARKET_INSIGHT_OUTPUT_KEYS);
  rejectCampaignKeys(value);

  if (value.version !== MARKET_INSIGHT_OUTPUT_VERSION) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (value.marketResearchId !== input.marketEvidence.marketResearchId) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (typeof value.evidenceVersion !== 'string' || value.evidenceVersion !== input.marketEvidence.version) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }

  const executiveSummary = requireBoundedString(value, 'executiveSummary', MARKET_INSIGHT_LIMITS.executiveSummary);
  const marketState = requireMarketState(value.marketState, input.marketEvidence.dataSufficiency);
  const confidence = requireConfidence(value.confidence);
  if (CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[input.marketEvidence.confidence]) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (input.marketEvidence.dataSufficiency === 'LIMITED' && confidence === 'HIGH') {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (input.marketEvidence.dataSufficiency === 'NONE' && confidence !== 'LOW') {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }

  const catalog = new Map(listMarketEvidenceItems(input.marketEvidence).map((item) => [item.code, item]));
  const keywordInsights = parseInsightArray(value.keywordInsights, catalog, input, MARKET_INSIGHT_LIMITS.insightsPerCategory);
  const contentInsights = parseInsightArray(value.contentInsights, catalog, input, MARKET_INSIGHT_LIMITS.insightsPerCategory);
  const competitorInsights = parseInsightArray(value.competitorInsights, catalog, input, MARKET_INSIGHT_LIMITS.insightsPerCategory);
  const trendInsights = parseInsightArray(value.trendInsights, catalog, input, MARKET_INSIGHT_LIMITS.insightsPerCategory);
  const audienceInsights = parseInsightArray(value.audienceInsights, catalog, input, MARKET_INSIGHT_LIMITS.insightsPerCategory);
  const opportunityInsights = parseInsightArray(value.opportunityInsights, catalog, input, MARKET_INSIGHT_LIMITS.insightsPerCategory);
  const strategicImplications = parseInsightArray(
    value.strategicImplications,
    catalog,
    input,
    MARKET_INSIGHT_LIMITS.strategicImplications,
  );
  const dataLimitations = parseDataLimitations(value.dataLimitations, input.marketEvidence.dataSufficiency);

  const output: MarketInsightOutputV1 = {
    version: MARKET_INSIGHT_OUTPUT_VERSION,
    marketResearchId: input.marketEvidence.marketResearchId,
    evidenceVersion: input.marketEvidence.version,
    executiveSummary,
    marketState,
    keywordInsights,
    contentInsights,
    competitorInsights,
    trendInsights,
    audienceInsights,
    opportunityInsights,
    strategicImplications,
    dataLimitations,
    confidence,
    evidenceCoverage: computeEvidenceCoverage(input.marketEvidence, []),
  };
  output.evidenceCoverage = computeEvidenceCoverage(input.marketEvidence, collectInsightItems(output));
  rejectForbiddenClaims(output);
  rejectOversizedPayload(output);
  return output;
}

function requireMarketEvidence(value: Record<string, unknown>): MarketEvidence {
  if (value.version !== 'v1' || typeof value.marketResearchId !== 'string' || !isUuid(value.marketResearchId)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (value.dataSufficiency !== 'NONE' && value.dataSufficiency !== 'LIMITED' && value.dataSufficiency !== 'USABLE') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (value.confidence !== 'LOW' && value.confidence !== 'MEDIUM' && value.confidence !== 'HIGH') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const arrays = [
    'keywordEvidence',
    'contentEvidence',
    'competitorEvidence',
    'trendEvidence',
    'audienceEvidence',
    'opportunityEvidence',
  ] as const;
  for (const key of arrays) {
    if (!Array.isArray(value[key])) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }
  return value as unknown as MarketEvidence;
}

function parseInsightArray(
  value: unknown,
  catalog: Map<string, MarketEvidenceItem>,
  input: MarketIntelligenceInput,
  max: number,
): MarketInsightItem[] {
  if (!Array.isArray(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (value.length > max) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value.map((item) => parseInsightItem(item, catalog, input));
}

function parseInsightItem(
  value: unknown,
  catalog: Map<string, MarketEvidenceItem>,
  input: MarketIntelligenceInput,
): MarketInsightItem {
  if (!isRecord(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  rejectExtraKeys(value, MARKET_INSIGHT_ITEM_KEYS);
  rejectCampaignKeys(value);
  const code = requireBoundedString(value, 'code', MARKET_INSIGHT_LIMITS.code);
  const statement = requireBoundedString(value, 'statement', MARKET_INSIGHT_LIMITS.statement);
  if (!isMarketInsightItemKind(value.evidenceKind)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const evidenceKind = value.evidenceKind;
  const confidence = requireConfidence(value.confidence);
  const evidenceCodes = parseEvidenceCodes(value.evidenceCodes);
  const cited = evidenceCodes.map((item) => {
    const found = catalog.get(item);
    if (!found) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    return found;
  });

  if (evidenceKind !== 'INSUFFICIENT_DATA' && evidenceCodes.length === 0) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }

  const maxCitedKind = cited.reduce<MarketInsightItemKind | null>((current, item) => {
    const kind = asInsightKind(item.evidenceKind);
    if (!kind) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (!current || EVIDENCE_KIND_RANK[kind] > EVIDENCE_KIND_RANK[current]) {
      return kind;
    }
    return current;
  }, null);
  if (maxCitedKind && EVIDENCE_KIND_RANK[evidenceKind] > EVIDENCE_KIND_RANK[maxCitedKind]) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (cited.length === 0 && evidenceKind !== 'INSUFFICIENT_DATA') {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }

  const citedCeiling = cited.reduce((max, item) => Math.max(max, CONFIDENCE_RANK[item.confidence]), 0);
  const allowed = Math.min(CONFIDENCE_RANK[input.marketEvidence.confidence], cited.length === 0 ? 0 : citedCeiling);
  if (CONFIDENCE_RANK[confidence] > allowed) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (input.marketEvidence.dataSufficiency === 'LIMITED' && confidence === 'HIGH') {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }

  const supportCount = optionalNonNegativeInt(value, 'supportCount');
  const caveat = optionalOutputString(value, 'caveat', MARKET_INSIGHT_LIMITS.caveat);
  return {
    code,
    statement,
    evidenceKind,
    confidence,
    evidenceCodes,
    ...(supportCount !== undefined ? { supportCount } : {}),
    ...(caveat ? { caveat } : {}),
  };
}

function parseEvidenceCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (value.length > MARKET_INSIGHT_LIMITS.evidenceCodes) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    const code = item.trim();
    if (seen.has(code)) {
      continue;
    }
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

function parseDataLimitations(value: unknown, sufficiency: MarketEvidence['dataSufficiency']): string[] {
  if (!Array.isArray(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (value.length > MARKET_INSIGHT_LIMITS.dataLimitations) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const items = value.map((item) => {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > MARKET_INSIGHT_LIMITS.dataLimitationItem) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    return item.trim();
  });
  if (sufficiency === 'NONE' && !items.includes(NO_MARKET_DATA_LIMITATION)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (sufficiency === 'LIMITED' && items.length === 0) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return items;
}

function requireMarketState(value: unknown, sufficiency: MarketEvidence['dataSufficiency']): MarketInsightState {
  if (typeof value !== 'string' || !(MARKET_INSIGHT_STATES as readonly string[]).includes(value)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const state = value as MarketInsightState;
  if (sufficiency === 'NONE' && state !== 'INSUFFICIENT_DATA') {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (sufficiency === 'LIMITED' && state === 'ANALYZABLE_SAMPLE') {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return state;
}

function requireConfidence(value: unknown): MarketConfidence {
  if (value !== 'LOW' && value !== 'MEDIUM' && value !== 'HIGH') {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value;
}

function rejectForbiddenClaims(output: MarketInsightOutputV1): void {
  const texts = [
    output.executiveSummary,
    ...output.dataLimitations,
    ...collectInsightItems(output).flatMap((item) => [item.statement, item.caveat ?? '']),
  ];
  for (const text of texts) {
    for (const claim of MARKET_INSIGHT_FORBIDDEN_CLAIMS) {
      if (text.includes(claim)) {
        throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
      }
    }
  }
}

function rejectOversizedPayload(output: MarketInsightOutputV1): void {
  const bytes = Buffer.byteLength(JSON.stringify(output), 'utf8');
  if (bytes > MARKET_INSIGHT_LIMITS.payloadBytes) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
}

function rejectCampaignKeys(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if ((MARKET_INSIGHT_CAMPAIGN_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  }
}

function rejectExtraKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  }
}

function collectInsightItems(output: MarketInsightOutputV1): MarketInsightItem[] {
  return [
    ...output.keywordInsights,
    ...output.contentInsights,
    ...output.competitorInsights,
    ...output.trendInsights,
    ...output.audienceInsights,
    ...output.opportunityInsights,
    ...output.strategicImplications,
  ];
}

function requireBoundedString(record: Record<string, unknown>, key: string, max: number): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return value.trim();
}

function optionalString(record: Record<string, unknown>, key: string, max: number): string | undefined {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    return undefined;
  }
  if (typeof record[key] !== 'string') {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  const trimmed = record[key].trim();
  if (!trimmed || trimmed.length > max) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  return trimmed;
}

function optionalOutputString(record: Record<string, unknown>, key: string, max: number): string | undefined {
  if (!(key in record) || record[key] === undefined || record[key] === null) {
    return undefined;
  }
  if (typeof record[key] !== 'string') {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  const trimmed = record[key].trim();
  if (!trimmed || trimmed.length > max) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return trimmed;
}

function optionalNonNegativeInt(record: Record<string, unknown>, key: string): number | undefined {
  if (!(key in record) || record[key] === undefined) {
    return undefined;
  }
  if (record[key] === null || typeof record[key] !== 'number' || !Number.isInteger(record[key]) || record[key] < 0) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return record[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
