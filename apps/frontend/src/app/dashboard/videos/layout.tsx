import { LegacyDebugGate } from "../../../lib/legacy-debug-gate";

export default function LegacyVideosLayout({ children }: { children: React.ReactNode }) {
  return <LegacyDebugGate>{children}</LegacyDebugGate>;
}
