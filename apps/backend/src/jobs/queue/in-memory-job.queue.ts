import { Injectable } from '@nestjs/common';
import type { JobQueue, JobQueuePayload } from './job-queue.js';
import { buildQueueJob } from './queue-job.js';

@Injectable()
export class InMemoryJobQueue implements JobQueue {
  readonly enqueued: JobQueuePayload[] = [];

  async enqueue(jobId: string): Promise<void> {
    const spec = buildQueueJob(jobId);
    this.enqueued.push(spec.data);
  }
}
