export const RESOLVED_SOURCE_KINDS = [
  'EXISTING_ASSET',
  'AI_IMAGE',
  'AI_VIDEO',
  'DIGITAL_HUMAN',
  'SYSTEM_LIBRARY',
  'PLACEHOLDER_FALLBACK',
] as const;
export type ResolvedSourceKind = (typeof RESOLVED_SOURCE_KINDS)[number];

export const MATERIAL_WARNING_CODES = [
  'SELECTED_ASSET_INVALID',
  'REFERENCE_ASSET_BLOCKED',
  'NO_MATCHING_ASSET',
  'FALLBACK_TO_AI_IMAGE',
  'VIDEO_TOO_SHORT',
  'ASSET_NOT_READY',
  'ORIENTATION_MISMATCH',
  'REPEATED_ASSET',
  'UNSUPPORTED_AI_VIDEO',
  'UNSUPPORTED_DIGITAL_HUMAN',
  'STORAGE_MISSING',
  'WRONG_MEDIA_TYPE',
] as const;
export type MaterialWarningCode = (typeof MATERIAL_WARNING_CODES)[number];

export const MATERIAL_WARNING_LABELS: Record<MaterialWarningCode, string> = {
  SELECTED_ASSET_INVALID: '原先选定的素材已不可用，已自动改用替代方案',
  REFERENCE_ASSET_BLOCKED: '参考素材不会进入成片',
  NO_MATCHING_ASSET: '没有匹配的已有素材，将用 AI 画面补齐',
  FALLBACK_TO_AI_IMAGE: '已改用 AI 图片作为可执行画面',
  VIDEO_TOO_SHORT: '源视频短于镜头时长，将定格补足',
  ASSET_NOT_READY: '素材尚未就绪，已跳过',
  ORIENTATION_MISMATCH: '画面比例与竖屏不完全一致，将裁切适配',
  REPEATED_ASSET: '该素材近期使用较多，仍是当前唯一可用真实画面',
  UNSUPPORTED_AI_VIDEO: 'AI 视频能力尚未配置，未作为执行结果',
  UNSUPPORTED_DIGITAL_HUMAN: '数字人能力尚未配置，未作为执行结果',
  STORAGE_MISSING: '素材文件缺失，已改用替代方案',
  WRONG_MEDIA_TYPE: '该素材类型不能作为画面',
};

export type ResolverAsset = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  type: string;
  status: string;
  mimeType?: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  sourceType: string;
  ownerType?: string;
  referenceOnly: boolean;
  reusable: boolean;
  rightsStatus: string;
  consentStatus: string;
  deletedAt: Date | null;
  storageKey: string;
  usedCount: number;
  lastUsedAt?: Date | string | null;
  libraryVisible?: boolean;
};

export type ResolverShotInput = {
  sequence: number;
  shotPurpose: string;
  requestedDurationMs: number;
  selectedAssetId?: string;
  preferredCandidateIds?: string[];
  originalAudio?: 'preserve' | 'duck' | 'mute';
  voiceover?: boolean;
  subtitle?: boolean;
};

export type ResolvedShotMaterial = {
  sequence: number;
  shotPurpose: string;
  requestedDurationMs: number;
  sourceKind: ResolvedSourceKind;
  assetId?: string;
  assetType?: string;
  generationRequired: boolean;
  generationType?: 'AI_IMAGE';
  fallbackLevel: number;
  originalAudioMode: 'MUTE' | 'PRESERVE' | 'DUCK';
  voiceoverRequired: boolean;
  subtitleRequired: boolean;
  sourceStartMs?: number;
  sourceEndMs?: number;
  freezePadMs?: number;
  fitMode: 'COVER' | 'CONTAIN';
  resolutionWarnings: MaterialWarningCode[];
};

export type MaterialResolutionSnapshot = {
  version: 1;
  generationVersion: string;
  directorPlanHash?: string;
  materialHash: string;
  reusedAssetCount: number;
  generatedShotCount: number;
  shots: ResolvedShotMaterial[];
};

export type MaterialCapabilities = {
  aiImage: boolean;
  aiVideo: boolean;
  digitalHuman: boolean;
};
