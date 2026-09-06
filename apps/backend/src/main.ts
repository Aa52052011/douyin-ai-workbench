import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { RuntimeConfigError } from './config/runtime-config-error.js';
import { validateRuntimeEnvironment } from './config/runtime-env.js';
import { assertRedisReachable } from './jobs/queue/redis-config.js';

async function bootstrap() {
  validateRuntimeEnvironment({
    role: 'api',
    probeFfmpeg: process.env.NODE_ENV === 'production',
  });
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  if (process.env.NODE_ENV === 'production') {
    await app.get(PrismaClient).$connect();
    await assertRedisReachable();
  }
  await app.listen(process.env.PORT ?? 3001);
}

try {
  await bootstrap();
} catch (error) {
  console.error(error instanceof RuntimeConfigError ? error.message : 'Backend startup failed');
  process.exitCode = 1;
}
