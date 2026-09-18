import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { RuntimeConfigError } from './config/runtime-config-error.js';
import { validateRuntimeEnvironment } from './config/runtime-env.js';
import { JobWorker } from './jobs/job.worker.js';
import { WorkerInstanceLockHeldError } from './jobs/worker-instance-lock.js';
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
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
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

  try {
    await worker.start();
  } catch (error) {
    try {
      await shutdown();
    } catch {
      // Preserve the original startup error (e.g. lock held).
    }
    throw error;
  }

  logger.log('Job worker started');
}

try {
  await bootstrapWorker();
} catch (error) {
  if (error instanceof WorkerInstanceLockHeldError) {
    console.error('Worker instance lock already held');
  } else {
    console.error(error instanceof RuntimeConfigError ? error.message : 'Worker startup failed');
  }
  process.exit(1);
}
