export const PROJECT_STAGE_KEYS = [
  "product",
  "positioning",
  "research",
  "analysis",
  "strategy",
  "planning",
  "script",
  "video",
  "publication",
  "performance",
] as const;

export type ProjectStageKey = (typeof PROJECT_STAGE_KEYS)[number];
export type StageMark = "completed" | "current" | "not_started" | "unknown";
export type ProjectStageMap = Record<ProjectStageKey, StageMark>;

export type ProjectNextAction = {
  id: ProjectStageKey | "next-plan";
  label: string;
  href: string;
  /** Supporting sentence under the title (optional). */
  description?: string;
  /** Button text; defaults to label when omitted. */
  ctaLabel?: string;
  /** Non-blocking auxiliary tip (e.g. unconfirmed improve draft). */
  note?: string;
};

export type ProjectOverviewSummary = {
  productName?: string;
  positioningLine?: string;
  strategyObjective?: string;
  planTitle?: string;
  planStatus?: string;
  scriptTitle?: string;
  scriptStatus?: string;
  videoStatus?: string;
  publicationTitle?: string;
  hasMetrics?: boolean;
};

export type ProjectStatusFacts = {
  productPresent: boolean | null;
  positioningValid: boolean | null;
  researchPresent: boolean | null;
  insightPresent: boolean | null;
  strategyUsable: boolean | null;
  hasReadablePlan: boolean | null;
  hasScriptEligiblePlan: boolean | null;
  latestPlanStatus?: string | null;
  latestDraftPlanId?: string | null;
  hasCompletedScript: boolean | null;
  hasDraftScript: boolean | null;
  draftScriptPlanId?: string | null;
  draftScriptTopicId?: string | null;
  hasVideo: boolean | null;
  hasCompletedVideo: boolean | null;
  hasProcessingVideo: boolean | null;
  hasFailedVideo: boolean | null;
  latestConfirmedScriptId?: string | null;
  hasPublishedPublication: boolean | null;
  hasPendingPublication: boolean | null;
  pendingPublicationVideoId?: string | null;
  publishedPublicationId?: string | null;
  hasMetrics: boolean | null;
  summary: ProjectOverviewSummary;
  /**
   * Client-only Intake draft presence. Never used by evaluateProjectStages.
   * Formal stage completion still depends only on ProductBrief / MarketResearch.
   */
  productIntakeDraftPresent?: boolean;
  marketIntakeDraftPresent?: boolean;
  productIntakeImproveActive?: boolean;
  marketIntakeImproveActive?: boolean;
};

export const STAGE_CHECKLIST: Array<{
  key: ProjectStageKey;
  label: string;
  group: "基础" | "市场与策略" | "内容生产" | "发布与数据";
  href: (projectId: string) => string;
}> = [
  { key: "product", label: "产品信息", group: "基础", href: (id) => `/dashboard/projects/${id}/product` },
  { key: "positioning", label: "账号定位", group: "基础", href: (id) => `/dashboard/projects/${id}/positioning` },
  { key: "research", label: "市场调研", group: "市场与策略", href: (id) => `/dashboard/projects/${id}/market/research` },
  { key: "analysis", label: "市场分析", group: "市场与策略", href: (id) => `/dashboard/projects/${id}/market/analysis` },
  { key: "strategy", label: "推广策略", group: "市场与策略", href: (id) => `/dashboard/projects/${id}/strategy` },
  { key: "planning", label: "内容计划", group: "内容生产", href: (id) => `/dashboard/projects/${id}/content/plans` },
  { key: "script", label: "脚本", group: "内容生产", href: (id) => `/dashboard/projects/${id}/content/scripts` },
  { key: "video", label: "视频", group: "内容生产", href: (id) => `/dashboard/projects/${id}/content/videos` },
  { key: "publication", label: "已发布", group: "发布与数据", href: (id) => `/dashboard/projects/${id}/publish` },
  { key: "performance", label: "表现与建议", group: "发布与数据", href: (id) => `/dashboard/projects/${id}/performance` },
];

export const STAGE_GROUPS = ["基础", "市场与策略", "内容生产", "发布与数据"] as const;

export function emptyStageMap(): ProjectStageMap {
  return {
    product: "not_started",
    positioning: "not_started",
    research: "not_started",
    analysis: "not_started",
    strategy: "not_started",
    planning: "not_started",
    script: "not_started",
    video: "not_started",
    publication: "not_started",
    performance: "not_started",
  };
}

export function emptyStatusFacts(): ProjectStatusFacts {
  return {
    productPresent: false,
    positioningValid: false,
    researchPresent: false,
    insightPresent: false,
    strategyUsable: false,
    hasReadablePlan: false,
    hasScriptEligiblePlan: false,
    hasCompletedScript: false,
    hasDraftScript: false,
    hasVideo: false,
    hasCompletedVideo: false,
    hasProcessingVideo: false,
    hasFailedVideo: false,
    hasPublishedPublication: false,
    hasPendingPublication: false,
    hasMetrics: false,
    summary: {},
  };
}

export function belongsToProject(item: { projectId?: string }, projectId: string): boolean {
  return !item.projectId || item.projectId === projectId;
}

export function isReadablePlanStatus(status?: string): boolean {
  return status === "DRAFT" || status === "CONFIRMED" || status === "ARCHIVED";
}

export function isCompletedScriptStatus(status?: string): boolean {
  return status === "CONFIRMED" || status === "ARCHIVED";
}

export function isProcessingVideoStatus(status?: string): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

function flag(value: boolean | null, completed: boolean): StageMark {
  if (value == null) {
    return "unknown";
  }
  return completed ? "completed" : "not_started";
}

export function evaluateProjectStages(facts: ProjectStatusFacts): ProjectStageMap {
  return {
    product: flag(facts.productPresent, facts.productPresent === true),
    positioning: flag(facts.positioningValid, facts.positioningValid === true),
    research: flag(facts.researchPresent, facts.researchPresent === true),
    analysis: flag(facts.insightPresent, facts.insightPresent === true),
    strategy: flag(facts.strategyUsable, facts.strategyUsable === true),
    planning: flag(facts.hasReadablePlan, facts.hasReadablePlan === true),
    script: flag(facts.hasCompletedScript, facts.hasCompletedScript === true),
    video: flag(facts.hasCompletedVideo, facts.hasCompletedVideo === true),
    publication: flag(facts.hasPublishedPublication, facts.hasPublishedPublication === true),
    performance: flag(facts.hasMetrics, facts.hasMetrics === true),
  };
}

export function markCurrentStages(stages: ProjectStageMap): ProjectStageMap {
  const next = { ...stages };
  let assigned = false;
  for (const key of PROJECT_STAGE_KEYS) {
    if (next[key] === "completed") {
      continue;
    }
    if (!assigned) {
      if (next[key] === "not_started") {
        next[key] = "current";
      }
      assigned = true;
    } else if (next[key] === "not_started") {
      next[key] = "not_started";
    }
  }
  return next;
}

export function buildProjectStages(facts: ProjectStatusFacts): ProjectStageMap {
  return markCurrentStages(evaluateProjectStages(facts));
}

export function completedStageCount(stages: ProjectStageMap): number {
  return PROJECT_STAGE_KEYS.filter((key) => stages[key] === "completed").length;
}

export function stageCountLabel(stages: ProjectStageMap): string {
  return `已完成 ${completedStageCount(stages)} / ${PROJECT_STAGE_KEYS.length} 个阶段`;
}

export function currentStageLabel(stages: ProjectStageMap): string {
  if (completedStageCount(stages) === PROJECT_STAGE_KEYS.length) {
    return "持续优化";
  }
  const current = PROJECT_STAGE_KEYS.find((key) => stages[key] === "current");
  return STAGE_CHECKLIST.find((item) => item.key === current)?.label ?? "产品信息";
}

export function groupProgress(stages: ProjectStageMap): Array<{ label: string; done: number; total: number }> {
  return STAGE_GROUPS.map((label) => {
    const keys = STAGE_CHECKLIST.filter((item) => item.group === label).map((item) => item.key);
    return {
      label,
      done: keys.filter((key) => stages[key] === "completed").length,
      total: keys.length,
    };
  });
}

export function getProjectNextAction(projectId: string, facts: ProjectStatusFacts): ProjectNextAction {
  const href = (path: string) => `/dashboard/projects/${projectId}${path}`;
  if (facts.productPresent !== true) {
    // Market draft must not jump ahead of ProductBrief.
    if (facts.productIntakeDraftPresent === true) {
      return {
        id: "product",
        label: "继续完善产品信息",
        description: "你已经开始整理产品信息，继续完成后即可进入账号定位。",
        ctaLabel: "继续完善",
        href: href("/product"),
      };
    }
    return {
      id: "product",
      label: "开始填写产品信息",
      ctaLabel: "开始填写",
      href: href("/product"),
    };
  }
  if (facts.positioningValid !== true) {
    return {
      id: "positioning",
      label: "生成账号定位",
      href: href("/positioning"),
      ...(facts.productIntakeImproveActive === true
        ? { note: "有一份未确认的产品信息补充，不影响当前正式产品信息。" }
        : {}),
    };
  }
  if (facts.researchPresent !== true) {
    if (facts.marketIntakeDraftPresent === true) {
      return {
        id: "research",
        label: "继续市场调研",
        description: "你已经开始整理市场调研素材，可以继续完善并确认后进入市场分析。",
        ctaLabel: "继续调研",
        href: href("/market/research"),
      };
    }
    return {
      id: "research",
      label: "开始市场调研",
      ctaLabel: "开始调研",
      href: href("/market/research"),
    };
  }
  if (facts.insightPresent !== true) {
    return {
      id: "analysis",
      label: "开始市场分析",
      href: href("/market/analysis"),
      ...(facts.marketIntakeImproveActive === true
        ? { note: "有一份未确认的补充调研，不影响当前已确认的市场调研。" }
        : {}),
    };
  }
  if (facts.strategyUsable !== true) {
    return { id: "strategy", label: "生成推广策略", href: href("/strategy") };
  }
  if (facts.hasReadablePlan !== true) {
    return { id: "planning", label: "创建内容计划", href: href("/content/plans") };
  }
  if (facts.latestPlanStatus === "DRAFT" && facts.hasScriptEligiblePlan !== true) {
    return { id: "planning", label: "确认内容计划", href: href("/content/plans") };
  }
  if (facts.hasCompletedScript !== true && facts.hasDraftScript === true) {
    const query =
      facts.draftScriptPlanId && facts.draftScriptTopicId
        ? `?contentPlanId=${encodeURIComponent(facts.draftScriptPlanId)}&topicId=${encodeURIComponent(facts.draftScriptTopicId)}`
        : "";
    return { id: "script", label: "确认脚本", href: href(`/content/scripts${query}`) };
  }
  if (facts.hasCompletedScript !== true) {
    return { id: "script", label: "从计划选题生成脚本", href: href("/content/scripts") };
  }
  if (facts.hasVideo !== true) {
    const query = facts.latestConfirmedScriptId
      ? `?scriptId=${encodeURIComponent(facts.latestConfirmedScriptId)}`
      : "";
    return { id: "video", label: "生成第一条视频", href: href(`/content/videos${query}`) };
  }
  if (facts.hasCompletedVideo !== true && facts.hasProcessingVideo === true) {
    return { id: "video", label: "查看视频生成进度", href: href("/content/videos") };
  }
  if (facts.hasCompletedVideo !== true && facts.hasFailedVideo === true) {
    return { id: "video", label: "重试视频生成", href: href("/content/videos") };
  }
  if (facts.hasCompletedVideo !== true) {
    return { id: "video", label: "生成第一条视频", href: href("/content/videos") };
  }
  if (facts.hasPendingPublication === true && facts.hasPublishedPublication !== true) {
    const query = facts.pendingPublicationVideoId
      ? `?videoId=${encodeURIComponent(facts.pendingPublicationVideoId)}`
      : "";
    return { id: "publication", label: "标记已发布", href: href(`/publish${query}`) };
  }
  if (facts.hasPublishedPublication !== true) {
    return { id: "publication", label: "记录已发布作品", href: href("/publish") };
  }
  if (facts.hasMetrics !== true) {
    const query = facts.publishedPublicationId
      ? `?publicationId=${encodeURIComponent(facts.publishedPublicationId)}`
      : "";
    return { id: "performance", label: "录入表现数据", href: href(`/performance${query}`) };
  }
  return { id: "next-plan", label: "创建下一期内容计划", href: href("/content/plans") };
}

export function fullLoopCtaNote(): string {
  return "系统会在下一期计划中自动参考最新发布表现。";
}

export function statusUnavailableLabel(): string {
  return "状态暂不可用";
}

export function usesPercentage(value: string): boolean {
  return value.includes("%") || /完成\s*\d+%\s*/.test(value);
}

export function performanceStageLabel(): string {
  return "表现与建议";
}

export function mountWriteOperations(): string[] {
  return [];
}

export function nextActionSkipsScript(action: ProjectNextAction, facts: ProjectStatusFacts): boolean {
  if (facts.hasCompletedScript === true) {
    return false;
  }
  return action.id === "video" || action.id === "publication" || action.id === "performance" || action.id === "next-plan";
}
