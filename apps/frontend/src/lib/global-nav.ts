export const GLOBAL_NAV_V2 = [
  { id: "workbench", href: "/dashboard", label: "工作台", match: (path: string) => path === "/dashboard" },
  {
    id: "projects",
    href: "/dashboard/projects",
    label: "项目",
    match: (path: string) => path === "/dashboard/projects" || path.startsWith("/dashboard/projects/"),
  },
  {
    id: "publish-data",
    href: "/dashboard/monitoring",
    label: "发布与数据",
    match: (path: string) =>
      path.startsWith("/dashboard/monitoring") ||
      /\/publish(?:\/|$)/.test(path) ||
      /\/performance(?:\/|$|\?)/.test(path),
  },
  { id: "settings", href: "/dashboard/settings", label: "设置", match: (path: string) => path.startsWith("/dashboard/settings") },
] as const;

/** Product labels. Kept as GLOBAL_NAV so existing imports pick up V2. */
export const GLOBAL_NAV = GLOBAL_NAV_V2;

export const HIDDEN_ENGINEERING_NAV_LABELS = [
  "Agent 测试",
  "账号定位",
  "内容规划",
  "脚本",
  "素材",
  "成片",
] as const;

export const LEGACY_NAV_HIDDEN_FROM_NORMAL_USER = [
  "/dashboard/agents",
  "/dashboard/content-planning",
  "/dashboard/scripts",
  "/dashboard/videos",
  "/dashboard/assets",
] as const;
