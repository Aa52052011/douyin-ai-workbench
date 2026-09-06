import { Platform } from '@prisma/client';
import { StorageService } from '../../media/storage/storage.service.js';
import { sanitizeProviderResponseMetadata } from '../provider-response-metadata.js';
import {
  isPublishVisibility,
  type AccountHealthResult,
  type GetPublishStatusInput,
  type MockPublishScenario,
  type PlatformAccountRef,
  type PlatformPublisher,
  type PublishStatusResult,
  type PublishVideoInput,
  type PublishVideoResult,
  type ValidatePublishingAccountInput,
} from './publishing-provider.types.js';

export class MockPublishingProvider implements PlatformPublisher {
  readonly platform = Platform.MOCK;
  private readonly uploadAttempts = new Map<string, number>();
  private readonly publishAttempts = new Map<string, number>();
  private readonly scenarios = new Map<string, MockPublishScenario>();

  constructor(private readonly storage?: Pick<StorageService, 'exists' | 'getUrl' | 'get'>) {}

  configureScenario(publicationId: string, scenario: MockPublishScenario): void {
    this.scenarios.set(publicationId, scenario);
  }

  getUploadAttempts(publicationId: string): number {
    return this.uploadAttempts.get(publicationId) ?? 0;
  }

  getPublishAttempts(publicationId: string): number {
    return this.publishAttempts.get(publicationId) ?? 0;
  }

  async validateAccount(input: ValidatePublishingAccountInput): Promise<AccountHealthResult> {
    const mismatch = this.platformMismatch(input.account, input.expectedPlatform);
    if (mismatch) {
      return { healthy: false, platform: this.platform, accountId: input.account.id, reason: mismatch };
    }
    if (input.account.status !== 'ACTIVE') {
      return {
        healthy: false,
        platform: this.platform,
        accountId: input.account.id,
        reason: 'ACCOUNT_NOT_ACTIVE',
      };
    }
    return { healthy: true, platform: this.platform, accountId: input.account.id };
  }

  async publishVideo(input: PublishVideoInput): Promise<PublishVideoResult> {
    this.publishAttempts.set(input.publicationId, this.getPublishAttempts(input.publicationId) + 1);
    const scenario = this.resolveScenario(input.publicationId, input.scenario);
    const mismatch = this.platformMismatch(input.platformAccount, this.platform);
    if (mismatch) {
      return rejected('PUBLISH_PLATFORM_MISMATCH', 'Account platform does not match mock publisher', 'PERMANENT');
    }
    if (input.platformAccount.status !== 'ACTIVE') {
      return rejected('PUBLISH_ACCOUNT_INVALID', 'Platform account is not active', 'PERMANENT');
    }
    if (!input.title.trim() || !isPublishVisibility(input.visibility) || scenario === 'VALIDATION_FAILURE') {
      return rejected('PUBLISH_VALIDATION_FAILED', 'Publish payload failed validation', 'PERMANENT');
    }

    const ids = mockIds(input.publicationId);
    const uploadId = await this.uploadIfNeeded(input, ids.providerUploadId, scenario);
    if (uploadId === null) {
      return rejected('PUBLISH_UPLOAD_FAILED', 'Mock upload failed before submit', 'SAFE_TO_RETRY');
    }

    if (scenario === 'UNKNOWN_AFTER_SUBMIT') {
      return {
        outcome: 'UNKNOWN',
        errorCode: 'PUBLISH_SUBMIT_UNKNOWN',
        retryClass: 'UNKNOWN_EXTERNAL_STATE',
        providerUploadId: uploadId,
        requestId: ids.unknownRequestId,
        metadata: sanitizeProviderResponseMetadata({
          requestId: ids.unknownRequestId,
          providerUploadId: uploadId,
          status: 'UNKNOWN',
          errorCode: 'PUBLISH_SUBMIT_UNKNOWN',
        }),
      };
    }

    if (scenario === 'PROCESSING') {
      return {
        outcome: 'ACCEPTED',
        platformStatus: 'PROCESSING',
        providerUploadId: uploadId,
        providerItemId: ids.providerItemId,
        requestId: ids.processingRequestId,
        metadata: sanitizeProviderResponseMetadata({
          requestId: ids.processingRequestId,
          providerUploadId: uploadId,
          providerItemId: ids.providerItemId,
          status: 'PROCESSING',
        }),
      };
    }

    return {
      outcome: 'ACCEPTED',
      platformStatus: 'PUBLISHED',
      providerUploadId: uploadId,
      providerItemId: ids.providerItemId,
      externalPostId: ids.externalPostId,
      externalUrl: ids.externalUrl,
      requestId: ids.requestId,
      metadata: sanitizeProviderResponseMetadata({
        requestId: ids.requestId,
        providerUploadId: uploadId,
        providerItemId: ids.providerItemId,
        externalPostId: ids.externalPostId,
        status: 'PUBLISHED',
      }),
    };
  }

  async getPublishStatus(input: GetPublishStatusInput): Promise<PublishStatusResult> {
    const mismatch = this.platformMismatch(input.platformAccount, this.platform);
    if (mismatch) {
      return {
        platformStatus: 'FAILED',
        metadata: sanitizeProviderResponseMetadata({ status: 'FAILED', errorCode: 'PUBLISH_PLATFORM_MISMATCH' }),
      };
    }
    const scenario = this.resolveScenario(input.publicationId ?? '', input.scenario);
    if (
      scenario === 'UNKNOWN_AFTER_SUBMIT' ||
      input.requestId?.startsWith('mock-unk-') ||
      (!input.providerItemId && !input.externalPostId && !input.requestId)
    ) {
      return {
        platformStatus: 'UNKNOWN',
        requestId: input.requestId,
        providerItemId: input.providerItemId,
        metadata: sanitizeProviderResponseMetadata({
          requestId: input.requestId,
          providerItemId: input.providerItemId,
          status: 'UNKNOWN',
        }),
      };
    }
    const publicationId = input.publicationId ?? extractPublicationId(input);
    const ids = publicationId ? mockIds(publicationId) : null;
    return {
      platformStatus: 'PUBLISHED',
      providerItemId: input.providerItemId ?? ids?.providerItemId,
      externalPostId: input.externalPostId ?? ids?.externalPostId,
      externalUrl: ids?.externalUrl ?? (publicationId ? `mock://publication/${publicationId}` : undefined),
      requestId: input.requestId ?? ids?.requestId,
      metadata: sanitizeProviderResponseMetadata({
        requestId: input.requestId ?? ids?.requestId,
        providerItemId: input.providerItemId ?? ids?.providerItemId,
        externalPostId: input.externalPostId ?? ids?.externalPostId,
        status: 'PUBLISHED',
      }),
    };
  }

  private resolveScenario(publicationId: string, explicit?: MockPublishScenario): MockPublishScenario {
    return explicit ?? this.scenarios.get(publicationId) ?? 'SUCCESS';
  }

  private platformMismatch(account: PlatformAccountRef, expected: Platform): string | undefined {
    if (account.platform !== this.platform || expected !== this.platform) {
      return 'PLATFORM_MISMATCH';
    }
    return undefined;
  }

  private async uploadIfNeeded(
    input: PublishVideoInput,
    generatedUploadId: string,
    scenario: MockPublishScenario,
  ): Promise<string | null> {
    if (input.providerUploadId) {
      return input.providerUploadId;
    }
    this.uploadAttempts.set(input.publicationId, this.getUploadAttempts(input.publicationId) + 1);
    if (scenario === 'UPLOAD_FAILURE') {
      return null;
    }
    if (this.storage) {
      const exists = await this.storage.exists(input.outputAsset.storageKey);
      if (!exists) {
        return null;
      }
    }
    return generatedUploadId;
  }
}

function rejected(errorCode: string, errorMessage: string, retryClass: 'PERMANENT' | 'SAFE_TO_RETRY'): PublishVideoResult {
  return {
    outcome: 'REJECTED',
    errorCode,
    errorMessage,
    retryClass,
    metadata: sanitizeProviderResponseMetadata({ errorCode, status: 'FAILED' }),
  };
}

function mockIds(publicationId: string) {
  return {
    providerUploadId: `mock-upload-${publicationId}`,
    providerItemId: `mock-item-${publicationId}`,
    externalPostId: `mock-post-${publicationId}`,
    externalUrl: `mock://publication/${publicationId}`,
    requestId: `mock-req-${publicationId}`,
    processingRequestId: `mock-proc-${publicationId}`,
    unknownRequestId: `mock-unk-${publicationId}`,
  };
}

function extractPublicationId(input: GetPublishStatusInput): string | undefined {
  const source = input.externalPostId ?? input.providerItemId ?? input.requestId ?? '';
  const match = /mock-(?:post|item|req|proc|unk)-(.+)$/.exec(source);
  return match?.[1];
}
