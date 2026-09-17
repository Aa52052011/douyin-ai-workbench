import type { ScriptRecord } from "./script.types";
import { latestScriptForTopic, scriptsForTopic } from "./script.form";

/** Workspace current script is always scoped to plan+topic. Never pick another plan's script. */
export function selectWorkspaceScript(
  scripts: ScriptRecord[],
  contentPlanId: string,
  topicId: string,
  selectedScriptId?: string,
): ScriptRecord | null {
  if (!contentPlanId || !topicId) {
    return null;
  }
  if (selectedScriptId) {
    const found = scripts.find((item) => item.id === selectedScriptId);
    if (found && found.contentPlanId === contentPlanId && found.topicId === topicId) {
      return found;
    }
  }
  return latestScriptForTopic(scripts, contentPlanId, topicId);
}

export function scriptBelongsToPlan(script: ScriptRecord | null | undefined, contentPlanId: string): boolean {
  return Boolean(script && script.contentPlanId === contentPlanId);
}

export function scriptWorkspaceStatusLabel(input: {
  script?: ScriptRecord | null;
  generating?: boolean;
  failed?: boolean;
  hasVideo?: boolean;
}): string {
  if (input.generating) return "正在生成脚本";
  if (input.failed && !input.script) return "生成失败";
  if (!input.script) return "待制作脚本";
  if (input.script.status === "DRAFT") return "脚本待确认";
  if (input.script.status === "CONFIRMED") {
    if (input.hasVideo) return "脚本已确认";
    return "脚本已确认";
  }
  if (input.script.status === "ARCHIVED") return "已归档";
  return "待制作脚本";
}

export function scriptQueueMark(label: string): string {
  if (label.includes("已确认") || label.includes("待制作视频") || label.includes("待发布") || label.includes("已发布")) {
    return "✓";
  }
  if (label.includes("正在生成") || label.includes("待确认")) return "●";
  return "○";
}

export function historicalScriptsForTopic(
  scripts: ScriptRecord[],
  contentPlanId: string,
  topicId: string,
): ScriptRecord[] {
  return scriptsForTopic(scripts, contentPlanId, topicId);
}
