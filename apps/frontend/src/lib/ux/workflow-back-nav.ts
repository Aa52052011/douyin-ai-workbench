export type WorkflowBackPage =
  | "project-overview"
  | "positioning"
  | "content-plan"
  | "script"
  | "video"
  | "publish"
  | "monitoring-list"
  | "publication-detail"
  | "metric-entry"
  | "ai-review";

export type WorkflowBackNavInput = {
  page: WorkflowBackPage;
  projectId?: string | null;
  publicationId?: string | null;
};

export type WorkflowBackNavModel = {
  label: string;
  href: string;
  previousStepLabel: string;
};

function projectPath(projectId: string, suffix: string): string {
  return `/dashboard/projects/${projectId}${suffix}`;
}

export function resolveWorkflowBackNav(input: WorkflowBackNavInput): WorkflowBackNavModel {
  const projectId = input.projectId?.trim() || "";
  const publicationId = input.publicationId?.trim() || "";

  if (input.page === "project-overview") {
    return { label: "返回项目列表", href: "/dashboard/projects", previousStepLabel: "项目" };
  }
  if (input.page === "positioning") {
    return {
      label: "返回项目概览",
      href: projectId ? projectPath(projectId, "") : "/dashboard/projects",
      previousStepLabel: "项目概览",
    };
  }
  if (input.page === "content-plan") {
    return {
      label: "返回账号定位",
      href: projectId ? projectPath(projectId, "/positioning") : "/dashboard/projects",
      previousStepLabel: "账号定位",
    };
  }
  if (input.page === "script") {
    return {
      label: "返回内容计划",
      href: projectId ? projectPath(projectId, "/content/plans") : "/dashboard/projects",
      previousStepLabel: "内容计划",
    };
  }
  if (input.page === "video") {
    return {
      label: "返回选题与脚本",
      href: projectId ? projectPath(projectId, "/content/scripts") : "/dashboard/projects",
      previousStepLabel: "选题与脚本",
    };
  }
  if (input.page === "publish") {
    return {
      label: "返回视频制作",
      href: projectId ? projectPath(projectId, "/content/videos") : "/dashboard/projects",
      previousStepLabel: "视频制作",
    };
  }
  if (input.page === "monitoring-list") {
    return {
      label: "返回手动发布",
      href: projectId ? projectPath(projectId, "/publish") : "/dashboard/projects",
      previousStepLabel: "发布与数据",
    };
  }
  if (input.page === "publication-detail") {
    return {
      label: "返回发布与数据",
      href: projectId ? projectPath(projectId, "/publish") : "/dashboard/monitoring",
      previousStepLabel: "发布与数据",
    };
  }
  if (input.page === "metric-entry") {
    return {
      label: "返回作品详情",
      href: publicationId
        ? `/dashboard/monitoring/${publicationId}`
        : projectId
          ? projectPath(projectId, "/publish")
          : "/dashboard/monitoring",
      previousStepLabel: "作品详情",
    };
  }
  if (input.page === "ai-review") {
    if (projectId) {
      return {
        label: "返回发布与数据",
        href: projectPath(projectId, "/publish"),
        previousStepLabel: "发布与数据",
      };
    }
    return {
      label: "返回发布与数据",
      href: "/dashboard/monitoring",
      previousStepLabel: "发布与数据",
    };
  }
  return {
    label: "返回发布与数据",
    href: publicationId
      ? `/dashboard/monitoring/${publicationId}`
      : projectId
        ? projectPath(projectId, "/publish")
        : "/dashboard/monitoring",
    previousStepLabel: "发布与数据",
  };
}

export type AiReviewBackScope = "PROJECT_SCOPED_AI_REVIEW" | "GLOBAL_MONITORING_CONTEXT";

export function resolveAiReviewBackScope(input: { projectId?: string | null }): AiReviewBackScope {
  return input.projectId?.trim() ? "PROJECT_SCOPED_AI_REVIEW" : "GLOBAL_MONITORING_CONTEXT";
}
