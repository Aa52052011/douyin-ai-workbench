import { uiStatusTone, videoUserStatusLabel } from "../lib/ui-labels";

export function ProductionStatusBadge({ status }: { status: string | null | undefined }) {
  const tone = uiStatusTone(status);
  const toneClass = {
    success: "bg-[var(--acf-success-subtle)] text-[var(--acf-success)]",
    progress: "bg-[var(--acf-info-subtle)] text-[var(--acf-info)]",
    danger: "bg-[var(--acf-danger-subtle)] text-[var(--acf-danger)]",
    neutral: "bg-[var(--acf-surface-subtle)] text-[var(--acf-text-secondary)]",
  }[tone];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${toneClass}`}>{videoUserStatusLabel(status)}</span>
  );
}
