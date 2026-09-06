export const GLOBAL_NAV = [
  { href: "/dashboard", label: "工作台", match: (path: string) => path === "/dashboard" },
  {
    href: "/dashboard/projects",
    label: "项目",
    match: (path: string) => path === "/dashboard/projects" || path.startsWith("/dashboard/projects/"),
  },
  { href: "/dashboard/settings", label: "设置", match: (path: string) => path.startsWith("/dashboard/settings") },
] as const;

export const HIDDEN_ENGINEERING_NAV_LABELS = [
  "Agent 测试",
  "账号定位",
  "内容规划",
  "脚本",
  "素材",
  "成片",
] as const;
