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

export function boundVideoLabel(hasBinding: boolean, title?: string | null): string {
  if (!hasBinding) return "未绑定成片";
  const name = title?.trim();
  return name || "已绑定成片";
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
    case "INSUFFICIENT":
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
    case "CTA":
      return "互动引导";
    case "ENGAGEMENT":
      return "互动";
    case "SHAREABILITY":
      return "分享结构";
    case "CONTENT_DIRECTION":
      return "内容方向";
    case "FORMAT":
      return "传播包装";
    case "AUDIENCE":
    case "ACCOUNT_POSITIONING":
    case "POSITIONING":
      return "账号定位";
    case "DATA_INSUFFICIENT":
      return "数据不足";
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

export const INSUFFICIENT_EVIDENCE_COPY = "证据不足";

type CountSnapshot = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  favorites?: number | null;
  newFollowers?: number | null;
  completionRate?: number | null;
  averageWatchTimeSeconds?: number | null;
};

type CountField = {
  key: keyof CountSnapshot;
  label: string;
  percent: boolean;
};

const LIKE_FIELD: CountField = { key: "likes", label: "点赞", percent: true };
const COMMENT_FIELD: CountField = { key: "comments", label: "评论", percent: true };
const SHARE_FIELD: CountField = { key: "shares", label: "分享", percent: true };
const FAVORITE_FIELD: CountField = { key: "favorites", label: "收藏", percent: true };
const VIEW_FIELD: CountField = { key: "views", label: "播放量", percent: true };
const FOLLOWER_FIELD: CountField = { key: "newFollowers", label: "新增粉丝", percent: false };

const INSIGHT_COUNT_FIELD: Record<string, CountField> = {
  HIGH_LIKE_RATE: LIKE_FIELD,
  LOW_LIKE_RATE: LIKE_FIELD,
  HIGH_COMMENT_RATE: COMMENT_FIELD,
  LOW_COMMENT_RATE: COMMENT_FIELD,
  HIGH_SHARE_RATE: SHARE_FIELD,
  LOW_SHARE_RATE: SHARE_FIELD,
  HIGH_FAVORITE_RATE: FAVORITE_FIELD,
  LOW_FAVORITE_RATE: FAVORITE_FIELD,
  HIGH_VIEW_RATE: VIEW_FIELD,
  HIGH_VIEWS: VIEW_FIELD,
  LOW_VIEWS: VIEW_FIELD,
  HIGH_FOLLOWER_GROWTH: FOLLOWER_FIELD,
  LOW_FOLLOWER_GROWTH: FOLLOWER_FIELD,
  FOLLOWER_CHANGE: FOLLOWER_FIELD,
};

const ENGAGEMENT_FIELDS: CountField[] = [LIKE_FIELD, COMMENT_FIELD, SHARE_FIELD, FAVORITE_FIELD];
const DECREASE_FIELDS: CountField[] = [VIEW_FIELD, LIKE_FIELD, COMMENT_FIELD, SHARE_FIELD, FAVORITE_FIELD, FOLLOWER_FIELD];

function formatEvidenceNumber(value: number): string {
  return String(value);
}

function percentChangeText(prev: number, next: number): string | null {
  const raw = trendPercent(prev, next);
  if (!raw) return null;
  if (next - prev > 0 && !raw.startsWith("+") && !raw.startsWith("-")) {
    return `+${raw}`;
  }
  return raw;
}

export function evidenceFromCounts(
  label: string,
  prev?: number | null,
  next?: number | null,
  options?: { percent?: boolean },
): string | null {
  if (typeof prev === "number" && typeof next === "number") {
    const delta = next - prev;
    const deltaText = delta > 0 ? `+${delta}` : String(delta);
    const pct = options?.percent === false ? null : percentChangeText(prev, next);
    const change = pct ? `${deltaText} / ${pct}` : deltaText;
    return `${label}从 ${formatEvidenceNumber(prev)} 到 ${formatEvidenceNumber(next)}（${change}）`;
  }
  if (typeof next === "number") {
    return `当前${label}为 ${formatEvidenceNumber(next)}`;
  }
  return null;
}

function evidenceForField(field: CountField, prev?: CountSnapshot, next?: CountSnapshot): string | null {
  return evidenceFromCounts(field.label, prev?.[field.key], next?.[field.key], { percent: field.percent });
}

function joinEvidence(parts: Array<string | null>): string | null {
  const present = parts.filter((item): item is string => Boolean(item));
  return present.length > 0 ? present.join("；") : null;
}

function completionEvidence(prev?: CountSnapshot, next?: CountSnapshot): string | null {
  const prevRate = prev?.completionRate;
  const nextRate = next?.completionRate;
  if (!mayShowRetentionClaim(prevRate) && !mayShowRetentionClaim(nextRate)) {
    return null;
  }
  const asPercent = (value: number) => `${Math.round(value * 1000) / 10}%`;
  if (typeof prevRate === "number" && typeof nextRate === "number") {
    return `完播率从 ${asPercent(prevRate)} 到 ${asPercent(nextRate)}`;
  }
  if (typeof nextRate === "number") {
    return `当前完播率为 ${asPercent(nextRate)}`;
  }
  return null;
}

export function evidenceForInsight(
  code: string | undefined,
  prev?: CountSnapshot | null,
  next?: CountSnapshot | null,
): string {
  if (!code) {
    return INSUFFICIENT_EVIDENCE_COPY;
  }
  if (code === "STRONG_COMPLETION_RATE" || code === "WEAK_COMPLETION_RATE") {
    return completionEvidence(prev ?? undefined, next ?? undefined) ?? INSUFFICIENT_EVIDENCE_COPY;
  }
  if (code === "HIGH_ENGAGEMENT_RATE" || code === "LOW_ENGAGEMENT_RATE") {
    return (
      joinEvidence(ENGAGEMENT_FIELDS.map((field) => evidenceForField(field, prev ?? undefined, next ?? undefined))) ??
      INSUFFICIENT_EVIDENCE_COPY
    );
  }
  if (code === "METRIC_DECREASE_DETECTED") {
    const decreased = DECREASE_FIELDS.filter((field) => {
      const a = prev?.[field.key];
      const b = next?.[field.key];
      return typeof a === "number" && typeof b === "number" && b < a;
    }).map((field) => evidenceForField(field, prev ?? undefined, next ?? undefined));
    return joinEvidence(decreased) ?? INSUFFICIENT_EVIDENCE_COPY;
  }
  const mapped = INSIGHT_COUNT_FIELD[code];
  if (mapped) {
    return evidenceForField(mapped, prev ?? undefined, next ?? undefined) ?? INSUFFICIENT_EVIDENCE_COPY;
  }
  return INSUFFICIENT_EVIDENCE_COPY;
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

export function publicationTruthCopy(): string {
  return "这条作品由你手动登记。系统尚未通过抖音接口验证发布状态。";
}

export function analysisReadinessCopy(snapshotCount: number, dataSufficiency?: string): string {
  if (snapshotCount < 1) {
    return "还没有表现数据，先录入你在抖音看到的数字。";
  }
  if (dataSufficiency === "INSUFFICIENT" || dataSufficiency === "INSUFFICIENT_DATA") {
    return "目前数据还不够，建议再录入一组后再看 AI 复盘。";
  }
  if (snapshotCount === 1) {
    return "目前只有一组数据。再录入一次后可以看到变化。";
  }
  return "可以查看当前表现。AI 复盘以系统已有分析结果为准。";
}
