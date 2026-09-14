export const VISIBLE_WARNINGS = [
  "MOBILE_READABILITY_LOW",
  "SAMPLED_SEMANTIC_PRECISION",
  "HIGH_TEMPORAL_VARIANCE",
  "BACKGROUND_TREATMENT_REQUIRED",
  "STATIC_CROP_WARNINGS",
] as const;

export const HUMAN_REQUIRED_ITEMS = [
  "MOBILE_READABILITY_ACCEPTABLE",
  "BACKGROUND_TREATMENT_ACCEPTABLE",
  "TEMPORAL_VARIANCE_ACCEPTABLE",
  "PRODUCT_UI_READABLE",
] as const;

export const BACKGROUNDS = ["SOLID", "BLUR_SOURCE", "DUPLICATE_BLUR", "STATIC_IMAGE"] as const;
export const CHANGE_REQUESTS = ["TRY_ANOTHER_CANDIDATE", "CHANGE_BACKGROUND", "REQUEST_DYNAMIC_REFRAME", "OTHER"] as const;

export type ReviewPayload = {
  ok?: boolean;
  code?: string;
  sourceOfTruth?: string;
  session?: {
    id: string;
    assetId: string;
    candidateId: string;
    candidateVersion: string;
    reviewPacketVersion: string;
    previewId: string | null;
    previewVersion: string;
    status: string;
    backgroundTreatment: string;
    humanDecision: string;
    invalidationReason?: string | null;
    requiredWarningsJson?: string[];
    checklistJson?: Array<{ id: string; interaction: string; kind: string }>;
  };
  candidate?: { id: string; version: string; strategy: string };
  preview?: {
    id: string | null;
    version: string;
    status: string;
    mediaUrl: string;
    abstractRef: string;
    width: number;
    height: number;
    previewOnly: boolean;
    productionUsable: boolean;
    playable: boolean;
    smokePlaceholder: boolean;
    smokeMode: string | null;
    failureCode?: string | null;
    backgroundApprovalEligible?: boolean;
    humanSelectedBackground?: string;
    type?: string;
  };
  dynamicReframe?: {
    previewType: string;
    status: string;
    previewVersion: string;
    reviewResolution: string;
    productionTargetResolution: string;
    productionSourcePolicy: string;
    previewUpscaleAllowed: boolean;
    planVersion: string;
    segmentCount: number;
    runtimeShotCount: number | null;
    shotSplitApplied: boolean;
    background: string;
    limitations: string[];
    timeline: Array<{
      segmentId: string;
      startMs: number;
      endMs: number;
      intent: string;
      targetReadability: string;
      requestShotSplit?: boolean;
      warnings: string[];
    }>;
    humanChecklist: Array<{ id: string; interaction: string }>;
    humanReviewRequired: boolean;
  };
  editorialPreview?: {
    previewType: string;
    status: string;
    previewVersion: string;
    reviewResolution: string;
    productionTargetResolution: string;
    productionSourcePolicy: string;
    previewUpscaleAllowed: boolean;
    productionUsable: boolean;
    planVersion: string;
    shotCount: number;
    wideCount: number;
    mediumCount: number;
    detailCount: number;
    failureCode: string | null;
    humanChecklist: Array<{ id: string; interaction: string }>;
    humanReviewRequired: boolean;
    humanReviewDecision: string;
    humanApproved: boolean;
    approvalObject: null;
    productionAuthorization: boolean;
    timingPrecision: string;
    simulatorPrecision: string;
  };
  sourceAwareEditorial?: {
    planVersion: string;
    sourceVisualType: string;
    defaultStrategy: string;
    mediumIsDefault: boolean;
    shotQuota: string;
    shotCount: number;
    wideCount: number;
    mediumCount: number;
    detailCount: number;
    keepCurrentCount: number;
    previewThisStep: boolean;
    humanReviewResult: string;
  };
  sourceAwarePreview?: {
    previewType: string;
    status: string;
    previewVersion: string;
    sourceVisualType: string;
    directorPolicy: string;
    reviewResolution: string;
    productionTargetResolution: string;
    verticalProductionTarget?: string;
    landscapeProductionTarget?: string;
    universalFinalResolution?: boolean;
    outputStrategy?: string;
    productionSourcePolicy: string;
    previewUpscaleAllowed: boolean;
    productionUsable: boolean;
    planVersion: string;
    decisionCount: number;
    keepCurrentCount: number;
    explicitReframeCount: number;
    timelineSegmentCount: number;
    renderedShotCount: number;
    currentDecision: string;
    reason: string;
    semanticIntegrity: string;
    failureCode: string | null;
    humanChecklist: Array<{ id: string; interaction: string }>;
    humanReviewRequired: boolean;
    humanReviewDecision: string;
    humanApproved: boolean;
    approvalObject: null;
    productionAuthorization: boolean;
    timingPrecision: string;
    simulatorPrecision: string;
  };
  outputSelection?: {
    outputStrategy: string;
    selectedBy: string;
    selectionSource: string | null;
    selectedStrategy: string | null;
    vertical: { profileId: string; resolution: string; status: string };
    landscape: { profileId: string; resolution: string; status: string };
    productionAuthorized: boolean;
    humanApproved: boolean;
    approvalObject: null;
    recommendation?: { strategy: string; forced: boolean; match: boolean };
  };
  finalReadiness?: {
    visualApproval: string;
    humanApproved: boolean;
    approvalObject: string | null;
    approvedBy?: string;
    approvalSource?: string | null;
    truthGate: string;
    restrictedClaims: string[];
    verticalReadiness: string;
    landscapeReadiness: string;
    productionAuthorization: boolean;
    authorizationObject?: string | null;
    authorizedBy?: string;
    authorizationSource?: string | null;
    executionPlanStatus: string;
    readyToRender?: boolean;
    productionUsable: boolean;
  };
  finalProductionReview?: {
    status: string;
    humanDecision: string;
    acceptance: null;
    publication: string;
    badge: string;
    reviewId?: string;
    vertical?: {
      artifactId: string;
      profileId: string;
      resolution: string;
      productionUsable: boolean;
      durationMs: number | null;
      kind: string;
    } | null;
    landscape?: {
      artifactId: string;
      profileId: string;
      resolution: string;
      productionUsable: boolean;
      durationMs: number | null;
      kind: string;
    } | null;
    media?: { verticalUrl: string | null; landscapeUrl: string | null };
    checklist?: Array<{ id: string; kind: string; result: string }>;
  };
  editorialShotDirector?: {
    planVersion: string;
    repairDirection: string;
    humanReviewResult: string;
    ffmpegThisStep: number;
    priorDynamicPreview: string;
    priorDynamicPreviewRole: string;
    simulator: { precision: string; modes: string[] };
    shotCount: number;
    shots: Array<{
      shotId: string;
      startMs: number;
      endMs: number;
      shotScale: string;
      intent?: string;
      narrationUnitRef: string | null;
      claimRefs: string[];
      readabilityTarget: string;
      backgroundTreatment: string;
      shotPurpose: string;
      contextRecoveryReason?: string | null;
      warnings: string[];
    }>;
    warnings: string[];
    humanFeedbackPreserved: string[];
  };
  warnings?: string[];
  checklist?: Array<{ id: string; interaction: string; kind: string }>;
  background?: { value: string; defaultSelected: boolean; options: string[]; unavailable: string[] };
  metrics?: { previewTarget: string; previewOnly: boolean; productionUsable: boolean };
  eligibleAlternatives?: Array<{ candidateId: string; strategy: string }>;
  ineligibleAlternatives?: Array<{ candidateId: string; strategy: string; reason: string }>;
  approveButton?: { enabled: boolean; reason: string; reasons?: string[] };
  humanDecision?: string;
  approval?: { id: string; status: string } | null;
};

export function loadErrorCopy(status?: number, code?: string): string {
  if (status === 401 || code === "AUTH_UNAUTHORIZED" || code === "AUTH_TOKEN_EXPIRED") {
    return "登录失效，请重新登录。";
  }
  if (code === "WORKSPACE_FORBIDDEN" || code === "PROJECT_FORBIDDEN") {
    return "当前工作区/项目与审核不匹配。";
  }
  if (status === 403) return "无权限访问审核。";
  if (code === "PERSISTENCE_FAILED" || code === "AGENT_EXECUTION_FAILED") {
    return "审核数据加载失败。";
  }
  if (status === 404 || code === "PROJECT_NOT_FOUND" || code === "NOT_FOUND") return "审核不存在。";
  return code ? `加载失败：${code}` : "加载失败。";
}

export function mutationErrorCopy(code?: string): { message: string; stale: boolean; persistenceFailed: boolean } {
  if (code === "STALE_REVIEW_SESSION" || code === "STALE_CANDIDATE_VERSION" || code === "STALE_REVIEW_PACKET") {
    return { message: "审核版本已变化，请重新查看。", stale: true, persistenceFailed: false };
  }
  if (code === "PERSISTENCE_FAILED") {
    return { message: "保存失败，未批准。", stale: false, persistenceFailed: true };
  }
  if (code === "UNRESOLVED_BACKGROUND" || code === "BACKGROUND_UNRESOLVED") {
    return { message: "尚未选择背景，无法批准。", stale: false, persistenceFailed: false };
  }
  if (code === "MISSING_HUMAN_CHECKLIST" || code === "REQUIRED_HUMAN_CHECKS_INCOMPLETE") {
    return { message: "请先完成必填人工确认项。", stale: false, persistenceFailed: false };
  }
  if (code === "PREVIEW_ARTIFACT_MISSING") {
    return { message: "预览需要重新生成。", stale: false, persistenceFailed: false };
  }
  if (code === "FFMPEG_FAILED") {
    return { message: "预览生成失败，请稍后重试。", stale: false, persistenceFailed: false };
  }
  if (code === "PLACEHOLDER_BACKGROUND_NOT_APPROVABLE") {
    return { message: "当前为占位预览，不能作为最终背景批准。", stale: false, persistenceFailed: false };
  }
  return { message: code ? `操作失败：${code}` : "操作失败。", stale: false, persistenceFailed: false };
}

export function stableApproveActionId(sessionId: string, previewVersion: string, packetVersion: string): string {
  return `ui-approve:${sessionId}:${previewVersion}:${packetVersion}`;
}

export function approveEnabledFromPayload(payload: ReviewPayload | null, loading: boolean): boolean {
  if (loading || !payload) return false;
  return Boolean(payload.approveButton?.enabled);
}

export function warningsDefaultAccepted(): false {
  return false;
}

export function pageHardcodesContent01(source: string): boolean {
  return (
    source.includes('"TOP_TRIM"') ||
    source.includes("'READY_FOR_REVIEW'") ||
    source.includes('"UNRESOLVED"') && source.includes("const ")
  );
}
