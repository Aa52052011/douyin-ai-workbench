export const QUALITY_RULESET_VERSION = 'v1';
export const MAX_QUALITY_REPAIR_ATTEMPTS = 2;
export const MAX_PROVIDER_REPAIR_ACTIONS = 2;
export const DURATION_ABS_TOLERANCE_MS = 500;
export const DURATION_REL_TOLERANCE = 0.05;
export const MAX_SHOT_DURATION_MS = 20_000;
export const MIN_SHOT_DURATION_MS = 400;
export const HOOK_LATE_AFTER_MS = 3_000;
export const OPENING_STATIC_MS = 8_000;
export const SUBTITLE_OVERFLOW_MAX_CHARS = 28;
export const SUBTITLE_OVERFLOW_MAX_LINES = 2;
export const SUBTITLE_EST_FONT_PX = 22;

export const QUALITY_CATEGORIES = [
  'TECHNICAL',
  'TIMELINE',
  'VISUAL',
  'AUDIO',
  'SUBTITLE',
  'CONTENT_ALIGNMENT',
  'PACING',
  'OPENING',
  'CTA',
  'REPETITION',
  'ASSET_QUALITY',
] as const;
export type QualityCategory = (typeof QUALITY_CATEGORIES)[number];

export const QUALITY_SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'BLOCKING'] as const;
export type QualitySeverity = (typeof QUALITY_SEVERITIES)[number];

export const QUALITY_STATUSES = ['PASS', 'FAIL', 'BEST_AVAILABLE'] as const;
export type QualityStatus = (typeof QUALITY_STATUSES)[number];

export const QUALITY_DISPOSITIONS = ['PASS', 'BEST_AVAILABLE', 'BLOCKED'] as const;
export type QualityDisposition = (typeof QUALITY_DISPOSITIONS)[number];

export const QUALITY_ISSUE_CODES = [
  'MEDIA_CORRUPTED',
  'OUTPUT_MISSING',
  'VIDEO_STREAM_MISSING',
  'AUDIO_STREAM_MISSING',
  'DURATION_MISMATCH',
  'RESOLUTION_INVALID',
  'FPS_INVALID',
  'TIMELINE_GAP',
  'SOURCE_RANGE_INVALID',
  'ASSET_MISSING',
  'ASSET_REVOKED',
  'REFERENCE_ASSET_USED',
  'SUBTITLE_OVERFLOW_RISK',
  'SUBTITLE_OUT_OF_RANGE',
  'SUBTITLE_TOO_DENSE',
  'VOICE_DURATION_MISMATCH',
  'HOOK_NOT_EARLY',
  'OPENING_TOO_STATIC',
  'SHOT_TOO_LONG',
  'SHOT_TOO_SHORT',
  'CTA_MISSING',
  'REPEATED_ASSET',
  'LOW_ASSET_DIVERSITY',
  'PACING_INCONSISTENT',
  'QUALITY_GATE_ERROR',
] as const;
export type QualityIssueCode = (typeof QUALITY_ISSUE_CODES)[number];

export const HARD_BLOCK_CODES: readonly QualityIssueCode[] = [
  'MEDIA_CORRUPTED',
  'OUTPUT_MISSING',
  'VIDEO_STREAM_MISSING',
  'AUDIO_STREAM_MISSING',
  'TIMELINE_GAP',
  'REFERENCE_ASSET_USED',
  'ASSET_REVOKED',
  'ASSET_MISSING',
  'QUALITY_GATE_ERROR',
];

export const REPAIR_ACTION_TYPES = [
  'REBUILD_TIMELINE',
  'REPLACE_SHOT_ASSET',
  'REGENERATE_AI_IMAGE',
  'REBUILD_SUBTITLE',
  'REGENERATE_VOICE',
  'ADJUST_SHOT_DURATION',
  'ADJUST_AUDIO_MODE',
  'RECOMPOSE',
  'MARK_BEST_AVAILABLE',
] as const;
export type RepairActionType = (typeof REPAIR_ACTION_TYPES)[number];

export const REPAIR_SCOPES = ['SHOT', 'SUBTITLE', 'VOICE', 'TIMELINE', 'COMPOSE', 'GLOBAL'] as const;
export type RepairScope = (typeof REPAIR_SCOPES)[number];

export type QualityCheckItem = {
  code: string;
  passed: boolean;
  durationMs?: number;
};

export type QualityIssue = {
  code: QualityIssueCode;
  category: QualityCategory;
  severity: QualitySeverity;
  scope: RepairScope;
  shotSequence?: number;
  assetId?: string;
  startMs?: number;
  endMs?: number;
  message: string;
  repairable: boolean;
  suggestedRepairType?: RepairActionType;
  deterministic: boolean;
  evidence?: Record<string, string | number | boolean>;
};

export type ProductionQualityResult = {
  version: typeof QUALITY_RULESET_VERSION;
  status: QualityStatus;
  overallScore?: number;
  checkedAt: string;
  checks: QualityCheckItem[];
  issues: QualityIssue[];
  repairableIssueCount: number;
  blockingIssueCount: number;
  attempt: number;
  finalDisposition: QualityDisposition;
  qualityInputHash: string;
  durationMs: number;
};

export type RepairAction = {
  type: RepairActionType;
  scope: RepairScope;
  shotSequence?: number;
  assetId?: string;
  issueCodes: QualityIssueCode[];
  requiresProvider: boolean;
};

export type RepairPlan = {
  attempt: number;
  actions: RepairAction[];
  estimatedScope: RepairScope;
  requiresProvider: boolean;
  requiresRecompose: boolean;
  expectedIssueCodes: QualityIssueCode[];
  fallbackIfFailed: QualityDisposition;
};

export type RepairHistoryEntry = {
  attempt: number;
  issueFingerprints: string[];
  actions: RepairActionType[];
  beforeHash: string;
  afterHash: string;
  result: QualityStatus | 'EXECUTED' | 'SKIPPED_SAME_ERROR';
  providerCalls: number;
  durationMs: number;
};

export type QualityCheckpoint = {
  rulesetVersion: typeof QUALITY_RULESET_VERSION;
  qualityInputHash: string;
  latestQualityResult?: ProductionQualityResult;
  qualityChecks: ProductionQualityResult[];
  repairHistory: RepairHistoryEntry[];
  qualityDisposition?: QualityDisposition;
};

export type QualityPublicView = {
  statusLabel: string;
  autoRepairCount: number;
  summary: string[];
  bestAvailable: boolean;
  completedAt: string | null;
  legacy?: boolean;
};

export type QualityMediaProbe = {
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  fps?: number;
};

export type QualityAssetSnapshot = {
  id: string;
  tenantId: string;
  type: string;
  status: string;
  referenceOnly: boolean;
  rightsStatus?: string;
  consentStatus?: string;
  deletedAt?: Date | null;
  duration?: number | null;
  exists: boolean;
};

export type QualityCheckInput = {
  qualityInputHash: string;
  attempt: number;
  composeProvider?: string;
  fileExists: boolean;
  storageExists: boolean;
  probe: QualityMediaProbe | null;
  probeFailed: boolean;
  expectedWidth: number;
  expectedHeight: number;
  expectedFps: number;
  targetDurationSec: number;
  voiceDurationSec: number;
  timelineDurationMs: number;
  voiceExpected: boolean;
  hasCtaInPlan: boolean;
  contentOverlap?: boolean;
  timeline?: {
    durationMs: number;
    tracks: {
      visual: Array<{
        sequence: number;
        startMs: number;
        endMs: number;
        assetId?: string;
        assetType: string;
        sourceStartMs?: number;
        sourceEndMs?: number;
        sourceKindLabel?: string;
        purpose?: string;
      }>;
      voice: Array<{ assetId?: string }>;
      subtitle: Array<{ assetId?: string }>;
    };
  };
  assets: QualityAssetSnapshot[];
  subtitleCues: Array<{ start: number; end: number; text: string }>;
  canvasWidth: number;
};
