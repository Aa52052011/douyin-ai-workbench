import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import { ACF_QUEUE_JOB_NAME } from './queue.constants.js';
import type { JobQueuePayload } from './job-queue.js';

export type QueueJobSpec = {
  name: string;
  data: JobQueuePayload;
  opts: {
    jobId: string;
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
    removeOnComplete: boolean;
    removeOnFail: boolean;
  };
};

export function buildQueueJob(jobId: string): QueueJobSpec {
  if (!isUuid(jobId)) {
    throw new AppError(ErrorCode.JOB_NOT_FOUND);
  }
  return {
    name: ACF_QUEUE_JOB_NAME,
    data: { jobId },
    opts: {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  };
}
