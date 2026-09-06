import { describe, expect, it } from 'vitest';
import { compareMetricSnapshotsNewestFirst } from './snapshot-order.js';

describe('compareMetricSnapshotsNewestFirst', () => {
  it('orders by observedAt, then createdAt, then id DESC', () => {
    const a = { id: 'a', observedAt: new Date('2026-08-02T00:00:00.000Z'), createdAt: new Date('2026-08-02T00:00:01.000Z') };
    const b = { id: 'b', observedAt: new Date('2026-08-03T00:00:00.000Z'), createdAt: new Date('2026-08-03T00:00:01.000Z') };
    const c = { id: 'c', observedAt: new Date('2026-08-03T00:00:00.000Z'), createdAt: new Date('2026-08-03T00:00:02.000Z') };
    const d = { id: 'd', observedAt: new Date('2026-08-03T00:00:00.000Z'), createdAt: new Date('2026-08-03T00:00:02.000Z') };
    const sorted = [a, b, d, c].sort(compareMetricSnapshotsNewestFirst);
    expect(sorted.map((row) => row.id)).toEqual(['d', 'c', 'b', 'a']);
  });
});
