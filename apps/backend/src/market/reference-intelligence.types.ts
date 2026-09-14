/**
 * Step 13.6 — Reference Intelligence types (structure learning, not copy).
 */

export const REFERENCE_ANALYSIS_OUTPUT_VERSION = 'v1' as const;
export const REFERENCE_ANALYSIS_AGENT_VERSION = 'v1';

export const REFERENCE_PATTERN_TYPES = [
  'HOOK',
  'NARRATIVE',
  'PACING',
  'SHOT_STRUCTURE',
  'SUBTITLE_STYLE',
  'VISUAL_STYLE',
  'CTA',
  'EMOTION',
  'FORMAT',
  'ANGLE',
  'DURATION',
  'CONTENT_FLOW',
] as const;

export type ReferencePatternType = (typeof REFERENCE_PATTERN_TYPES)[number];

export const IMITATION_RISK_CODES = [
  'TOO_CLOSE_TO_ORIGINAL',
  'DIRECT_TEXT_COPY',
  'DIRECT_SHOT_COPY',
  'THIRD_PARTY_FACE',
  'THIRD_PARTY_VOICE',
  'UNAUTHORIZED_MEDIA_USE',
] as const;

export type ImitationRiskCode = (typeof IMITATION_RISK_CODES)[number];

export const REFERENCE_CONTEXT_LIMITS = {
  maxReferences: 3,
  maxPatternsPerType: 2,
  maxPatternsTotal: 10,
  maxSummaryChars: 120,
} as const;

/** Forbidden exact-copy fields that must never enter reusable patterns / script context. */
export const REFERENCE_FORBIDDEN_COPY_KEYS = [
  'exactTitle',
  'exactScript',
  'exactShots',
  'exactVoice',
  'exactAvatar',
  'originalTranscript',
  'copiedNarration',
  'verbatimQuote',
] as const;

export type ReferencePatternItem = {
  patternType: ReferencePatternType;
  key: string;
  summary: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type ImitationRiskItem = {
  code: ImitationRiskCode;
  summary: string;
};

export type ReferenceAnalysisOutputV1 = {
  version: typeof REFERENCE_ANALYSIS_OUTPUT_VERSION;
  referenceSummary: string;
  hookPattern?: string;
  narrativePattern?: string;
  pacingPattern?: string;
  shotPattern?: string;
  subtitlePattern?: string;
  visualPattern?: string;
  ctaPattern?: string;
  emotionalTone?: string;
  formatPattern?: string;
  durationPattern?: string;
  anglePattern?: string;
  reusablePatterns: ReferencePatternItem[];
  imitationRisks: ImitationRiskItem[];
  productionNotes: string[];
  originalityGuidance: string;
};

export type ReferenceAnalysisAgentInput = {
  referenceContentId: string;
  platform?: string | null;
  sourceType: string;
  reasonForReference?: string | null;
  userNote?: string | null;
  title?: string | null;
  assetMetadata?: {
    type?: string | null;
    mimeType?: string | null;
    duration?: number | null;
    width?: number | null;
    height?: number | null;
    size?: number | null;
    originalFilename?: string | null;
  };
  availableText?: string;
  availableTranscript?: string;
  availableDescription?: string;
};

export type CompactReferencePattern = {
  id: string;
  patternType: string;
  typeLabel: string;
  summary: string;
  confidence: string;
  sourceLabel: string;
  referenceContentId: string;
};

export type ReferenceContextView = {
  referenceIds: string[];
  patterns: CompactReferencePattern[];
  warnings: string[];
  sourceCount: number;
  contextSummary: string;
  originalityGuidance: string;
};
