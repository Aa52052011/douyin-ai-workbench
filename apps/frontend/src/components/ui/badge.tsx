import type { ReactNode } from "react";
import { cn } from "../../lib/ux/cn";
import { productStatusLabel, productStatusTone, toProductStatus } from "../../lib/ux/status-map";

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full bg-[var(--acf-surface-subtle)] px-2 py-0.5 text-xs text-[var(--acf-text-secondary)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

const toneClass = {
  success: "bg-[var(--acf-success-subtle)] text-[var(--acf-success)]",
  progress: "bg-[var(--acf-info-subtle)] text-[var(--acf-info)]",
  danger: "bg-[var(--acf-danger-subtle)] text-[var(--acf-danger)]",
  warning: "bg-[var(--acf-warning-subtle)] text-[var(--acf-warning)]",
  neutral: "bg-[var(--acf-surface-subtle)] text-[var(--acf-text-secondary)]",
} as const;

export function ProductStatusBadge({ status }: { status: string | null | undefined }) {
  const product = toProductStatus(status);
  const tone = productStatusTone(product);
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs", toneClass[tone])}>
      {productStatusLabel(status)}
    </span>
  );
}
