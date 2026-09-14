export const VISUAL_SOURCE_TYPES = [
  'TEXT_TO_VIDEO',
  'TEXT_TO_IMAGE',
  'IMAGE_TO_VIDEO',
  'STOCK',
  'USER_ASSET',
  'GENERATED_IMAGE',
  'SOURCE_VIDEO',
  'COLOR_BACKGROUND',
] as const;

export type VisualSourceType = (typeof VISUAL_SOURCE_TYPES)[number];

export type SceneSourceKind = 'hook' | 'opening' | 'section' | 'ending' | 'cta';

export type ProductionScene = {
  sceneId: string;
  sourceSectionSequence: number;
  sourceKind: SceneSourceKind;
  sequence: number;
  narration: string;
  subtitle: string;
  visualSuggestion: string;
  visualPrompt: string;
  visualSourceType: VisualSourceType;
  visualNegativePrompt?: string;
  durationBudget: number;
  transition: 'cut' | 'fade';
};

export type VideoProductionPlan = {
  version: 1;
  scriptId: string;
  videoId: string;
  scriptVersion: number;
  generationVersion: string;
  aspectRatio: string;
  resolution: string;
  fps: number;
  targetDuration: number;
  voice: {
    style: string;
    language: string;
    speed: number;
    text: string;
    resolvedVoiceId?: string;
    voiceProfileId?: string;
    voiceType?: 'SYSTEM' | 'CUSTOM' | 'CLONED';
  };
  scenes: ProductionScene[];
  audio: {
    backgroundMusic: 'none' | 'stock' | 'user';
    volume: number;
  };
  subtitle: {
    style: string;
    position: string;
    format: 'srt';
  };
  output: {
    format: 'mp4';
    codec: 'h264';
  };
};

export type VideoGenerationConfig = {
  voiceStyle?: string;
  visualStyle?: string;
  aspectRatio?: string;
  resolution?: string;
  targetDuration?: number;
  requirements?: string;
  preferredVoiceId?: string;
};

export type PipelineStageName = 'visual' | 'voice' | 'subtitle' | 'compose' | 'quality_check' | 'repair';

export type VisualSceneCheckpointStatus =
  | 'pending'
  | 'submitting'
  | 'submitted'
  | 'polling'
  | 'ready'
  | 'completed'
  | 'failed'
  | 'unknown_billing';

export type VisualSceneCheckpoint = {
  sceneId: string;
  sequence: number;
  status: VisualSceneCheckpointStatus;
  assetId?: string;
  storageKey?: string;
  provider?: string;
  model?: string;
  clientRequestId: string;
  generationVersion: string;
  submittedAt?: string;
  providerRequestId?: string;
  providerTask?: { providerTaskId?: string; status?: string };
  error?: { code?: string; message?: string };
};

export type JobStageCheckpoint = {
  status: 'completed' | 'failed' | 'running';
  assetIds: string[];
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  provider?: string;
  model?: string;
  scenes?: VisualSceneCheckpoint[];
};

export type JobPipelineOutput = {
  currentStage?: string;
  stages: Partial<Record<PipelineStageName, JobStageCheckpoint>>;
  usage: {
    imageCount: number;
    audioCharacters: number;
    audioSeconds: number;
    videoSeconds: number;
    estimatedCost: number;
    visual?: {
      imageCount: number;
      provider: string;
      model?: string;
    };
  };
  timeline?: {
    targetDuration: number;
    voiceDuration?: number;
    composeDuration?: number;
  };
  materialResolution?: import('./material-resolve.types.js').MaterialResolutionSnapshot;
  editingTimeline?: import('./editing-timeline.js').EditingTimelineV1;
  qualityGate?: import('../quality/quality.types.js').QualityCheckpoint;
  final?: {
    assetId: string;
    duration: number;
    completedAt: string;
  };
};
