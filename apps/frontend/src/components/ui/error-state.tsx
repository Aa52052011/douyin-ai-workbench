"use client";

import { useState } from "react";
import type { ProductErrorV1 } from "../../lib/ux/product-error";

export function ProductErrorState({
  title,
  humanMessage,
  recoveryAction,
  technicalDetails,
}: ProductErrorV1) {
  return (
    <div className="rounded-[var(--acf-radius-md)] border border-[var(--acf-danger)] bg-[var(--acf-danger-subtle)] p-4" role="alert">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm">{humanMessage}</p>
      <p className="acf-caption mt-2">{recoveryAction}</p>
      {technicalDetails ? <TechnicalDetailsPanel details={technicalDetails} /> : null}
    </div>
  );
}

export function TechnicalDetailsPanel({ details }: { details: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-3 text-xs" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer">技术细节</summary>
      <pre className="mt-2 whitespace-pre-wrap break-words">{details}</pre>
    </details>
  );
}
