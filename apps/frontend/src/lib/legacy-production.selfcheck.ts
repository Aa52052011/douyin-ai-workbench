import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { GLOBAL_NAV, HIDDEN_ENGINEERING_NAV_LABELS } from "./global-nav";
import { PROJECT_NAV } from "./project-nav";
import {
  FORMAL_PRODUCT_ROUTES,
  LEGACY_DEBUG_ROUTE_PREFIXES,
  LEGACY_DEBUG_ROUTES,
  isFormalProductRoute,
  isLegacyDebugRoute,
  shouldBlockLegacyDebugRoutes,
} from "./legacy-debug-routes";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "..");

function source(rel: string): string {
  return readFileSync(join(frontendRoot, rel), "utf8");
}

function flattenProjectHrefs(projectId: string): string[] {
  return PROJECT_NAV.map((item) => item.href(projectId));
}

function run() {
  const routesSource = source("lib/legacy-debug-routes.ts");
  const gateSource = source("lib/legacy-debug-gate.tsx");
  const proxySource = source("proxy.ts");
  const layoutFiles = [
    "app/dashboard/agents/layout.tsx",
    "app/dashboard/content-planning/layout.tsx",
    "app/dashboard/scripts/layout.tsx",
    "app/dashboard/videos/layout.tsx",
    "app/dashboard/assets/layout.tsx",
  ];
  const layoutSources = layoutFiles.map((file) => source(file));

  assert.deepEqual([...LEGACY_DEBUG_ROUTE_PREFIXES], [
    "/dashboard/agents",
    "/dashboard/content-planning",
    "/dashboard/scripts",
    "/dashboard/videos",
    "/dashboard/assets",
  ]);
  assert.deepEqual([...LEGACY_DEBUG_ROUTES], [
    "/dashboard/agents",
    "/dashboard/agents/account-positioning",
    "/dashboard/content-planning",
    "/dashboard/scripts",
    "/dashboard/scripts/:id",
    "/dashboard/videos",
    "/dashboard/videos/:id",
    "/dashboard/assets",
  ]);
  assert.equal(FORMAL_PRODUCT_ROUTES.includes("/dashboard"), true);
  assert.equal(FORMAL_PRODUCT_ROUTES.includes("/dashboard/settings"), true);

  assert.equal(shouldBlockLegacyDebugRoutes("production"), true);
  assert.equal(shouldBlockLegacyDebugRoutes("development"), false);
  assert.equal(shouldBlockLegacyDebugRoutes("test"), false);

  assert.equal(isLegacyDebugRoute("/dashboard/agents"), true);
  assert.equal(isLegacyDebugRoute("/dashboard/agents/account-positioning"), true);
  assert.equal(isLegacyDebugRoute("/dashboard/content-planning"), true);
  assert.equal(isLegacyDebugRoute("/dashboard/scripts"), true);
  assert.equal(isLegacyDebugRoute("/dashboard/scripts/script_1"), true);
  assert.equal(isLegacyDebugRoute("/dashboard/videos"), true);
  assert.equal(isLegacyDebugRoute("/dashboard/videos/video_1"), true);
  assert.equal(isLegacyDebugRoute("/dashboard/assets"), true);

  assert.equal(isLegacyDebugRoute("/dashboard"), false);
  assert.equal(isLegacyDebugRoute("/dashboard/settings"), false);
  assert.equal(isLegacyDebugRoute("/dashboard/projects"), false);
  assert.equal(isLegacyDebugRoute("/dashboard/projects/proj_1"), false);
  assert.equal(isLegacyDebugRoute("/dashboard/projects/proj_1/positioning"), false);
  assert.equal(isLegacyDebugRoute("/dashboard/projects/proj_1/content/scripts"), false);
  assert.equal(isLegacyDebugRoute("/dashboard/projects/proj_1/content/videos"), false);

  assert.equal(isFormalProductRoute("/dashboard"), true);
  assert.equal(isFormalProductRoute("/dashboard/settings"), true);
  assert.equal(isFormalProductRoute("/dashboard/projects/proj_1/content/scripts"), true);
  assert.equal(isFormalProductRoute("/dashboard/projects/proj_1/content/videos"), true);
  assert.equal(isFormalProductRoute("/dashboard/projects/proj_1/positioning"), true);
  assert.equal(isFormalProductRoute("/dashboard/agents"), false);
  assert.equal(isFormalProductRoute("/dashboard/scripts/script_1"), false);

  for (const path of [
    "/dashboard/agents",
    "/dashboard/agents/account-positioning",
    "/dashboard/content-planning",
    "/dashboard/scripts",
    "/dashboard/scripts/x",
    "/dashboard/videos",
    "/dashboard/videos/x",
    "/dashboard/assets",
  ]) {
    assert.equal(isLegacyDebugRoute(path) && shouldBlockLegacyDebugRoutes("production"), true, path);
    assert.equal(isLegacyDebugRoute(path) && shouldBlockLegacyDebugRoutes("development"), false, path);
  }

  assert.equal(gateSource.includes("notFound()"), true);
  assert.equal(gateSource.includes("\"use client\""), false);
  assert.equal(gateSource.includes("useEffect"), false);
  assert.equal(gateSource.includes("router.push"), false);
  assert.equal(gateSource.includes("router.replace"), false);
  assert.equal(proxySource.includes("shouldBlockLegacyDebugRoutes"), true);
  assert.equal(proxySource.includes("isLegacyDebugRoute"), true);
  assert.equal(proxySource.includes("NextResponse.rewrite"), true);
  assert.equal(proxySource.includes("/_not-found"), true);
  assert.equal(proxySource.includes("accessToken"), false);
  assert.equal(proxySource.includes("acf_rt"), false);
  assert.equal(proxySource.includes("auth-session"), false);
  assert.equal(proxySource.includes("includes(\"scripts\")"), false);
  assert.equal(proxySource.includes("includes(\"videos\")"), false);
  assert.equal(routesSource.includes("NEXT_PUBLIC"), false);
  assert.equal(gateSource.includes("NEXT_PUBLIC"), false);
  assert.equal(routesSource.includes("includes(\"scripts\")"), false);
  assert.equal(routesSource.includes("includes(\"videos\")"), false);

  for (const text of layoutSources) {
    assert.equal(text.includes("LegacyDebugGate"), true);
    assert.equal(text.includes("\"use client\""), false);
    assert.equal(text.includes("useEffect"), false);
    assert.equal(text.includes("router.push"), false);
    assert.equal(text.includes("NEXT_PUBLIC"), false);
    assert.equal(text.includes("fetch("), false);
    assert.equal(text.includes("method: \"POST\""), false);
  }

  const changed = [routesSource, gateSource, proxySource, ...layoutSources].join("\n");
  assert.equal(changed.includes("// eslint-disable"), false);
  assert.equal(changed.includes("/* eslint-disable"), false);
  assert.equal(changed.includes("INTERNAL_ONLY"), false);
  assert.equal(changed.includes("debug permission"), false);
  assert.equal(/roleHasPermission|INTERNAL_DEBUG/.test(changed), false);

  const implementationFiles = [
    join(frontendRoot, "lib/legacy-debug-routes.ts"),
    join(frontendRoot, "lib/legacy-debug-gate.tsx"),
    join(frontendRoot, "proxy.ts"),
    ...layoutFiles.map((file) => join(frontendRoot, file)),
  ];
  for (const file of implementationFiles) {
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes("NEXT_PUBLIC_ENABLE_DEBUG"), false, relative(frontendRoot, file));
    assert.equal(text.includes("NEXT_PUBLIC_"), false, relative(frontendRoot, file));
  }

  assert.deepEqual(
    GLOBAL_NAV.map((item) => item.label),
    ["工作台", "项目", "发布与数据", "设置"],
  );
  const visible = GLOBAL_NAV.map((item) => item.label as string);
  for (const label of HIDDEN_ENGINEERING_NAV_LABELS) {
    assert.equal(visible.includes(label), false, label);
  }
  const hrefs = flattenProjectHrefs("proj_1");
  assert.deepEqual(hrefs, [
    "/dashboard/projects/proj_1",
    "/dashboard/projects/proj_1/positioning",
    "/dashboard/projects/proj_1/content/plans",
    "/dashboard/projects/proj_1/content/scripts",
    "/dashboard/projects/proj_1/content/videos",
    "/dashboard/projects/proj_1/publish",
  ]);
  for (const href of hrefs) {
    assert.equal(isLegacyDebugRoute(href), false, href);
    assert.equal(isFormalProductRoute(href), true, href);
  }
  assert.equal(
    hrefs.some((href) => href === "/dashboard/agents" || href === "/dashboard/assets"),
    false,
  );

  console.log("legacy-production selfcheck PASS");
}

run();
