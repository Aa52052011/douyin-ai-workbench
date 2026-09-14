export const REFERENCE_ORIGINALITY_DISCLAIMER = "只学习结构与节奏，不直接复制原视频或文案。";
export const REFERENCE_INSUFFICIENT_HINT = "再补充一条公开链接或说明，分析会更稳。";

export type ReferenceAnalysisView = {
  id: string;
  status: string;
  statusLabel?: string;
  version: number;
  payload?: Record<string, unknown>;
};

export type ReferencePatternView = {
  key: string;
  id?: string;
  label: string;
  value: string;
  summary?: string;
  typeLabel?: string;
  patternType?: string;
};

export function patternTypeLabel(type: string): string {
  return {
    HOOK: "开头 Hook",
    NARRATIVE: "叙事",
    PACING: "节奏",
    SHOT: "镜头",
    SUBTITLE: "字幕",
    CTA: "行动号召",
  }[type] ?? type;
}

export function analysisStatusLabel(status: string): string {
  return { INSUFFICIENT: "输入不足", COMPLETED: "已完成", FAILED: "失败" }[status] ?? "处理中";
}

export function isInsufficientAnalysis(row: { status?: string; payload?: { code?: string }; [key: string]: unknown } | null | undefined): boolean {
  if (!row) return false;
  return row.status === "INSUFFICIENT" || row.payload?.code === "ANALYSIS_INPUT_INSUFFICIENT";
}

export function patternCardsFromAnalysis(row: ReferenceAnalysisView | null | undefined): ReferencePatternView[] {
  if (!row) return [];
  const payload = row.payload ?? {};
  const map: Array<[string, string, string]> = [
    ["hookPattern", "开头", "HOOK"],
    ["narrativePattern", "叙事", "NARRATIVE"],
    ["pacingPattern", "节奏", "PACING"],
    ["shotPattern", "画面", "SHOT"],
    ["subtitlePattern", "字幕", "SUBTITLE"],
    ["ctaPattern", "行动号召", "CTA"],
  ];
  return map
    .filter(([key]) => typeof payload[key] === "string" && String(payload[key]).trim())
    .map(([key, label, patternType]) => ({
      key,
      id: key,
      label,
      value: String(payload[key]),
      summary: String(payload[key]),
      typeLabel: label,
      patternType,
    }));
}
