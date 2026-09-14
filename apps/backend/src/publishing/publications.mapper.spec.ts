import { describe, expect, it } from 'vitest';
import { publicationFingerprint, samePublicationRequest } from './publication-fingerprint.js';
import { requireIdempotencyKey } from './idempotency-key.js';
import { ErrorCode } from '../common/errors/app-error.js';
import { toPublicPublication } from './publications.mapper.js';
import { isHttpRetryAllowed } from './publication-status.js';
import { Platform, PublicationMode, PublicationStatus } from '@prisma/client';
import { readPublicationIdFromJobInput } from './publish-job-input.js';

describe('publication fingerprint', () => {
  const base = {
    videoId: 'vid',
    platformAccountId: 'acc',
    platform: 'MOCK',
    mode: 'API',
    title: 't',
    description: 'd',
    hashtags: ['b', 'a'],
    visibility: 'PUBLIC',
  };

  it('treats hashtag order as equivalent', () => {
    expect(samePublicationRequest(base, { ...base, hashtags: ['a', 'b'] })).toBe(true);
    expect(publicationFingerprint(base)).not.toContain('accessToken');
  });

  it('detects semantic drift', () => {
    expect(samePublicationRequest(base, { ...base, title: 'other' })).toBe(false);
  });

  it('does not include platformAccountId in MANUAL fingerprints', () => {
    const manual = { ...base, mode: 'MANUAL', platformAccountId: null, platform: 'DOUYIN' };
    expect(publicationFingerprint(manual)).not.toContain('platformAccountId');
    expect(samePublicationRequest(manual, { ...manual, platformAccountId: 'other' })).toBe(true);
  });
});

describe('idempotency key', () => {
  it('rejects missing or short keys', () => {
    expect(() => requireIdempotencyKey(undefined)).toThrowError();
    expect(() => requireIdempotencyKey('')).toThrowError();
    expect(() => requireIdempotencyKey('short')).toThrowError();
    try {
      requireIdempotencyKey('');
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED });
    }
  });

  it('accepts a stable key', () => {
    expect(requireIdempotencyKey('publish-key-1')).toBe('publish-key-1');
  });
});

describe('publication public mapper', () => {
  it('omits credentialRef and provider metadata blobs', () => {
    const publicDto = toPublicPublication({
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: 't',
      workspaceId: 'w',
      projectId: 'p',
      videoId: 'v',
      contentPlanId: null,
      scriptId: null,
      productionArtifactId: null,
      artifactSha: null,
      platformAccountId: 'a',
      platform: Platform.MOCK,
      mode: PublicationMode.API,
      status: PublicationStatus.PUBLISHED,
      lifecycleStatus: 'DRAFT' as never,
      registrationSource: null,
      verificationStatus: null,
      monitoringStatus: 'WAITING_REGISTRATION' as never,
      monitoringMode: 'MANUAL_IMPORT' as never,
      platformAuthorId: null,
      registeredAt: null,
      feedbackCycleId: null,
      metadataSnapshot: null,
      title: 't',
      description: '',
      hashtags: [],
      visibility: 'PUBLIC',
      scheduledAt: null,
      publishedAt: new Date(),
      externalPostId: 'mock-post',
      externalUrl: 'mock://publication/x',
      providerUploadId: 'up',
      providerItemId: 'item',
      idempotencyKey: 'idem-key-1',
      sourceJobId: 'job',
      errorCode: null,
      errorMessage: null,
      providerResponseMetadata: { retryClass: 'SAFE_TO_RETRY', accessToken: 'nope' },
      createdByUserId: 'u',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(publicDto).not.toHaveProperty('credentialRef');
    expect(publicDto).not.toHaveProperty('providerResponseMetadata');
    expect(publicDto).not.toHaveProperty('providerUploadId');
    expect(JSON.stringify(publicDto)).not.toContain('accessToken');
    expect(publicDto.retryClass).toBe('SAFE_TO_RETRY');
  });
});

describe('http retry eligibility', () => {
  it('allows only FAILED plus SAFE_TO_RETRY or TEMPORARY', () => {
    expect(isHttpRetryAllowed('FAILED', 'SAFE_TO_RETRY')).toBe(true);
    expect(isHttpRetryAllowed('FAILED', 'TEMPORARY')).toBe(true);
    expect(isHttpRetryAllowed('FAILED', 'PERMANENT')).toBe(false);
    expect(isHttpRetryAllowed('UNKNOWN_EXTERNAL_STATE', 'UNKNOWN_EXTERNAL_STATE')).toBe(false);
    expect(isHttpRetryAllowed('PUBLISHED', 'SAFE_TO_RETRY')).toBe(false);
    expect(isHttpRetryAllowed('PROCESSING', 'TEMPORARY')).toBe(false);
  });
});

describe('publish job input', () => {
  it('reads only publicationId', () => {
    expect(readPublicationIdFromJobInput({ publicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(readPublicationIdFromJobInput({ publicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', storageKey: 'nope' })).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(readPublicationIdFromJobInput({})).toBeUndefined();
  });
});
