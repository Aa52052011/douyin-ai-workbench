export const PRODUCT_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "GENERATING",
  "NEEDS_REVIEW",
  "COMPLETED",
  "BLOCKED",
  "FAILED",
  "PAUSED",
] as const;

export type ProductStatusV1 = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABEL: Record<ProductStatusV1, string> = {
  NOT_STARTED: "待开始",
  IN_PROGRESS: "进行中",
  GENERATING: "生成中",
  NEEDS_REVIEW: "待确认",
  COMPLETED: "已完成",
  BLOCKED: "需要处理",
  FAILED: "失败",
  PAUSED: "已暂停",
};

const INTERNAL_TO_PRODUCT: Record<string, ProductStatusV1> = {
  PENDING: "NOT_STARTED",
  NOT_STARTED: "NOT_STARTED",
  not_started: "NOT_STARTED",
  RUNNING: "GENERATING",
  PROCESSING: "GENERATING",
  GENERATING: "GENERATING",
  QUALITY_CHECK: "GENERATING",
  current: "IN_PROGRESS",
  IN_PROGRESS: "IN_PROGRESS",
  DRAFT: "NEEDS_REVIEW",
  WAITING_REVIEW: "NEEDS_REVIEW",
  HUMAN_REVIEW_REQUIRED: "NEEDS_REVIEW",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  COMPLETED: "COMPLETED",
  CONFIRMED: "COMPLETED",
  READY: "COMPLETED",
  PUBLISHED: "COMPLETED",
  VIDEO_READY: "COMPLETED",
  SCRIPT_READY: "COMPLETED",
  ARCHIVED: "COMPLETED",
  completed: "COMPLETED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  unknown: "BLOCKED",
  STALE_BY_NEWER_METRICS: "BLOCKED",
  PAUSED: "PAUSED",
  AWAITING_MANUAL_PUBLICATION: "NEEDS_REVIEW",
  MONITORING_READY: "NEEDS_REVIEW",
  REGISTERED: "IN_PROGRESS",
  MONITORING_ACTIVE: "IN_PROGRESS",
};

export function toProductStatus(internal: string | null | undefined): ProductStatusV1 {
  if (!internal) return "IN_PROGRESS";
  return INTERNAL_TO_PRODUCT[internal] ?? "IN_PROGRESS";
}

export function productStatusLabel(internal: string | null | undefined): string {
  switch (internal) {
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
    default:
      return PRODUCT_STATUS_LABEL[toProductStatus(internal)];
  }
}

export function productStatusTone(
  status: ProductStatusV1,
): "neutral" | "progress" | "success" | "danger" | "warning" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
    case "BLOCKED":
      return "danger";
    case "GENERATING":
    case "IN_PROGRESS":
      return "progress";
    case "NEEDS_REVIEW":
    case "PAUSED":
      return "warning";
    default:
      return "neutral";
  }
}
