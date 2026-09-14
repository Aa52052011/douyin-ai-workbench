import { VISUAL_REPAIR_PLAN_VERSION, type VisualRepairPlanV1 } from './types.js';

export const REQUIRED_REPAIR_CHANGES = [
  'INCREASE_FOREGROUND_UI_SCALE',
  'MAKE_KEY_TEXT_MOBILE_READABLE',
  'INTRODUCE_SEMANTIC_LOCAL_FOCUS',
  'HANDLE_TEMPORAL_UI_STATE_CHANGES',
  'IMPROVE_FOREGROUND_BACKGROUND_SEPARATION',
] as const;

export const PROHIBITED_REPAIR_CHANGES = [
  'NO_FAKE_UI',
  'NO_TEXT_REGENERATION_AS_EVIDENCE',
  'NO_TRUTH_DISTORTION',
  'NO_UNSAFE_CROP',
  'NO_APPROVAL_BYPASS',
] as const;

export const BACKGROUND_REPAIR_OPTIONS = [
  'STRONGER_BLUR_SOURCE',
  'DARKER_TINTED_BLUR',
  'NEUTRAL_SOLID',
  'SUBTLE_CONTRAST_LAYER',
] as const;

export function buildVisualRepairPlan(sourceFeedbackRef: string): VisualRepairPlanV1 {
  return {
    schemaVersion: VISUAL_REPAIR_PLAN_VERSION,
    sourceFeedbackRef,
    repairType: 'DYNAMIC_REFRAME',
    requiredChanges: [...REQUIRED_REPAIR_CHANGES],
    prohibitedChanges: [...PROHIBITED_REPAIR_CHANGES],
    reanalysisRequired: false,
    executionRequired: false,
    humanReviewRequiredAfterRepair: true,
    backgroundDecisionDeferred: true,
    provenance: { source: 'EXPLICIT_USER_MESSAGE', visionCalls: 0, llmCalls: 0 },
  };
}
