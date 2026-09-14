import { priorityLabel } from "./campaign-strategy.view";
import { groupTopicsByDay, parsePlanPayload, planStatusLabel } from "./content-planning.view";
import type { ContentPlanRecord, ContentTopicRecord, DayGroupView } from "./content-planning.types";
import {
  SCRIPT_RAW_CONTRACT_TERMS,
  type RecentScriptItemView,
  type ScriptHistoryItemView,
  type ScriptPayloadRecord,
  type ScriptRecord,
  type ScriptSectionView,
  type ScriptView,
  type TopicSourceView,
} from "./script.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function formatScriptTime(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function scriptStatusLabel(status?: string): string {
  switch (status) {
    case "DRAFT":
      return "等待审核";
    case "CONFIRMED":
      return "已确认";
    case "ARCHIVED":
      return "已归档";
    default:
      return "";
  }
}

export function parseScriptPayload(value: unknown): ScriptPayloadRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = asText(value.title);
  const hook = asText(value.hook);
  const opening = asText(value.opening);
  const ending = asText(value.ending);
  const cta = asText(value.cta);
  const voiceStyle = asText(value.voiceStyle);
  const visualStyle = asText(value.visualStyle);
  if (!title || !hook || !opening || !ending || !cta || !voiceStyle || !visualStyle) {
    return null;
  }
  if (typeof value.totalDuration !== "number" || typeof value.estimatedWordCount !== "number") {
    return null;
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0 || !Array.isArray(value.productionNotes)) {
    return null;
  }
  const sections = value.sections
    .map((item): ScriptSectionView | null => {
      if (!isRecord(item)) {
        return null;
      }
      const narration = asText(item.narration);
      const visualSuggestion = asText(item.visualSuggestion);
      const subtitle = asText(item.subtitle);
      if (
        typeof item.sequence !== "number" ||
        typeof item.duration !== "number" ||
        !narration ||
        !visualSuggestion ||
        !subtitle
      ) {
        return null;
      }
      return {
        sequence: item.sequence,
        narration,
        visualSuggestion,
        subtitle,
        duration: item.duration,
      };
    })
    .filter((item): item is ScriptSectionView => Boolean(item))
    .sort((a, b) => a.sequence - b.sequence);
  if (sections.length === 0) {
    return null;
  }
  return {
    title,
    hook,
    opening,
    sections,
    ending,
    cta,
    totalDuration: value.totalDuration,
    estimatedWordCount: value.estimatedWordCount,
    voiceStyle,
    visualStyle,
    productionNotes: value.productionNotes.map(asText).filter(Boolean),
  };
}

export function scriptView(payload: ScriptPayloadRecord): ScriptView {
  return {
    title: payload.title ?? "",
    hook: payload.hook ?? "",
    opening: payload.opening ?? "",
    sections: [...(payload.sections ?? [])]
      .map((item) => ({
        sequence: item.sequence ?? 0,
        narration: item.narration ?? "",
        visualSuggestion: item.visualSuggestion ?? "",
        subtitle: item.subtitle ?? "",
        duration: item.duration ?? 0,
      }))
      .sort((a, b) => a.sequence - b.sequence),
    ending: payload.ending ?? "",
    cta: payload.cta ?? "",
    totalDuration: payload.totalDuration ?? 0,
    estimatedWordCount: payload.estimatedWordCount ?? 0,
    voiceStyle: payload.voiceStyle ?? "",
    visualStyle: payload.visualStyle ?? "",
    productionNotes: payload.productionNotes ?? [],
  };
}

export function parsedScriptView(record: ScriptRecord): ScriptView | null {
  const parsed = parseScriptPayload(record.payload);
  return parsed ? scriptView(parsed) : null;
}

export function topicSourceView(topic: ContentTopicRecord | null): TopicSourceView | null {
  if (!topic || !asText(topic.title)) {
    return null;
  }
  return {
    title: asText(topic.title),
    contentAngle: asText(topic.contentAngle) || undefined,
    targetAudience: asText(topic.targetAudience) || undefined,
    hook: asText(topic.hook) || undefined,
    cta: asText(topic.cta) || undefined,
    dayIndex: typeof topic.dayIndex === "number" ? topic.dayIndex : undefined,
    contentPillar: asText(topic.contentPillar) || undefined,
    priorityLabel: priorityLabel(topic.priority) || undefined,
  };
}

export function parseTopicSnapshot(value: unknown): TopicSourceView | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = asText(value.title);
  if (!title) {
    return null;
  }
  return {
    title,
    contentAngle: asText(value.contentAngle) || undefined,
  };
}

export function scriptHistoryViews(items: ScriptRecord[]): ScriptHistoryItemView[] {
  return [...items]
    .sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((item) => {
      const parsed = parseScriptPayload(item.payload);
      return {
        version: item.version,
        createdAtLabel: formatScriptTime(item.createdAt),
        statusLabel: scriptStatusLabel(item.status),
        title: parsed?.title || item.title || "该版本无法读取",
        durationLabel: parsed ? `${parsed.totalDuration} 秒` : "",
        readable: Boolean(parsed),
      };
    });
}

export function recentScriptViews(items: ScriptRecord[]): RecentScriptItemView[] {
  return [...items]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      title: parseScriptPayload(item.payload)?.title || item.title || "未命名脚本",
      topicTitle: parseTopicSnapshot(item.topicSnapshot)?.title || "来源选题",
      statusLabel: scriptStatusLabel(item.status),
      createdAtLabel: formatScriptTime(item.createdAt),
    }));
}

export function topicSelectorGroups(plan: ContentPlanRecord | null): DayGroupView[] {
  return groupTopicsByDay((plan ? parsePlanPayload(plan.payload)?.topics : null) ?? []).map((group) => ({
    ...group,
    topics: group.topics.filter((item) => Boolean(item.id)),
  }));
}

export function planOptionLabel(plan: ContentPlanRecord): string {
  const parsed = parsePlanPayload(plan.payload);
  return [
    `版本 ${plan.version}`,
    planStatusLabel(plan.status),
    parsed?.title || plan.title || "内容计划",
    parsed?.topics?.length ? `${parsed.topics.length} 个选题` : "",
    formatScriptTime(plan.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function topicOptionLabel(topic: ContentTopicRecord | { title?: string; dayIndex?: number; contentPillar?: string; contentAngle?: string; priority?: string; priorityLabel?: string }): string {
  return [
    topic.title,
    typeof topic.dayIndex === "number" ? `第 ${topic.dayIndex} 条` : "",
    topic.contentPillar,
    topic.contentAngle,
    ("priorityLabel" in topic && topic.priorityLabel) || priorityLabel("priority" in topic ? topic.priority : undefined),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function viewModelHasRawContract(view: object): boolean {
  return SCRIPT_RAW_CONTRACT_TERMS.some((term) => JSON.stringify(view).includes(term));
}

export function viewModelHasAgentRunFields(view: object): boolean {
  const blob = JSON.stringify(view);
  return ["sourceAgentRunId", "AgentRun", "token", "provider", "prompt"].some((term) => blob.includes(term));
}
