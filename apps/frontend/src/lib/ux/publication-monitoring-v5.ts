export const SHORT_LINK_HUMAN_ERROR =
  "这个短链接暂时无法自动识别，请填写作品 ID 或使用完整作品链接。";

export const MANUAL_PUBLISH_MODE_COPY = "手动发布到抖音";

export const METRICS_NONNEGATIVE_ERROR = "请输入 0 或更大的整数";

export const CONFIDENCE_TOOLTIP =
  "这是对分析可靠程度的描述，不是结果好坏评分。";

export const POSITIONING_SINGLE_POST_DOWNGRADE =
  "先继续测试内容变量，不建议仅根据这一条作品调整账号定位。";

export function isDouyinShortLink(value: string): boolean {
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase();
    return hostname === "v.douyin.com" || hostname.endsWith(".v.douyin.com");
  } catch {
    return false;
  }
}

export function registrationVerificationCopy(kind: "USER_ASSERTED" | "FORMAT_VALIDATED" | "PLATFORM_VERIFIED"): string {
  switch (kind) {
    case "USER_ASSERTED":
      return "用户已登记";
    case "FORMAT_VALIDATED":
      return "链接格式已识别";
    case "PLATFORM_VERIFIED":
      return "平台已验证";
  }
}

export function showPlatformVerified(realPlatformVerificationExists: boolean): boolean {
  return realPlatformVerificationExists === true;
}

export function monitoringStatusLabel(status?: string | null): string {
  switch (status) {
    case "REGISTERED":
      return "已登记";
    case "MONITORING_READY":
      return "等待数据";
    case "MONITORING_ACTIVE":
      return "监控中";
    case "ANALYSIS_READY":
      return "可进行AI复盘";
    case "STALE":
    case "STALE_BY_NEWER_METRICS":
      return "有新数据，建议重新复盘";
    case "NEEDS_ATTENTION":
      return "需要处理";
    default:
      if (!status) return "待录入数据";
      return "监控中";
  }
}

export function monitoringTitle(item: {
  title?: string | null;
  platformPostId?: string | null;
  platformUrl?: string | null;
}): string {
  const title = item.title?.trim();
  if (title && !looksLikeTechnicalId(title)) return title;
  return "未命名作品";
}

export function looksLikeTechnicalId(value: string): boolean {
  const t = value.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) return true;
  if (/^(pub|post|art|snap|run|fb)_/i.test(t)) return true;
  if (/^[0-9a-f]{24,}$/i.test(t)) return true;
  return false;
}

export function boundVideoLabel(hasBinding: boolean): string {
  return hasBinding ? "已绑定成片" : "未绑定成片";
}

export function monitoringPrimaryCta(input: { hasMetrics: boolean; hasAnalysis: boolean }): {
  label: string;
  kind: "enter-metrics" | "start-review" | "view-review";
} {
  if (!input.hasMetrics) return { label: "录入数据", kind: "enter-metrics" };
  if (!input.hasAnalysis) return { label: "开始AI复盘", kind: "start-review" };
  return { label: "查看AI复盘", kind: "view-review" };
}

export function pagePrimaryCta(state: "register" | "metrics" | "analyze" | "view"): { label: string } {
  switch (state) {
    case "register":
      return { label: "登记作品" };
    case "metrics":
      return { label: "录入数据" };
    case "analyze":
      return { label: "开始AI复盘" };
    case "view":
      return { label: "查看复盘" };
  }
}

export function findingTypeCopy(type?: string): string {
  switch (type) {
    case "STRENGTH":
      return "表现较好的地方";
    case "WEAKNESS":
      return "可以改进的地方";
    case "OBSERVATION":
      return "观察结果";
    case "OPPORTUNITY":
      return "可以尝试";
    case "HYPOTHESIS":
      return "待验证假设";
    default:
      return "观察结果";
  }
}

export function confidenceCopy(value?: string): string {
  switch (value) {
    case "HIGH":
      return "证据较充分";
    case "MEDIUM":
      return "有一定依据";
    case "LOW":
      return "依据有限";
    case "UNKNOWN":
      return "证据不足";
    default:
      return "";
  }
}

export function causalityCopy(value?: string): string {
  switch (value) {
    case "CORRELATED":
      return "可能相关";
    case "PLAUSIBLE":
      return "值得继续验证";
    default:
      return "";
  }
}

export function recommendationGroupLabel(raw?: string): string {
  switch (raw) {
    case "CONTENT_PLANNING":
      return "内容方向";
    case "SCRIPT_GENERATION":
    case "SCRIPT":
      return "脚本";
    case "DIRECTOR":
    case "VIDEO":
      return "视频表现";
    case "PUBLICATION":
    case "PUBLISH":
      return "发布表达";
    case "POSITIONING":
      return "账号定位";
    default:
      return "内容方向";
  }
}

export function reviewActionLabel(action: "approve" | "reject" | "defer"): string {
  switch (action) {
    case "approve":
      return "采纳";
    case "reject":
      return "不采纳";
    case "defer":
      return "稍后再看";
  }
}

export function metricSourceUserCopy(source?: string): string {
  if (source === "MANUAL" || source === "MANUAL_IMPORT" || source === "MANUAL_ENTRY" || !source) {
    return "手动录入";
  }
  if (source === "IMPORT") return "文件导入";
  return "手动录入";
}

export function trendDelta(prev?: number | null, next?: number | null): number | null {
  if (typeof prev !== "number" || typeof next !== "number") return null;
  return next - prev;
}

export function trendPercent(prev?: number | null, next?: number | null): string | null {
  if (typeof prev !== "number" || typeof next !== "number") return null;
  if (prev <= 0) return null;
  const pct = ((next - prev) / prev) * 100;
  if (!Number.isFinite(pct)) return null;
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded}%`;
}

export function mayShowBenchmarkClaim(_hasBaseline: boolean): boolean {
  return false;
}

export function mayShowRetentionClaim(retentionValue?: number | null): boolean {
  return typeof retentionValue === "number" && Number.isFinite(retentionValue);
}

export function integerFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return METRICS_NONNEGATIVE_ERROR;
  return null;
}

export function hubNextAction(input: {
  pendingPublishCount: number;
  pendingRegisterCount: number;
  waitingMetricsCount: number;
  analysisReadyCount: number;
}): { label: string; bucket: string } | null {
  if (input.pendingPublishCount > 0) {
    return {
      label: `还有 ${input.pendingPublishCount} 条视频等待手动发布`,
      bucket: "待发布",
    };
  }
  if (input.pendingRegisterCount > 0) {
    return {
      label: "这条作品还没有登记链接",
      bucket: "待登记",
    };
  }
  if (input.waitingMetricsCount > 0) {
    return {
      label: "已登记作品还没有数据，可以先录入第一组数据",
      bucket: "监控中",
    };
  }
  if (input.analysisReadyCount > 0) {
    return {
      label: "已有数据，可以开始 AI 复盘",
      bucket: "待复盘",
    };
  }
  return null;
}

export function insufficientReviewCopy(): string {
  return "目前数据还不足以进行有效复盘。建议再补充一组数据后再分析。";
}

export function analysisErrorCopy(): { title: string; body: string } {
  return {
    title: "复盘暂时没有完成",
    body: "可以稍后重试。历史数据不会丢失。",
  };
}

export function staleAnalysisCopy(): string {
  return "有新的数据，建议重新复盘";
}

export function forceReanalysisCopy(): string {
  return "使用最新数据重新复盘";
}

export function feedbackHandoffCopy(): string {
  return "这些建议将在下一轮内容规划时提供参考";
}

export function applyFeedbackCopy(): string {
  return "准备应用到下一轮内容";
}

export function notAutoAppliedCopy(): string {
  return "尚未自动应用。下一轮内容规划前仍需你确认。";
}

export function nowLocalDatetimeValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function evidenceFromCounts(label: string, prev?: number | null, next?: number | null): string | null {
  if (typeof prev === "number" && typeof next === "number") {
    return `${label}从 ${prev.toLocaleString("zh-CN")} 增长到 ${next.toLocaleString("zh-CN")}`;
  }
  if (typeof next === "number") {
    return `当前${label}为 ${next.toLocaleString("zh-CN")}`;
  }
  return null;
}

export function likeRateEvidence(views?: number | null, likes?: number | null): string | null {
  if (typeof views !== "number" || views <= 0 || typeof likes !== "number") return null;
  const rate = Math.round((likes / views) * 1000) / 10;
  if (!Number.isFinite(rate)) return null;
  return `当前点赞率为 ${rate}%`;
}

export function overclaimRewrite(): string {
  return "开头结构可能与当前表现有关，建议在后续内容继续验证。";
}

export function containsForbiddenAutoPublish(text: string): boolean {
  return /一键发布|立即发布到抖音|自动发布/.test(text);
}

export function containsForbiddenPlatformVerifiedLie(text: string, real: boolean): boolean {
  return !real && /平台已验证/.test(text);
}
