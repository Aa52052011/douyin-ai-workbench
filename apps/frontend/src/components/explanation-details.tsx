import type { ReactNode } from "react";

/** Accessible collapsed explanation — default closed, no provider. */
export function ExplanationDetails({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface-muted)] px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-neutral-800">{summary}</summary>
      <div className="mt-3 space-y-2 text-sm leading-6 text-neutral-700">{children}</div>
    </details>
  );
}
