import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { RuntimeConfigError } from './config/runtime-config-error.js';
import { validateRuntimeEnvironment } from './config/runtime-env.js';
import { resolveBackendListen } from './config/listen-config.js';
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
  const listen = resolveBackendListen();
  if (listen.host) {
    await app.listen(listen.port, listen.host);
  } else {
    await app.listen(listen.port);
  }
}

try {
  await bootstrap();
} catch (error) {
  console.error(error instanceof RuntimeConfigError ? error.message : 'Backend startup failed');
  process.exitCode = 1;
}
