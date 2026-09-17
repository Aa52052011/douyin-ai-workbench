export const VIDEO_PIPELINE_STAGES = ["visual", "voice", "subtitle", "compose", "finalize"] as const;
export type VideoPipelineStage = (typeof VIDEO_PIPELINE_STAGES)[number];

export type VideoJobRecord = {
  status?: string;
  progress?: number;
  output?: unknown;
  error?: unknown;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type VideoAssetRecord = {
  id?: string;
  type?: string;
  status?: string;
  mimeType?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  contentPath?: string;
};

export type VideoRecord = {
  id: string;
  projectId?: string;
  scriptId?: string | null;
  scriptTitle?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
  job?: VideoJobRecord | null;
  outputAsset?: VideoAssetRecord | null;
  landscapeAsset?: VideoAssetRecord | null;
  finalAcceptance?: VideoFinalAcceptanceRecord | null;
};

export type VideoFinalAcceptanceRecord = {
  id: string;
  current: boolean;
  acceptedArtifactId: string;
  variant: string;
  status: string;
  acceptedAt?: string;
};

export type VideoStageView = {
  key: VideoPipelineStage;
  label: string;
  state: "done" | "current" | "pending" | "failed";
};

export type VideoHistoryItemView = {
  title: string;
  createdAtLabel: string;
  statusLabel: string;
  durationLabel: string;
  readable: boolean;
  versionLabel?: string;
};

export type VideoView = {
  title: string;
  statusLabel: string;
  durationLabel: string;
  createdAtLabel: string;
  sourceScriptTitle: string;
  currentStageLabel: string;
  stages: VideoStageView[];
  progressPercent: number | null;
  startedAtLabel: string;
  completedAtLabel: string;
  failedStageLabel: string;
  failureMessage: string;
  qualityLabel?: string;
  qualitySummary: string[];
};

export const VIDEO_RAW_CONTRACT_TERMS = [
  "JobProcessor",
  "ProductionPlan",
  "storageKey",
  "BullMQ",
  "AssetRecord",
  "providerRequestId",
  "sourceJobId",
  "outputAssetId",
] as const;
