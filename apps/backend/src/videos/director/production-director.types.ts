/**
 * Step 13.7 — Production Director foundation types (planning only; no media execution).
 */

export const PRODUCTION_DIRECTOR_VERSION = 'v1' as const;

export const PRODUCTION_MODES = [
  'REAL_FOOTAGE',
  'DIGITAL_HUMAN_BROLL',
  'VOICEOVER_ASSETS',
  'AI_ASSISTED',
  'HYBRID',
] as const;
export type ProductionMode = (typeof PRODUCTION_MODES)[number];

export const SHOT_PURPOSES = [
  'HOOK',
  'PROBLEM',
  'EXPLANATION',
  'PROOF',
  'DEMO',
  'CASE',
  'TRANSITION',
  'CTA',
  'OTHER',
] as const;
export type ShotPurpose = (typeof SHOT_PURPOSES)[number];

export const MATERIAL_SOURCES = [
  'CURRENT_UPLOAD',
  'USER_LIBRARY',
  'PROJECT_HISTORY',
  'GENERATED_REUSABLE',
  'SYSTEM_LIBRARY',
  'AI_IMAGE',
  'AI_VIDEO',
  'DIGITAL_HUMAN',
] as const;
export type MaterialSource = (typeof MATERIAL_SOURCES)[number];

export const VOICE_STRATEGIES = [
  'SYSTEM_VOICE',
  'CUSTOM_VOICE',
  'CLONED_VOICE',
  'ORIGINAL_AUDIO',
  'DIGITAL_HUMAN_VOICE',
] as const;
export type VoiceStrategy = (typeof VOICE_STRATEGIES)[number];

export const SUBTITLE_STRATEGIES = ['STANDARD', 'DYNAMIC_SHORT_LINES', 'KEYWORD_EMPHASIS'] as const;
export type SubtitleStrategy = (typeof SUBTITLE_STRATEGIES)[number];

export const PACING_STRATEGIES = ['FAST', 'MEDIUM', 'SLOW', 'MIXED'] as const;
export type PacingStrategy = (typeof PACING_STRATEGIES)[number];

export const DIRECTOR_WARNING_CODES = [
  'NO_MATCHING_REAL_ASSET',
  'DIGITAL_HUMAN_UNAVAILABLE',
  'AI_VIDEO_UNAVAILABLE',
  'LOW_ASSET_DIVERSITY',
  'REFERENCE_ONLY_ASSET_SKIPPED',
  'FALLBACK_DIRECTOR_USED',
  'PREFERRED_MODE_UNAVAILABLE',
  'VOICE_CLONE_UNAVAILABLE',
  'VOICE_SELECTION_FALLBACK',
] as const;
export type DirectorWarningCode = (typeof DIRECTOR_WARNING_CODES)[number];

export const MODE_LABELS: Record<ProductionMode, string> = {
  REAL_FOOTAGE: '真人/实拍素材为主',
  DIGITAL_HUMAN_BROLL: '数字人口播 + 辅助画面',
  VOICEOVER_ASSETS: '旁白 + 素材画面',
  AI_ASSISTED: 'AI 画面辅助',
  HYBRID: '混合制作',
};

export const PURPOSE_LABELS: Record<ShotPurpose, string> = {
  HOOK: '开场抓注意力',
  PROBLEM: '痛点/问题',
  EXPLANATION: '解释说明',
  PROOF: '证明/信任',
  DEMO: '演示',
  CASE: '案例',
  TRANSITION: '过渡',
  CTA: '行动号召',
  OTHER: '其它',
};

export const SOURCE_LABELS: Record<MaterialSource, string> = {
  CURRENT_UPLOAD: '本次上传',
  USER_LIBRARY: '用户素材库',
  PROJECT_HISTORY: '项目历史素材',
  GENERATED_REUSABLE: '已生成可复用素材',
  SYSTEM_LIBRARY: '系统素材',
  AI_IMAGE: 'AI 图片',
  AI_VIDEO: 'AI 视频（预留）',
  DIGITAL_HUMAN: '数字人（预留）',
};

export const WARNING_LABELS: Record<DirectorWarningCode, string> = {
  NO_MATCHING_REAL_ASSET: '缺少匹配的真实素材，将使用可执行替代方案',
  DIGITAL_HUMAN_UNAVAILABLE: '数字人能力尚未接入，已自动改用当前可执行方案',
  AI_VIDEO_UNAVAILABLE: 'AI 视频能力尚未接入，已自动改用当前可执行方案',
  LOW_ASSET_DIVERSITY: '可用素材种类较少，画面多样性可能有限',
  REFERENCE_ONLY_ASSET_SKIPPED: '参考素材仅用于学习结构，不会进入成片',
  FALLBACK_DIRECTOR_USED: '已使用系统默认制作方案，保证可继续生产',
  PREFERRED_MODE_UNAVAILABLE: '偏好制作方式暂不可用，已切换到可执行方案',
  VOICE_CLONE_UNAVAILABLE: '声音克隆服务尚未配置，已改用系统旁白',
  VOICE_SELECTION_FALLBACK: '所选声音不可用，已改用系统默认旁白',
};

export type AssetCandidateView = {
  assetId: string;
  mediaType: string;
  sourceLabel: string;
  sourceType?: string;
  duration: number | null;
  orientation: 'portrait' | 'landscape' | 'square' | 'unknown';
  usageSummary: string;
  qualityHint?: string;
  usedCount: number;
  lastUsedAt?: string | null;
  referenceOnly: boolean;
  reusable: boolean;
  rightsStatus: string;
};

export type ProductionPreferences = {
  preferRealFootage?: boolean;
  preferDigitalHuman?: boolean;
  preferLowCost?: boolean;
  allowAiVideo?: boolean;
  allowAiImage?: boolean;
  allowDigitalHuman?: boolean;
  lockPreferredAssets?: boolean;
  preferredVoiceId?: string;
  preferredDigitalHumanProfileId?: string;
};

export type DirectorShot = {
  sequence: number;
  purpose: ShotPurpose;
  durationMs: number;
  narrationSegment: string;
  visualRequirement: string;
  preferredSource: MaterialSource;
  fallbackSources: MaterialSource[];
  preferredCandidateIds?: string[];
  selectedAssetId?: string;
  generationInstruction?: string;
  digitalHuman?: boolean;
  originalAudio?: 'preserve' | 'duck' | 'mute';
  voiceover?: boolean;
  subtitle?: boolean;
  transitionHint?: 'cut' | 'fade';
  qualityRequirement?: string;
  shootingGuidance?: {
    optional: true;
    shotDescription: string;
    duration: number;
    framing: string;
    action: string;
    dialogue?: string;
  };
};

export type ProductionDirectorOutput = {
  directorVersion: typeof PRODUCTION_DIRECTOR_VERSION;
  mode: ProductionMode;
  rationale: string;
  targetDuration: number;
  aspectRatio: string;
  voiceStrategy: VoiceStrategy;
  voiceId?: string;
  voiceProfileId?: string;
  digitalHumanProfileId?: string;
  subtitleStrategy: SubtitleStrategy;
  pacingStrategy: PacingStrategy;
  visualStrategy: string;
  shots: DirectorShot[];
  fallbackPolicy: {
    summary: string;
    onMissingAsset: MaterialSource[];
    onUnavailableCapability: string;
  };
  qualityTargets: {
    openingImpact: string;
    visualContinuity: string;
    assetAuthenticity: string;
    subtitleReadability: string;
    pacingConsistency: string;
  };
  productionWarnings: Array<{ code: DirectorWarningCode; message: string }>;
  shootingGuidanceSummary?: string;
  referencePatternIds: string[];
  contextSnapshot: {
    scriptId: string;
    scriptVersion: number;
    goalCode?: string;
    strategyId?: string;
    contentPlanId?: string;
    topicId?: string;
    memorySnapshotVersion?: number;
    referencePatternIds: string[];
    assetCandidateIds: string[];
    capabilityVersion: string;
    contextHash: string;
  };
  status: 'READY' | 'FAILED';
};

export type ProductionDirectorPublicView = {
  mode: string;
  modeLabel: string;
  rationale: string;
  targetDuration: number;
  shotCount: number;
  voiceStrategyLabel: string;
  subtitleStrategyLabel: string;
  pacingStrategyLabel: string;
  visualStrategy: string;
  sourceOverview: string[];
  warnings: string[];
  shootingGuidance: Array<{
    optional: true;
    shotDescription: string;
    duration: number;
    framing: string;
    action: string;
  }>;
  fallbackSummary: string;
  referencePatternCount: number;
  status: string;
  directorVersion: string;
  contextHash: string;
  generationVersion?: string;
};

export const DIRECTOR_LIMITS = {
  maxShots: 30,
  minShots: 1,
  maxAssetCandidates: 30,
  maxReferencePatterns: 10,
  durationToleranceRatio: 0.15,
  maxRationaleChars: 280,
} as const;
