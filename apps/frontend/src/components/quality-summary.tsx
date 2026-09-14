export function QualitySummary({
  statusLabel,
  autoRepairCount,
  bestAvailable,
  items,
}: {
  statusLabel?: string | null;
  autoRepairCount?: number;
  bestAvailable?: boolean;
  items?: string[];
}) {
  if (bestAvailable) {
    return <p className="text-sm text-neutral-700">已生成最佳可用版本</p>;
  }
  if (statusLabel && /通过|完成|pass/i.test(statusLabel)) {
    return (
      <div className="text-sm text-neutral-700">
        <p>质量检查已通过</p>
        {autoRepairCount && autoRepairCount > 0 ? <p className="mt-1 text-xs text-neutral-500">系统已自动优化 {autoRepairCount} 项</p> : null}
      </div>
    );
  }
  if (autoRepairCount && autoRepairCount > 0) {
    return (
      <p className="text-sm text-neutral-700">
        系统已自动优化 {autoRepairCount} 项
        {items?.length ? `：${items.slice(0, 3).join("、")}` : ""}
      </p>
    );
  }
  if (statusLabel) {
    return <p className="text-sm text-neutral-700">{statusLabel}</p>;
  }
  return null;
}
