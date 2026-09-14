export const VISUAL_SEMANTIC_SCHEMA = 'visual.semantic:v1';
export const VISUAL_SEMANTIC_PROVIDER_REQUEST_SCHEMA = 'visual.semantic.provider-request:v1';
export const VISUAL_SEMANTIC_PROVIDER_RESULT_SCHEMA = 'visual.semantic.provider-result:v1';
export const VISUAL_SEMANTIC_OBSERVATION_SCHEMA = 'visual.semantic.observation:v1';
export const VISUAL_SEMANTIC_BASE_PROMPT_VERSION = 'visual.semantic.base:v1';
export const VISUAL_CONTEXT_SCHEMA = 'visual.context:v1';
export const VISUAL_HYBRID_SCHEMA = 'visual.hybrid:v1';
export const SEMANTIC_CROP_CANDIDATE_SCHEMA = 'semantic.crop-candidate:v1';
export const CROP_SAFETY_SCHEMA = 'crop.safety:v1';
export const CROP_COMPARISON_SCHEMA = 'crop.comparison:v1';
export const DIRECTOR_CROP_CONTRACT_SCHEMA = 'director.crop-contract:v1';
export const DIRECTOR_VISUAL_POLICY_SCHEMA = 'production.director-visual-policy:v1';
export const CROP_SELECTION_DRYRUN_SCHEMA = 'crop.selection-dryrun:v1';
export const CROP_DECISION_REVIEW_SCHEMA = 'crop.decision-review:v1';
export const CROP_HUMAN_APPROVAL_SCHEMA = 'crop.human-approval:v1';
export const FFMPEG_CROP_EXECUTION_PLAN_SCHEMA = 'ffmpeg.crop-execution-plan:v1';
export const FFMPEG_EXECUTION_VALIDATION_SCHEMA = 'ffmpeg.execution-validation:v1';
export const CROP_REVIEW_SESSION_SCHEMA = 'crop.review-session:v1';
export const CROP_REVIEW_UI_SCHEMA = 'crop.review-ui:v1';
export const CROP_PREVIEW_RENDER_PLAN_SCHEMA = 'crop.preview-render-plan:v1';
export const CROP_HUMAN_APPROVAL_COMMAND_SCHEMA = 'crop.human-approval-command:v1';
export const CROP_REVIEW_PERSISTENCE_SCHEMA = 'crop.review-persistence:v1';
export const CROP_APPROVAL_PERSISTENCE_SCHEMA = 'crop.approval-persistence:v1';
export const CROP_EXECUTION_AUTHORIZATION_SCHEMA = 'crop.execution-authorization:v1';
export const CROP_AUTHORIZED_RUNTIME_SCHEMA = 'crop.authorized-runtime:v1';
export const SEMANTIC_FRAME_SELECTION_VERSION = 'semantic.frame-selection:v1';
export const SEMANTIC_FRAME_EXTRACT_VERSION = 'semantic.frame-extract:v1';
export const HUMAN_MOBILE_READABILITY_SCHEMA = 'human.mobile-readability:v1';
export const HUMAN_VISUAL_REVIEW_FEEDBACK_SCHEMA = 'human.visual-review-feedback:v1';
export const VISUAL_REPAIR_PLAN_SCHEMA = 'visual.repair-plan:v1';
export const DYNAMIC_REFRAME_PLAN_SCHEMA = 'dynamic.reframe-plan:v1';
export const DYNAMIC_PREVIEW_SIDECAR_SCHEMA = 'dynamic.preview-sidecar:v1';
export const EDITORIAL_SHOT_PLAN_SCHEMA = 'editorial.shot-plan:v1';
export const BACKGROUND_COMPOSITION_SCHEMA = 'background.composition:v1';
export const DOUYIN_MOBILE_SIMULATOR_SCHEMA = 'douyin.mobile-simulator:v1';
export const NARRATION_VISUAL_UNIT_SCHEMA = 'narration.visual-unit:v1';

/** Design guideline only — not an implementation threshold table. */
export const SEMANTIC_CONFIDENCE_GUIDELINE = {
  highMin: 0.85,
  mediumMin: 0.6,
} as const;

/** Design guideline only — low-confidence semantics must not drive destructive actions. */
export const LOW_CONFIDENCE_POLICY = {
  mustNotDrive: ['DESTRUCTIVE_CROP', 'PRIVACY_DELETE', 'ASSET_REJECTION', 'TRUTH_JUDGMENT'],
  mustDo: ['WARN', 'REQUEST_CONFIRMATION', 'FALLBACK_DETERMINISTIC'],
} as const;

export const VISUAL_ANALYSIS_STATUS = ['PENDING', 'RUNNING', 'READY', 'PARTIAL', 'FAILED'] as const;
export type VisualAnalysisStatus = (typeof VISUAL_ANALYSIS_STATUS)[number];

export const HYBRID_PRECEDENCE = [
  'SAFETY_PRIVACY_RIGHTS',
  'TRUTH',
  'PROJECT_RELEVANCE',
  'EVIDENCE',
  'MUST_KEEP',
  'READABILITY',
  'GEOMETRY',
  'CREATIVE_PREFERENCE',
] as const;
export type HybridPrecedence = (typeof HYBRID_PRECEDENCE)[number];
