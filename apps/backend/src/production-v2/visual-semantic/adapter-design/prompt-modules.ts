export const VISUAL_SEMANTIC_PROMPT_MODULE_VERSIONS = {
  BASE: 'visual.semantic.base:v1',
  UI_STRUCTURE: 'visual.semantic.ui-structure:v2',
  UI_STRUCTURE_V1: 'visual.semantic.ui-structure:v1',
  AUTHENTICITY: 'visual.semantic.authenticity:v1',
  PRIVACY: 'visual.semantic.privacy:v1',
  WATERMARK: 'visual.semantic.watermark:v1',
  DEV_ARTIFACT: 'visual.semantic.dev-artifact:v1',
  TEXT_EVIDENCE: 'visual.semantic.text-evidence:v1',
  EVIDENCE: 'visual.semantic.evidence:v1',
} as const;

export const FUTURE_VISION_ENV_KEYS = [
  'VISUAL_SEMANTIC_PROVIDER_ENABLED',
  'VISUAL_SEMANTIC_PROVIDER',
  'VISUAL_SEMANTIC_MODEL',
  'VISUAL_SEMANTIC_FALLBACK_MODEL',
] as const;

export const VISION_TIMEOUT_RECOMMENDATION = {
  singleImagePrimaryMs: 45_000,
  multiFramePrimaryMs: 90_000,
  backupMs: 60_000,
  repairReserveMs: 15_000,
  totalCeilingMs: 150_000,
  note: 'Design recommendation only. Do not write .env in B2-3.',
} as const;
