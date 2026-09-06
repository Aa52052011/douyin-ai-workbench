import type { Platform } from '@prisma/client';

export const PUBLISH_VISIBILITIES = ['PUBLIC', 'PRIVATE', 'FRIENDS'] as const;
export type PublishVisibility = (typeof PUBLISH_VISIBILITIES)[number];

export const MOCK_PUBLISH_SCENARIOS = [
  'SUCCESS',
  'PROCESSING',
  'VALIDATION_FAILURE',
  'UPLOAD_FAILURE',
  'UNKNOWN_AFTER_SUBMIT',
] as const;
export type MockPublishScenario = (typeof MOCK_PUBLISH_SCENARIOS)[number];

export const PUBLISHING_RETRY_CLASSES = [
  'SAFE_TO_RETRY',
  'TEMPORARY',
  'PERMANENT',
  'UNKNOWN_EXTERNAL_STATE',
] as const;
export type PublishingRetryClass = (typeof PUBLISHING_RETRY_CLASSES)[number];

export type PublishOutcome = 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';

export type ProviderPublishStatus = 'PROCESSING' | 'PUBLISHED' | 'FAILED' | 'UNKNOWN';

export type PlatformAccountRef = {
  id: string;
  platform: Platform;
  status: string;
  credentialRef: string;
  externalAccountId?: string;
  displayName?: string;
};

export type OutputAssetRef = {
  assetId: string;
  storageKey: string;
  mimeType?: string;
  size?: number;
};

export type ValidatePublishingAccountInput = {
  tenantId: string;
  workspaceId: string;
  account: PlatformAccountRef;
  expectedPlatform: Platform;
};

export type AccountHealthResult = {
  healthy: boolean;
  platform: Platform;
  accountId: string;
  reason?: string;
};

export type PublishVideoInput = {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  publicationId: string;
  videoId: string;
  platformAccount: PlatformAccountRef;
  outputAsset: OutputAssetRef;
  title: string;
  description: string;
  hashtags: string[];
  visibility: string;
  idempotencyKey: string;
  providerUploadId?: string;
  scenario?: MockPublishScenario;
};

export type PublishVideoAccepted = {
  outcome: 'ACCEPTED';
  platformStatus: ProviderPublishStatus;
  providerUploadId: string;
  providerItemId?: string;
  externalPostId?: string;
  externalUrl?: string;
  requestId: string;
  metadata: Record<string, unknown>;
};

export type PublishVideoRejected = {
  outcome: 'REJECTED';
  errorCode: string;
  errorMessage: string;
  retryClass: PublishingRetryClass;
  metadata: Record<string, unknown>;
};

export type PublishVideoUnknown = {
  outcome: 'UNKNOWN';
  errorCode: string;
  retryClass: 'UNKNOWN_EXTERNAL_STATE';
  providerUploadId?: string;
  requestId?: string;
  metadata: Record<string, unknown>;
};

export type PublishVideoResult = PublishVideoAccepted | PublishVideoRejected | PublishVideoUnknown;

export type GetPublishStatusInput = {
  tenantId: string;
  workspaceId: string;
  platformAccount: PlatformAccountRef;
  publicationId?: string;
  providerItemId?: string;
  externalPostId?: string;
  requestId?: string;
  scenario?: MockPublishScenario;
};

export type PublishStatusResult = {
  platformStatus: ProviderPublishStatus;
  providerItemId?: string;
  externalPostId?: string;
  externalUrl?: string;
  requestId?: string;
  metadata: Record<string, unknown>;
};

export interface PlatformPublisher {
  readonly platform: Platform;
  validateAccount(input: ValidatePublishingAccountInput): Promise<AccountHealthResult>;
  publishVideo(input: PublishVideoInput): Promise<PublishVideoResult>;
  getPublishStatus(input: GetPublishStatusInput): Promise<PublishStatusResult>;
}

export function isPublishVisibility(value: string): value is PublishVisibility {
  return (PUBLISH_VISIBILITIES as readonly string[]).includes(value);
}

export interface PublishingProviderRegistry {
  resolve(platform: Platform): PlatformPublisher;
}
