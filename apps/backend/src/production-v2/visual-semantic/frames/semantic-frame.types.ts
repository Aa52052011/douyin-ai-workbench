import type { FrameSelectionReason } from '../contracts/provider-runtime.types.js';
import type { SemanticFrameErrorCode, SemanticFrameWarningCode } from './semantic-frame-errors.js';

export const SEMANTIC_SELECTION_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;
export type SemanticSelectionPriority = (typeof SEMANTIC_SELECTION_PRIORITIES)[number];

export type SemanticFramePreparationStatus = 'READY' | 'PARTIAL' | 'FAILED';

export type SemanticFrameSelection = {
  frameId: string;
  timestampMs?: number;
  reasons: FrameSelectionReason[];
  priority: SemanticSelectionPriority;
  sourceSignals: string[];
  confidence: number;
  selectionScore: number;
};

export type SemanticFrameSelectionPlan = {
  planId: string;
  assetId: string;
  mediaKind: 'IMAGE' | 'VIDEO';
  strategy: 'HYBRID_SEMANTIC_V1';
  requestedFrameCount: number;
  maxFrameCount: number;
  selectedFrames: SemanticFrameSelection[];
  sourceDurationMs?: number;
  selectionVersion: 'semantic.frame-selection:v1';
  warnings: SemanticFrameWarningCode[];
};

export type SemanticFrameQuality = {
  usable: boolean;
  warnings: SemanticFrameWarningCode[];
  sharpnessHint?: number;
  brightnessHint?: number;
};

export type ExtractedSemanticFrame = {
  frameId: string;
  timestampMs?: number;
  width: number;
  height: number;
  format: 'jpeg';
  mediaRef: { kind: 'LOCAL_REF'; reference: string };
  reasons: FrameSelectionReason[];
  selectionScore: number;
  extractionStatus: 'OK' | 'FAILED';
  warnings: SemanticFrameWarningCode[];
  quality?: SemanticFrameQuality;
  excludedFromProvider?: boolean;
  duplicateOfFrameId?: string;
  actualTimestampMs?: number;
};

export type SemanticFramePreparationResult = {
  status: SemanticFramePreparationStatus;
  selectionPlan: SemanticFrameSelectionPlan;
  extractedFrames: ExtractedSemanticFrame[];
  providerReadyFrames: ExtractedSemanticFrame[];
  excludedFrames: ExtractedSemanticFrame[];
  warnings: SemanticFrameWarningCode[];
  errors: SemanticFrameErrorCode[];
  timing: {
    selectionMs: number;
    extractionMs: number;
    dedupMs: number;
    totalMs: number;
  };
  versions: {
    selection: 'semantic.frame-selection:v1';
    extract: 'semantic.frame-extract:v1';
  };
};

export type SemanticFramePrepInput = {
  assetId: string;
  mediaKind: 'IMAGE' | 'VIDEO';
  mediaPath: string;
  facts?: import('../../visual/deterministic-visual.types.js').DeterministicVisualFacts;
  sourceWidth?: number;
  sourceHeight?: number;
  durationMs?: number;
  manualTimestampsMs?: number[];
  contentHash?: string;
  /** If set, extract only these selected frameIds after B2-2 planning. */
  extractFrameIds?: readonly string[];
};
