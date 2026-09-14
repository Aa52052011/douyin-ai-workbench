import { statusLabel, statusTone } from "../lib/status-label";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const tone = statusTone(status);
  const toneClass = {
    success: "bg-[var(--acf-success-subtle)] text-[var(--acf-success)]",
    progress: "bg-[var(--acf-info-subtle)] text-[var(--acf-info)]",
    danger: "bg-[var(--acf-danger-subtle)] text-[var(--acf-danger)]",
    neutral: "bg-[var(--acf-surface-subtle)] text-[var(--acf-text-secondary)]",
  }[tone];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${toneClass}`}>{statusLabel(status)}</span>
  );
}
