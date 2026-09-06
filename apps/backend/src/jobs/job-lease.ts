import { AppError, ErrorCode } from '../common/errors/app-error.js';

export function jobLeaseConfig(): { leaseMs: number; heartbeatMs: number } {
  const leaseMs = Number(process.env.JOB_LEASE_TIMEOUT_MS ?? 90_000);
  const heartbeatMs = Number(process.env.JOB_HEARTBEAT_INTERVAL_MS ?? 15_000);
  if (!Number.isFinite(leaseMs) || !Number.isFinite(heartbeatMs) || heartbeatMs <= 0 || leaseMs <= heartbeatMs) {
    throw new AppError(ErrorCode.JOB_CONFLICT, 'Invalid JOB_LEASE_TIMEOUT_MS / JOB_HEARTBEAT_INTERVAL_MS');
  }
  return { leaseMs, heartbeatMs };
}

export function isLeaseExpired(
  job: { status: string; lastHeartbeatAt?: Date | null; lockedAt?: Date | null },
  now = Date.now(),
  leaseMs = jobLeaseConfig().leaseMs,
): boolean {
  if (job.status !== 'RUNNING') {
    return false;
  }
  const beat = job.lastHeartbeatAt ?? job.lockedAt;
  if (!beat) {
    return true;
  }
  return now - beat.getTime() > leaseMs;
}
