export const UX_GLOBAL_PRINCIPLES_V1 = [
  { id: "UX-G1", name: "VISUAL_SIMPLICITY_AND_COMFORT", status: "ACTIVE" as const },
  { id: "UX-G2", name: "LINEAR_TASK_FLOW_FIRST", status: "ACTIVE" as const },
  { id: "UX-G3", name: "NO_REDUNDANT_USER_INPUT", status: "ACTIVE" as const },
  { id: "UX-G4", name: "AI_CONTEXT_REUSE_FIRST", status: "ACTIVE" as const },
  { id: "UX-G5", name: "AUTO_FILL_WHEN_KNOWN", status: "ACTIVE" as const },
  { id: "UX-G6", name: "SUGGEST_WHEN_INFERRED", status: "ACTIVE" as const },
  { id: "UX-G7", name: "HUMAN_CONFIRMATION_FOR_IMPORTANT_DECISIONS", status: "ACTIVE" as const },
  { id: "UX-G8", name: "PROGRESSIVE_DISCLOSURE", status: "ACTIVE" as const },
  { id: "UX-G9", name: "ONE_PRIMARY_ACTION_PER_STEP", status: "ACTIVE" as const },
  { id: "UX-G10", name: "AI_VALUE_SHOULD_BE_FELT_THROUGH_REDUCED_WORK", status: "ACTIVE" as const },
  { id: "UX-G11", name: "AI_PREFILL_MUST_REMAIN_USER_EDITABLE", status: "ACTIVE" as const },
  { id: "UX-G12", name: "OPTIONAL_CHOICE_MUST_ALLOW_USER_EXPRESSION", status: "ACTIVE" as const },
  { id: "UX-G13", name: "UI_DECISION_MUST_NOT_IMPLY_PERSISTED_STATE_WITHOUT_REAL_PERSISTENCE", status: "ACTIVE" as const },
  { id: "UX-G14", name: "PRODUCTIZED_SURFACE_MUST_NOT_IMPLY_FULL_BACKEND_INTEGRATION", status: "ACTIVE" as const },
] as const;

export const UX_PRINCIPLE_COUNT = UX_GLOBAL_PRINCIPLES_V1.length;

export const FORBIDDEN_AI_VISUAL = ["gradient-hero", "neon", "glow", "persistent-drift", "cyberpunk-screen"] as const;

export const ONE_PRIMARY_CTA_CONTRACT = "one primary CTA per primary task step";
