export const PROJECT_MAIN_NAV = [
  {
    id: "overview",
    label: "项目概览",
    href: (projectId: string) => `/dashboard/projects/${projectId}`,
    exact: true,
  },
  {
    id: "positioning",
    label: "账号定位",
    href: (projectId: string) => `/dashboard/projects/${projectId}/positioning`,
  },
  {
    id: "plans",
    label: "内容计划",
    href: (projectId: string) => `/dashboard/projects/${projectId}/content/plans`,
  },
  {
    id: "scripts",
    label: "脚本",
    href: (projectId: string) => `/dashboard/projects/${projectId}/content/scripts`,
  },
  {
    id: "videos",
    label: "视频",
    href: (projectId: string) => `/dashboard/projects/${projectId}/content/videos`,
  },
  {
    id: "publish",
    label: "发布与数据",
    href: (projectId: string) => `/dashboard/projects/${projectId}/publish`,
  },
] as const;

export const PROJECT_NAV = PROJECT_MAIN_NAV;

export const PROJECT_FOUNDATION_NAV = [
  { id: "product", label: "产品信息", href: (projectId: string) => `/dashboard/projects/${projectId}/product` },
  {
    id: "research",
    label: "市场调研",
    href: (projectId: string) => `/dashboard/projects/${projectId}/market/research`,
  },
  {
    id: "analysis",
    label: "市场分析",
    href: (projectId: string) => `/dashboard/projects/${projectId}/market/analysis`,
  },
  { id: "strategy", label: "推广策略", href: (projectId: string) => `/dashboard/projects/${projectId}/strategy` },
  { id: "assets", label: "素材库", href: (projectId: string) => `/dashboard/projects/${projectId}/assets` },
] as const;

export function isProjectNavActive(pathname: string, href: string, exact = false): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
