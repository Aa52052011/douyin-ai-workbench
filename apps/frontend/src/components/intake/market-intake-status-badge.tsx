import type { MarketIntakeState } from "../../lib/market-intake.types";
import { marketIntakeStatusLabel } from "../../lib/market-intake";

const STYLES: Record<MarketIntakeState, string> = {
  EMPTY: "bg-neutral-100 text-neutral-700",
  IN_PROGRESS: "bg-amber-50 text-amber-900",
  READY_TO_CONFIRM: "bg-sky-50 text-sky-900",
  CONFIRMED: "bg-emerald-50 text-emerald-900",
};

export function MarketIntakeStatusBadge({ state }: { state: MarketIntakeState }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[state]}`}>
      {marketIntakeStatusLabel(state)}
    </span>
  );
}
