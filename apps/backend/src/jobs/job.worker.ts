import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Worker, type Job as BullJob } from 'bullmq';
import { Redis } from 'ioredis';
import { isUuid } from '../common/ids.js';
import { JobProcessor } from './job.processor.js';
import { resolveJobQueueName } from './queue/queue.constants.js';
import { resolveRedisUrl } from './queue/redis-config.js';

@Injectable()
export class JobWorker implements OnModuleDestroy {
  private readonly logger = new Logger(JobWorker.name);
  private connection: Redis | undefined;
  private worker: Worker | undefined;

  constructor(private readonly processor: JobProcessor) {}

  async start(): Promise<void> {
    const url = resolveRedisUrl();
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.worker = new Worker(
      resolveJobQueueName(),
      async (bullJob: BullJob<{ jobId?: string }>) => {
        const jobId = resolveQueuedJobId(bullJob);
        if (!jobId) {
          return { status: 'skipped' };
        }
        const result = await this.processor.process(jobId);
        return { status: result.status };
      },
      { connection: this.connection, concurrency: 2 },
    );
    this.worker.on('error', () => {
      this.logger.error('Job worker connection error');
    });
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = undefined;
    }
    if (this.connection) {
      await this.connection.quit();
      this.connection = undefined;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}

function resolveQueuedJobId(bullJob: BullJob<{ jobId?: string }>): string | undefined {
  const fromData = bullJob.data?.jobId;
  if (typeof fromData === 'string' && isUuid(fromData)) {
    return fromData;
  }
  if (typeof bullJob.id === 'string' && isUuid(bullJob.id)) {
    return bullJob.id;
  }
  return undefined;
}
