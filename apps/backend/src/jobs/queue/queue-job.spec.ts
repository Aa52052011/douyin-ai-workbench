import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { InMemoryJobQueue } from './in-memory-job.queue.js';
import { UnavailableJobQueue } from './unavailable-job.queue.js';
import { buildQueueJob } from './queue-job.js';

const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('buildQueueJob', () => {
  it('uses the database job id and only puts jobId in the payload', () => {
    const spec = buildQueueJob(JOB_ID);
    expect(spec.opts.jobId).toBe(JOB_ID);
    expect(spec.data).toEqual({ jobId: JOB_ID });
    expect(Object.keys(spec.data)).toEqual(['jobId']);
    expect(JSON.stringify(spec.data)).not.toContain('tenantId');
    expect(JSON.stringify(spec.data)).not.toContain('workspaceId');
    expect(JSON.stringify(spec.data)).not.toContain('projectId');
    expect(JSON.stringify(spec.data)).not.toContain('Authorization');
    expect(JSON.stringify(spec.data)).not.toContain('prompt');
  });

  it('rejects a non-uuid job id', () => {
    expect(() => buildQueueJob('not-a-job')).toThrow(AppError);
  });
});

describe('InMemoryJobQueue', () => {
  it('enqueues only { jobId }', async () => {
    const queue = new InMemoryJobQueue();
    await queue.enqueue(JOB_ID);
    expect(queue.enqueued).toEqual([{ jobId: JOB_ID }]);
  });
});

describe('UnavailableJobQueue', () => {
  it('fails enqueue without leaving a silent success', async () => {
    const queue = new UnavailableJobQueue();
    await expect(queue.enqueue(JOB_ID)).rejects.toMatchObject({
      code: ErrorCode.JOB_ENQUEUE_FAILED,
    });
  });
});
