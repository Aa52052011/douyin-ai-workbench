import { analysisConfidenceLabel } from "./market-analysis.view";
import type { MarketInsightRecord } from "./market-analysis.types";
import type { MarketResearchRecord } from "./market-research.types";
import type { PositioningRecord } from "./positioning.types";
import {
  STRATEGY_CONFIDENCE_NOTE,
  STRATEGY_RAW_CONTRACT_TERMS,
  type CampaignStrategyEvidenceBasisRecord,
  type CampaignStrategyOutputRecord,
  type CampaignStrategyRecord,
  type ContentMixItemView,
  type InsightOptionView,
  type PositioningOptionView,
  type SourceLabel,
  type StrategyHistoryItemView,
  type StrategyItemView,
  type StrategyView,
} from "./campaign-strategy.types";
import { isStrategyUsable } from "./campaign-strategy.form";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asText).filter(Boolean);
}

export function formatStrategyTime(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function strategyStatusLabel(status?: string): string {
  switch (status) {
    case "READY":
      return "可使用";
    case "CONFIRMED":
      return "已确认";
    case "ARCHIVED":
      return "已归档";
    default:
      return "";
  }
}

export function strategyConfidenceLabel(value?: string): string {
  return analysisConfidenceLabel(value);
}

export function evidenceSourceLabel(type?: string): SourceLabel {
  switch (type) {
    case "PRODUCT_BRIEF":
      return "来自产品信息";
    case "MARKET_INSIGHT":
      return "来自市场分析";
    case "PERFORMANCE_FEEDBACK":
      return "来自历史表现";
    case "ACCOUNT_POSITIONING":
      return "来自账号定位";
    case "USER_GOAL":
      return "来自本次目标";
    default:
      return "";
  }
}

export function priorityLabel(value?: string): string {
  switch (value) {
    case "high":
      return "高优先级";
    case "medium":
      return "中优先级";
    case "low":
      return "低优先级";
    default:
      return "";
  }
}

export function humanizeStrategyLimitation(value: string): string {
  const trimmed = value.trim();
  switch (trimmed) {
    case "NO_MARKET_INSIGHT":
      return "未使用市场分析";
    case "NO_PERFORMANCE_HISTORY":
      return "暂无历史表现数据";
    case "LIMITED_MARKET_SAMPLE":
      return "当前市场样本有限";
    case "BRIEF_VERSION_MISMATCH":
      return "产品版本存在差异";
    default:
      break;
  }
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) {
    return "当前策略存在数据限制";
  }
  return trimmed;
}

function sourceLabels(items?: CampaignStrategyEvidenceBasisRecord[]): SourceLabel[] {
  return [...new Set((items ?? []).map((item) => evidenceSourceLabel(item.type)).filter(Boolean))];
}

export function parseStrategyOutput(value: unknown): CampaignStrategyOutputRecord | null {
  if (!isRecord(value) || value.version !== "v1") {
    return null;
  }
  const objective = isRecord(value.objective) ? value.objective : null;
  const audience = isRecord(value.targetAudience) ? value.targetAudience : null;
  const positioning = isRecord(value.positioning) ? value.positioning : null;
  if (!asText(objective?.businessGoal) || !asText(objective?.primaryObjective)) {
    return null;
  }
  if (!asText(audience?.primary)) {
    return null;
  }
  if (!asText(positioning?.accountRole) || !asText(positioning?.marketPosition)) {
    return null;
  }
  return value as CampaignStrategyOutputRecord;
}

export function strategyView(payload: CampaignStrategyOutputRecord): StrategyView {
  const mix = (payload.contentMix ?? [])
    .map((item): ContentMixItemView | null => {
      const type = asText(item.type);
      const purpose = asText(item.purpose);
      if (!type || !purpose) {
        return null;
      }
      const percentage = typeof item.percentage === "number" && Number.isFinite(item.percentage) ? item.percentage : undefined;
      return { type, purpose, ...(percentage !== undefined ? { percentage } : {}) };
    })
    .filter((item): item is ContentMixItemView => Boolean(item));

  return {
    objective: payload.objective?.businessGoal && payload.objective.primaryObjective
      ? {
          businessGoal: payload.objective.businessGoal,
          primaryObjective: payload.objective.primaryObjective,
          ...(payload.objective.conversionGoal ? { conversionGoal: payload.objective.conversionGoal } : {}),
        }
      : undefined,
    targetAudience: payload.targetAudience?.primary
      ? {
          primary: payload.targetAudience.primary,
          ...(payload.targetAudience.secondary ? { secondary: payload.targetAudience.secondary } : {}),
          pains: asStringArray(payload.targetAudience.pains),
          motivations: asStringArray(payload.targetAudience.motivations),
        }
      : undefined,
    positioning: payload.positioning?.accountRole && payload.positioning.marketPosition
      ? {
          accountRole: payload.positioning.accountRole,
          marketPosition: payload.positioning.marketPosition,
          differentiation: asStringArray(payload.positioning.differentiation),
        }
      : undefined,
    valuePropositions: (payload.valuePropositions ?? [])
      .map((item): StrategyItemView | null => {
        const title = asText(item.proposition);
        return title ? { title, priorityLabel: priorityLabel(item.priority), sources: sourceLabels(item.evidenceBasis) } : null;
      })
      .filter((item): item is StrategyItemView => Boolean(item)),
    contentPillars: (payload.contentPillars ?? [])
      .map((item): StrategyItemView | null => {
        const title = asText(item.name);
        const detail = asText(item.purpose);
        return title ? { title, detail, priorityLabel: priorityLabel(item.priority), sources: sourceLabels(item.evidenceBasis) } : null;
      })
      .filter((item): item is StrategyItemView => Boolean(item)),
    contentMix: mix,
    creativeAngles: (payload.creativeAngles ?? [])
      .map((item): StrategyItemView | null => {
        const title = asText(item.angle);
        const detail = asText(item.rationale);
        return title ? { title, detail, sources: sourceLabels(item.evidenceBasis) } : null;
      })
      .filter((item): item is StrategyItemView => Boolean(item)),
    conversionPath: payload.conversionPath?.awareness && payload.conversionPath.consideration && payload.conversionPath.conversion
      ? {
          awareness: payload.conversionPath.awareness,
          consideration: payload.conversionPath.consideration,
          conversion: payload.conversionPath.conversion,
        }
      : undefined,
    ctaStrategy: payload.ctaStrategy
      ? {
          principles: asStringArray(payload.ctaStrategy.principles),
          allowedDirections: asStringArray(payload.ctaStrategy.allowedDirections),
        }
      : undefined,
    testingStrategy: payload.testingStrategy
      ? {
          hypotheses: (payload.testingStrategy.hypotheses ?? []).map((item) => asText(item.hypothesis)).filter(Boolean),
          variables: asStringArray(payload.testingStrategy.variables),
          successSignals: asStringArray(payload.testingStrategy.successSignals),
        }
      : undefined,
    publishingCadence: asText(payload.publishingCadence?.guidance) || undefined,
    risks: (payload.risks ?? [])
      .map((item) => {
        const risk = asText(item.risk);
        return risk ? { risk, ...(asText(item.mitigation) ? { mitigation: asText(item.mitigation) } : {}) } : null;
      })
      .filter((item): item is { risk: string; mitigation?: string } => Boolean(item)),
    dataLimitations: (payload.dataLimitations ?? []).map(humanizeStrategyLimitation).filter(Boolean),
    confidenceLabel: strategyConfidenceLabel(payload.confidence),
    confidenceNote: STRATEGY_CONFIDENCE_NOTE,
  };
}

export function parsedStrategyView(record: CampaignStrategyRecord): StrategyView | null {
  const parsed = parseStrategyOutput(record.payload);
  return parsed ? strategyView(parsed) : null;
}

export function currentUsableStrategy(items: CampaignStrategyRecord[]): CampaignStrategyRecord | null {
  const latest = [...items].sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (!latest) {
    return null;
  }
  if (!isStrategyUsable(latest.status) || !parseStrategyOutput(latest.payload)) {
    return null;
  }
  return latest;
}

export function strategyHistoryViews(items: CampaignStrategyRecord[]): StrategyHistoryItemView[] {
  return [...items]
    .sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((item) => {
      const parsed = parseStrategyOutput(item.payload);
      return {
        version: item.version,
        createdAtLabel: formatStrategyTime(item.createdAt),
        statusLabel: strategyStatusLabel(item.status),
        confidenceLabel: parsed ? strategyConfidenceLabel(parsed.confidence) : "",
        summary: parsed?.objective?.primaryObjective || (parsed ? parsed.objective?.businessGoal : "") || "该版本无法读取",
        readable: Boolean(parsed),
      };
    });
}

export function positioningOptions(records: PositioningRecord[]): PositioningOptionView[] {
  return records.map((item) => ({
    runId: item.runId,
    createdAtLabel: formatStrategyTime(item.createdAt),
    accountPositioning: item.output.accountPositioning,
    audienceSummary: item.output.targetAudience.description,
  }));
}

export function defaultPositioningRunId(records: PositioningRecord[]): string {
  return [...records].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]?.runId ?? "";
}

export function insightOptions(researches: MarketResearchRecord[], insights: MarketInsightRecord[]): InsightOptionView[] {
  const researchById = new Map(researches.map((item) => [item.id, item]));
  return [...insights]
    .sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((item) => {
      const research = researchById.get(item.marketResearchId);
      return {
        id: item.id,
        researchId: item.marketResearchId,
        researchLabel: research ? `第 ${research.version} 次调研` : "市场调研",
        insightLabel: `第 ${item.version} 次分析`,
        confidenceLabel: strategyConfidenceLabel(item.payload?.confidence),
        summary: asText(item.payload?.executiveSummary) || "暂无总结",
      };
    });
}

export function defaultInsightSelection(researches: MarketResearchRecord[], insights: MarketInsightRecord[]): {
  marketResearchId: string;
  marketInsightId: string;
} {
  const latestInsight = [...insights].sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (latestInsight) {
    return { marketResearchId: latestInsight.marketResearchId, marketInsightId: latestInsight.id };
  }
  const latestResearch = [...researches].sort((a, b) => b.version - a.version)[0];
  return { marketResearchId: latestResearch?.id ?? "", marketInsightId: "" };
}

export function noMarketAllowed(form: { marketInsightId: string }): boolean {
  return !form.marketInsightId;
}

export function viewModelHasRawContract(view: object): boolean {
  const blob = JSON.stringify(view);
  return STRATEGY_RAW_CONTRACT_TERMS.some((term) => blob.includes(term));
}

export function viewModelHasAgentRunFields(view: object): boolean {
  const blob = JSON.stringify(view);
  return ["sourceAgentRunId", "AgentRun", "token", "provider", "prompt"].some((term) => blob.includes(term));
}

export function contentMixHasFakePercentage(items: ContentMixItemView[]): boolean {
  return items.some((item) => item.percentage !== undefined && (typeof item.percentage !== "number" || !Number.isFinite(item.percentage)));
}
