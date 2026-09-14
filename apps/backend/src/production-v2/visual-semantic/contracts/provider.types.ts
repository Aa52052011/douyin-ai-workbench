import type { VisualSemanticResult } from './result.types.js';

export const VISUAL_SEMANTIC_PROMPT_MODULES = [
  'BASE',
  'UI_STRUCTURE',
  'AUTHENTICITY',
  'PRIVACY',
  'WATERMARK',
  'PROJECT_RELEVANCE',
  'EVIDENCE',
] as const;
export type VisualSemanticPromptModule = (typeof VISUAL_SEMANTIC_PROMPT_MODULES)[number];

export type SemanticImageInput = {
  assetId: string;
  contentHash: string;
  /** Higher-resolution semantic frame; never B1 96px statistics frame. */
  imageRef: string;
  promptModules: VisualSemanticPromptModule[];
};

export type SemanticVideoFramesInput = {
  assetId: string;
  contentHash: string;
  frames: Array<{ frameId: string; timestampMs: number; imageRef: string }>;
  promptModules: VisualSemanticPromptModule[];
};

/**
 * B2 design stub (Layer B result). Runtime provider is `VisualSemanticProvider`
 * in `provider/visual-semantic-provider.ts` and returns `VisualSemanticProviderResult`.
 */
export type DesignedVisualSemanticAdapter = {
  analyzeImage(input: SemanticImageInput): Promise<VisualSemanticResult>;
  analyzeVideoFrames(input: SemanticVideoFramesInput): Promise<VisualSemanticResult>;
};

export type DesignedSemanticFrameSelectionPlan = {
  schemaVersion: 'semantic.frame-selection:v1';
  sourceUses: ['SEMANTIC_FRAME_EXTRACT'];
  neverUse: ['ANALYSIS_FRAME_SAMPLE'];
  sources: Array<'UNIFORM_SAMPLES' | 'SCENE_CANDIDATES' | 'MOTION_TRANSITIONS' | 'LONG_STATIC_REPRESENTATIVE' | 'MANUAL_KEYFRAME'>;
  dedup: 'B1_NEAR_DUPLICATE_HINT_ONLY';
  budgetGuideline: {
    shortVideoFrames: '3-6';
    longerVideoFrames: '6-12';
  };
  prefer: ['SCENE_BOUNDARIES', 'ACTIVITY_CHANGE', 'REPRESENTATIVE_STATIC'];
};

export type SemanticCacheKeyDesign = {
  contentHash: true;
  semanticProviderFamily: true;
  semanticPromptVersion: true;
  frameSelectionVersion: true;
  semanticSchemaVersion: true;
  notAssetIdAlone: true;
};

export type ProjectEvaluationCacheKeyDesign = {
  contentHash: true;
  projectId: true;
  planId?: true;
  scriptId?: true;
  contextSchemaVersion: true;
  notContentHashAlone: true;
};
