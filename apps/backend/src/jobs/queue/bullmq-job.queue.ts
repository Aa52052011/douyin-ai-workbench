import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { JobQueue } from './job-queue.js';
import { ACF_JOB_QUEUE_NAME } from './queue.constants.js';
import { buildQueueJob } from './queue-job.js';

@Injectable()
export class BullMqJobQueue implements JobQueue, OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue;

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(ACF_JOB_QUEUE_NAME, { connection: this.connection });
  }

  async enqueue(jobId: string): Promise<void> {
    const spec = buildQueueJob(jobId);
    try {
      await this.queue.add(spec.name, spec.data, spec.opts);
    } catch (error) {
      if (isDuplicateJobError(error)) {
        return;
      }
      throw new AppError(ErrorCode.JOB_ENQUEUE_FAILED);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

function isDuplicateJobError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /already exists/i.test(message);
}
