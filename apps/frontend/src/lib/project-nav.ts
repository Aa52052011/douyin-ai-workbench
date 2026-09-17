import type { ProjectStatusFacts } from "./project-status";
import {
  currentCyclePublishComplete,
  currentCycleReviewComplete,
  currentCycleScriptsComplete,
  currentCycleVideosComplete,
  currentCycleWorkflowNavId,
} from "./ux/current-cycle";

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
    label: "选题与脚本",
    href: (projectId: string) => `/dashboard/projects/${projectId}/content/scripts`,
  },
  {
    id: "videos",
    label: "视频制作",
    href: (projectId: string) => `/dashboard/projects/${projectId}/content/videos`,
  },
  {
    id: "publish",
    label: "发布与数据",
    href: (projectId: string) => `/dashboard/projects/${projectId}/publish`,
  },
  {
    id: "review",
    label: "AI复盘",
    href: (projectId: string) => `/dashboard/projects/${projectId}/performance`,
  },
] as const;

export const PROJECT_NAV = PROJECT_MAIN_NAV;

export type ProjectNavId = (typeof PROJECT_MAIN_NAV)[number]["id"];
export type ProjectWorkflowMark = "done" | "current" | "todo";

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

export function isProjectNavItemDone(id: ProjectNavId, facts: ProjectStatusFacts | null): boolean {
  if (!facts) return false;
  switch (id) {
    case "overview":
      return false;
    case "positioning":
      return Boolean(facts.positioningValid);
    case "plans":
      return Boolean(facts.hasScriptEligiblePlan || facts.latestPlanStatus === "CONFIRMED");
    case "scripts":
      return currentCycleScriptsComplete(facts);
    case "videos":
      return currentCycleVideosComplete(facts);
    case "publish":
      return currentCyclePublishComplete(facts);
    case "review":
      return currentCycleReviewComplete(facts);
    default:
      return false;
  }
}

export function projectWorkflowMark(id: ProjectNavId, current: boolean, facts: ProjectStatusFacts | null): ProjectWorkflowMark {
  if (isProjectNavItemDone(id, facts)) return "done";
  if (current) return "current";
  if (facts && id === currentCycleWorkflowNavId(facts) && id !== "overview") return "current";
  return "todo";
}

export function hideProjectShellNextActionBar(pathname: string, projectId: string): boolean {
  if (pathname === `/dashboard/projects/${projectId}`) return true;
  return (
    /\/positioning(\/|$)/.test(pathname) ||
    /\/content\/plans(\/|$)/.test(pathname) ||
    /\/content\/scripts(\/|$)/.test(pathname) ||
    /\/content\/videos(\/|$)/.test(pathname) ||
    /\/publish(\/|$)/.test(pathname) ||
    /\/performance(\/|$)/.test(pathname)
  );
}

export function workflowMarkSymbol(mark: ProjectWorkflowMark): string {
  if (mark === "done") return "✓";
  if (mark === "current") return "●";
  return "○";
}

export function adjacentProjectNav(pathname: string, projectId: string): { back?: { href: string; label: string }; next?: { href: string; label: string }; current?: string } {
  const index = PROJECT_MAIN_NAV.findIndex((item) => isProjectNavActive(pathname, item.href(projectId), "exact" in item ? item.exact : false));
  if (index < 0) return {};
  const current = PROJECT_MAIN_NAV[index];
  const prev = PROJECT_MAIN_NAV[index - 1];
  const nxt = PROJECT_MAIN_NAV[index + 1];
  return {
    current: current.label,
    back: prev ? { href: prev.href(projectId), label: `返回${prev.label}` } : { href: "/dashboard/projects", label: "返回项目列表" },
    next: nxt ? { href: nxt.href(projectId), label: nxt.label } : undefined,
  };
}
