import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppExceptionFilter } from './common/filters/app-exception.filter.js';
import { resolveCorsOrigins } from './config/cors-origin.js';
import { applyTrustProxy } from './config/trust-proxy.js';

export function configureApp(app: INestApplication): void {
  applyTrustProxy(app.getHttpAdapter().getInstance() as { set: (key: string, value: unknown) => unknown });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  });
}
