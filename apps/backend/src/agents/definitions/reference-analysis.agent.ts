import { AgentError } from '../agent.errors.js';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  REFERENCE_ANALYSIS_AGENT_ID,
  REFERENCE_ANALYSIS_AGENT_VERSION,
  REFERENCE_ANALYSIS_TIMEOUT_MS,
  type AgentDefinition,
} from '../agent.types.js';
import {
  REFERENCE_ANALYSIS_OUTPUT_VERSION,
  REFERENCE_FORBIDDEN_COPY_KEYS,
  REFERENCE_PATTERN_TYPES,
  type ReferenceAnalysisAgentInput,
  type ReferenceAnalysisOutputV1,
  type ReferencePatternItem,
} from '../../market/reference-intelligence.types.js';
import {
  isImitationRiskCode,
  isReferencePatternType,
  postprocessReferenceAnalysis,
} from '../../market/reference-intelligence.helpers.js';

export const referenceAnalysisDefinition: AgentDefinition = {
  id: REFERENCE_ANALYSIS_AGENT_ID,
  name: '参考内容结构分析',
  version: REFERENCE_ANALYSIS_AGENT_VERSION,
  description: '从参考内容的文字/元数据提取可复用结构模式，禁止复制原文与素材。',
  capabilities: ['reference-intelligence', 'structured-output', 'originality-safe'],
  timeoutMs: REFERENCE_ANALYSIS_TIMEOUT_MS,
  defaultModel: process.env.MODEL_NAME?.trim() || undefined,
  temperature: 0.2,
  maxTokens: 2500,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['referenceContentId', 'sourceType'],
    properties: {
      referenceContentId: { type: 'string' },
      platform: { type: 'string' },
      sourceType: { type: 'string' },
      reasonForReference: { type: 'string' },
      userNote: { type: 'string' },
      title: { type: 'string' },
      assetMetadata: { type: 'object' },
      availableText: { type: 'string' },
      availableTranscript: { type: 'string' },
      availableDescription: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'version',
      'referenceSummary',
      'reusablePatterns',
      'imitationRisks',
      'productionNotes',
      'originalityGuidance',
    ],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseReferenceAnalysisInput(input: unknown): ReferenceAnalysisAgentInput {
  if (!isRecord(input)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (typeof input.referenceContentId !== 'string' || !input.referenceContentId.trim()) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  if (typeof input.sourceType !== 'string' || !input.sourceType.trim()) {
    throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
  }
  for (const key of Object.keys(input)) {
    if ((REFERENCE_FORBIDDEN_COPY_KEYS as readonly string[]).includes(key)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
    if (
      ![
        'referenceContentId',
        'platform',
        'sourceType',
        'reasonForReference',
        'userNote',
        'title',
        'assetMetadata',
        'availableText',
        'availableTranscript',
        'availableDescription',
      ].includes(key)
    ) {
      throw new AgentError(ErrorCode.AGENT_INVALID_INPUT);
    }
  }
  return {
    referenceContentId: input.referenceContentId.trim(),
    platform: typeof input.platform === 'string' ? input.platform : null,
    sourceType: input.sourceType.trim(),
    reasonForReference: typeof input.reasonForReference === 'string' ? input.reasonForReference : null,
    userNote: typeof input.userNote === 'string' ? input.userNote : null,
    title: typeof input.title === 'string' ? input.title : null,
    assetMetadata: isRecord(input.assetMetadata)
      ? {
          type: typeof input.assetMetadata.type === 'string' ? input.assetMetadata.type : null,
          mimeType: typeof input.assetMetadata.mimeType === 'string' ? input.assetMetadata.mimeType : null,
          duration: typeof input.assetMetadata.duration === 'number' ? input.assetMetadata.duration : null,
          width: typeof input.assetMetadata.width === 'number' ? input.assetMetadata.width : null,
          height: typeof input.assetMetadata.height === 'number' ? input.assetMetadata.height : null,
          size: typeof input.assetMetadata.size === 'number' ? input.assetMetadata.size : null,
          originalFilename:
            typeof input.assetMetadata.originalFilename === 'string'
              ? input.assetMetadata.originalFilename
              : null,
        }
      : undefined,
    availableText: typeof input.availableText === 'string' ? input.availableText : undefined,
    availableTranscript: typeof input.availableTranscript === 'string' ? input.availableTranscript : undefined,
    availableDescription:
      typeof input.availableDescription === 'string' ? input.availableDescription : undefined,
  };
}

export function validateReferenceAnalysisOutput(
  raw: unknown,
  sourceText = '',
): ReferenceAnalysisOutputV1 {
  if (!isRecord(raw)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  for (const key of REFERENCE_FORBIDDEN_COPY_KEYS) {
    if (key in raw) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  }
  if (raw.version !== REFERENCE_ANALYSIS_OUTPUT_VERSION) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (typeof raw.referenceSummary !== 'string' || !raw.referenceSummary.trim()) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (!Array.isArray(raw.reusablePatterns) || !Array.isArray(raw.imitationRisks) || !Array.isArray(raw.productionNotes)) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  if (typeof raw.originalityGuidance !== 'string' || !raw.originalityGuidance.trim()) {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }

  const reusablePatterns: ReferencePatternItem[] = [];
  for (const item of raw.reusablePatterns) {
    if (!isRecord(item)) throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    if (!isReferencePatternType(item.patternType)) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (typeof item.summary !== 'string' || !item.summary.trim()) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (typeof item.key !== 'string' || !item.key.trim()) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (item.confidence !== 'LOW' && item.confidence !== 'MEDIUM' && item.confidence !== 'HIGH') {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    if (JSON.stringify(item).length > 2000) {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
    reusablePatterns.push({
      patternType: item.patternType,
      key: item.key.trim(),
      summary: item.summary.trim(),
      confidence: item.confidence,
    });
  }

  for (const risk of raw.imitationRisks) {
    if (!isRecord(risk) || !isImitationRiskCode(risk.code) || typeof risk.summary !== 'string') {
      throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  }

  const candidate: ReferenceAnalysisOutputV1 = {
    version: REFERENCE_ANALYSIS_OUTPUT_VERSION,
    referenceSummary: raw.referenceSummary.trim(),
    hookPattern: typeof raw.hookPattern === 'string' ? raw.hookPattern : undefined,
    narrativePattern: typeof raw.narrativePattern === 'string' ? raw.narrativePattern : undefined,
    pacingPattern: typeof raw.pacingPattern === 'string' ? raw.pacingPattern : undefined,
    shotPattern: typeof raw.shotPattern === 'string' ? raw.shotPattern : undefined,
    subtitlePattern: typeof raw.subtitlePattern === 'string' ? raw.subtitlePattern : undefined,
    visualPattern: typeof raw.visualPattern === 'string' ? raw.visualPattern : undefined,
    ctaPattern: typeof raw.ctaPattern === 'string' ? raw.ctaPattern : undefined,
    emotionalTone: typeof raw.emotionalTone === 'string' ? raw.emotionalTone : undefined,
    formatPattern: typeof raw.formatPattern === 'string' ? raw.formatPattern : undefined,
    durationPattern: typeof raw.durationPattern === 'string' ? raw.durationPattern : undefined,
    anglePattern: typeof raw.anglePattern === 'string' ? raw.anglePattern : undefined,
    reusablePatterns,
    imitationRisks: raw.imitationRisks.map((r) => {
      const rec = r as Record<string, unknown>;
      return { code: rec.code as ReferenceAnalysisOutputV1['imitationRisks'][number]['code'], summary: String(rec.summary) };
    }),
    productionNotes: raw.productionNotes.filter((x): x is string => typeof x === 'string'),
    originalityGuidance: raw.originalityGuidance.trim(),
  };

  return postprocessReferenceAnalysis(candidate, sourceText);
}

export function parseAndValidateReferenceAnalysisModelText(
  text: string,
  sourceText: string,
): ReferenceAnalysisOutputV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AgentError(ErrorCode.AGENT_INVALID_OUTPUT);
  }
  return validateReferenceAnalysisOutput(parsed, sourceText);
}

export { REFERENCE_PATTERN_TYPES };
