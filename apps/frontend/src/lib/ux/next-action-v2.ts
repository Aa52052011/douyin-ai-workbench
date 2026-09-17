import { getProjectNextAction, type ProjectNextAction, type ProjectStatusFacts } from "../project-status";

export type PresentedNextAction = ProjectNextAction & {
  stepCopy: string;
};

function withCopy(action: ProjectNextAction, label: string, ctaLabel: string, description?: string): PresentedNextAction {
  return {
    ...action,
    label,
    ctaLabel,
    description: description ?? action.description,
    stepCopy: `下一步：${label}`,
  };
}

export function latestPlanNeedsScripts(facts: ProjectStatusFacts): boolean {
  if (facts.latestPlanStatus !== "CONFIRMED" && facts.latestPlanStatus !== "ARCHIVED") return false;
  if (typeof facts.latestPlanTopicCount !== "number" || typeof facts.completedScriptsOnLatestPlan !== "number") {
    return false;
  }
  return facts.completedScriptsOnLatestPlan < facts.latestPlanTopicCount;
}

/** Deterministic UI presentation over existing getProjectNextAction facts. No LLM. */
export function resolveNextActionV2(projectId: string, facts: ProjectStatusFacts): PresentedNextAction {
  const path = (suffix: string) => `/dashboard/projects/${projectId}${suffix}`;
  const planQuery = facts.latestPlanId ? `?contentPlanId=${encodeURIComponent(facts.latestPlanId)}` : "";

  if (facts.productPresent === true && facts.positioningValid === true && latestPlanNeedsScripts(facts)) {
    const done = facts.completedScriptsOnLatestPlan ?? 0;
    const drafts = facts.draftScriptsOnLatestPlan ?? 0;
    if (drafts > 0) {
      return withCopy(
        { id: "script", label: "确认脚本", href: path(`/content/scripts${planQuery}`), ctaLabel: "去确认" },
        "确认脚本",
        "去确认",
        "有脚本还没有确认。",
      );
    }
    const label = done === 0 ? "制作第一条脚本" : `继续制作第 ${done + 1} 条脚本`;
    return withCopy(
      { id: "script", label, href: path(`/content/scripts${planQuery}`), ctaLabel: "继续处理" },
      label,
      "继续处理",
      "内容计划已确认，可以继续为选题生成脚本。",
    );
  }

  if (
    facts.hasVideoAwaitingAcceptance === true &&
    facts.productPresent === true &&
    facts.positioningValid === true &&
    !latestPlanNeedsScripts(facts)
  ) {
    const count = facts.awaitingAcceptanceCount ?? 0;
    return withCopy(
      { id: "video", label: "待审核视频", href: path("/content/videos"), ctaLabel: "去审核" },
      "待审核视频",
      "去审核",
      count > 0 ? `${count} 条成片等待你确认` : "有成片等待你确认",
    );
  }

  const raw = getProjectNextAction(projectId, facts);

  switch (raw.id) {
    case "product":
      return withCopy(raw, "完善账号定位", raw.ctaLabel ?? "继续完善", "先补齐产品资料，再生成账号定位。不会要求你重复填写已保存的内容。");
    case "positioning":
      return withCopy(raw, "开始账号定位", "开始账号定位", "告诉 AI 你的账号目标。后续计划和脚本会复用这些信息。");
    case "research":
    case "analysis":
    case "strategy":
      return withCopy(raw, raw.label, raw.ctaLabel ?? "继续", "这些资料会带入后续内容，可随时修改。");
    case "planning":
      if (raw.label.includes("确认")) {
        return withCopy(raw, "确认本周内容计划", "去确认");
      }
      return withCopy(raw, "生成内容计划", raw.ctaLabel ?? "去生成");
    case "script":
      if (raw.label.includes("确认")) {
        return withCopy(raw, "确认脚本", "去确认");
      }
      return withCopy(raw, "生成脚本", "去生成");
    case "video":
      if (raw.label.includes("进度")) {
        return withCopy(raw, "查看成片进度", "查看成片");
      }
      if (raw.label.includes("重试")) {
        return withCopy(raw, "重试视频制作", "去处理");
      }
      return withCopy(raw, "开始制作视频", "开始制作");
    case "publication":
      if (raw.label.includes("标记") || raw.label.includes("记录")) {
        return withCopy(raw, "手动发布并登记作品", "登记作品", "当前仅支持导出后手动发布，没有自动发布。");
      }
      return withCopy(raw, "手动发布", "去发布");
    case "performance":
      return withCopy(raw, "录入第一组数据", "录入数据");
    case "next-plan":
      return withCopy(raw, "创建下一期内容", raw.ctaLabel ?? "去创建");
    default:
      return { ...raw, ctaLabel: raw.ctaLabel ?? raw.label, stepCopy: `下一步：${raw.label}` };
  }
}
