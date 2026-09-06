import { LegacyDebugGate } from "../../../lib/legacy-debug-gate";

export default function LegacyContentPlanningLayout({ children }: { children: React.ReactNode }) {
  return <LegacyDebugGate>{children}</LegacyDebugGate>;
}
