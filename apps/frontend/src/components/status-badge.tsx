import { cn } from "../lib/ux/cn";
import { getStatusTone, getUserFacingStatus } from "../lib/ui-labels";

const toneClass = {
  success: "bg-[var(--acf-success-soft)] text-[var(--acf-success)]",
  progress: "bg-[var(--acf-info-soft)] text-[var(--acf-info)]",
  danger: "bg-[var(--acf-danger-soft)] text-[var(--acf-danger)]",
  warning: "bg-[var(--acf-warning-soft)] text-[var(--acf-warning)]",
  neutral: "bg-[var(--acf-surface-muted)] text-[var(--acf-text-secondary)]",
} as const;

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const tone = getStatusTone(status);
  return (
    <span className={cn("inline-flex rounded-[var(--acf-radius-pill)] px-2 py-0.5 text-xs", toneClass[tone])}>
      {getUserFacingStatus(status)}
    </span>
  );
}

export const StatusBadgeV2 = StatusBadge;
