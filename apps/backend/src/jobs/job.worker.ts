import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Worker, type Job as BullJob } from 'bullmq';
import { Redis } from 'ioredis';
import { isUuid } from '../common/ids.js';
import { JobProcessor } from './job.processor.js';
import { resolveJobQueueName } from './queue/queue.constants.js';
import { resolveRedisUrl } from './queue/redis-config.js';
import {
  WorkerInstanceLock,
  WorkerInstanceLockHeldError,
  resolveWorkerLockHeartbeatMs,
  resolveWorkerLockKey,
  resolveWorkerLockTtlMs,
  shouldAcquireWorkerSingleton,
  type RedisLockClient,
} from './worker-instance-lock.js';

@Injectable()
export class JobWorker implements OnModuleDestroy {
  private readonly logger = new Logger(JobWorker.name);
  private connection: Redis | undefined;
  private lockConnection: Redis | undefined;
  private lock: WorkerInstanceLock | undefined;
  private worker: Worker | undefined;
  private lostLock = false;

  constructor(private readonly processor: JobProcessor) {}

  async start(): Promise<void> {
    const url = resolveRedisUrl();
    if (shouldAcquireWorkerSingleton()) {
      this.lockConnection = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 3_000 });
      this.lock = new WorkerInstanceLock(
        this.lockConnection as RedisLockClient,
        randomUUID(),
        resolveWorkerLockKey(),
        resolveWorkerLockTtlMs(),
        resolveWorkerLockHeartbeatMs(),
      );
      const acquired = await this.lock.acquire();
      if (!acquired) {
        this.lock.stopHeartbeat();
        this.lock = undefined;
        await this.disconnectLock();
        throw new WorkerInstanceLockHeldError();
      }
      this.lock.startHeartbeat(() => {
        if (this.lostLock) {
          return;
        }
        this.lostLock = true;
        this.logger.error('Worker instance lock renew failed');
        void this.close().then(() => {
          process.exitCode = 1;
        });
      });
    }

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
    if (this.lock) {
      await this.lock.release();
      this.lock = undefined;
    }
    await this.disconnectLock();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private async disconnectLock(): Promise<void> {
    if (!this.lockConnection) {
      return;
    }
    try {
      await this.lockConnection.quit();
    } catch {
      this.lockConnection.disconnect();
    }
    this.lockConnection = undefined;
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
