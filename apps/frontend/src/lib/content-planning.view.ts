import { priorityLabel } from "./campaign-strategy.view";
import {
  PLANNING_RAW_CONTRACT_TERMS,
  type ContentPlanPayloadRecord,
  type ContentPlanRecord,
  type ContentPlanView,
  type ContentTopicRecord,
  type DayGroupView,
  type PlanHistoryItemView,
  type TopicCardView,
} from "./content-planning.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function formatPlanTime(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function planStatusLabel(status?: string): string {
  switch (status) {
    case "DRAFT":
      return "草稿";
    case "CONFIRMED":
      return "已确认";
    case "ARCHIVED":
      return "已归档";
    default:
      return "";
  }
}

export function topicStatusLabel(status?: string): string {
  if (status === "planned") {
    return "已规划";
  }
  return "";
}

export function parsePlanPayload(value: unknown): ContentPlanPayloadRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = asText(value.title);
  const topics = Array.isArray(value.topics) ? value.topics : [];
  if (!title || topics.length === 0) {
    return null;
  }
  const parsedTopics = topics.filter((item): item is ContentTopicRecord => {
    if (!isRecord(item)) {
      return false;
    }
    return typeof item.dayIndex === "number" && Number.isInteger(item.dayIndex) && Boolean(asText(item.title));
  });
  if (parsedTopics.length === 0) {
    return null;
  }
  return {
    title,
    summary: asText(value.summary),
    planningDays: typeof value.planningDays === "number" ? value.planningDays : undefined,
    postsPerDay: typeof value.postsPerDay === "number" ? value.postsPerDay : undefined,
    platform: asText(value.platform) || undefined,
    additionalRequirements: asText(value.additionalRequirements) || undefined,
    topics: parsedTopics,
  };
}

function topicCard(item: ContentTopicRecord): TopicCardView | null {
  const title = asText(item.title);
  const dayIndex = item.dayIndex;
  if (!title || typeof dayIndex !== "number") {
    return null;
  }
  return {
    id: asText(item.id),
    dayIndex,
    title,
    contentAngle: asText(item.contentAngle) || undefined,
    contentPillar: asText(item.contentPillar) || undefined,
    targetAudience: asText(item.targetAudience) || undefined,
    estimatedDuration: asText(item.estimatedDuration) || undefined,
    hook: asText(item.hook) || undefined,
    reason: asText(item.reason) || undefined,
    priorityLabel: priorityLabel(item.priority) || undefined,
    cta: asText(item.cta) || undefined,
    statusLabel: topicStatusLabel(item.status) || undefined,
    painPoint: asText(item.painPoint) || undefined,
    format: asText(item.format) || undefined,
  };
}

export function groupTopicsByDay(topics: ContentTopicRecord[]): DayGroupView[] {
  const groups = new Map<number, TopicCardView[]>();
  for (const topic of topics) {
    const card = topicCard(topic);
    if (!card) {
      continue;
    }
    const current = groups.get(card.dayIndex) ?? [];
    current.push(card);
    groups.set(card.dayIndex, current);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayIndex, items]) => ({
      dayIndex,
      heading: `第 ${dayIndex} 条`,
      topics: items,
    }));
}

export function planView(payload: ContentPlanPayloadRecord, status?: string): ContentPlanView {
  const dayGroups = groupTopicsByDay(payload.topics ?? []);
  return {
    title: payload.title ?? "",
    summary: payload.summary ?? "",
    days: payload.planningDays ?? dayGroups.length,
    postsPerDay: payload.postsPerDay ?? 0,
    topicCount: dayGroups.reduce((sum, group) => sum + group.topics.length, 0),
    statusLabel: planStatusLabel(status),
    dayGroups,
  };
}

export function parsedPlanView(record: ContentPlanRecord): ContentPlanView | null {
  const parsed = parsePlanPayload(record.payload);
  return parsed ? planView(parsed, record.status) : null;
}

export function planHistoryViews(
  items: ContentPlanRecord[],
  strategyByPlanId?: Record<string, string>,
): PlanHistoryItemView[] {
  return [...items]
    .sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((item) => {
      const parsed = parsePlanPayload(item.payload);
      const view = parsed ? planView(parsed, item.status) : null;
      return {
        version: item.version,
        createdAtLabel: formatPlanTime(item.createdAt),
        statusLabel: planStatusLabel(item.status),
        daysLabel: item.planningDays ? `${item.planningDays} 天` : view ? `${view.days} 天` : "",
        topicCountLabel: view ? `${view.topicCount} 个选题` : "",
        strategyLabel: strategyByPlanId?.[item.id] ?? "策略信息未保留在产品视图中",
        readable: Boolean(view),
      };
    });
}

export function viewModelHasRawContract(view: object): boolean {
  const blob = JSON.stringify(view);
  return PLANNING_RAW_CONTRACT_TERMS.some((term) => blob.includes(term));
}

export function viewModelHasPerformanceFeedback(view: object): boolean {
  return JSON.stringify(view).includes("PerformanceFeedback") || JSON.stringify(view).includes("positiveSignals");
}
