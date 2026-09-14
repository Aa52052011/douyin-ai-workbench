/** Step 13.13 — user-facing Chinese labels. Never render raw enums. */

export const TERM = {
  project: "项目",
  contentPlan: "内容计划",
  topic: "内容",
  script: "脚本",
  video: "成片",
  asset: "素材",
  publication: "发布",
  performance: "数据表现",
  learning: "系统学习",
  reference: "参考内容",
} as const;

const STATUS: Record<string, string> = {
  PENDING: "等待中",
  RUNNING: "正在制作",
  PROCESSING: "正在制作",
  COMPLETED: "成片完成",
  FAILED: "制作失败",
  READY: "可使用",
  DRAFT: "等待审核",
  CONFIRMED: "已确认",
  ARCHIVED: "已归档",
  PUBLISHED: "已发布",
  UNKNOWN_EXTERNAL_STATE: "发布状态待确认",
  NOT_STARTED: "待写脚本",
  WAITING_REVIEW: "等待审核",
  SCRIPT_READY: "脚本已确认",
  VIDEO_READY: "成片完成",
  QUALITY_CHECK: "系统正在检查并优化视频",
  BEST_AVAILABLE: "已生成最佳可用版本",
  BLOCKED: "需要处理",
  NOT_CONFIGURED: "尚未配置",
};

export function uiStatusLabel(status: string | null | undefined): string {
  if (!status) return "未知状态";
  return STATUS[status] ?? "处理中";
}

export function uiStatusTone(status: string | null | undefined): "neutral" | "progress" | "success" | "danger" {
  switch (status) {
    case "FAILED":
    case "BLOCKED":
      return "danger";
    case "COMPLETED":
    case "CONFIRMED":
    case "PUBLISHED":
    case "READY":
    case "VIDEO_READY":
    case "SCRIPT_READY":
      return "success";
    case "RUNNING":
    case "PROCESSING":
    case "PENDING":
    case "QUALITY_CHECK":
      return "progress";
    default:
      return "neutral";
  }
}

export function productionModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case "REAL_FOOTAGE":
      return "真实素材为主";
    case "VOICEOVER_ASSETS":
      return "素材 + 旁白";
    case "AI_ASSISTED":
      return "AI辅助制作";
    case "HYBRID":
      return "混合制作";
    case "DIGITAL_HUMAN_BROLL":
      return "数字人口播";
    default:
      return mode ? "当前制作方式" : "未指定制作方式";
  }
}

export function capabilityLabel(state: "available" | "notConfigured" | "unavailable" | boolean | null | undefined): string {
  if (state === true || state === "available") return "可用";
  if (state === false || state === "notConfigured") return "未配置";
  return "暂不可用";
}

export function videoUserStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "PENDING":
      return "等待制作";
    case "RUNNING":
    case "PROCESSING":
      return "正在制作";
    case "COMPLETED":
      return "成片完成";
    case "FAILED":
      return "制作失败";
    default:
      return uiStatusLabel(status);
  }
}

export function formatDisplayDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "暂无数据";
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatDurationSeconds(total: number | null | undefined): string {
  if (total == null || total < 0 || Number.isNaN(total)) return "—";
  const sec = Math.round(total);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s}秒`;
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

export const RAW_ENUM_LEAKS = [
  "RUNNING",
  "BEST_AVAILABLE",
  "QUALITY_CHECK",
  "FOLLOW_GROWTH",
  "LEAD_GENERATION",
  "AI_ASSISTED",
  "NOT_CONFIGURED",
  "RIGHTS_UNKNOWN",
  "UsageEvent",
  "CostLedger",
  "ResearchRequest",
] as const;

export function hasVisibleRawEnum(text: string): boolean {
  return RAW_ENUM_LEAKS.some((item) => text.includes(item));
}
