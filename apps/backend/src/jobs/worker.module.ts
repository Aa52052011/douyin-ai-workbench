import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsageModule } from '../usage/usage.module.js';
import { VideoGenerationModule } from '../videos/video-generation.module.js';
import { JobWorker } from './job.worker.js';

@Module({
  imports: [PrismaModule, UsageModule, VideoGenerationModule],
  providers: [JobWorker],
})
export class WorkerAppModule {}
