import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { JobQueue } from './job-queue.js';

@Injectable()
export class UnavailableJobQueue implements JobQueue {
  async enqueue(_jobId: string): Promise<void> {
    throw new AppError(ErrorCode.JOB_ENQUEUE_FAILED);
  }
}
