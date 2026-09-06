import { RuntimeConfigError } from '../../config/runtime-config-error.js';
import type { JobQueue } from './job-queue.js';
import { BullMqJobQueue } from './bullmq-job.queue.js';
import { InMemoryJobQueue } from './in-memory-job.queue.js';
import { UnavailableJobQueue } from './unavailable-job.queue.js';
import { usesInMemoryJobQueue } from './redis-config.js';

export function createJobQueue(): JobQueue {
  if (usesInMemoryJobQueue()) {
    return new InMemoryJobQueue();
  }
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new RuntimeConfigError(['REDIS_URL is required']);
    }
    return new UnavailableJobQueue();
  }
  return new BullMqJobQueue(url);
}
