import { statusLabel, statusTone } from "../lib/status-label";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const tone = statusTone(status);
  const toneClass = {
    success: "bg-emerald-50 text-emerald-800",
    progress: "bg-sky-50 text-sky-800",
    danger: "bg-red-50 text-red-700",
    neutral: "bg-neutral-100 text-neutral-700",
  }[tone];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${toneClass}`}>{statusLabel(status)}</span>
  );
}
