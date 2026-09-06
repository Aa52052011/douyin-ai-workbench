const STATUS_LABELS: Record<string, string> = {
  PENDING: "等待中",
  RUNNING: "生成中",
  PROCESSING: "生成中",
  COMPLETED: "已完成",
  FAILED: "失败",
  READY: "可使用",
  DRAFT: "草稿",
  CONFIRMED: "已确认",
  ARCHIVED: "已归档",
  PUBLISHED: "已发布",
  UNKNOWN_EXTERNAL_STATE: "发布状态待确认",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) {
    return "未知";
  }
  return STATUS_LABELS[status] ?? status;
}

export function statusTone(status: string | null | undefined): "neutral" | "progress" | "success" | "danger" {
  switch (status) {
    case "FAILED":
      return "danger";
    case "COMPLETED":
    case "CONFIRMED":
    case "PUBLISHED":
    case "READY":
      return "success";
    case "RUNNING":
    case "PROCESSING":
    case "PENDING":
      return "progress";
    default:
      return "neutral";
  }
}
