import { GLOBAL_NAV } from "./global-nav";
import { isProjectNavActive, PROJECT_MAIN_NAV } from "./project-nav";
import { resolveWorkflowBackNav } from "./ux/workflow-back-nav";

export function activeGlobalNavIds(pathname: string): string[] {
  return GLOBAL_NAV.filter((item) => item.match(pathname)).map((item) => item.id);
}

export function activeProjectNavIds(pathname: string, projectId: string): string[] {
  return PROJECT_MAIN_NAV.filter((item) =>
    isProjectNavActive(pathname, item.href(projectId), "exact" in item ? item.exact : false),
  ).map((item) => item.id);
}

export function isProjectWorkspacePath(pathname: string): boolean {
  return /^\/dashboard\/projects\/[^/]+/.test(pathname);
}

export function hasConflictingGlobalPublishActive(pathname: string): boolean {
  return isProjectWorkspacePath(pathname) && activeGlobalNavIds(pathname).includes("publish-data");
}

export type NavScopeRow = {
  route: string;
  globalActive: string[];
  projectActive: string[];
  backTarget: string;
};

export function navScopeMatrix(projectId: string): NavScopeRow[] {
  const pub = "pub-scope";
  const rows: Array<{ route: string; page?: Parameters<typeof resolveWorkflowBackNav>[0]["page"] }> = [
    { route: "/dashboard" },
    { route: "/dashboard/projects" },
    { route: `/dashboard/projects/${projectId}`, page: "project-overview" },
    { route: `/dashboard/projects/${projectId}/positioning`, page: "positioning" },
    { route: `/dashboard/projects/${projectId}/content/plans`, page: "content-plan" },
    { route: `/dashboard/projects/${projectId}/content/scripts`, page: "script" },
    { route: `/dashboard/projects/${projectId}/content/videos`, page: "video" },
    { route: `/dashboard/projects/${projectId}/publish`, page: "publish" },
    { route: `/dashboard/projects/${projectId}/performance`, page: "ai-review" },
    { route: "/dashboard/monitoring", page: "monitoring-list" },
    { route: `/dashboard/monitoring/${pub}`, page: "publication-detail" },
    { route: "/dashboard/settings" },
  ];
  return rows.map((row) => ({
    route: row.route,
    globalActive: activeGlobalNavIds(row.route),
    projectActive: isProjectWorkspacePath(row.route) ? activeProjectNavIds(row.route, projectId) : [],
    backTarget: row.page ? resolveWorkflowBackNav({ page: row.page, projectId }).href : "",
  }));
}
