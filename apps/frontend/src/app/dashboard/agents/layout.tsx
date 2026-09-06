import { LegacyDebugGate } from "../../../lib/legacy-debug-gate";

export default function LegacyAgentsLayout({ children }: { children: React.ReactNode }) {
  return <LegacyDebugGate>{children}</LegacyDebugGate>;
}
