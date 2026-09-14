import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertFinalReviewSourcePath,
  buildFinalChecklist,
  buildFinalProductionReview,
  copyByteIdentical,
  finalProductionAcceptanceContract,
  sha256File,
} from './final-production-review.js';
import { FileFinalProductionReviewStore } from './final-production-review-store.js';

describe('B2-15N final production review and delivery', () => {
  it('rejects calibration and preview as final review sources', () => {
    expect(() => assertFinalReviewSourcePath('/x/V_1080x1920_crf18.mp4')).toThrow('CALIBRATION_REJECTED_AS_FINAL');
    expect(() => assertFinalReviewSourcePath('/x/source-aware-previews/a.mp4')).toThrow('PREVIEW_REJECTED_AS_FINAL');
    expect(() => assertFinalReviewSourcePath('/media/original.mp4')).toThrow('DELIVERY_SOURCE_MUST_BE_PRODUCTION_ARTIFACT');
  });

  it('copies only from production-artifacts and keeps bytes identical', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'b215n-'));
    const source = path.join(dir, 'production-artifacts', 't', 's', 'vertical.douyin.v1.mp4');
    const dest = path.join(dir, 'delivery.mp4');
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, Buffer.from('production-bytes-15n'));
    const copied = copyByteIdentical(source, dest);
    expect(copied.bytes).toBe(20);
    expect(await sha256File(source)).toBe(await sha256File(dest));
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps human acceptance pending and packaging not publication', () => {
    const review = buildFinalProductionReview({
      reviewId: 'r1',
      tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      reviewSessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      productionPlanId: 'plan-1',
      artifacts: [
        {
          artifactId: 'e1b03315-7cba-441d-9bbd-4f96d57f44f5',
          profileId: 'production.vertical.douyin:v1',
          fileRef: '/.local/production-artifacts/t/s/vertical.douyin.v1.mp4',
          configHash: 'v',
          sha256: 'aa',
          resolution: '1080x1920',
          productionUsable: true,
          durationMs: 35067,
          bytes: 1,
        },
        {
          artifactId: '693843ed-5b6b-4072-9e49-d5544b5f0e32',
          profileId: 'production.landscape.ui-demo:v1',
          fileRef: '/.local/production-artifacts/t/s/landscape.ui-demo.v1.mp4',
          configHash: 'l',
          sha256: 'bb',
          resolution: '1920x1080',
          productionUsable: true,
          durationMs: 35067,
          bytes: 1,
        },
      ],
      checklist: buildFinalChecklist({ verticalOk: true, landscapeOk: true, identityOk: true, truthOk: true }),
    });
    expect(review.humanDecision).toBe('PENDING');
    expect(finalProductionAcceptanceContract().object).toBeNull();
    expect(finalProductionAcceptanceContract().packagingDoesNotAccept).toBe(true);
    expect(review.checklist.find((item) => item.id === 'VERTICAL_TEXT_SHARPNESS_ACCEPTABLE')?.result).toBe('PENDING');
    expect(review.checklist.find((item) => item.id === 'C5_RESTRICTION_PRESERVED')?.result).toBe('PASS');
  });

  it('scopes final review by tenant', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'b215n-store-'));
    const store = new FileFinalProductionReviewStore(dir);
    const review = buildFinalProductionReview({
      reviewId: 'r1',
      tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      reviewSessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      productionPlanId: 'plan-1',
      artifacts: [
        {
          artifactId: 'a',
          profileId: 'production.vertical.douyin:v1',
          fileRef: '/.local/production-artifacts/t/s/vertical.douyin.v1.mp4',
          configHash: 'v',
          sha256: 'aa',
          resolution: '1080x1920',
          productionUsable: true,
          durationMs: 1,
          bytes: 1,
        },
        {
          artifactId: 'b',
          profileId: 'production.landscape.ui-demo:v1',
          fileRef: '/.local/production-artifacts/t/s/landscape.ui-demo.v1.mp4',
          configHash: 'l',
          sha256: 'bb',
          resolution: '1920x1080',
          productionUsable: true,
          durationMs: 1,
          bytes: 1,
        },
      ],
      checklist: [],
    });
    await store.putIfAbsentOrSame(review);
    expect(await store.getByReviewSession(review.tenantId, review.reviewSessionId)).not.toBeNull();
    expect(await store.getByReviewSession('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', review.reviewSessionId)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
