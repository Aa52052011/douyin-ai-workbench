export const DYNAMIC_PREVIEW_RENDER_CONFIG = {
  reviewWidth: 720,
  reviewHeight: 1280,
  productionWidth: 1080,
  productionHeight: 1920,
  codec: 'libx264',
  pixelFormat: 'yuv420p',
  crf: 20,
  preset: 'medium',
  scaler: 'lanczos',
  fps: 30,
  audioPolicy: 'MUTE_SOURCE_AUDIO' as const,
  productionUsable: false as const,
  previewUpscaleAllowed: false as const,
  productionSourcePolicy: 'DIRECT_FROM_ORIGINAL_SOURCE' as const,
  backgroundMode: 'BLUR_SOURCE_DARKENED' as const,
  blurLuma: 20,
  blurChroma: 20,
  bgBrightness: -0.18,
  timeoutMs: 180_000,
  previewVersion: 'dynamic-preview:runtime-1',
  planVersion: 'dynamic.reframe-plan:v1',
} as const;

export const DYNAMIC_UAT_CHECKLIST = [
  'PRODUCT_UI_SCALE_ACCEPTABLE',
  'KEY_TEXT_READABLE_ON_DOUYIN_DEFAULT_MOBILE_VIEW',
  'DYNAMIC_FOCUS_SEMANTICALLY_CORRECT',
  'TRANSITIONS_NOT_MECHANICAL',
  'BACKGROUND_SEPARATION_ACCEPTABLE',
  'TEMPORAL_STABILITY_ACCEPTABLE',
  'TRUTH_PRESERVED',
] as const;

export const FROZEN_TEXT_REGION = { x: 0.22, y: 0.12, width: 0.4, height: 0.06 } as const;
