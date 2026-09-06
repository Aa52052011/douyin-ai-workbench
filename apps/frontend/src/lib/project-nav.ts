export const PROJECT_NAV = [
  {
    id: "overview",
    label: "概览",
    href: (projectId: string) => `/dashboard/projects/${projectId}`,
    exact: true,
  },
  {
    id: "foundation",
    label: "基础",
    items: [
      { id: "product", label: "产品信息", href: (projectId: string) => `/dashboard/projects/${projectId}/product` },
      {
        id: "positioning",
        label: "账号定位",
        href: (projectId: string) => `/dashboard/projects/${projectId}/positioning`,
      },
    ],
  },
  {
    id: "market",
    label: "市场与策略",
    items: [
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
    ],
  },
  {
    id: "content",
    label: "内容生产",
    items: [
      { id: "plans", label: "内容计划", href: (projectId: string) => `/dashboard/projects/${projectId}/content/plans` },
      {
        id: "scripts",
        label: "脚本",
        href: (projectId: string) => `/dashboard/projects/${projectId}/content/scripts`,
      },
      { id: "videos", label: "视频", href: (projectId: string) => `/dashboard/projects/${projectId}/content/videos` },
    ],
  },
  {
    id: "publish",
    label: "发布与数据",
    items: [
      { id: "publish", label: "发布", href: (projectId: string) => `/dashboard/projects/${projectId}/publish` },
      {
        id: "performance",
        label: "表现与建议",
        href: (projectId: string) => `/dashboard/projects/${projectId}/performance`,
      },
    ],
  },
] as const;

export function isProjectNavActive(pathname: string, href: string, exact = false): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
