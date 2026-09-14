import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { ffmpegBin, ffprobeBin } from '../../media/ffmpeg/ffmpeg-config.js';
import { buildFfprobeArgs } from '../../media/ffmpeg/ffprobe.js';
import { runChildProcess } from '../../media/ffmpeg/run-process.js';
import { parseVideoOnlyFfprobe } from '../crop-review-flow/preview-runtime-plan.js';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import { compositionsMatch } from '../dynamic-reframe/normalized-geometry.js';
import { directSourceAwareEditorialPlan } from '../source-aware-editorial/director.js';
import { auditCropIntegrity } from '../source-aware-editorial/integrity.js';
import { mapPlanToRuntimeTimeline } from '../source-aware-editorial/timeline.js';
import { auditEditorialFrameContinuityV1, filterHasConcatGapRisk, ptsContinuity } from '../editorial-shot-runtime/continuity.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG as C } from './render-config.js';
import { buildSourceAwareFilterGraph, sourceAwareFfmpegArgs } from './filter-builder.js';
import { sampleBlankWindowFrames, SOURCE_AWARE_BLANK_PROBE_MS } from './frame-probe.js';
import {
  readSourceAwareSidecar,
  sourceAwarePreviewConfigHash,
  sourceAwarePreviewFile,
  writeSourceAwareSidecar,
  type SourceAwarePreviewSidecarV1,
} from './store.js';

async function probe(filePath: string) {
  const result = await runChildProcess(ffprobeBin(), buildFfprobeArgs(filePath), { timeoutMs: 20_000 });
  return parseVideoOnlyFfprobe(result.stdout);
}

export async function renderSourceAwarePreview(input: {
  tenantId: string;
  sessionId: string;
  assetId: string;
  sourcePath: string;
}): Promise<{
  ok: boolean;
  code?: string;
  ffmpegSpawned: boolean;
  previewVersion: string;
  sidecar?: SourceAwarePreviewSidecarV1;
  bytes?: number;
  diagnosticProbeCalls?: number;
}> {
  const plan = directSourceAwareEditorialPlan({ assetId: input.assetId });
  if (plan.assetId !== input.assetId) return { ok: false, code: 'ASSET_MISMATCH', ffmpegSpawned: false, previewVersion: C.previewVersion };
  const timeline = mapPlanToRuntimeTimeline(plan);
  if (!timeline.segments.length || timeline.initialComposition !== 'SMART_UI_FIT') {
    return { ok: false, code: 'INITIAL_COMPOSITION_MISSING', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  if (!timeline.coverage.continuous) return { ok: false, code: 'COVERAGE_GAP', ffmpegSpawned: false, previewVersion: C.previewVersion };
  if (timeline.segments.some((item) => (item.decision === 'MEDIUM_FOCUS' || item.decision === 'DETAIL_READABLE') && !item.integrityOk)) {
    return { ok: false, code: 'INTEGRITY_HARD_FAIL', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  if (timeline.segments.some((item) => item.decision === 'DETAIL_READABLE' && item.normalizedCrop.width * item.normalizedCrop.height < 0.02)) {
    return { ok: false, code: 'EMPTY_PUNCH_IN_BLANK_RISK', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  for (const item of timeline.segments) {
    if (!auditCropIntegrity(item.normalizedCrop).ok && item.decision !== 'WIDE_CONTEXT') {
      return { ok: false, code: 'INTEGRITY_HARD_FAIL', ffmpegSpawned: false, previewVersion: C.previewVersion };
    }
    if (!compositionsMatch(item.normalizedCrop, { width: 1920, height: 1040 }, { width: 720, height: 1280 }, { width: 1080, height: 1920 })) {
      return { ok: false, code: 'COMPOSITION_MISMATCH', ffmpegSpawned: false, previewVersion: C.previewVersion };
    }
  }
  if (!existsSync(input.sourcePath)) return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, previewVersion: C.previewVersion };
  if (isPreviewOfPreviewPath(input.sourcePath)) return { ok: false, code: 'PREVIEW_OF_PREVIEW_REJECTED', ffmpegSpawned: false, previewVersion: C.previewVersion };
  const loc = { tenantId: input.tenantId, sessionId: input.sessionId, previewVersion: C.previewVersion };
  const outPath = sourceAwarePreviewFile(loc);
  const sourceStat = statSync(input.sourcePath);
  const hash = sourceAwarePreviewConfigHash(plan, timeline.segments, { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs });
  const existing = readSourceAwareSidecar(loc);
  if (existing?.status === 'READY' && existing.configHash === hash && existsSync(outPath) && statSync(outPath).size > 0) {
    return {
      ok: true,
      ffmpegSpawned: false,
      previewVersion: C.previewVersion,
      sidecar: existing,
      bytes: statSync(outPath).size,
      diagnosticProbeCalls: 0,
    };
  }
  const sourceProbe = await probe(input.sourcePath);
  if (!sourceProbe?.width || !sourceProbe.height || !sourceProbe.hasVideo) {
    return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  const graph = buildSourceAwareFilterGraph({
    segments: timeline.segments,
    sourceWidth: sourceProbe.width,
    sourceHeight: sourceProbe.height,
  });
  if (filterHasConcatGapRisk(graph.filter)) return { ok: false, code: 'CONCAT_DURATION_GUARD', ffmpegSpawned: false, previewVersion: C.previewVersion };
  if (!ptsContinuity(timeline.segments).ok) return { ok: false, code: 'PTS_DISCONTINUITY', ffmpegSpawned: false, previewVersion: C.previewVersion };
  mkdirSync(path.dirname(outPath), { recursive: true });
  const tempPath = `${outPath}.tmp.mp4`;
  if (existsSync(tempPath)) unlinkSync(tempPath);
  const pending = (status: SourceAwarePreviewSidecarV1['status'], failureCode: string | null): SourceAwarePreviewSidecarV1 => ({
    schemaVersion: 'source-aware.preview-sidecar:v1',
    previewVersion: C.previewVersion,
    configHash: hash,
    assetId: input.assetId,
    sessionId: input.sessionId,
    sourceVisualType: plan.sourceVisualType,
    sourceAwarePlanVersion: plan.schemaVersion,
    decisionCount: timeline.decisionCount,
    keepCurrentCount: timeline.keepCurrentCount,
    timelineSegmentCount: timeline.timelineSegmentCount,
    renderedShotCount: timeline.renderedShotCount,
    smartUiFitVersion: 'smart-ui-fit:v1',
    semanticIntegrityVersion: 'semantic.composition-integrity:v1',
    frameContinuityVersion: 'editorial.frame-continuity:v1',
    reviewResolution: `${C.reviewWidth}x${C.reviewHeight}`,
    productionTargetResolution: `${C.productionWidth}x${C.productionHeight}`,
    productionDirectFromOriginal: true,
    previewUpscaleAllowed: false,
    productionUsable: false,
    audioPolicy: C.audioPolicy,
    createdAt: new Date().toISOString(),
    status,
    failureCode,
    durationMs: null,
  });
  writeSourceAwareSidecar(loc, pending('RENDERING', null));
  try {
    await runChildProcess(ffmpegBin(), sourceAwareFfmpegArgs(input.sourcePath, tempPath, graph.filter), { timeoutMs: C.timeoutMs });
  } catch {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    writeSourceAwareSidecar(loc, pending('FAILED', 'FFMPEG_FAILED'));
    return { ok: false, code: 'FFMPEG_FAILED', ffmpegSpawned: true, previewVersion: C.previewVersion };
  }
  const after = statSync(input.sourcePath);
  if (sourceStat.size !== after.size || sourceStat.mtimeMs !== after.mtimeMs) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    writeSourceAwareSidecar(loc, pending('FAILED', 'SOURCE_MUTATED'));
    return { ok: false, code: 'SOURCE_MUTATED', ffmpegSpawned: true, previewVersion: C.previewVersion };
  }
  const probed = await probe(tempPath);
  const expectedMs = plan.coverage.endMs - plan.coverage.startMs;
  if (
    !probed ||
    probed.width !== C.reviewWidth ||
    probed.height !== C.reviewHeight ||
    probed.hasAudio ||
    Math.abs((probed.durationMs ?? 0) - expectedMs) > 2500
  ) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    writeSourceAwareSidecar(loc, pending('FAILED', 'OUTPUT_INVALID'));
    return { ok: false, code: 'OUTPUT_INVALID', ffmpegSpawned: true, previewVersion: C.previewVersion, diagnosticProbeCalls: 0 };
  }
  const sampled = sampleBlankWindowFrames(tempPath);
  if (sampled.frames.length < SOURCE_AWARE_BLANK_PROBE_MS.length) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    writeSourceAwareSidecar(loc, pending('FAILED', 'FRAME_CONTINUITY_PROBE_FAILED'));
    return {
      ok: false,
      code: 'FRAME_CONTINUITY_PROBE_FAILED',
      ffmpegSpawned: true,
      previewVersion: C.previewVersion,
      diagnosticProbeCalls: sampled.diagnosticProbeCalls,
    };
  }
  const continuity = auditEditorialFrameContinuityV1({ segments: timeline.segments, frames: sampled.frames });
  if (!continuity.ok || continuity.unexpectedBlank.blank) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    writeSourceAwareSidecar(loc, pending('FAILED', 'EMPTY_PUNCH_IN_BLANK_RISK'));
    return {
      ok: false,
      code: 'EMPTY_PUNCH_IN_BLANK_RISK',
      ffmpegSpawned: true,
      previewVersion: C.previewVersion,
      diagnosticProbeCalls: sampled.diagnosticProbeCalls,
    };
  }
  renameSync(tempPath, outPath);
  const sidecar: SourceAwarePreviewSidecarV1 = { ...pending('READY', null), durationMs: probed.durationMs };
  writeSourceAwareSidecar(loc, sidecar);
  return {
    ok: true,
    ffmpegSpawned: true,
    previewVersion: C.previewVersion,
    sidecar,
    bytes: statSync(outPath).size,
    diagnosticProbeCalls: sampled.diagnosticProbeCalls,
  };
}
