import { JobKind, JobStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service.js';

const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT = '11111111-1111-4111-8111-111111111111';
const VIDEO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('JobsService.fail', () => {
  const prisma = {
    job: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  let jobs: JobsService;

  beforeEach(() => {
    vi.resetAllMocks();
    jobs = new JobsService(prisma as never);
  });

  it('does not change a COMPLETED job to FAILED', async () => {
    prisma.job.updateMany.mockResolvedValue({ count: 0 });
    prisma.job.findFirst.mockResolvedValue({
      id: JOB_ID,
      tenantId: TENANT,
      status: JobStatus.COMPLETED,
    });
    const result = await jobs.fail(TENANT, JOB_ID, { code: 'VIDEO_PROVIDER_FAILED' });
    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID, tenantId: TENANT, status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } },
      }),
    );
    expect(result.status).toBe(JobStatus.COMPLETED);
  });
});

describe('JobsService.findLatestForVideo', () => {
  const prisma = {
    job: {
      findFirst: vi.fn(),
    },
  };
  let jobs: JobsService;

  beforeEach(() => {
    vi.resetAllMocks();
    jobs = new JobsService(prisma as never);
  });

  it('filters by VIDEO_GENERATION by default', async () => {
    prisma.job.findFirst.mockResolvedValue({ id: JOB_ID, kind: JobKind.VIDEO_GENERATION });
    await jobs.findLatestForVideo(TENANT, VIDEO);
    expect(prisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, videoId: VIDEO, kind: JobKind.VIDEO_GENERATION },
      }),
    );
  });
});
