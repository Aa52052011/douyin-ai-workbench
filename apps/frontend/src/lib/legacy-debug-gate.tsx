import { notFound } from "next/navigation";
import { shouldBlockLegacyDebugRoutes } from "./legacy-debug-routes";

export function LegacyDebugGate({ children }: { children: React.ReactNode }) {
  if (shouldBlockLegacyDebugRoutes()) {
    notFound();
  }
  return children;
}
