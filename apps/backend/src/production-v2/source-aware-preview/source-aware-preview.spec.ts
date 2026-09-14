import { describe, expect, it } from 'vitest';
import { directSourceAwareEditorialPlan, countDecisions } from '../source-aware-editorial/director.js';
import { mapPlanToRuntimeTimeline } from '../source-aware-editorial/timeline.js';
import { auditCropIntegrity } from '../source-aware-editorial/integrity.js';
import { cropForScale } from '../editorial-shot-director/crop-for-scale.js';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import { ptsContinuity } from '../editorial-shot-runtime/continuity.js';
import { buildSourceAwareFilterGraph } from './filter-builder.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG } from './render-config.js';

describe('B2-15F source-aware preview runtime', () => {
  const plan = directSourceAwareEditorialPlan();
  const timeline = mapPlanToRuntimeTimeline(plan);
  const counts = countDecisions(plan);

  it('maps decision / timeline / rendered counts consistently', () => {
    expect(timeline.decisionCount).toBe(plan.decisions.length);
    expect(timeline.keepCurrentCount).toBe(counts.keep);
    expect(timeline.explicitReframeCount).toBe(plan.decisions.length - counts.keep);
    expect(timeline.timelineSegmentCount).toBe(timeline.renderedShotCount);
    expect(timeline.timelineSegmentCount).toBe(timeline.segments.length);
    expect(timeline.keepCurrentCount).toBe(7);
    expect(timeline.renderedShotCount).toBe(1);
  });

  it('covers 0-35107ms continuously with SMART_UI_FIT initial composition', () => {
    expect(timeline.coverage.continuous).toBe(true);
    expect(timeline.segments[0].sourceStartMs).toBe(0);
    expect(timeline.segments[timeline.segments.length - 1].sourceEndMs).toBe(35107);
    expect(timeline.initialComposition).toBe('SMART_UI_FIT');
    expect(timeline.segments[0].fitMode).toBe('CONTAIN');
  });

  it('does not emit broken medium/detail crops', () => {
    expect(timeline.segments.every((item) => item.decision === 'WIDE_CONTEXT')).toBe(true);
    expect(timeline.segments.every((item) => item.integrityOk)).toBe(true);
    expect(auditCropIntegrity(cropForScale('MEDIUM_FOCUS').crop).ok).toBe(false);
  });

  it('KEEP_CURRENT does not skip time and PTS is continuous', () => {
    expect(ptsContinuity(timeline.segments).ok).toBe(true);
    expect(timeline.segments[0].sourceEndMs - timeline.segments[0].sourceStartMs).toBe(35107);
  });

  it('builds overlay-guarded SMART_UI_FIT filter', () => {
    const graph = buildSourceAwareFilterGraph({ segments: timeline.segments, sourceWidth: 1920, sourceHeight: 1040 });
    expect(graph.usesLanczos).toBe(true);
    expect(graph.filter).toContain('eof_action=repeat');
    expect(graph.filter).toContain('flags=lanczos');
    expect(graph.filter).toContain('boxblur');
  });

  it('keeps 720 review / 1080 production / no upscale / rejects preview-as-source', () => {
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.reviewWidth).toBe(720);
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.productionHeight).toBe(1920);
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.previewUpscaleAllowed).toBe(false);
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.productionUsable).toBe(false);
    expect(isPreviewOfPreviewPath('/x/source-aware-previews/a.mp4')).toBe(true);
    expect(isPreviewOfPreviewPath('/x/editorial-shot-previews/a.mp4')).toBe(true);
    expect(isPreviewOfPreviewPath('/x/dynamic-reframe-previews/a.mp4')).toBe(true);
  });

  it('KEEP_CURRENT maps onto full coverage without blank segments', () => {
    expect(plan.decisions.filter((item) => item.decision === 'KEEP_CURRENT_COMPOSITION')).toHaveLength(7);
    expect(timeline.segments.every((item) => item.sourceEndMs > item.sourceStartMs)).toBe(true);
    expect(timeline.segments.some((item) => item.compositionFrom === 'PREVIOUS_KEEP' || item.sourceEndMs === 35107)).toBe(true);
  });

  it('does not auto-approve or authorize production', () => {
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.productionUsable).toBe(false);
    expect(SOURCE_AWARE_PREVIEW_RENDER_CONFIG.previewUpscaleAllowed).toBe(false);
  });
});
