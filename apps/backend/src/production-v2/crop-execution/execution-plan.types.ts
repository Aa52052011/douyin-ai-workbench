export const FFMPEG_CROP_EXECUTION_PLAN_VERSION = 'ffmpeg.crop-execution-plan:v1' as const;
export const FFMPEG_EXECUTION_VALIDATION_VERSION = 'ffmpeg.execution-validation:v1' as const;

export const PLAN_MODES = ['PREVIEW_ONLY', 'AUTHORIZED'] as const;
export type ExecutionPlanMode = (typeof PLAN_MODES)[number];

export const BACKGROUND_TREATMENTS = [
  'UNRESOLVED',
  'SOLID',
  'BLUR_SOURCE',
  'DUPLICATE_BLUR',
  'STATIC_IMAGE',
  'AI_GENERATED',
  'TRANSPARENT_IF_SUPPORTED',
] as const;
export type BackgroundTreatment = (typeof BACKGROUND_TREATMENTS)[number];

export const EXECUTION_FIT_MODES = ['CROP_SCALE', 'CONTAIN_PAD', 'CROP_SCALE_PAD', 'DIRECT_SCALE_IF_SAME_ASPECT'] as const;
export type ExecutionFitMode = (typeof EXECUTION_FIT_MODES)[number];

export type PixelCropRect = { x: number; y: number; width: number; height: number };

export type FFmpegCropExecutionPlanV1 = {
  schemaVersion: typeof FFMPEG_CROP_EXECUTION_PLAN_VERSION;
  mode: ExecutionPlanMode;
  assetId: string;
  inputPathRef: string;
  outputPathRef: string;
  approvedDecisionRef: string | null;
  source: { width: number; height: number; durationMs?: number; fps?: 'PRESERVE_SOURCE' };
  crop: PixelCropRect | null;
  scale: { width: number; height: number; mode: 'UNIFORM' };
  pad?: {
    enabled: boolean;
    width: number;
    height: number;
    x: number;
    y: number;
    backgroundTreatment: BackgroundTreatment;
  };
  target: { width: 1080; height: 1920; aspectRatio: '9:16' };
  executionFitMode: ExecutionFitMode;
  audioPolicy: 'MUTE_SOURCE_AUDIO';
  pixelFormat: 'yuv420p';
  codecPolicy: 'libx264';
  fpsPolicy: 'PRESERVE_SOURCE';
  durationPreserved: true;
  trim: 'NONE';
  split: false;
  dynamicReframe: false;
  ffmpegFilterGraph: string;
  pixelAlignmentAdjustment: boolean;
  executionAuthorized: boolean;
  productionExecutionAllowed: false | true;
  ffmpegExecuted: false;
  outputFileCreated: false;
  provenance: { candidateId: string; ruleIds: string[] };
};

export type FFmpegExecutionArgsV1 = {
  binaryRef: 'ffmpeg';
  args: string[];
  expectedOutput: string;
  mode: ExecutionPlanMode;
};

export type PlanValidationResult = {
  ok: boolean;
  errors: string[];
  ruleIds: string[];
};

export type FFmpegExecutionValidationResultV1 = {
  schemaVersion: typeof FFMPEG_EXECUTION_VALIDATION_VERSION;
  status: 'NOT_RUN' | 'PASS' | 'FAIL';
  exitCode: null;
  outputExists: false;
  width: null;
  height: null;
  durationWithinTolerance: null;
  videoStreamExists: null;
  audioPolicyRespected: null;
  decodeProbePass: null;
};
