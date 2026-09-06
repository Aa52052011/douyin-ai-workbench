import { LegacyDebugGate } from "../../../lib/legacy-debug-gate";

export default function LegacyScriptsLayout({ children }: { children: React.ReactNode }) {
  return <LegacyDebugGate>{children}</LegacyDebugGate>;
}
