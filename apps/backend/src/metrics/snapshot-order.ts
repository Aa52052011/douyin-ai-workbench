export const METRIC_SNAPSHOT_ORDER = [
  { observedAt: 'desc' as const },
  { createdAt: 'desc' as const },
  { id: 'desc' as const },
];

export type SnapshotSortKey = {
  observedAt: Date;
  createdAt: Date;
  id: string;
};

/** Newest first: observedAt DESC, createdAt DESC, id DESC. */
export function compareMetricSnapshotsNewestFirst(a: SnapshotSortKey, b: SnapshotSortKey): number {
  const observed = b.observedAt.getTime() - a.observedAt.getTime();
  if (observed !== 0) {
    return observed;
  }
  const created = b.createdAt.getTime() - a.createdAt.getTime();
  if (created !== 0) {
    return created;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? 1 : -1;
}

export function compareMetricSnapshotsOldestFirst(a: SnapshotSortKey, b: SnapshotSortKey): number {
  return compareMetricSnapshotsNewestFirst(b, a);
}
