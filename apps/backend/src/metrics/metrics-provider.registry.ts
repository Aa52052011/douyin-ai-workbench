import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { MockMetricsProvider } from './mock-metrics.provider.js';
import type {
  PlatformMetricsProvider,
  PlatformMetricsProviderRegistry as RegistryContract,
} from './metrics-provider.types.js';

@Injectable()
export class PlatformMetricsProviderRegistry implements RegistryContract {
  constructor(private readonly mock: MockMetricsProvider) {}

  resolve(platform: Platform): PlatformMetricsProvider {
    if (platform === Platform.MOCK) {
      return this.mock;
    }
    throw new AppError(ErrorCode.PLATFORM_METRICS_PROVIDER_NOT_IMPLEMENTED);
  }
}
