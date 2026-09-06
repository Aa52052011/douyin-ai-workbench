import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { RuntimeConfigError } from './config/runtime-config-error.js';
import { validateRuntimeEnvironment } from './config/runtime-env.js';
import { JobWorker } from './jobs/job.worker.js';
import { WorkerAppModule } from './jobs/worker.module.js';
import { assertRedisReachable } from './jobs/queue/redis-config.js';

const logger = new Logger('Worker');

async function bootstrapWorker(): Promise<void> {
  validateRuntimeEnvironment({
    role: 'worker',
    probeFfmpeg: process.env.NODE_ENV === 'production',
  });
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
  if (process.env.NODE_ENV === 'production') {
    await app.get(PrismaClient).$connect();
    await assertRedisReachable();
  }
  const worker = app.get(JobWorker);
  await worker.start();
  logger.log('Job worker started');

  const shutdown = async () => {
    await worker.close();
    const prisma = app.get(PrismaClient);
    await app.close();
    await prisma.$disconnect();
  };

  process.once('SIGTERM', () => {
    void shutdown();
  });
  process.once('SIGINT', () => {
    void shutdown();
  });
}

try {
  await bootstrapWorker();
} catch (error) {
  console.error(error instanceof RuntimeConfigError ? error.message : 'Worker startup failed');
  process.exitCode = 1;
}
