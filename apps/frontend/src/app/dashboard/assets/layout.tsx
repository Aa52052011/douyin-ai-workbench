import { LegacyDebugGate } from "../../../lib/legacy-debug-gate";

export default function LegacyAssetsLayout({ children }: { children: React.ReactNode }) {
  return <LegacyDebugGate>{children}</LegacyDebugGate>;
}
