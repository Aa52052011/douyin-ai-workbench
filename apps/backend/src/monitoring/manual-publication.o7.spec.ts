import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DouyinPublishingProviderV1 } from '../publishing/douyin/douyin-publishing.provider.js';
import { DouyinUploadVideoClientV1 } from '../publishing/douyin/douyin-upload.client.js';
import { DouyinCreateVideoClientV1 } from '../publishing/douyin/douyin-create.client.js';
import { isDouyinLiveApiEnabled } from '../publishing/douyin/douyin-runtime-config.js';
import {
  activeFrozenConstraintCount,
  noQualityDowngradePolicy,
  productionConstraintRegistry,
  v1ProductStrategyConstraintRegistry,
} from '../production-v2/global-director/production-constraints.js';
import { ErrorCode } from '../common/errors/app-error.js';
import { canEnterAwaitingManualPublication, defaultDouyinPublicationCandidate, requireAcceptedArtifact } from './accepted-artifact.gate.js';
import { parseDouyinPostUrl, parsePlatformPostId } from './douyin-post-url-parser.js';
import { monitoringReadyAfterRegistration } from './manual-publication.workflow.js';
import {
  DouyinPostMonitoringProvider,
  ManualPostMonitoringProviderV1,
  officialMetricsProviderState,
} from './post-monitoring.provider.js';
import { computeMetricTrend, validateManualMetricsSnapshotV1 } from './post-metrics.validation.js';
import { officialPublishResumeCriteriaV1, v1PublicationStrategy, sameTenantRequired } from './publication-strategy.js';
import { VERTICAL_ARTIFACT_V2_ID } from '../production-v2/global-director/final-production-v2-authorization.js';

describe('B2-15O7 manual publication freeze', () => {
  it('final accepted artifact can enter manual export', () => {
    expect(canEnterAwaitingManualPublication(VERTICAL_ARTIFACT_V2_ID)).toBe(true);
    expect(requireAcceptedArtifact(VERTICAL_ARTIFACT_V2_ID).acceptance).toBe('ACCEPTED');
    expect(defaultDouyinPublicationCandidate().artifactId).toBe(VERTICAL_ARTIFACT_V2_ID);
  });

  it('unaccepted artifact is blocked', () => {
    expect(canEnterAwaitingManualPublication('not-an-accepted-artifact')).toBe(false);
    try {
      requireAcceptedArtifact('not-an-accepted-artifact');
      throw new Error('expected block');
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.ARTIFACT_NOT_ACCEPTED });
    }
  });

  it('preserves official provider classes and keeps live disabled', () => {
    expect(new DouyinPublishingProviderV1().providerId).toBeTruthy();
    expect(DouyinUploadVideoClientV1.name).toBe('DouyinUploadVideoClientV1');
    expect(DouyinCreateVideoClientV1.name).toBe('DouyinCreateVideoClientV1');
    expect(isDouyinLiveApiEnabled({ DOUYIN_LIVE_API_ENABLED: 'false' })).toBe(false);
    expect(isDouyinLiveApiEnabled({})).toBe(false);
  });

  it('does not treat user-asserted as platform-verified', () => {
    const parsed = parseDouyinPostUrl('https://www.douyin.com/video/7123456789012345678');
    expect(parsed.status).toBe('FORMAT_VALIDATED');
    expect(parsed.platformPostId).toBe('7123456789012345678');
    expect(parsed.platformVerified).toBe(false);
    expect(parsePlatformPostId('7123456789012345678')).toBe('7123456789012345678');
  });

  it('does not fake-parse short links', () => {
    const parsed = parseDouyinPostUrl('https://v.douyin.com/AbCdEf/');
    expect(parsed.status).toBe('SHORT_LINK_RESOLUTION_REQUIRED');
    expect(parsed.platformPostId).toBeNull();
  });

  it('requires registration identity before monitoring', () => {
    expect(monitoringReadyAfterRegistration({ registered: true, platformPostId: '1', platformUrl: null })).toBe(true);
    expect(monitoringReadyAfterRegistration({ registered: true, platformPostId: null, platformUrl: null })).toBe(false);
    expect(monitoringReadyAfterRegistration({ registered: false, platformPostId: '1' })).toBe(false);
  });

  it('validates metrics and computes deterministic trends', () => {
    expect(() => validateManualMetricsSnapshotV1({ playCount: -1 })).toThrowError();
    expect(() => validateManualMetricsSnapshotV1({ playCount: Number.NaN })).toThrowError();
    const ok = validateManualMetricsSnapshotV1({ playCount: 10, likeCount: 1, capturedAt: '2026-09-13T12:00:00.000Z' });
    expect(ok.playCount).toBe(10);
    expect(computeMetricTrend(10, 15, 86_400_000)).toEqual({ delta: 5, deltaPercent: 50, intervalMs: 86_400_000 });
  });

  it('manual provider does not fetch; douyin metrics provider is reserved', () => {
    const manual = new ManualPostMonitoringProviderV1();
    expect(manual.status).toBe('IMPLEMENTED');
    expect(manual.acceptUserSnapshot().externalFetch).toBe(false);
    expect(officialMetricsProviderState().status).toBe('RESERVED_NOT_IMPLEMENTED');
    const reserved = new DouyinPostMonitoringProvider();
    expect(reserved.status).toBe('RESERVED_NOT_IMPLEMENTED');
  });

  it('isolates tenants and keeps C5/C6 plus new product constraints', () => {
    expect(sameTenantRequired('t1', 't2')).toBe(false);
    expect(productionConstraintRegistry().constraints).toHaveLength(24);
    expect(v1ProductStrategyConstraintRegistry().constraints).toHaveLength(8);
    expect(activeFrozenConstraintCount()).toBe(32);
    expect(v1PublicationStrategy().c5).toBe('RESTRICTED');
    expect(v1PublicationStrategy().c6).toBe('RESTRICTED');
    expect(noQualityDowngradePolicy().status).toBe('ACTIVE');
    expect(officialPublishResumeCriteriaV1().resumeAllowed).toBe(false);
  });

  it('does not create a fake Content #1 Douyin post in source', () => {
    const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'monitoring.service.ts'), 'utf8');
    expect(src.includes('fake Douyin')).toBe(false);
    expect(src.includes('NOT_REGISTERED')).toBe(true);
  });
});
