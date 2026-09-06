export const LEGACY_DEBUG_ROUTE_PREFIXES = [
  "/dashboard/agents",
  "/dashboard/content-planning",
  "/dashboard/scripts",
  "/dashboard/videos",
  "/dashboard/assets",
] as const;

export const LEGACY_DEBUG_ROUTES = [
  "/dashboard/agents",
  "/dashboard/agents/account-positioning",
  "/dashboard/content-planning",
  "/dashboard/scripts",
  "/dashboard/scripts/:id",
  "/dashboard/videos",
  "/dashboard/videos/:id",
  "/dashboard/assets",
] as const;

export const FORMAL_PRODUCT_ROUTES = [
  "/dashboard",
  "/dashboard/projects",
  "/dashboard/projects/:projectId",
  "/dashboard/projects/:projectId/product",
  "/dashboard/projects/:projectId/positioning",
  "/dashboard/projects/:projectId/market/research",
  "/dashboard/projects/:projectId/market/analysis",
  "/dashboard/projects/:projectId/strategy",
  "/dashboard/projects/:projectId/content/plans",
  "/dashboard/projects/:projectId/content/scripts",
  "/dashboard/projects/:projectId/content/videos",
  "/dashboard/projects/:projectId/publish",
  "/dashboard/projects/:projectId/performance",
  "/dashboard/settings",
] as const;

export function normalizePathname(pathname: string): string {
  const path = pathname.split("?")[0] ?? pathname;
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

export function isLegacyDebugRoute(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return LEGACY_DEBUG_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isFormalProductRoute(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === "/dashboard" || path === "/dashboard/settings" || path.startsWith("/dashboard/settings/")) {
    return true;
  }
  return path === "/dashboard/projects" || path.startsWith("/dashboard/projects/");
}

export function shouldBlockLegacyDebugRoutes(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}
