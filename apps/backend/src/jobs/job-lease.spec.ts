import { JobStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { isLeaseExpired, jobLeaseConfig } from './job-lease.js';

describe('job lease', () => {
  it('requires heartbeat to be shorter than the lease', () => {
    const previousLease = process.env.JOB_LEASE_TIMEOUT_MS;
    const previousBeat = process.env.JOB_HEARTBEAT_INTERVAL_MS;
    process.env.JOB_LEASE_TIMEOUT_MS = '1000';
    process.env.JOB_HEARTBEAT_INTERVAL_MS = '2000';
    expect(() => jobLeaseConfig()).toThrow();
    if (previousLease === undefined) {
      delete process.env.JOB_LEASE_TIMEOUT_MS;
    } else {
      process.env.JOB_LEASE_TIMEOUT_MS = previousLease;
    }
    if (previousBeat === undefined) {
      delete process.env.JOB_HEARTBEAT_INTERVAL_MS;
    } else {
      process.env.JOB_HEARTBEAT_INTERVAL_MS = previousBeat;
    }
    const defaults = jobLeaseConfig();
    expect(defaults.heartbeatMs).toBeLessThan(defaults.leaseMs);
  });

  it('treats a fresh running job as not expired and a stale one as expired', () => {
    const now = Date.parse('2026-08-31T00:00:30.000Z');
    expect(
      isLeaseExpired(
        { status: JobStatus.RUNNING, lastHeartbeatAt: new Date('2026-08-31T00:00:25.000Z') },
        now,
        10_000,
      ),
    ).toBe(false);
    expect(
      isLeaseExpired(
        { status: JobStatus.RUNNING, lastHeartbeatAt: new Date('2026-08-31T00:00:00.000Z') },
        now,
        10_000,
      ),
    ).toBe(true);
    expect(isLeaseExpired({ status: JobStatus.COMPLETED, lastHeartbeatAt: new Date(0) }, now, 10)).toBe(false);
  });
});
