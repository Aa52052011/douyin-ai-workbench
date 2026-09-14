export const SOURCE_AWARE_OUTPUT_PROFILE_VERSION = 'source-aware.output-profile:v1' as const;
export const PRODUCTION_OUTPUT_PROFILE_VERSION = 'production.output-profile:v1' as const;
export const DUAL_OUTPUT_RECOMMENDATION_VERSION = 'dual-output.recommendation:v1' as const;

export const OUTPUT_ASPECT_MODES = [
  'VERTICAL_FEED_9_16',
  'LANDSCAPE_FULLSCREEN_16_9',
  'DUAL_VERTICAL_AND_LANDSCAPE',
  'SOURCE_NATIVE',
] as const;
export type OutputAspectModeV1 = (typeof OUTPUT_ASPECT_MODES)[number];

export const DUAL_OUTPUT_DECISIONS = ['VERTICAL_ONLY', 'LANDSCAPE_ONLY', 'DUAL_RECOMMENDED', 'HUMAN_DECISION_REQUIRED'] as const;
export type DualOutputDecisionV1 = (typeof DUAL_OUTPUT_DECISIONS)[number];

export type ProductionOutputProfileV1 = {
  schemaVersion: typeof PRODUCTION_OUTPUT_PROFILE_VERSION;
  profileId: string;
  aspectMode: OutputAspectModeV1;
  width: number;
  height: number;
  codec: 'libx264';
  qualityPolicy: { crf: number; pixelFormat: 'yuv420p'; fps: number; audio: 'none' };
  sourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE';
  platformIntent: string;
  fullscreenBehavior: {
    portraitContentInLandscapePlayer: boolean;
    landscapeFullscreenFillExpected: boolean;
  };
  productionUsable: false;
};

export const VERTICAL_DOUYIN_PROFILE: ProductionOutputProfileV1 = {
  schemaVersion: PRODUCTION_OUTPUT_PROFILE_VERSION,
  profileId: 'production.vertical.douyin:v1',
  aspectMode: 'VERTICAL_FEED_9_16',
  width: 1080,
  height: 1920,
  codec: 'libx264',
  qualityPolicy: { crf: 18, pixelFormat: 'yuv420p', fps: 30, audio: 'none' },
  sourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE',
  platformIntent: 'VERTICAL_FEED',
  fullscreenBehavior: {
    portraitContentInLandscapePlayer: true,
    landscapeFullscreenFillExpected: false,
  },
  productionUsable: false,
};

export const LANDSCAPE_UI_DEMO_PROFILE: ProductionOutputProfileV1 = {
  schemaVersion: PRODUCTION_OUTPUT_PROFILE_VERSION,
  profileId: 'production.landscape.ui-demo:v1',
  aspectMode: 'LANDSCAPE_FULLSCREEN_16_9',
  width: 1920,
  height: 1080,
  codec: 'libx264',
  qualityPolicy: { crf: 18, pixelFormat: 'yuv420p', fps: 30, audio: 'none' },
  sourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE',
  platformIntent: 'LANDSCAPE_FULLSCREEN',
  fullscreenBehavior: {
    portraitContentInLandscapePlayer: false,
    landscapeFullscreenFillExpected: true,
  },
  productionUsable: false,
};

export const SOURCE_AWARE_OUTPUT_PROFILES = {
  schemaVersion: SOURCE_AWARE_OUTPUT_PROFILE_VERSION,
  universalHardResolution: false,
  modes: OUTPUT_ASPECT_MODES,
  vertical: VERTICAL_DOUYIN_PROFILE,
  landscape: LANDSCAPE_UI_DEMO_PROFILE,
} as const;

export type DualOutputRecommendationV1 = {
  schemaVersion: typeof DUAL_OUTPUT_RECOMMENDATION_VERSION;
  sourceVisualType: string;
  sourceAspectRatio: number;
  uiDensity: 'HIGH' | 'MEDIUM' | 'LOW';
  textDensity: 'HIGH' | 'MEDIUM' | 'LOW';
  verticalReadability: 'REDUCED_BY_WHOLE_PAGE_FIT' | 'ACCEPTABLE';
  landscapeReadability: 'NEAR_NATIVE_PIXELS' | 'UNKNOWN';
  fullscreenNeed: 'LIKELY' | 'OPTIONAL';
  platformMode: 'UNDECIDED';
  preferredEvaluation: OutputAspectModeV1;
  autoRecommendation: DualOutputDecisionV1;
  locked: false;
};

export function recommendOutputForSourceType(input: {
  sourceVisualType: string;
  sourceWidth: number;
  sourceHeight: number;
}): DualOutputRecommendationV1 {
  const sourceAspectRatio = input.sourceWidth / input.sourceHeight;
  const uiDemo = input.sourceVisualType === 'SCREEN_RECORDING_UI_DEMO';
  return {
    schemaVersion: DUAL_OUTPUT_RECOMMENDATION_VERSION,
    sourceVisualType: input.sourceVisualType,
    sourceAspectRatio,
    uiDensity: uiDemo ? 'HIGH' : 'MEDIUM',
    textDensity: uiDemo ? 'HIGH' : 'MEDIUM',
    verticalReadability: uiDemo ? 'REDUCED_BY_WHOLE_PAGE_FIT' : 'ACCEPTABLE',
    landscapeReadability: uiDemo ? 'NEAR_NATIVE_PIXELS' : 'UNKNOWN',
    fullscreenNeed: uiDemo ? 'LIKELY' : 'OPTIONAL',
    platformMode: 'UNDECIDED',
    preferredEvaluation: uiDemo ? 'DUAL_VERTICAL_AND_LANDSCAPE' : 'VERTICAL_FEED_9_16',
    autoRecommendation: uiDemo ? 'DUAL_RECOMMENDED' : 'HUMAN_DECISION_REQUIRED',
    locked: false,
  };
}

export function landscapeFillStrategy(sourceWidth: number, sourceHeight: number, targetWidth = 1920, targetHeight = 1080) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const fgWidth = Math.round(sourceWidth * scale);
  const fgHeight = Math.round(sourceHeight * scale);
  const stretched = sourceWidth / sourceHeight !== fgWidth / fgHeight && Math.abs(sourceWidth / sourceHeight - fgWidth / fgHeight) > 1e-6;
  return {
    strategy: 'SCALE_TO_FIT_PLUS_PAD' as const,
    scale,
    fgWidth,
    fgHeight,
    padX: Math.floor((targetWidth - fgWidth) / 2),
    padY: Math.floor((targetHeight - fgHeight) / 2),
    stretch: false,
    stretched,
  };
}

export function buildLandscapeCalibrationFilter(sourceEndSec: number): { filter: string; stretch: false } {
  const end = sourceEndSec.toFixed(3);
  const filter = `[0:v]trim=start=0:end=${end},setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,setpts=PTS-STARTPTS[outv]`;
  return { filter, stretch: false };
}

export function landscapeFfmpegArgs(inputPath: string, outputPath: string, filter: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    '-filter_complex',
    filter,
    '-map',
    '[outv]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}
