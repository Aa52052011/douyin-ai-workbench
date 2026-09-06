import type { PublicationStatus } from '@prisma/client';
import type { PublishingRetryClass } from './providers/publishing-provider.types.js';

export const PUBLICATION_STATUSES = [
  'PENDING',
  'UPLOADING',
  'SUBMITTING',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'UNKNOWN_EXTERNAL_STATE',
  'CANCELLED',
] as const satisfies readonly PublicationStatus[];

const BLIND_RETRY_FORBIDDEN: ReadonlySet<PublicationStatus> = new Set([
  'SUBMITTING',
  'PROCESSING',
  'PUBLISHED',
  'UNKNOWN_EXTERNAL_STATE',
  'CANCELLED',
]);

export function isUnknownExternalState(status: PublicationStatus): boolean {
  return status === 'UNKNOWN_EXTERNAL_STATE';
}

export function isBlindRetryForbidden(status: PublicationStatus): boolean {
  return BLIND_RETRY_FORBIDDEN.has(status);
}

export function isSafeToRetry(status: PublicationStatus): boolean {
  return status === 'FAILED' || status === 'PENDING' || status === 'UPLOADING';
}

const RETRYABLE_CLASSES: ReadonlySet<PublishingRetryClass> = new Set(['SAFE_TO_RETRY', 'TEMPORARY']);

export function readRetryClass(metadata: unknown): PublishingRetryClass | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>).retryClass;
  if (
    value === 'SAFE_TO_RETRY' ||
    value === 'TEMPORARY' ||
    value === 'PERMANENT' ||
    value === 'UNKNOWN_EXTERNAL_STATE'
  ) {
    return value;
  }
  return undefined;
}

export function isHttpRetryAllowed(status: PublicationStatus, retryClass: PublishingRetryClass | undefined): boolean {
  return status === 'FAILED' && retryClass != null && RETRYABLE_CLASSES.has(retryClass);
}
