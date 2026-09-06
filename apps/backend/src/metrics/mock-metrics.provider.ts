import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Platform } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { GetPostMetricsInput, PlatformMetricsProvider, PostMetricsResult } from './metrics-provider.types.js';

export const MOCK_METRICS_SCENARIOS = [
  'SUCCESS',
  'PARTIAL',
  'ZERO',
  'INVALID_RESPONSE',
  'TEMPORARY_FAILURE',
  'PERMANENT_FAILURE',
] as const;

export type MockMetricsScenario = (typeof MOCK_METRICS_SCENARIOS)[number];

@Injectable()
export class MockMetricsProvider implements PlatformMetricsProvider {
  readonly platform = Platform.MOCK;
  private readonly scenarios = new Map<string, MockMetricsScenario>();
  private readonly calls: GetPostMetricsInput[] = [];

  configureScenario(publicationId: string, scenario: MockMetricsScenario): void {
    this.scenarios.set(publicationId, scenario);
  }

  getCallCount(publicationId?: string): number {
    if (!publicationId) {
      return this.calls.length;
    }
    return this.calls.filter((call) => call.publicationId === publicationId).length;
  }

  getCalls(): readonly GetPostMetricsInput[] {
    return this.calls;
  }

  async getPostMetrics(input: GetPostMetricsInput): Promise<PostMetricsResult> {
    this.calls.push(input);
    if (input.platform !== Platform.MOCK) {
      throw new AppError(ErrorCode.PLATFORM_METRICS_PROVIDER_NOT_IMPLEMENTED);
    }
    const scenario = this.scenarios.get(input.publicationId) ?? 'SUCCESS';
    if (scenario === 'TEMPORARY_FAILURE') {
      throw new AppError(ErrorCode.METRICS_PROVIDER_TEMPORARY_FAILURE);
    }
    if (scenario === 'PERMANENT_FAILURE') {
      throw new AppError(ErrorCode.METRICS_PROVIDER_PERMANENT_FAILURE, 'External post not found');
    }
    if (scenario === 'INVALID_RESPONSE') {
      return invalidResult(input);
    }
    if (scenario === 'PARTIAL') {
      return partialResult(input);
    }
    if (scenario === 'ZERO') {
      return zeroResult(input);
    }
    return successResult(input);
  }
}

function successResult(input: GetPostMetricsInput): PostMetricsResult {
  const n = stableInt(`${input.publicationId}:${input.externalPostId}`);
  const observedAt = new Date(Date.UTC(2026, 7, 1) + (n % 86_400_000));
  return {
    views: 1000 + (n % 8000),
    likes: n % 400,
    comments: n % 80,
    shares: n % 40,
    favorites: n % 60,
    averageWatchTimeSeconds: 5 + (n % 2500) / 100,
    completionRate: ((n % 90) + 10) / 100,
    newFollowers: n % 20,
    observedAt,
    providerCollectedAt: new Date(observedAt.getTime() + 1000),
    providerRequestId: mockRequestId(input.publicationId),
    providerSnapshotId: mockSnapshotId(input.externalPostId),
    metadata: safeMetadata(),
  };
}

function partialResult(input: GetPostMetricsInput): PostMetricsResult {
  return {
    views: 1000,
    likes: 50,
    comments: null,
    shares: null,
    favorites: null,
    averageWatchTimeSeconds: null,
    completionRate: null,
    newFollowers: null,
    observedAt: new Date(Date.UTC(2026, 7, 2, 11, 0, 0)),
    providerCollectedAt: new Date(Date.UTC(2026, 7, 2, 11, 0, 1)),
    providerRequestId: mockRequestId(input.publicationId),
    providerSnapshotId: mockSnapshotId(input.externalPostId),
    metadata: safeMetadata(),
  };
}

function zeroResult(input: GetPostMetricsInput): PostMetricsResult {
  return {
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    favorites: 0,
    averageWatchTimeSeconds: 0,
    completionRate: 0,
    newFollowers: 0,
    observedAt: new Date(Date.UTC(2026, 7, 2, 12, 0, 0)),
    providerCollectedAt: new Date(Date.UTC(2026, 7, 2, 12, 0, 1)),
    providerRequestId: mockRequestId(input.publicationId),
    providerSnapshotId: mockSnapshotId(input.externalPostId),
    metadata: safeMetadata(),
  };
}

function invalidResult(input: GetPostMetricsInput): PostMetricsResult {
  return {
    views: -1,
    likes: 0,
    comments: null,
    shares: null,
    favorites: null,
    averageWatchTimeSeconds: null,
    completionRate: 1.5,
    newFollowers: null,
    observedAt: new Date(Date.UTC(2026, 7, 2, 13, 0, 0)),
    providerCollectedAt: null,
    providerRequestId: mockRequestId(input.publicationId),
    providerSnapshotId: mockSnapshotId(input.externalPostId),
    metadata: safeMetadata(),
  };
}

function safeMetadata(): Record<string, unknown> {
  return { apiVersion: 'mock-metrics-v1', mappingVersion: 'metrics-v1' };
}

function mockRequestId(publicationId: string): string {
  return `mock-req-${publicationId.replace(/-/g, '').slice(0, 12)}`;
}

function mockSnapshotId(externalPostId: string): string {
  return `mock-snap-${externalPostId.slice(0, 32)}`;
}

function stableInt(seed: string): number {
  return createHash('sha1').update(seed).digest().readUInt32BE(0);
}
