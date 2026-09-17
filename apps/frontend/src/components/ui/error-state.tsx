"use client";

import type { ProductErrorV1 } from "../../lib/ux/product-error";
import { TechnicalDetailsPanel } from "../technical-details-panel";

export { TechnicalDetailsPanel } from "../technical-details-panel";

export function ProductErrorState({
  title,
  humanMessage,
  recoveryAction,
  technicalDetails,
}: ProductErrorV1) {
  return (
    <div className="rounded-[var(--acf-radius-md)] border border-[var(--acf-danger)] bg-[var(--acf-danger-soft)] p-4" role="alert">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm">{humanMessage}</p>
      <p className="acf-caption mt-2">{recoveryAction}</p>
      {technicalDetails ? <TechnicalDetailsPanel details={technicalDetails} /> : null}
    </div>
  );
}
