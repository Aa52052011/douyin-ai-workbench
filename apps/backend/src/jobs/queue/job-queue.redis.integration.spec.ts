import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ACF_JOB_QUEUE_NAME } from './queue.constants.js';
import { BullMqJobQueue } from './bullmq-job.queue.js';
import { buildQueueJob } from './queue-job.js';

const enabled = process.env.RUN_REDIS_TESTS === 'true' && Boolean(process.env.REDIS_URL?.trim());

describe.skipIf(!enabled)('BullMQ redis integration', () => {
  const jobId = randomUUID();
  let queue: BullMqJobQueue | undefined;
  let inspect: Queue | undefined;
  let connection: Redis | undefined;

  afterAll(async () => {
    await queue?.onModuleDestroy();
    await inspect?.close();
    await connection?.quit();
  });

  it('enqueues with database job id and payload { jobId } only', async () => {
    const url = process.env.REDIS_URL as string;
    const isolatedQueue = `${ACF_JOB_QUEUE_NAME}-it-${randomUUID()}`;
    queue = new BullMqJobQueue(url, { queueName: isolatedQueue });
    await queue.enqueue(jobId);
    await queue.enqueue(jobId);
    connection = new Redis(url, { maxRetriesPerRequest: null });
    inspect = new Queue(isolatedQueue, { connection });
    const job = await inspect.getJob(jobId);
    expect(job).toBeTruthy();
    expect(job?.id).toBe(jobId);
    expect(job?.data).toEqual({ jobId });
    expect(Object.keys(job?.data ?? {})).toEqual(['jobId']);
    const spec = buildQueueJob(jobId);
    expect(spec.opts.jobId).toBe(jobId);
    await inspect.remove(jobId);
    expect(await inspect.getJob(jobId)).toBeUndefined();
  });
});
