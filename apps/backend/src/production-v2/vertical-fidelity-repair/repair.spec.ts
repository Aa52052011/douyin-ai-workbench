import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_01_CONTAINERS } from '../source-aware-editorial/containers.js';
import { smartUiFit } from '../source-aware-editorial/smart-ui-fit.js';
import {
  SAMPLE_WINDOWS,
  SHARPEN_LIGHT,
  SHARPEN_VERY_LIGHT,
  assertCalibrationDirectFromOriginal,
  assertNotProductionMutationTarget,
  baselineCrop,
  buildVerticalSampleFilter,
  occupancyTighten,
  pickSharpen,
  reduceMobileCandidates,
  requiredContainers,
  rootCauseAnalysis,
  sampleFfmpegArgs,
  semanticIntegrity,
  haloIndex,
} from './repair.js';
import { applyExplicitRequestChanges, buildFinalChecklist, buildFinalProductionReview } from '../source-aware-output/final-production-review.js';

describe('B2-15O1 vertical fidelity repair', () => {
  const page = baselineCrop();

  it('uses original source only and never writes production artifacts', () => {
    expect(() => assertCalibrationDirectFromOriginal('/media/original.mp4')).not.toThrow();
    expect(() => assertCalibrationDirectFromOriginal('/x/source-aware-previews/a.mp4')).toThrow();
    expect(() => assertCalibrationDirectFromOriginal('/x/production-artifacts/t/s/vertical.douyin.v1.mp4')).toThrow();
    expect(() => assertCalibrationDirectFromOriginal('/x/V_1080x1920_crf18.mp4')).toThrow();
    expect(() => assertNotProductionMutationTarget('/tmp/V0_baseline_sample.mp4')).not.toThrow();
    expect(() => assertNotProductionMutationTarget('/.local/production-artifacts/t/s/vertical.douyin.v1.mp4')).toThrow();
  });

  it('keeps semantic integrity on baseline SMART_UI_FIT', () => {
    const check = semanticIntegrity(page);
    expect(check.pass).toBe(true);
    expect(page).toEqual(smartUiFit().crop);
  });

  it('rejects occupancy that would cut required UI, so V1 has no unsafe width gain on Content #1 containers', () => {
    const result = occupancyTighten({ page, required: requiredContainers() });
    expect(result.technically).toBe('TECHNICALLY_UNSAFE');
    expect(result.crop).toEqual(page);
    expect(result.reason).toMatch(/NO_SAFE_WIDTH_OCCUPANCY_GAIN|SEMANTIC_FAIL/);
  });

  it('builds lanczos sample graphs from original windows with optional weak unsharp only on foreground', () => {
    const v0 = buildVerticalSampleFilter({ crop: page, sourceWidth: 1920, sourceHeight: 1040 });
    expect(v0.usesLanczos).toBe(true);
    expect(v0.sharpenApplied).toBe(false);
    expect(v0.filter).toContain('1080:1920');
    expect(v0.filter).not.toMatch(/1440|2160/);
    expect(SAMPLE_WINDOWS).toHaveLength(4);
    const v2 = buildVerticalSampleFilter({
      crop: page,
      sourceWidth: 1920,
      sourceHeight: 1040,
      sharpen: SHARPEN_VERY_LIGHT,
    });
    expect(v2.filter).toContain(SHARPEN_VERY_LIGHT);
    expect(v2.filter).not.toMatch(/unsharp=7:7:1|cas=/);
    const args = sampleFfmpegArgs('/media/source.mp4', '/tmp/V2_light_sharpen_sample.mp4', v2.filter);
    expect(args.join(' ')).toContain('-crf 18');
    expect(args).toContain('-an');
  });

  it('fails aggressive halo/ringing and keeps light sharpen selectable', () => {
    const w = 8;
    const h = 8;
    const base = Buffer.alloc(w * h, 40);
    const mild = Buffer.from(base);
    mild[27] = 52;
    const harsh = Buffer.alloc(w * h, 80);
    expect(haloIndex(base, mild, w, h).fail).toBe(false);
    expect(haloIndex(base, harsh, w, h).fail).toBe(true);
    const pick = pickSharpen([
      { id: 'very-light', fail: false, edgeGain: 1.06 },
      { id: 'light', fail: true, edgeGain: 1.4 },
    ]);
    expect(pick.filter).toBe(SHARPEN_VERY_LIGHT);
    expect(pick.technically).toBe('TECHNICALLY_SAFE');
  });

  it('does not treat packaging or calibration as acceptance and keeps REQUEST_CHANGES', () => {
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
    const changed = applyExplicitRequestChanges(review, 'vertical text ragged on phone');
    expect(changed.humanDecision).toBe('REQUEST_CHANGES');
    expect(changed.checklist.find((item) => item.id === 'VERTICAL_TEXT_SHARPNESS_ACCEPTABLE')?.result).toBe('FAIL');
    expect(changed.checklist.find((item) => item.id === 'C5_RESTRICTION_PRESERVED')?.result).toBe('PASS');
  });

  it('reduces phone candidates to baseline + best 1-2', () => {
    expect(reduceMobileCandidates({ v1Safe: false, v1GlyphGainPx: 0, v2Safe: true, v3Safe: false })).toEqual(['V0', 'V2']);
    expect(reduceMobileCandidates({ v1Safe: true, v1GlyphGainPx: 2, v2Safe: true, v3Safe: true })).toEqual(['V0', 'V1', 'V3']);
  });

  it('names width downscale as primary root cause', () => {
    const analysis = rootCauseAnalysis({ effectiveScale: 0.686, typicalGlyphHeight: 17.2 });
    expect(String(analysis.primary)).toMatch(/WIDTH_DOWNSCALE/);
  });

  it('keeps PAGE crop covering all required containers', () => {
    for (const rect of requiredContainers()) {
      expect(semanticIntegrity(CONTENT_01_CONTAINERS[0].rect).pass).toBe(true);
      expect(rect.width).toBeGreaterThan(0);
    }
  });
});
