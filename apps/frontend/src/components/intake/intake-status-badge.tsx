import type { ProductIntakeState } from "../../lib/product-intake.types";
import { productIntakeStatusLabel } from "../../lib/product-intake";

const STYLES: Record<ProductIntakeState, string> = {
  EMPTY: "bg-neutral-100 text-neutral-700",
  IN_PROGRESS: "bg-amber-50 text-amber-900",
  READY_TO_CONFIRM: "bg-sky-50 text-sky-900",
  CONFIRMED: "bg-emerald-50 text-emerald-900",
};

export function IntakeStatusBadge({ state }: { state: ProductIntakeState }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[state]}`}>
      {productIntakeStatusLabel(state)}
    </span>
  );
}
