import { Module } from '@nestjs/common';
import { createJobQueue } from './queue/create-job-queue.js';
import { JOB_QUEUE } from './queue/queue.constants.js';
import { JobsService } from './jobs.service.js';

@Module({
  providers: [
    JobsService,
    {
      provide: JOB_QUEUE,
      useFactory: createJobQueue,
    },
  ],
  exports: [JobsService, JOB_QUEUE],
})
export class JobsModule {}
