import {
  KIND_LABELS,
  MARKET_IMPORT_ALLOWED_EXTENSIONS,
  MARKET_IMPORT_FIELDS_BY_KIND,
  MARKET_IMPORT_FIELD_LABELS,
  MARKET_IMPORT_FORBIDDEN_TARGETS,
  MARKET_IMPORT_KINDS,
  MARKET_IMPORT_MAX_FILE_BYTES,
  MARKET_IMPORT_REQUIRED_BY_KIND,
  ORIGIN_OPTIONS,
  SELECTION_OPTIONS,
  type MarketImportKind,
  type MarketResearchRecord,
} from "./market-research.types";

export function isMarketImportKind(value: string): value is MarketImportKind {
  return (MARKET_IMPORT_KINDS as readonly string[]).includes(value);
}

export function kindLabel(kind: string | undefined): string {
  if (kind && isMarketImportKind(kind)) {
    return KIND_LABELS[kind].label;
  }
  return "市场样本";
}

export function fieldLabel(field: string): string {
  return MARKET_IMPORT_FIELD_LABELS[field] ?? field;
}

export function mappingOptions(kind: MarketImportKind): Array<{ value: string; label: string; required: boolean }> {
  const required = new Set(MARKET_IMPORT_REQUIRED_BY_KIND[kind]);
  return MARKET_IMPORT_FIELDS_BY_KIND[kind]
    .filter((field) => !(MARKET_IMPORT_FORBIDDEN_TARGETS as readonly string[]).includes(field))
    .map((field) => ({
      value: field,
      label: `${fieldLabel(field)}${required.has(field) ? " *" : ""}`,
      required: required.has(field),
    }));
}

export function missingRequiredFields(kind: MarketImportKind, mapping: Record<string, string>): string[] {
  const used = new Set(Object.values(mapping).filter(Boolean));
  return MARKET_IMPORT_REQUIRED_BY_KIND[kind].filter((field) => !used.has(field));
}

export function duplicateMappedFields(mapping: Record<string, string>): string[] {
  const counts = new Map<string, number>();
  for (const field of Object.values(mapping)) {
    if (!field) continue;
    counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([field]) => field);
}

export function mappingForPreview(mapping: Record<string, string>): Record<string, string> | null {
  const next: Record<string, string> = {};
  for (const [column, field] of Object.entries(mapping)) {
    if (field) {
      next[column] = field;
    }
  }
  return Object.keys(next).length > 0 ? next : null;
}

export function fileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

export function validateImportFile(file: File | null): string | null {
  if (!file) {
    return "请选择 CSV 或 XLSX 文件";
  }
  if (!(MARKET_IMPORT_ALLOWED_EXTENSIONS as readonly string[]).includes(fileExtension(file.name))) {
    return "仅支持 CSV / XLSX 文件";
  }
  if (file.size > MARKET_IMPORT_MAX_FILE_BYTES) {
    return "文件大小需 ≤ 1MB";
  }
  return null;
}

export function originLabel(value?: string): string {
  return ORIGIN_OPTIONS.find((item) => item.value === value)?.label ?? "不确定";
}

export function selectionLabel(value?: string): string {
  return SELECTION_OPTIONS.find((item) => item.value === value)?.label ?? "不确定";
}

export function qualityLabel(value?: string): string {
  switch (value) {
    case "NONE":
      return "无有效数据";
    case "LIMITED":
      return "样本有限";
    case "USABLE":
      return "可用于分析";
    default:
      return "";
  }
}

export function confidenceLabel(value?: string): string {
  switch (value) {
    case "LOW":
      return "可信度较低";
    case "MEDIUM":
      return "可信度中等";
    case "HIGH":
      return "可信度较高";
    default:
      return "";
  }
}

export function warningLabel(code: string): string {
  if (code === "COLLECTED_AT_ASSUMED") {
    return "未找到采集时间，系统将使用本次导入时间";
  }
  if (code === "WEAK_IDENTITY") {
    return "部分数据缺少稳定账号/作品标识，分析可信度可能较低";
  }
  if (code.includes("UNKNOWN_SELECTION") || code.toLowerCase().includes("selection method")) {
    return "未说明样本如何筛选，分析只能代表当前导入样本";
  }
  if (code.includes("Unknown column")) {
    return "部分列未能自动匹配，可在下方手动选择";
  }
  if (code.includes("Ignored control column")) {
    return "已忽略内部控制列";
  }
  if (code.includes("searchVolume")) {
    return "搜索量列无法导入，请改用量级信号";
  }
  if (code.includes("heat") || code.includes("Heat")) {
    return "官方热度数值无法导入，请改用热度信号";
  }
  if (code.includes("required field")) {
    return `还需要匹配：${fieldLabel(code.replace(/^.*required field /, "").replace(/ is not mapped$/, "").trim())}`;
  }
  return "部分数据需要检查后再导入";
}

export function uniqueWarningLabels(warnings: string[] | undefined): string[] {
  const labels = [...new Set((warnings ?? []).map(warningLabel))];
  return labels;
}

export function sortResearchNewestFirst(items: MarketResearchRecord[]): MarketResearchRecord[] {
  return [...items].sort((a, b) => b.version - a.version || +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function researchKind(item: MarketResearchRecord): string | undefined {
  return item.queryContext?.kind;
}

export function researchSourceLabel(item: MarketResearchRecord): string {
  if (item.queryContext?.source === "IMPORT") {
    return "文件导入";
  }
  if (item.queryContext?.source === "MANUAL") {
    return "手工录入";
  }
  return "已导入样本";
}

export function researchSampleCount(item: MarketResearchRecord): number {
  return (
    item.queryContext?.itemCount ??
    item.snapshot?.dataQuality?.sampleSize?.total ??
    (item.snapshot?.sampleStats?.contentCount ?? 0) +
      (item.snapshot?.sampleStats?.keywordCount ?? 0) +
      (item.snapshot?.sampleStats?.competitorCount ?? 0) +
      (item.snapshot?.sampleStats?.trendCount ?? 0) +
      (item.snapshot?.sampleStats?.audienceSignalCount ?? 0)
  );
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function confirmSemantics(input: {
  kind: string;
  fileName: string;
  fileSize: number;
  mapping: Record<string, string>;
  origin: string;
  selectionMethod: string;
  collectedAt: string;
}): string {
  return JSON.stringify({
    kind: input.kind,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mapping: input.mapping,
    origin: input.origin,
    selectionMethod: input.selectionMethod,
    collectedAt: input.collectedAt,
  });
}

export function nextIdempotencyKey(
  previous: { semantics: string; key: string } | null,
  semantics: string,
): { semantics: string; key: string } {
  if (previous && previous.semantics === semantics) {
    return previous;
  }
  return { semantics, key: createIdempotencyKey() };
}

export function collectedAtToIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

export function marketAnalysisHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/market/analysis`;
}

export function productInformationHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/product`;
}

export function humanizeMarketImportError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "PRODUCT_BRIEF_REQUIRED" || code === "PRODUCT_BRIEF_NOT_FOUND") {
    return "请先填写产品信息，再开始市场调研。";
  }
  if (message.includes("too large") || message.includes("file is required")) {
    return "文件无法解析，请检查格式或字段。";
  }
  if (message.includes("kind is invalid")) {
    return "请选择一种数据类型。";
  }
  if (message.includes("no valid market import rows") || message.includes("required field")) {
    return "请检查字段匹配后重试。";
  }
  if (message.includes("mapping")) {
    return "请检查字段匹配后重试。";
  }
  if (code.includes("IDEMPOTENCY")) {
    return "这次导入正在处理，请稍后再看调研记录。";
  }
  return "文件无法解析，请检查格式或字段。";
}

export function cellText(value: unknown): string {
  if (value == null) {
    return "";
  }
  return String(value);
}

export function pageHasEvidenceOrInsight(view: Record<string, unknown>): boolean {
  return "evidence" in view || "insight" in view || "MarketEvidence" in view;
}
