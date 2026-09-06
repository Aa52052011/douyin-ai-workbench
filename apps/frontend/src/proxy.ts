import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isLegacyDebugRoute, shouldBlockLegacyDebugRoutes } from "./lib/legacy-debug-routes";

export function proxy(request: NextRequest) {
  if (shouldBlockLegacyDebugRoutes() && isLegacyDebugRoute(request.nextUrl.pathname)) {
    return NextResponse.rewrite(new URL("/_not-found", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/agents",
    "/dashboard/agents/:path*",
    "/dashboard/content-planning",
    "/dashboard/content-planning/:path*",
    "/dashboard/scripts",
    "/dashboard/scripts/:path*",
    "/dashboard/videos",
    "/dashboard/videos/:path*",
    "/dashboard/assets",
    "/dashboard/assets/:path*",
  ],
};
