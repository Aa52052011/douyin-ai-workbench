export const STATUS_VOCABULARY_MIGRATION_V6 = {
  dualSystems: ["ui-labels.ts uiStatusLabel", "ux/status-map.ts productStatusLabel"],
  policy: "Do not delete ui-labels.ts in Wave 6. Prefer ProductStatusBadge on formal pages.",
  map: {
    PENDING: { product: "待开始 / 进行中", uiLabels: "等待中 / 正在制作" },
    DRAFT: { product: "待确认", uiLabels: "等待审核" },
    COMPLETED: { product: "已完成", uiLabels: "成片完成" },
    PUBLISHED: { product: "已完成", uiLabels: "已发布" },
    MONITORING_READY: { product: "等待数据", uiLabels: "fallback 处理中" },
  },
} as const;

export const TOAST_COPY = {
  saveSuccess: "已保存",
  submitSuccess: "已提交",
  actionFailed: "这次没能完成，请重试",
} as const;

export const UX_TRUTH_FORBIDDEN_CLAIMS = [
  "已永久保存",
  "已自动应用",
  "完整AI复盘已完成",
  "平台已验证",
  "下载完成",
  "已自动发到抖音",
] as const;
