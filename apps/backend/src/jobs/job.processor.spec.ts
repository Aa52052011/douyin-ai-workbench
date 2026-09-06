import { JobKind, JobStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/app-error.js';
import { JobProcessor } from './job.processor.js';

const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function isolatedPending(kind: JobKind) {
  return {
    id: JOB_ID,
    status: JobStatus.PENDING,
    kind,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    videoId: null,
    scriptId: null,
  };
}

describe('JobProcessor', () => {
  const prisma = {
    job: { findUnique: vi.fn() },
    workspace: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
    video: { findFirst: vi.fn(), updateMany: vi.fn() },
    script: { findFirst: vi.fn() },
  };
  const jobs = { fail: vi.fn() };
  const generation = { run: vi.fn() };
  const publish = { run: vi.fn() };
  const metricsSync = { run: vi.fn() };
  let processor: JobProcessor;

  beforeEach(() => {
    vi.resetAllMocks();
    processor = new JobProcessor(
      prisma as never,
      jobs as never,
      generation as never,
      publish as never,
      metricsSync as never,
    );
    prisma.workspace.findFirst.mockResolvedValue({ id: 'ws', tenantId: TENANT });
    prisma.project.findFirst.mockResolvedValue({
      id: 'p',
      tenantId: TENANT,
      workspaceId: 'ws',
    });
  });

  it('skips terminal jobs and does not run the provider', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: JOB_ID,
      status: JobStatus.COMPLETED,
      tenantId: TENANT,
      kind: JobKind.VIDEO_GENERATION,
    });
    await expect(processor.process(JOB_ID)).resolves.toMatchObject({
      status: 'skipped',
      reason: 'terminal',
    });
    expect(generation.run).not.toHaveBeenCalled();
  });

  it('fails isolation mismatches without calling the provider', async () => {
    prisma.job.findUnique.mockResolvedValue({
      ...isolatedPending(JobKind.VIDEO_GENERATION),
      scriptId: '44444444-4444-4444-8444-444444444444',
    });
    prisma.script.findFirst.mockResolvedValue(null);
    await expect(processor.process(JOB_ID)).resolves.toMatchObject({
      status: 'failed',
      reason: 'isolation',
    });
    expect(jobs.fail).toHaveBeenCalledWith(
      TENANT,
      JOB_ID,
      expect.objectContaining({ code: ErrorCode.JOB_ISOLATION_VIOLATION }),
    );
    expect(generation.run).not.toHaveBeenCalled();
  });

  it('skips a running job with a fresh heartbeat', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: JOB_ID,
      status: JobStatus.RUNNING,
      lastHeartbeatAt: new Date(),
      tenantId: TENANT,
      kind: JobKind.VIDEO_GENERATION,
    });
    await expect(processor.process(JOB_ID)).resolves.toMatchObject({
      status: 'skipped',
      reason: 'running',
    });
    expect(generation.run).not.toHaveBeenCalled();
  });

  it('does not reclaim failed or cancelled jobs', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: JOB_ID,
      status: JobStatus.FAILED,
      tenantId: TENANT,
      kind: JobKind.VIDEO_GENERATION,
    });
    await expect(processor.process(JOB_ID)).resolves.toMatchObject({ status: 'skipped', reason: 'terminal' });
    prisma.job.findUnique.mockResolvedValue({
      id: JOB_ID,
      status: JobStatus.CANCELLED,
      tenantId: TENANT,
      kind: JobKind.VIDEO_GENERATION,
    });
    await expect(processor.process(JOB_ID)).resolves.toMatchObject({ status: 'skipped', reason: 'terminal' });
  });

  it('runs the generation handler for VIDEO_GENERATION', async () => {
    prisma.job.findUnique.mockResolvedValue(isolatedPending(JobKind.VIDEO_GENERATION));
    generation.run.mockResolvedValue(undefined);
    await expect(processor.process(JOB_ID)).resolves.toEqual({ status: 'completed' });
    expect(generation.run).toHaveBeenCalledWith(TENANT, JOB_ID);
  });

  it('runs the publish handler for VIDEO_PUBLISH and never generation', async () => {
    prisma.job.findUnique.mockResolvedValue(isolatedPending(JobKind.VIDEO_PUBLISH));
    publish.run.mockResolvedValue({ status: 'completed' });
    await expect(processor.process(JOB_ID)).resolves.toEqual({ status: 'completed' });
    expect(generation.run).not.toHaveBeenCalled();
    expect(publish.run).toHaveBeenCalledWith(TENANT, JOB_ID);
    expect(jobs.fail).not.toHaveBeenCalled();
  });

  it('fail-closes unsupported kinds without calling generation', async () => {
    prisma.job.findUnique.mockResolvedValue(isolatedPending(JobKind.MOVIE_EDITING));
    await expect(processor.process(JOB_ID)).resolves.toEqual({ status: 'failed', reason: 'unsupported' });
    expect(generation.run).not.toHaveBeenCalled();
    expect(publish.run).not.toHaveBeenCalled();
    expect(metricsSync.run).not.toHaveBeenCalled();
    expect(jobs.fail).toHaveBeenCalledWith(
      TENANT,
      JOB_ID,
      expect.objectContaining({ code: ErrorCode.JOB_KIND_UNSUPPORTED }),
    );
  });

  it('runs the metrics sync handler for PUBLICATION_METRICS_SYNC', async () => {
    prisma.job.findUnique.mockResolvedValue(isolatedPending(JobKind.PUBLICATION_METRICS_SYNC));
    metricsSync.run.mockResolvedValue({ status: 'completed' });
    await expect(processor.process(JOB_ID)).resolves.toEqual({ status: 'completed' });
    expect(generation.run).not.toHaveBeenCalled();
    expect(publish.run).not.toHaveBeenCalled();
    expect(metricsSync.run).toHaveBeenCalledWith(TENANT, JOB_ID);
    expect(jobs.fail).not.toHaveBeenCalled();
  });
});
