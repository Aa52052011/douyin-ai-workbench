export const SOURCE_VISUAL_TYPE_VERSION = 'source.visual-type:v1' as const;
export const SOURCE_TYPE_EDITORIAL_POLICY_VERSION = 'source-type.editorial-policy:v1' as const;
export const SEMANTIC_COMPOSITION_INTEGRITY_VERSION = 'semantic.composition-integrity:v1' as const;
export const SOURCE_AWARE_EDITORIAL_DIRECTOR_VERSION = 'source-aware.editorial-director:v2' as const;
export const SMART_UI_FIT_VERSION = 'smart-ui-fit:v1' as const;
export const EDITORIAL_FRAME_CONTINUITY_VERSION = 'editorial.frame-continuity:v1' as const;

export const SOURCE_VISUAL_TYPES = [
  'SCREEN_RECORDING_UI_DEMO',
  'CAMERA_HUMAN',
  'OBJECT_PRODUCT_DEMO',
  'GAMEPLAY',
  'SLIDES_PRESENTATION',
  'MIXED',
  'UNKNOWN',
] as const;
export type SourceVisualTypeV1 = (typeof SOURCE_VISUAL_TYPES)[number];

export const SEMANTIC_CONTAINER_TYPES = [
  'PAGE',
  'NAVIGATION_PANEL',
  'CONTENT_PANEL',
  'CARD',
  'SECTION',
  'FORM',
  'TABLE',
  'MODAL',
  'HEADER',
  'TEXT_BLOCK',
  'ACTION_GROUP',
  'STATUS_GROUP',
] as const;
export type SemanticContainerTypeV1 = (typeof SEMANTIC_CONTAINER_TYPES)[number];

export const INTEGRITY_FAIL_CODES = [
  'TEXT_LINE_CUT',
  'TEXT_BLOCK_PARTIALLY_CUT',
  'CARD_PARTIALLY_CUT_WITHOUT_REASON',
  'BUTTON_PARTIALLY_VISIBLE',
  'TABLE_COLUMN_BROKEN',
  'SECTION_TITLE_MISSING',
  'NAV_ITEM_HALF_CUT',
  'IMPORTANT_LABEL_CUT',
  'SEMANTIC_CONTAINER_FRAGMENTED',
] as const;
export type IntegrityFailCode = (typeof INTEGRITY_FAIL_CODES)[number];

export type ShotDecisionKindV2 = 'KEEP_CURRENT_COMPOSITION' | 'WIDE_CONTEXT' | 'MEDIUM_FOCUS' | 'DETAIL_READABLE';
