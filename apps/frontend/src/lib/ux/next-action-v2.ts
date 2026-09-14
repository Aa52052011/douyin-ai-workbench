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

/** Deterministic UI presentation over existing getProjectNextAction facts. No LLM. */
export function resolveNextActionV2(projectId: string, facts: ProjectStatusFacts): PresentedNextAction {
  const raw = getProjectNextAction(projectId, facts);

  if (raw.id === "next-plan" && facts.hasMetrics === true) {
    return withCopy(
      { ...raw, id: "performance", href: `/dashboard/projects/${projectId}/performance` },
      "开始AI复盘",
      "开始AI复盘",
      "已有表现数据，可以在发布与数据里查看复盘建议。",
    );
  }

  switch (raw.id) {
    case "product":
      return withCopy(raw, "完善账号定位", raw.ctaLabel ?? "继续完善", "先补齐产品资料，再生成账号定位。不会要求你重复填写已保存的内容。");
    case "positioning":
      return withCopy(raw, "完善账号定位", "继续完善");
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
