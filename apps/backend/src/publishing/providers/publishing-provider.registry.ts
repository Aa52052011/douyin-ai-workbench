import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { MockPublishingProvider } from './mock-publishing.provider.js';
import type { PlatformPublisher, PublishingProviderRegistry as RegistryContract } from './publishing-provider.types.js';

@Injectable()
export class PublishingProviderRegistry implements RegistryContract {
  constructor(private readonly mock: MockPublishingProvider) {}

  resolve(platform: Platform): PlatformPublisher {
    if (platform === Platform.MOCK) {
      return this.mock;
    }
    throw new AppError(ErrorCode.PUBLISHING_PROVIDER_NOT_IMPLEMENTED);
  }
}
